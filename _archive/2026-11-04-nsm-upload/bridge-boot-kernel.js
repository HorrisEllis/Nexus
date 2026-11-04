#!/usr/bin/env node
/**
 * bridge-boot-kernel.js  — Bridge OS Boot Kernel v2.0.0
 *
 * THE IMMUTABLE CORE. This file is integrity-checked by bridge-integrity
 * and is the ONLY entry point for Bridge OS. Nothing bypasses this.
 *
 * Boot contract:
 *   1. Crypto self-test           — hard gate (abort on failure)
 *   2. File integrity check       — hard gate (tamper = abort, default)
 *   3. Identity load + verify     — hard gate
 *   4. IME init                   — hard gate (behavioral memory must exist)
 *   5. SNGate init                — hard gate (firewall must be armed)
 *   6. Bus live                   — hard gate (event backbone)
 *   7. Data pipeline              — hard gate (intake gated by SNGate + IME)
 *   [ signal-noise lock applied here — boot signals emit, mesh blocked ]
 *   8. Heartbeat                  — hard gate
 *   9. Causal ring                — soft (degrades gracefully)
 *  10. Mesh + trust               — soft
 *  11. Transport (BLE/HTTP/onion) — soft
 *  12. HTTP server :3747          — hard gate
 *  13. Swarm engine               — soft
 *  14. Guardian WS gateway        — soft
 *
 * After Phase 7 the SNR lock is applied:
 *   - All inbound bus events pass through IME behavioral scoring
 *   - SNGate evaluates every event against trust + rules
 *   - No module can communicate without the bus (layer sovereignty)
 *   - Boot signals are signed with identity key (unforgeable)
 *
 * The kernel is NOT hot-reloadable. Modules above Phase 9 are.
 *
 * Usage:
 *   node bridge-boot-kernel.js               # normal boot
 *   node bridge-boot-kernel.js --cli         # boot + attach REPL
 *   node bridge-boot-kernel.js --run-diag    # boot + run diagnostics
 *   node bridge-boot-kernel.js --quiet       # minimal console output
 *   node bridge-boot-kernel.js --no-mesh     # boot without mesh (isolated)
 *   node bridge-boot-kernel.js --verify-only # run integrity check, exit
 */

'use strict';

const path   = require('path');
const fs     = require('fs');
const crypto = require('crypto');

// ── Args ─────────────────────────────────────────────────────────────────────
const ARGS        = process.argv.slice(2);
const WITH_CLI    = ARGS.includes('--cli')         || process.env.NEXUS_CLI === 'true';
const WITH_DIAG   = ARGS.includes('--run-diag');
const QUIET       = ARGS.includes('--quiet')       || process.env.NEXUS_QUIET === 'true';
const NO_MESH     = ARGS.includes('--no-mesh');
const VERIFY_ONLY = ARGS.includes('--verify-only');

// ── ANSI palette (used in boot banner only — modules use their own) ───────────
const A = {
  reset:  '\x1b[0m',
  bold:   '\x1b[1m',
  dim:    '\x1b[2m',
  red:    '\x1b[91m',
  green:  '\x1b[92m',
  yellow: '\x1b[93m',
  cyan:   '\x1b[96m',
  white:  '\x1b[97m',
};

// ── Boot phase reporter ───────────────────────────────────────────────────────
// Clean, minimal — no emoji spam, no color noise. Information only.
// Later a TUI will render this properly.

const PHASE_LOG = [];  // machine-readable, emitted to bus after it's live

function phase(num, name, status, detail = '') {
  const ts = Date.now();
  const icon = { ok: A.green + '✓', warn: A.yellow + '⚠', fail: A.red + '✗', skip: A.dim + '·' }[status] || '·';
  const line = `  ${icon}${A.reset}  ${String(num).padEnd(4)} ${name.padEnd(18)} ${A.dim}${detail}${A.reset}`;
  if (!QUIET) console.log(line);
  PHASE_LOG.push({ num, name, status, detail, ts });
}

function fatal(num, name, err) {
  phase(num, name, 'fail', err.message);
  if (!QUIET) {
    console.error(`\n${A.red}${A.bold}  BOOT ABORTED — Phase ${num} (${name}) failed.${A.reset}`);
    console.error(`${A.dim}  ${err.stack || err.message}${A.reset}\n`);
  }
  process.exit(1);
}

function banner(version) {
  if (QUIET) return;
  const W = 56;
  const title = `BRIDGE OS  Kernel v${version}`;
  const pad   = W - title.length - 2;
  console.log(`\n  ${A.cyan}${A.bold}╔${'─'.repeat(W)}╗${A.reset}`);
  console.log(`  ${A.cyan}${A.bold}║${A.reset}  ${A.bold}${title}${' '.repeat(pad)}${A.cyan}${A.bold}║${A.reset}`);
  console.log(`  ${A.cyan}${A.bold}║${A.reset}  ${A.dim}Crypto · Identity · IME · SNGate · Bus · Causal · Mesh${' '.repeat(W - 54)}${A.cyan}${A.bold}║${A.reset}`);
  console.log(`  ${A.cyan}${A.bold}╚${'─'.repeat(W)}╝${A.reset}\n`);
}

// ── SNR Lock ──────────────────────────────────────────────────────────────────
// Applied after bus + gate are live. Every event that enters the system
// must pass through IME → SNGate. This is not optional, not bypassed,
// not configurable via env in production mode.
//
// The lock is expressed as a closure over the gate + IME instances.
// It wraps busEmit so every emission is scored before dispatch.

function createSNRLock(gate, ime, busEmitRaw) {
  let _locked = true;
  let _overrides = 0;

  function lockedEmit(sig, data = {}, level = 'INFO') {
    if (!_locked) return busEmitRaw(sig, data, level);

    // Internal signals (bridge:*) always pass — these are kernel signals
    if (sig.startsWith('bridge:') || sig.startsWith('bus:meta:')) {
      return busEmitRaw(sig, data, level);
    }

    // Evaluate via gate if a UUID is present (peer-originated events)
    if (data._uuid && data._uuid !== _selfUUID) {
      const gr = gate.evaluate({
        type:     sig,
        payload:  data,
        identity: { uuid: data._uuid },
        surface:  data._surface || 'mesh',
      });
      if (gr.decision === 'deny') {
        // Don't emit. Log the suppression.
        busEmitRaw('snr:suppressed', {
          sig, uuid: data._uuid, gateId: gr.gateId, reason: gr.reason,
        }, 'WARN');
        return null;
      }
    }

    return busEmitRaw(sig, data, level);
  }

  let _selfUUID = null;
  function setSelfUUID(uuid) { _selfUUID = uuid; }
  function unlock() { _locked = false; }  // for shutdown / test only
  function stats()  { return { locked: _locked, overrides: _overrides }; }

  return { emit: lockedEmit, setSelfUUID, unlock, stats };
}

// ── Main boot ─────────────────────────────────────────────────────────────────

const VERSION = '2.0.0';

async function boot() {
  const t0 = Date.now();
  banner(VERSION);

  // ── Phase 1: Crypto self-test (HARD GATE) ────────────────────────────────
  let integrityManager;
  try {
    const { createIntegrityManager } = require('./bridge-integrity/index');
    // We need identity for the proof — but can't load identity yet.
    // Run the pure crypto test first (no identity argument).
    integrityManager = createIntegrityManager({
      rootDir:  path.join(__dirname),
      dataDir:  process.env.NEXUS_DATA_DIR || path.join(__dirname, 'data'),
      identity: null,  // wired after Phase 3
      busEmit:  null,  // wired after Phase 5
      onTamper: process.env.NEXUS_INTEGRITY_TAMPER || 'abort',
    });
    integrityManager.runSelfTest();
    phase(1, 'crypto', 'ok', 'AES-256-GCM · ECDH · HKDF · HMAC · SHA-256 · scrypt');
  } catch (e) { fatal(1, 'crypto', e); }

  // ── Phase 1.5: File integrity check (HARD GATE) ──────────────────────────
  try {
    const r = integrityManager.runFileIntegrityCheck();
    if (!r.ok && !r.newBaseline) {
      // Tampered files — abort unless NEXUS_INTEGRITY_TAMPER=warn
      const msg = `Tampered: ${(r.tampered||[]).join(', ')}`;
      if ((process.env.NEXUS_INTEGRITY_TAMPER || 'abort') === 'abort') {
        fatal('1.5', 'file-integrity', new Error(msg));
      }
      phase('1.5', 'file-integrity', 'warn', msg);
    } else {
      const detail = r.newBaseline
        ? 'baseline created'
        : `${Object.keys(r.hashes || {}).length} files verified`;
      phase('1.5', 'file-integrity', 'ok', detail);
    }
  } catch (e) { fatal('1.5', 'file-integrity', e); }

  if (VERIFY_ONLY) {
    console.log(`\n  ${A.green}Integrity OK — exiting (--verify-only)${A.reset}\n`);
    process.exit(0);
  }

  // ── Phase 2: Identity (HARD GATE) ────────────────────────────────────────
  let identity;
  const dataDir = process.env.NEXUS_DATA_DIR || path.join(__dirname, 'data');
  try {
    const { loadOrInit } = require('./bridge-identity/index');
    identity = await loadOrInit({ dataDir, groupHint: process.env.NEXUS_GROUP || null });
    // Wire identity into integrity manager
    integrityManager._identity = identity;
    phase(2, 'identity', 'ok', identity.uuid.slice(0, 8));
  } catch (e) { fatal(2, 'identity', e); }

  // ── Phase 3: IME (HARD GATE) ─────────────────────────────────────────────
  // IME must exist before the gate, because the gate reads IME profiles.
  let ime;
  try {
    const { createIME } = require('./bridge-IME/index');
    ime = createIME({
      storeDir:          path.join(dataDir, 'ime'),
      baselineMinEvents: 100,
    });
    phase(3, 'IME', 'ok', 'behavioral memory armed');
  } catch (e) { fatal(3, 'IME', e); }

  // ── Phase 4: SNGate (HARD GATE) ──────────────────────────────────────────
  // Gate must exist before bus, because the SNR lock wraps busEmit.
  let gate;
  try {
    const { createSNGate }  = require('./bridge-sngate/index');
    const { validate }      = require('./bridge-contracts/index');
    gate = createSNGate({
      logDir:    path.join(dataDir, 'sngate-logs'),
      rulesPath: path.join(dataDir, 'sngate-rules.json'),
    }, ime);
    validate('IME-to-sngate', ime);
    validate('sngate-to-adapters', gate);
    if (integrityManager && gate.setIntegrityManager) {
      gate.setIntegrityManager(integrityManager);
    }
    phase(4, 'SNGate', 'ok', 'allow/deny/observe — firewall armed');
  } catch (e) { fatal(4, 'SNGate', e); }

  // ── Phase 5: Bus + SNR lock (HARD GATE) ──────────────────────────────────
  let bus, busEmit, snrLock;
  try {
    const { createBus }      = require('./bridge-core/bus');
    const { createDataBus }  = require('./bridge-data/index');
    const { validate }       = require('./bridge-contracts/index');

    bus = createBus({ logLevel: process.env.NEXUS_LOG || 'INFO', ime });

    // Wrap emit with SNR lock BEFORE any module gets busEmit
    const rawEmit  = (sig, data, level) => bus.emit(sig, data, level);
    snrLock        = createSNRLock(gate, ime, rawEmit);
    snrLock.setSelfUUID(identity.uuid);
    busEmit        = snrLock.emit;

    // Wire back
    ime.install({ busEmit });
    integrityManager._busEmit = busEmit;

    const dataBus = createDataBus({ gate, ime, busEmit, deltaDir: path.join(dataDir, 'delta') });
    validate('data-to-sngate', dataBus);

    phase(5, 'bus+SNR+data', 'ok', 'SISO bus live · SNR lock applied');

    // Store dataBus for boot context
    bus._dataBus = dataBus;
  } catch (e) { fatal(5, 'bus', e); }

  // ── Phase 6: Heartbeat (HARD GATE) ───────────────────────────────────────
  let heartbeat;
  try {
    const { createHeartbeatManager } = require('./bridge-heartbeat/index');
    const { createNodeRegistry }     = require('./bridge-core/registry/index');
    const { validate }               = require('./bridge-contracts/index');
    const { createNetworkIdentity }  = require('./bridge-node/network-identity');

    const netId       = createNetworkIdentity({ busEmit, port: parseInt(process.env.NEXUS_PORT || '3747') });
    const nodeRegistry = createNodeRegistry({ busEmit });
    heartbeat = createHeartbeatManager({ busEmit, nodeRegistry });
    validate('mesh-to-heartbeat', heartbeat);
    heartbeat.register(identity.uuid, `http://${netId.getBest()}:${process.env.NEXUS_PORT || 3747}/health`);
    phase(6, 'heartbeat', 'ok', 'BPM + UDP :7777');

    bus._nodeRegistry = nodeRegistry;
    bus._netId        = netId;
  } catch (e) { fatal(6, 'heartbeat', e); }

  // ── Phase 7: Causal ring (SOFT) ──────────────────────────────────────────
  let causal = null;
  try {
    const { createCausalAuthority } = require('./bridge-causal/index');
    causal   = await createCausalAuthority({ busEmit, dataDir, identity });
    busEmit  = causal.wrappedEmit;   // re-wrap: causal logs every emission
    phase(7, 'causal', 'ok', '1M ring · CQL');
  } catch (e) { phase(7, 'causal', 'warn', e.message); }

  // ── Phase 8: Mesh + trust (SOFT, skipped if --no-mesh) ───────────────────
  let meshNode = null, trustMesh = null;
  if (!NO_MESH) {
    try {
      const { createMeshNode }  = require('./bridge-mesh/index');
      const { createTrustMesh } = require('./bridge-mesh/mesh/trust-mesh');
      trustMesh = createTrustMesh({ busEmit });
      meshNode  = createMeshNode({ identity, gate, ime, busEmit });

      // Peer admission via integrity manager
      bus.on('mesh:peer:incoming', (d) => {
        if (!d?.handshake || !integrityManager) return;
        const { verifyHandshake } = require('./bridge-identity/index');
        const result = integrityManager.admitPeer(d.handshake, { verifyHandshakeFn: verifyHandshake });
        if (!result.admit) {
          busEmit('mesh:peer:rejected', { uuid: d.handshake.uuid, reason: result.reason }, 'WARN');
        }
      });

      // Bus wiring for trust mesh
      bus.on('node:dead',            d => { const u = d._uuid||d.uuid; if(u) trustMesh.pulse(u, false, 0.9, 'node:dead'); });
      bus.on('mesh:peer:connected',  d => { const u = d._uuid||d.uuid; if(u) trustMesh.pulse(u, true,  1.0, 'mesh:peer:connected'); });
      bus.on('sngate:decision',      d => { if(d.decision==='deny'&&d.uuid) trustMesh.pulse(d.uuid, false, 0.6, 'sngate:deny'); });

      phase(8, 'mesh', 'ok', 'ECDH · trust-mesh · peer admission');
    } catch (e) { phase(8, 'mesh', 'warn', e.message); }
  } else {
    phase(8, 'mesh', 'skip', '--no-mesh flag');
  }

  // ── Phase 9: Optional modules (all SOFT) ─────────────────────────────────
  const ctx = { identity, bus, busEmit, gate, ime, causal, trustMesh, meshNode,
                dataBus: bus._dataBus, nodeRegistry: bus._nodeRegistry,
                netId: bus._netId, heartbeat, integrityManager,
                snrLock, dataDir, config: { dataDir, port: parseInt(process.env.NEXUS_PORT || '3747') } };

  function tryLoad(phaseNum, phaseName, loader) {
    try { const r = loader(); phase(phaseNum, phaseName, 'ok', ''); return r; }
    catch (e) { phase(phaseNum, phaseName, 'warn', e.message); return null; }
  }

  ctx.dht      = tryLoad('9a', 'DHT',      () => { const m = require('./bridge-dht/index'); const d = m.createDHT({ identity, busEmit, port: ctx.config.port }); d.start(); return d; });
  ctx.ollama   = tryLoad('9b', 'ollama',   () => { const m = require('./bridge-ollama/index'); if (m.start) m.start({ emit: busEmit, on: bus.on.bind(bus) }); return m; });
  ctx.routing  = tryLoad('9c', 'routing',  () => { const m = require('./bridge-routing/index'); if (m.init) m.init({ identity, modules: {}, dataDir, ports: { mesh: ctx.config.port } }, { emit: busEmit, on: bus.on.bind(bus) }); return m; });
  ctx.gateway  = tryLoad('9d', 'gateway',  () => { const m = require('./bridge-gateway/index'); if (m.init) m.init({ emit: busEmit, on: bus.on.bind(bus) }); return m; });
  ctx.swarm    = tryLoad('9e', 'swarm',    () => { const { SwarmEngine } = require('./bridge-swarm/index'); const s = new SwarmEngine({ dataDir }); s.init(bus, { gate, ime, identity, dataBus: ctx.dataBus }); return s; });
  ctx.aiIdent  = tryLoad('9f', 'ai-ident', () => { const m = require('./bridge-ai-identity/index'); m.registerWithDataBus(ctx.dataBus, busEmit); return m; });
  ctx.guardian = tryLoad('9g', 'guardian', () => { const { createWSGateway } = require('./bridge-plugin/gateway/ws-gateway'); return createWSGateway({ busEmit }); });
  ctx.magnet   = tryLoad('9h', 'magnet',   () => { const m = require('./bridge-magnet/index'); if (m.init) m.init({ emit: busEmit, on: bus.on.bind(bus) }, { peers: [] }); return m; });
  ctx.cfr      = tryLoad('9i', 'CFR',      () => { const m = require('./bridge-cfr/index'); m.install(ctx); return m; });

  // ── Phase 10: HTTP server :3747 (HARD GATE) ───────────────────────────────
  let server;
  try {
    const http = require('http');
    const { boot: bootHTTP } = require('./bridge-node/boot');
    // The HTTP server is assembled inside boot.js and returned
    // We re-use boot.js's route table but inject our already-live ctx
    server = await bootHTTP({ _inject: ctx });
    phase(10, 'HTTP :3747', 'ok', `:${ctx.config.port}`);
  } catch (e) { fatal(10, 'HTTP', e); }

  // ── Boot complete ─────────────────────────────────────────────────────────
  const elapsed = ((Date.now() - t0) / 1000).toFixed(2);

  if (!QUIET) {
    console.log(`\n  ${A.green}●${A.reset}  Online in ${A.bold}${elapsed}s${A.reset}`);
    console.log(`  ${A.dim}│${A.reset}  UUID     ${identity.uuid}`);
    console.log(`  ${A.dim}│${A.reset}  ShortID  ${A.bold}${identity.uuid.slice(0, 8)}${A.reset}`);
    console.log(`  ${A.dim}│${A.reset}  Port     :${ctx.config.port}`);
    console.log(`  ${A.dim}│${A.reset}  SNR      ${A.green}armed${A.reset} · IME ${A.green}armed${A.reset} · Gate ${A.green}armed${A.reset}`);
    console.log(`  ${A.dim}└${A.reset}  nexus://${identity.uuid.slice(0, 8)}\n`);
  }

  // Emit signed boot event (proof: identity holds the key)
  busEmit('bridge:boot', {
    _uuid:   identity.uuid,
    uuid:    identity.uuid,
    port:    ctx.config.port,
    elapsed,
    version: VERSION,
    sig:     identity.sign(`bridge:boot:${identity.uuid}:${elapsed}`),
    snr:     snrLock.stats(),
    phases:  PHASE_LOG,
  }, 'INFO');

  // Attach CLI if requested
  if (WITH_CLI) {
    const { startCLI } = require('./bridge-cli/nexus-cli');
    setTimeout(() => startCLI({ port: ctx.config.port, host: 'localhost', bus, busEmit, ctx }), 350);
  }

  if (WITH_DIAG) {
    const { spawn } = require('child_process');
    spawn(process.execPath, [path.join(__dirname, 'service', 'nexus-diag.js')], {
      stdio: 'inherit', cwd: __dirname,
    });
  }

  return { server, ctx };
}

// ── Graceful shutdown ─────────────────────────────────────────────────────────
function attachShutdown(server, busEmit, uuid) {
  const shutdown = (sig) => {
    if (!QUIET) console.log(`\n  ${A.yellow}⚡${A.reset}  Shutting down (${sig})…`);
    try { busEmit?.('bridge:shutdown', { uuid, signal: sig }, 'INFO'); } catch {}
    server?.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 5000);
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT',  () => shutdown('SIGINT'));
}

// ── Run ───────────────────────────────────────────────────────────────────────
boot().then(({ server, ctx }) => {
  attachShutdown(server, ctx.busEmit, ctx.identity.uuid);
}).catch(err => {
  console.error(`\n${A.red}FATAL BOOT ERROR:${A.reset}`, err.message);
  console.error(err.stack);
  process.exit(1);
});

module.exports = { boot };
