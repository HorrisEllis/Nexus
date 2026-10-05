'use strict';
const _bootedAt = Date.now();   // §health — real uptime, not a guess
let _tensionWarned = false;   // §1.2 warn-once for the missing cortex/healer canonical scorer
// diagnostic/nexus-diagnostic.js — System Auditing + Monitoring Service
// UUID: nexus-diagnostic-service-v1-0000-4000-0000-000000000001
//
// A running ICO kernel that:
//   - Reads all system ledgers every N seconds
//   - Computes sigma/friction/drift per system
//   - Detects gaps (baseline deviations, missing heartbeats, stuck queues)
//   - Surfaces gaps in real-time via SSE + REST
//   - Logs its own events to data/diagnostic/ledger/
//   - Failure mode ledger with solution + friction scoring
//
// HTTP :7825:
//   GET /status          — full system health snapshot
//   GET /gaps            — all open gaps across all systems
//   GET /friction        — per-system friction scores
//   GET /audit           — full audit: requires, syntax, endpoints, ledger health
//   GET /ledger/:system  — tail of a system's ledger
//   GET /baseline/:sys   — baseline stats for a system
//   GET /events          — SSE stream of all diagnostic events
//
// CLI:
//   node diagnostic/nexus-diagnostic.js           — start service
//   node diagnostic/nexus-diagnostic.js status    — check health
//   node diagnostic/nexus-diagnostic.js gaps      — print open gaps
//   node diagnostic/nexus-diagnostic.js audit     — full audit

const fs     = require('fs');
const path   = require('path');
const http   = require('http');
const crypto = require('crypto');

const { createICO }      = require('../lib/ico');
const { createContractVerifier, loadContracts } = require('../intelligence/cfr/contract-verifier');
const { createCFRField, computeRegime }         = require('../intelligence/cfr/field');
const { createBaseline } = require('../intelligence/baseline');
const { sigma, mean }    = require('../intelligence/baseline');
// §NEW 2026-07-11 — loom/schema/axioms.js's loom.wire-endpoints-exist
// axiom already HARD-rejects a dangling wire at declare time — real,
// working, verified live. But nothing checks for the OTHER shape of the
// same problem: a hook declared as an output that never got a wire at
// all, which the axiom can't catch because it only fires when a wire is
// actually being declared. This diagnostic makes that check periodic and
// automatic instead of something someone has to think to run by hand.
const { LoomDriver } = require('../loom/schema/index.js');
const WireIntegrity = require('./wire-integrity');
// ── Meta layer: telemetry codec replaces hand-rolled stats where available ────
let _metaTelemetry = null;
function _getMetaTel() {
  if (_metaTelemetry !== null) return _metaTelemetry;
  try { _metaTelemetry = require('../intelligence/telemetry-codec/index.js'); } catch(_) { _metaTelemetry = false; }
  return _metaTelemetry;
}
// Per-system TelemetryRuntime instances — keyed by system name
const _sysRuntimes = {};
function _getSysRuntime(name) {
  if (!_sysRuntimes[name]) {
    const tel = _getMetaTel();
    if (tel) _sysRuntimes[name] = new tel.TelemetryRuntime({ serviceId: name });
  }
  return _sysRuntimes[name] || null;
}

// ── Diagnostic engines: 12-engine composite health pack (entropy_rate, snr_floor,
//    homeostasis, fault_tree, cascade_risk, fingerprint, ...) ─────────────────
// FIX: this function was called at two sites (/engines and /tension) but never
// defined anywhere in the file — a bare `_getDiagEngines()` call threw
// ReferenceError and crashed the entire diagnostic process (Node exits on an
// uncaught exception in an http handler), which cascaded into
// "contract.unreachable" for every other system on the next health pass.
// Follows the exact same lazy-require/cache-false precedent as _getMetaTel()
// above: if the engines module isn't present, this returns null instead of
// throwing, and both existing call sites already null-check it correctly
// (`if (!de) return 503` / `if (de2) {...}`) — they just needed the function
// to actually exist. §1.2 (nothing silent): logs once, not per-request.
// §FIX-14.8a-CORRECTED: the Phase 14.x expansion shipped lib/diag-engines/index.js,
// but it exports runAll(snapshot) -> {composite,status,engines,critical} — a
// different API than what /engines and /tension below actually call
// (runAllEngines({events,systemStates}) -> {healthScore,alertCount,alerts,
// engines:{X:{regime}}}). That exact API already exists, fully implemented
// with all 12 engines, in lib/diagnostic-engines.js — it was just never wired
// in here. Pointing the loader there fixes the real 503s with zero API risk.
// lib/diag-engines/ (the JAA-snapshot-based pack) is still installed and
// reachable via lib/nexus-expansion-boot.js#getDiagEngines() for future use
// against buildDiagSnapshot(jaaDB, bus) — just not as this endpoint's source.
let _diagEngines = null;
let _diagEnginesWarned = false;
function _getDiagEngines() {
  if (_diagEngines !== null) return _diagEngines || null;
  try {
    _diagEngines = require('../lib/diagnostic-engines.js');
  } catch (_) {
    _diagEngines = false;
    if (!_diagEnginesWarned) {
      _diagEnginesWarned = true;
      console.warn(`[nexus-diagnostic] diagnostic engines module not found (../lib/diagnostic-engines) — ` +
        `/engines and the engine summary on /tension will report unavailable instead of crashing. ` +
        `This is a real gap (Phase 47/CG-class: missing module, not a transient failure) — ` +
        `build or wire ../lib/diag-engines if the 12-engine composite health pack is needed.`);
    }
  }
  return _diagEngines || null;
}

const ROOT    = path.join(__dirname, '..');

const PORT    = 7825;
const PID_FILE = path.join(ROOT, 'data/diagnostic/diagnostic.pid');

function uid() { return crypto.randomUUID(); }

// ── System registry ───────────────────────────────────────────────────────────

const SYSTEMS = {
  // §LEDGER-FIX: paths now match flat JSONL written by ledger-writer + jaaDB
  guardian:    { port: 7820, dataDir: 'data/guardian',    healthPath: '/health',   label: 'Guardian' },
  cortex:      { port: 3748, dataDir: 'cortex/data',      healthPath: '/health', label: 'Cortex' },
  idearium:    { port: 4800, dataDir: 'data/idearium',    healthPath: '/health', label: 'Idearium' },
  orchestrator:{ port: 9000, dataDir: 'data/orchestrator',healthPath: '/health',   label: 'Orchestrator' },
  // §RETIRED 2026-09-06 — emerge is no longer a standalone process
  // (see PULSE_ALL_2026-09-06 in the phasemap): copilot/module-
  // builder.js now calls emerge/compiler/pipeline.js's compile()
  // directly. Nothing serves :4242/status anymore — polling it would
  // recreate the exact stale-registry-entry problem bridge's own dead
  // entry caused before this session's earlier bridge removal pass.
  // emerge/registry-components.js (a few lines below, _REGISTRY_PATHS)
  // is untouched — that's about the still-real compiler's components,
  // not this retired service entry.
  architect:   { port: 3747, dataDir: 'data/architect',   healthPath: '/health', label: 'Architect' },
  diagnostic:  { port: 7825, dataDir: 'data/diagnostic',  healthPath: '/status',   label: 'Diagnostic' },
  // §DIAGNOSTIC-AWARE 2026-08-28 — James: "ClearGlass-aware diagnostics
  // (expected runtime behavior, deviation detection)... need those."
  // Real gap, confirmed directly: Clear Glass was not in this registry
  // at all — the entire diagnostic system (baseline observation, gap
  // detection, self-heal triggering) had zero visibility into it.
  //
  // optional:true — same flag 'emerge' above already uses, but fixed
  // here for both of them (see the offlineMs gate above): it now
  // genuinely suppresses the generic "port didn't answer" offline gap,
  // not just a log line's wording, which is what this flag's name
  // always should have meant. Clear Glass is deliberately dormant
  // (autopilot's onDemand:true) until something requests it — being
  // offline is its normal resting state, not a fault, and this poller
  // has no way to know whether anyone recently asked it to be up.
  // Clear Glass's REAL, precise deviation detection — a spawn actually
  // attempted and failing — is handled separately below, driven by
  // orchestrator's own real orchestrator.ui.open_failed event, not this
  // generic check. healthPath:'/status' (not '/health' — Clear Glass
  // has no separate /health route; /status already returns 200 with
  // real, live data plus a real uptime, confirmed directly).
  //
  // §FIX 2026-09-02 — James, live, twice: "'clear-glass' missed its
  // /status probe... spamming my console. should all be using the
  // heartbeat system anyways." Real root cause found, not a timing
  // race: clear-glass's MAIN process registers with orchestrator as
  // systemId 'clear-glass' on its own SSE port (7701, real createPulse
  // call in clear-glass/src/main/index.js), while THIS entry's port
  // (7704) is nexus-wire's — a genuinely separate process, registered
  // under systemId 'nexus-wire' instead. Two different real processes,
  // two independent heartbeat timings, meaning the direct probe here
  // and the registry-fallback lookup below can drift out of sync
  // repeatedly, not just once at boot — the earlier log-severity fix
  // addressed the symptom, not this. preferHeartbeat:true (read by
  // pollSystem() below) skips the direct probe for this system
  // entirely and trusts orchestrator's real registry first, exactly as
  // asked — the probe is a fallback only if the registry itself has
  // nothing recent.
  'clear-glass':{ port: 7704, dataDir: 'data/clear-glass', healthPath: '/status',  label: 'Clear Glass', optional: true, preferHeartbeat: true },
  // §MONITOR-03: UI surfaces — probed as virtual systems, no dataDir
  'forge-shell':{ port: 9000, dataDir: 'data/orchestrator', healthPath: '/ui/forge-shell/forge-shell.html',
    label: 'Forge Shell', virtual: true, optional: true,
    // Forge shell is served by orchestrator — it's healthy when orch is healthy
    // We track it separately to surface in the diagnostic tile
  },
  // §BUILD 2026-08-30 — DOD2_diagnose_and_self_repair's real, confirmed
  // remaining gap: "only a handful of real systems are actually
  // registered... most of the ~30+ real systems in this codebase are
  // not yet diagnostic-aware. Not a design gap, a coverage gap." Cross-
  // checked this registry against autopilot.js's own real, authoritative
  // ALL_KERNELS list (the true source of what's actually supervised) and
  // found 6 real systems missing entirely. Adding the 5 with a real,
  // confirmed healthUrl in autopilot's own definition — ports/paths
  // copied directly from there, not guessed. optional:true mirrors
  // autopilot's own real optional flag for each, so a dormant/not-yet-
  // started one doesn't trip a false alarm the same way clear-glass's
  // own optional:true already prevents above.
  eravos:      { port: 3751, dataDir: 'data/eravos',      healthPath: '/health', label: 'Eravos' },
  intelligence:{ port: 3753, dataDir: 'data/intelligence', healthPath: '/health', label: 'Intelligence' },
  'ollama-bridge':{ port: 3749, dataDir: 'data/ollama',    healthPath: '/health', label: 'Ollama Bridge', optional: true },
  copilot:     { port: 3750, dataDir: 'data/copilot',      healthPath: '/health', label: 'Co-pilot', optional: true },
  loom:        { port: 3752, dataDir: 'data/loom',         healthPath: '/health', label: 'Loom', optional: true },
  // §HONEST LIMIT — intelligence-consumer (autopilot.js: { name:
  // 'intelligence-consumer', cmd: 'node', args: ['intelligence/
  // consumer.js'], optional: true, phase: 4 }) deliberately NOT added
  // here. Checked directly: it has no port and no healthUrl anywhere in
  // its own real autopilot definition — a pure file-watcher with zero
  // network presence, not even the "wrong path" situation emerge's own
  // existing (separate, pre-existing, not touched here) registration
  // has. This polling mechanism is fundamentally port-based
  // (pollSystem builds http://127.0.0.1:${port}${healthPath} — a
  // missing healthPath would produce a literal "undefined" in that
  // URL, a worse bug than not registering it at all). Real remaining
  // work, not silently dropped: either pollSystem needs a genuine
  // no-probe/registry-only mode, or intelligence-consumer needs its own
  // minimal real health endpoint added — a decision and a change this
  // pass didn't make unilaterally.
};

// ── CLI dispatch ──────────────────────────────────────────────────────────────

const cmd = process.argv[2];
if      (cmd === 'status') { checkStatus(); }
else if (cmd === 'stop')   { stopService(); }
else if (cmd === 'gaps')   { printGaps(); }
else if (cmd === 'audit')  { runAudit().then(r => { console.log(JSON.stringify(r, null, 2)); process.exit(0); }); }
else                       { startService(); }

// ── Check / Stop ──────────────────────────────────────────────────────────────

function checkStatus() {
  if (!fs.existsSync(PID_FILE)) { console.log('NOT RUNNING'); process.exit(1); }
  const pid = parseInt(fs.readFileSync(PID_FILE,'utf8').trim());
  try {
    process.kill(pid, 0);
    const req = http.get(`http://127.0.0.1:${PORT}/status`, { timeout:2000 }, res => {
      let b=''; res.on('data',d=>b+=d); res.on('end',()=>{
        try { const d=JSON.parse(b); console.log('RUNNING pid='+pid+'\n'+JSON.stringify(d.summary,null,2)); process.exit(0); }
        catch { console.log('RUNNING pid='+pid); process.exit(0); }
      });
    });
    req.on('error',()=>{ console.log('RUNNING pid='+pid+' (port not responding)'); process.exit(0); });
  } catch { fs.unlinkSync(PID_FILE); console.log('NOT RUNNING (stale pid)'); process.exit(1); }
}

function stopService() {
  if (!fs.existsSync(PID_FILE)) { console.log('NOT RUNNING'); process.exit(0); }
  const pid = parseInt(fs.readFileSync(PID_FILE,'utf8').trim());
  try { process.kill(pid,'SIGTERM'); console.log(`SIGTERM → pid=${pid}`); fs.unlinkSync(PID_FILE); }
  catch { console.log('Failed to stop'); }
  process.exit(0);
}

async function printGaps() {
  const req = http.get(`http://127.0.0.1:${PORT}/gaps`, { timeout:3000 }, res => {
    let b=''; res.on('data',d=>b+=d); res.on('end',()=>{
      try {
        const d = JSON.parse(b);
        const gaps = d.gaps || [];
        if (!gaps.length) { console.log('No open gaps'); process.exit(0); }
        for (const g of gaps) {
          console.log(`[${g.severity||'medium'}] ${g.system} — ${g.type}: ${g.body||g.description||''}`);
        }
      } catch { console.log(b); }
      process.exit(0);
    });
  });
  req.on('error', () => {
    console.log('Diagnostic service not running. Start with: node diagnostic/nexus-diagnostic.js');
    process.exit(1);
  });
}

// ── Start service ─────────────────────────────────────────────────────────────

function startService() {
  fs.mkdirSync(path.join(ROOT, 'data/diagnostic/ledger'),   { recursive: true });
  fs.mkdirSync(path.join(ROOT, 'data/diagnostic/gaps'),     { recursive: true });
  fs.mkdirSync(path.join(ROOT, 'data/diagnostic/friction'), { recursive: true });
  fs.mkdirSync(path.join(ROOT, 'data/diagnostic/invariant'),{ recursive: true });
  fs.writeFileSync(PID_FILE, String(process.pid));

  // Diagnostic ICO kernel
  const ico = createICO({
    name: 'diagnostic',
    root: path.join(ROOT, 'data/diagnostic'),
  });

  // Per-system baseline monitors
  // ── §P3 CRASH FIX 2026-08-07 — sseClients + broadcast HOISTED here, above the
  // monitor setup below. They were declared at ~line 320, but onGap callbacks
  // registered during setup (line ~215) call broadcast(); if a gap fires while
  // monitors are still being created, `const sseClients` is in the temporal dead
  // zone → "Cannot access 'sseClients' before initialization" → the CIRCUIT OPEN
  // crash loop on James's boots. Declaring before first possible use removes it.
  const sseClients = new Set();
  function broadcast(msg) {
    const payload = 'data: ' + JSON.stringify(msg) + '\n\n';
    for (const res of sseClients) {
      try { res.write(payload); } catch { sseClients.delete(res); }
    }
    // §P3 — also fan the diagnostic event into the live stream, so autopilot,
    // intelligence, and co-pilot see diagnostic findings like any other system.
    try { const f = require('../lib/ledger-fanin'); f.emit && f.emit({ type: `diagnostic.${msg.type || 'event'}`, source: 'diagnostic', payload: msg, ts: msg.ts || Date.now() }); } catch (_) {}
  }

  // §2026-08-09 — James: "did you ever build the kernel for that?" This
  // kernel has ALWAYS written its own gaps to ico.ledger.append('gaps', ...)
  // — an append-only history, separate from every other gap-writer in NEXUS.
  // gap-field.js unified gap-finder + user-model.checkContradictions +
  // diagnostic-causal into one queryable "what's open right now" table, but
  // never reached THIS kernel — the one that actually boots as a service.
  // Dual-write, not a replacement: the ledger stays (real history worth
  // keeping), this ALSO puts the same gap on gap-field's table so "what's
  // open right now" is complete, kernel included.
  function _reportToGapField(gap) {
    try {
      const gapField = require('../lib/gap-field');
      // §GRANULARITY 2026-08-13 — resolve the specific component loom knows
      // about, not just the system string. For wire-integrity gaps this is
      // free: gap.hookId already carries loom's own id, and loom-map's
      // resolveComponent() walks hook -> component_id through the live
      // registry rather than guessing from the id's shape. found:false
      // (component stays null) is the honest answer for gap sources that
      // don't carry a loom-resolvable id at all — never fabricated.
      let component = null;
      if (gap.hookId) {
        try {
          const loomMap = require('../lib/loom-map');
          const resolved = loomMap.resolveComponent(gap.hookId);
          if (resolved.found) component = resolved.componentId;
        } catch (_) { /* loom-map unavailable — report proceeds without component, same as before this existed */ }
      }
      gapField.report({
        type: gap.type,
        body: gap.body || gap.detail || gap.message || gap.type,
        source: gap.system || gap.source || 'diagnostic-kernel',
        domain: 'system',
        severity: gap.severity || 'medium',
        component,
        meta: { kernelGapUuid: gap.uuid, hookId: gap.hookId, direction: gap.direction },
      });
    } catch (e) { console.warn(`[diag] gap-field dual-write failed (non-fatal, ledger write still happened): ${e.message}`); }
  }

  const monitors = {};
  for (const [name, cfg] of Object.entries(SYSTEMS)) {
    monitors[name] = createBaseline({
      name,
      ledgerDir:    path.join(ROOT, cfg.dataDir),   // §LEDGER-FIX: dataDir is now the source
      failuresDir:  path.join(ROOT, cfg.dataDir, 'failures'),
      invariantDir: path.join(ROOT, cfg.dataDir, 'invariant'),
      baselineN:    10,
      sigmaThreshold: 0.25,
      onGap: (gap) => {
        gap.system = name;
        openGaps.set(gap.uuid, gap);
        broadcast({ type: 'gap.found', gap, ts: Date.now() });
        ico.ledger.append('gaps', { ...gap, ts: Date.now() });
        _reportToGapField(gap);
        const cfrSnap = cfrFeed('cortex.gap.found', gap.sigma || 0);
        broadcast({ type: 'cfr.update', cfr: cfrSnap, ts: Date.now() });
        console.log(`[diag] GAP ${name}: ${gap.type} sigma=${gap.sigma}`);
      },
    });
  }

  // In-memory gap store (backed by ledger)
  const openGaps = new Map();

  // §PERSIST-HYDRATE 2026-08-13 — the actual root cause of the ~470
  // dangling-hook gaps re-announcing on EVERY boot (loud in the log this
  // was found from: identical console spam, identical broadcasts, growing
  // JAA gaps row count — 1 row -> 495 rows across one restart cycle).
  // openGaps' dedup gate (`if (openGaps.has(gapKey)) continue` in
  // _wireIntegrityScan below) only prevents re-announcing a hook WITHIN one
  // process's lifetime — it was never hydrated from anything on boot, so a
  // fresh process always starts believing zero hooks are dangling and
  // rediscovers every single one from scratch, each one going through
  // console.log + broadcast + ico.ledger.append (which write-throughs to
  // component-ledger -> event_log — the exact table cortex/intelligence's
  // pattern scanner reads) + gapField.report(). gap-field.js's own
  // dedup_key check stops the persisted `gaps` TABLE from growing without
  // bound, but it runs downstream of all of that — it caps row count, it
  // doesn't prevent the restart noise. Seeding openGaps from gap-field's
  // own store closes the actual gap: a hook already known-dangling from a
  // prior boot is skipped here the same way it would be mid-run, instead
  // of being rediscovered the expensive, noisy way every single restart.
  try {
    const gapField = require('../lib/gap-field');
    const persistedOpen = gapField.openGaps({ domain: 'system', limit: 10000 })
      .filter(g => g.type === 'dangling-hook' && g.meta?.hookId);
    for (const g of persistedOpen) {
      const gapKey = `wire-integrity:${g.meta.hookId}`;
      openGaps.set(gapKey, {
        uuid: gapKey, type: 'dangling-hook', system: g.source,
        hookId: g.meta.hookId, direction: g.meta.direction,
        detail: g.body, hydratedFrom: g.uuid, gapFieldUuids: [g.uuid],
      });
      // several persisted rows can name the same hook (older boots); keep them all so the scan can close every one
      const cur = openGaps.get(gapKey);
      if (cur.gapFieldUuids && !cur.gapFieldUuids.includes(g.uuid)) cur.gapFieldUuids.push(g.uuid);
    }
    if (persistedOpen.length)
      console.log(`[diag] hydrated ${persistedOpen.length} open dangling-hook gap(s) from prior boot — wire-integrity scan will only announce genuinely NEW ones`);
  } catch (e) {
    console.warn(`[diag] openGaps hydration failed (non-fatal — falls back to full rediscovery on first scan): ${e.message}`);
  }

  // §NEW 2026-07-11 — the actual gap this session found: "the diagnostic
  // tool doesn't do much." It had real wire-validation logic
  // (_extractWires/_validateWires below) — reachable, correct, but only
  // via a manual GET /components call, and reading a THIRD data source
  // (static registry-components.js files) separate from both loom's
  // enforced registry and the real runtime code (IPC handlers, gate()
  // registrations, event emitters) where every actual bug this session
  // found was hand-written and unchecked. This is the periodic,
  // automatic version, reading loom's REAL registry (the one now
  // actually seeded — see loom/seed/2026-07-11-session-wires.js) —
  // same onGap/openGaps/broadcast/ledger pattern the baseline monitors
  // above already use, so a dangling wire shows up in the exact same
  // place "[diag] GAP idearium: baseline_deviation sigma=0.3" already
  // does, not a second, separate reporting surface nobody thinks to check.
  function _wireIntegrityScan() {
    let driver;
    try { driver = new LoomDriver({}); }
    catch (e) { console.warn('[diag] wire-integrity scan: loom unavailable —', e.message); return; }

    const graph = driver.graph();
    const hookById = new Map(graph.nodes.filter(n => n.kind === 'hook' || n.direction).map(n => [n.id, n]));
    // Fall back to scanning raw nodes if `kind` isn't tagged the way expected —
    // §1.2: a scan that silently finds nothing because of a shape mismatch
    // is worse than one that errors loudly.
    if (hookById.size === 0 && graph.nodes.length > 0) {
      console.warn('[diag] wire-integrity scan: graph().nodes shape unexpected — 0 hooks matched out of', graph.nodes.length, 'nodes');
    }

    // §0.39.260 — classification moved to diagnostic/wire-integrity.js (pure,
    // tested). Require-graph `<file>.import/.export` hooks are counted, not
    // raised: see that file's header for why they are not wiring contracts.
    const cls = WireIntegrity.classify(graph);
    const derivedUnwired = cls.derivedUnwired;

    for (const node of cls.dangling) {
      const isOrphanOut = node.isOrphanOut;
      const gapKey = `wire-integrity:${node.id}`;
      if (openGaps.has(gapKey)) continue; // don't re-open every scan — same dedup discipline as the stuck-contract gaps above

      const gap = {
        uuid: gapKey,
        type: 'dangling-hook',
        system: node.component_id || 'unknown',
        hookId: node.id,
        direction: node.direction,
        detail: isOrphanOut
          ? `hook '${node.id}' is declared as an OUTPUT but no wire connects it to anything — an emit/call with no possible listener`
          : `hook '${node.id}' is declared as an INPUT but no wire ever targets it — dead code, or a caller that was never wired`,
      };
      openGaps.set(gap.uuid, gap);
      broadcast({ type: 'gap.found', gap, ts: Date.now() });
      try { ico.ledger.append('gaps', { ...gap, ts: Date.now() }); } catch (_) {}
      _reportToGapField(gap);
      console.log(`[diag] GAP ${gap.system}: ${gap.type} hook=${gap.hookId} (${gap.direction})`);
    }

    // Close what no longer qualifies: a hook that was since wired, removed
    // from the registry (the pruned imported-repo records), or is a derived
    // require-graph hook. Before this, a dangling-hook gap could be opened
    // but never closed, so every one ever raised was re-hydrated each boot.
    const gapField = (() => { try { return require('../lib/gap-field'); } catch (_) { return null; } })();
    let closed = 0;
    for (const [gapKey, g] of openGaps) {
      if (g.type !== 'dangling-hook' || !gapKey.startsWith('wire-integrity:')) continue;
      const why = WireIntegrity.closeReason(g.hookId, cls);
      if (!why) continue;
      openGaps.delete(gapKey);
      const uuids = g.gapFieldUuids || (g.hydratedFrom ? [g.hydratedFrom] : []);
      if (gapField && typeof gapField.resolve === 'function') for (const u of uuids) gapField.resolve(u, why);
      broadcast({ type: 'gap.resolved', gap: { uuid: gapKey, hookId: g.hookId, reason: why }, ts: Date.now() });
      closed++;
    }
    if (closed) console.log(`[diag] wire-integrity: closed ${closed} dangling-hook gap(s) that no longer qualify`);
    if (derivedUnwired !== _lastDerivedUnwired) {
      _lastDerivedUnwired = derivedUnwired;
      if (derivedUnwired) console.log(`[diag] wire-integrity: ${derivedUnwired} require-graph hook(s) without a wire (root/leaf files, dynamic requires) — counted, not raised as gaps`);
    }
  }
  let _lastDerivedUnwired = -1;
  // Wire declarations don't change every 15s the way system health does —
  // every 60s is frequent enough to catch a regression quickly without
  // spamming a scan that reads the whole registry each time.
  _wireIntegrityScan();
  setInterval(_wireIntegrityScan, 60000);

  // §WIRED 2026-08-17 — James: "Run a check every boot up, a system check
  // of every system in order one by one. Core first, cli, api, event
  // driven interaction contract, ui. Then each module... bottom up,
  // architecture first." lib/system-check.js built and verified earlier
  // this same day, deliberately NOT wired in then — this is that real
  // integration, done separately and carefully, not rushed into the same
  // pass as building it. Once per boot only, not intervaled like the wire
  // scan above: a system's own architecture (does cortex/boot.js exist,
  // does guardian have a cli/ dir) doesn't change mid-process the way
  // live wire declarations can. §1.2 — wrapped; a system-check failure
  // must never stop diagnostic boot, same reasoning as every other
  // defensive wrap in this file.
  try {
    const systemCheck = require('../lib/system-check');
    const result = systemCheck.run({ dryRun: false });
    const missing = result.results.filter(r => Object.values(r.layers).some(v => !v)).length;
    console.log(`[diag] system-check: ${result.order.length} real systems, ordered ${result.order.join(' > ')} — ${missing} with at least one missing layer (real gaps written, priority-scored)`);
  } catch (e) { console.warn('[diag] system-check unavailable (non-fatal):', e.message); }

  // ── CFR field — local diagnostic field, nudged by gap/poll events ──────────
  const cfrField = createCFRField();
  function cfrFeed(type, sigmaScore = 0) {
    return cfrField.update(type, sigmaScore);
  }

  // ── Guardian CFR field — proxied from the ledger-backed source of truth ────
  let guardianCFR = null; // last fetched snapshot from :7820/cfr/state, or null if unreachable
  function fetchGuardianCFR() {
    return new Promise((resolve) => {
      const req = http.get(`http://127.0.0.1:${SYSTEMS.guardian.port}/cfr/state`, { timeout: 1500 }, res => {
        let b = ''; res.on('data', d => b += d); res.on('end', () => {
          try { guardianCFR = JSON.parse(b); } catch { guardianCFR = null; }
          resolve(guardianCFR);
        });
      });
      req.on('error', () => { guardianCFR = null; resolve(null); });
      req.on('timeout', () => { req.destroy(); guardianCFR = null; resolve(null); });
    });
  }

  // SSE clients — declared above (hoisted for the crash fix); broadcast() too.

  // ── Contract verifier — validates runtime behavior vs interaction contracts ──
  const contracts = loadContracts(ROOT);
  const _verifier = createContractVerifier({
    contracts,
    onViolation: (v) => {
      // Write violation to diagnostic ledger
      if (v.severity > 0) {
        ico.ledger.append('gaps', {
          type:     v.type,
          body:     v.message,
          system:   v.system,
          severity: v.severity > 0.7 ? 'high' : v.severity > 0.4 ? 'medium' : 'low',
          status:   'open',
          source:   'contract-verifier',
          ts:       Date.now(),
        });
        _reportToGapField({ type: v.type, body: v.message, system: v.system, severity: v.severity > 0.7 ? 'high' : v.severity > 0.4 ? 'medium' : 'low' });
        // Broadcast to diagnostic SSE
        _broadcast({ type: v.type, ...v });
      }
    },
  });

  // Tick the contract verifier every 5s to catch expired behavioral rules
  setInterval(() => _verifier.tick(), 5000).unref();

  // ── Polling loop — read ledgers + probe health ────────────────────────────

  const systemState = {};

  // §BUGFIX 2026-08-30 — James: "the diagnostic is still probing" (real
  // console spam, confirmed by counting timestamps in a real captured
  // log in an earlier session: 7,263 occurrences in one hour, ~twice a
  // second, from the "live ledger watching" fs.watch handler re-
  // triggering pollSystem() on every write to a system's own .ndjson
  // ledger). Same fix already proven in a sibling checkout, applied
  // here since this lineage never had it. Real dedup: log this warning
  // at most once per minute per system, matching the friction logger's
  // own real granularity elsewhere in this file (_remediatedGaps).
  const _registryFallbackLogged = new Set();

  async function pollSystem(name, cfg) {
    const state = systemState[name] || { online: false, uptime: 0, friction: 0, gaps: [] };

    // §FIX 2026-09-02 — James: "should all be using the heartbeat system
    // anyways." For a system flagged preferHeartbeat (clear-glass, see
    // that config entry's own header for the real root cause), the
    // orchestrator registry — fed by that system's own real, already-
    // running createPulse() heartbeat — IS the primary source of truth,
    // not a fallback consulted only after a failed direct probe. The
    // direct HTTP probe below still exists as a real, honest last
    // resort if the registry itself has nothing recent (e.g.
    // orchestrator itself is down), not removed — just no longer tried
    // first for a system where "first" was the actual source of drift.
    async function _checkRegistry(timeoutMs) {
      try {
        const reg = await new Promise((resolve) => {
          const rq = http.get(`http://127.0.0.1:9000/api/registry`, { timeout: timeoutMs }, r => {
            let b = ''; r.on('data', d => b += d);
            r.on('end', () => { try { resolve(JSON.parse(b)); } catch { resolve(null); } });
          });
          rq.on('error', () => resolve(null));
          rq.on('timeout', () => { rq.destroy(); resolve(null); });
        });
        const entry = reg && reg.registry && reg.registry[name];
        const lastSeen = entry && (entry.lastSeen || entry.ts);
        return lastSeen && (Date.now() - lastSeen) < 15000 ? lastSeen : null;
      } catch (_) { return null; }
    }

    let online = false, uptime = 0, jobs = 0, onlineSource = 'probe';

    // §0.39.327 — James: "i though we switched to heartbeat and pulse system". Every system pulses to orchestrator
    // (createPulse → POST /api/heartbeat every 10 s; orchestrator watches for missed pulses). Only clear-glass read the
    // pulse first; every other system was HTTP-probed first, so a system still booting "missed its /health probe" and
    // was rescued by the registry a moment later — the log he pasted. The pulse is now first for every system; the
    // probe stays as the fallback for a system orchestrator has not heard from (no pulse yet, or orchestrator down).
    // preferHeartbeat:false opts a system out.
    if (cfg.preferHeartbeat !== false) {
      const lastSeen = await _checkRegistry(1500);
      if (lastSeen) { online = true; onlineSource = 'heartbeat'; }
    }

    // 1. Probe health endpoint — skipped entirely for a preferHeartbeat
    // system that the registry already confirmed online, tried as the
    // real primary path for everyone else, and as a real last resort
    // for a preferHeartbeat system the registry couldn't confirm.
    if (!online) {
      try {
        await new Promise((resolve) => {
          const req = http.get(`http://127.0.0.1:${cfg.port}${cfg.healthPath}`, { timeout: 2000 }, res => {
            let b = '';
            res.on('data', d => b += d);
            res.on('end', () => {
              online = res.statusCode === 200; // status code is ground truth regardless of body shape
              try {
                const d = JSON.parse(b);
                uptime = d.uptime || 0;
                jobs   = d.jobs   || 0;
              } catch {}
              resolve();
            });
          });
          req.on('error', () => resolve());
          req.on('timeout', () => { req.destroy(); resolve(); });
        });
      } catch {}
    }

    // ── §COMPETING TRUTH FIXED 2026-07-24 ─────────────────────────────────
    // Until now this probe alone decided `online`, with a 2s timeout and NO
    // registry fallback — while orchestrator/allHealth() decides the same
    // question with a 3s probe OR a registry lastSeen within 15s. So a system
    // that was alive but briefly slow to answer was ONLINE TO ORCHESTRATOR AND
    // OFFLINE TO DIAGNOSTIC AT THE SAME MOMENT (§10.3 competing truth).
    //
    // That was not a cosmetic disagreement. Diagnostic acts on its answer: it
    // raises a `system_offline` gap and fires HEAL_REQUESTED. So the divergence
    // was a SPURIOUS-HEAL GENERATOR, and it fired hardest exactly when the
    // system was under load and slow — i.e. when a stampede of heal attempts
    // is the last thing wanted.
    //
    // Orchestrator is the registration authority (every system registers and
    // heartbeats there), so it OWNS liveness. Diagnostic now defers to it
    // rather than maintaining a private opinion: a system this probe missed is
    // only declared offline if orchestrator has not heard from it either.
    // Consulted over HTTP, never by require (decoupling law) — and a failure
    // to reach orchestrator leaves the local probe's answer standing, with the
    // degradation NAMED rather than silently trusted.
    if (!online) {
      try {
        const reg = await new Promise((resolve) => {
          const rq = http.get(`http://127.0.0.1:9000/api/registry`, { timeout: 1500 }, r => {
            let b = ''; r.on('data', d => b += d);
            r.on('end', () => { try { resolve(JSON.parse(b)); } catch { resolve(null); } });
          });
          rq.on('error', () => resolve(null));
          rq.on('timeout', () => { rq.destroy(); resolve(null); });
        });
        // Shape verified against orchestrator.js's registryAll(), not guessed:
        // { ok, registry: { <systemId>: { ...entry, lastSeen, online } }, ts }.
        // My first pass assumed a `systems` array and would have silently
        // found nothing — the fallback would have looked wired and never
        // fired, which is the failure mode this whole session keeps finding.
        const entry = reg && reg.registry && reg.registry[name];
        const lastSeen = entry && (entry.lastSeen || entry.ts);
        if (lastSeen && (Date.now() - lastSeen) < 15000) {
          online = true;
          onlineSource = 'registry-fallback';
          // §FIX 2026-09-02 — James, live: pasted this exact log line
          // ("registered 1s ago") and asked to fix it. Traced, not
          // silently suppressed: this specific case — a probe missed
          // within a few seconds of the system's OWN registration — is
          // the exact boundary case this 2026-07-24 fallback was built
          // to handle gracefully, and it IS handling it correctly (no
          // gap raised, online correctly reported). The real annoyance
          // is the WARNING LOG for a benign, expected startup race, not
          // a functional bug — the underlying online=true fallback
          // logic above is unchanged. A miss this close to registration
          // (<5s) is downgraded to a one-time, quiet console.log; a miss
          // further from registration (a system that's been up a while
          // and is still getting missed) keeps the real console.warn,
          // since THAT pattern is the one actually worth a human's
          // attention.
          const sinceRegMs = Date.now() - lastSeen;
          const logKey = `${name}:${Math.floor(Date.now() / 60000)}`; // one per minute per system, matching _remediatedGaps' own real granularity
          if (!_registryFallbackLogged.has(logKey)) {
            _registryFallbackLogged.add(logKey);
            const msg = `[diagnostic] '${name}' missed its ${cfg.healthPath} probe but registered ${Math.round(sinceRegMs / 1000)}s ago — treating as ONLINE, matching orchestrator. No gap raised.`;
            if (sinceRegMs < 5000) console.log(msg);
            else console.warn(msg);
          }
        }
      } catch (_) {
        onlineSource = 'probe-only(registry unreachable)';
      }
    }
    state.onlineSource = onlineSource;

    // Feed to baseline
    monitors[name].observe({
      type:      online ? 'health.ok' : 'health.fail',
      latencyMs: 0,
      error:     !online,
      ts:        Date.now(),
    });

    // 2. Read recent ledger entries from flat JSONL (§LEDGER-FIX)
    // ledger-writer writes: data/<system>/event_log.jsonl
    // guardian still writes: data/guardian/ledger/events.ndjson (legacy path — read both)
    let recentEvents = [];
    try {
      const dataPath  = path.join(ROOT, cfg.dataDir);
      // Primary: flat event_log.jsonl (ledger-writer format)
      const flatFile  = path.join(dataPath, 'event_log.jsonl');
      if (fs.existsSync(flatFile)) {
        const lines = fs.readFileSync(flatFile, 'utf8').trim().split('\n').filter(Boolean);
        const recent = lines.slice(-20).map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
        recentEvents.push(...recent);
      }
      // Legacy: guardian-style ledger/events.ndjson (backwards compat)
      const legacyFile = path.join(dataPath, 'ledger', 'events.ndjson');
      if (!recentEvents.length && fs.existsSync(legacyFile)) {
        const lines = fs.readFileSync(legacyFile, 'utf8').trim().split('\n').filter(Boolean);
        const recent = lines.slice(-20).map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
        recentEvents.push(...recent);
      }
    } catch {}

    // Feed recent events into baseline monitor
    for (const ev of recentEvents) {
      if (!ev._ts) continue;
      monitors[name].observe({ type: ev.type || 'event', latencyMs: 0, error: !!ev.error, ts: ev._ts });
    }

    // 3. Check physical queue for stuck items
    const queueDir = path.join(ROOT, cfg.dataDir, 'queue');
    let stuckCount = 0;
    if (fs.existsSync(queueDir)) {
      const items = fs.readdirSync(queueDir).filter(f => f.endsWith('.json'));
      for (const item of items) {
        try {
          const state = JSON.parse(fs.readFileSync(path.join(queueDir, item), 'utf8'));
          if (state.status === 'processing' && state.claimedAt) {
            const age = Date.now() - state.claimedAt;
            if (age > 120000) { // 2 minutes stuck = gap
              stuckCount++;
              const gapId = uid();
              if (!openGaps.has(`stuck:${state.uuid}`)) {
                const gap = {
                  uuid:        gapId,
                  type:        'stuck_queue_item',
                  system:      name,
                  body:        `Queue item ${state.uuid} stuck in processing for ${Math.round(age/1000)}s`,
                  severity:    'high',
                  status:      'open',
                  ageMs:       age,
                  itemUuid:    state.uuid,
                  detectedAt:  Date.now(),
                };
                openGaps.set(`stuck:${state.uuid}`, gap);
                broadcast({ type: 'gap.found', gap });
                ico.ledger.append('gaps', gap);
                _reportToGapField(gap);
              }
            }
          }
        } catch {}
      }
    }

    // Update state
    const friction = monitors[name].friction();
    const _mStats  = monitors[name].stats();

    // §METRICS-06: write per-system metrics every poll cycle
    try {
      ledgerWriter.writeMetrics(name, {
        sigma: _mStats.sigma||0, slope: _mStats.slope||0,
        errorRate: _mStats.errorRate||0, friction: friction||0,
        latencyMean: _mStats.latencyMean||0, latencyP95: _mStats.latencyP95||_mStats.latencyMean||0,
      });
    } catch(_){}

    systemState[name] = { online, uptime, jobs, friction, stuckCount,
      sigma: _mStats.sigma, slope: _mStats.slope||0,
      openGaps: monitors[name].gaps().length,
      lastChecked: Date.now() };

    return systemState[name];
  }

  async function pollAll() {
    for (const [name, cfg] of Object.entries(SYSTEMS)) {
      await pollSystem(name, cfg);
    }
    await fetchGuardianCFR();
    const allOnline = Object.values(systemState).every(s => s.online);
    const cfrSnap = cfrFeed(allOnline ? 'orchestrator.pulse' : 'pulse.missed');
    broadcast({ type: 'poll.complete', systems: systemState, cfr: cfrSnap, ts: Date.now() });
    ico.ledger.append('poll', { type: 'poll.complete', systems: Object.keys(systemState), cfr: cfrSnap, ts: Date.now() });
  }

  // Poll every 15 seconds
  pollAll();
  const pollTimer = setInterval(pollAll, 15000);

  // ── Active remediation loop (§DIAG-ACTIVE) ──────────────────────────────────
  // Runs every 30s. For each offline system: logs gap + writes to data/diagnostic/
  // For each stuck queue item: attempts unlock.
  // For syntax errors found in audit: logs with fix suggestion.
  // Does NOT restart processes (that's orchestrator's job) but fires HEAL_REQUESTED
  // on the bus so self-heal can attempt forge patching.

  const _remediationLog = path.join(ROOT, 'data/diagnostic/remediation.jsonl');
  const _offlineSince   = {}; // track how long each system has been offline
  const _remediatedGaps = new Set(); // don't spam the same gap

  function _logRemediation(entry) {
    try {
      fs.mkdirSync(path.join(ROOT, 'data/diagnostic'), { recursive: true });
      fs.appendFileSync(_remediationLog, JSON.stringify({ ...entry, ts: Date.now() }) + '\n');
    } catch(_) {}
    // Also write to cortex
    http.request({
      hostname: '127.0.0.1', port: 3748, path: '/api/event', method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    }, () => {}).on('error', () => {}).end(JSON.stringify({
      type: 'diagnostic.remediation', source: 'nexus-diagnostic',
      payload: entry, ts: Date.now(),
    }));
  }

  async function remediationScan() {
    const issues = [];

    // 1. Systems offline — escalate after 30s, emit HEAL_REQUESTED
    for (const [name, cfg] of Object.entries(SYSTEMS)) {
      if (name === 'diagnostic') continue; // don't self-report
      const state = systemState[name] || {};
      if (!state.online) {
        if (!_offlineSince[name]) _offlineSince[name] = Date.now();
        const offlineMs = Date.now() - _offlineSince[name];
        const gapKey = `offline:${name}`;

        // §BUGFIX 2026-08-28 — found while wiring Clear Glass into this
        // registry: optional:true (already used by 'emerge' above) only
        // ever gated the console.log WORDING two lines below, not the
        // actual gap/HEAL_REQUESTED escalation — a system correctly
        // marked "expected to sometimes be offline" was STILL getting a
        // real system_offline gap and a real heal-escalation dispatched
        // to cortex every 30s it stayed down, which is precisely the
        // false-positive class this flag's own name implies it should
        // prevent. Real fix, not cosmetic: skip the whole gap block for
        // optional systems here, not just the log line at the end of it.
        // Clear Glass's REAL, precise deviation detection (a spawn that
        // was actually attempted and failed) is handled separately,
        // below, driven by orchestrator's own real ui.open_failed event
        // — not this generic "port didn't answer" check, which has no
        // way to know whether anyone ever asked Clear Glass to be up.
        if (offlineMs > 30000 && !_remediatedGaps.has(gapKey) && !cfg.optional) {
          _remediatedGaps.add(gapKey);

          // §BUILT 2026-09-20 — enrich with orchestrator's negative-space
          // pulse watchdog (orchestrator.js's _armPulseWatch), when it has
          // fired for this system. This is a SEPARATE, slower, higher-
          // confidence signal (N consecutive missed heartbeat intervals,
          // not a probe timeout) — corroborating evidence added to the
          // existing gap, not a new detection path. A probe/registry
          // hiccup can raise this gap alone; a real pulseMissed count says
          // orchestrator waited multiple full intervals and heard nothing.
          let pulseNote = '';
          try {
            const reg = await new Promise((resolve) => {
              const rq = http.get(`http://127.0.0.1:9000/api/registry`, { timeout: 1000 }, r => {
                let b = ''; r.on('data', d => b += d);
                r.on('end', () => { try { resolve(JSON.parse(b)); } catch { resolve(null); } });
              });
              rq.on('error', () => resolve(null));
              rq.on('timeout', () => { rq.destroy(); resolve(null); });
            });
            const missed = reg && reg.registry && reg.registry[name] && reg.registry[name].pulseMissed;
            if (missed) pulseNote = ` — orchestrator's own pulse watchdog also missed ${missed} consecutive heartbeat(s) from ${name}`;
          } catch (_) { /* registry unreachable — gap still stands on the probe alone */ }

          const gap = {
            type: 'system_offline', system: name, port: cfg.port,
            severity: 'high', offlineMs,
            fix: `Start ${name}: node ${name}/boot.js or node service/${name}-service.js`,
            body: `${name} offline for ${Math.round(offlineMs/1000)}s — :${cfg.port} not responding${pulseNote}`,
          };
          issues.push(gap);

          // §23.7 — enrich gap with predicate + dedup check before inserting
          // enrichGap returns existing_uuid if this gap already exists (same predicate)
          // In that case: evidence appended, recurrence incremented, no new gap created
          let gapUuid;
          try {
            const gp = require('../intelligence/gap/predicate');
            const { enriched_gap, existing_uuid } = gp.enrichGap(gap);
            if (existing_uuid) {
              gapUuid = existing_uuid;
              // Gap already exists — don't create a new one, don't re-dispatch
              // Just update our in-memory map to point at the existing gap
              if (!openGaps.has(gapKey)) {
                const jaaDB = require('../cortex/memory/jaa-db').jaaDB;
                const existing = jaaDB.query('gaps', g => g.uuid === existing_uuid, 1)[0];
                if (existing) openGaps.set(gapKey, existing);
              }
            } else {
              const finalGap = { uuid: uid(), ...enriched_gap, status: 'open', detectedAt: Date.now() };
              gapUuid = finalGap.uuid;
              openGaps.set(gapKey, finalGap);
              broadcast({ type: 'gap.found', gap: finalGap });
              // §ROOT-CAUSE FIX 2026-07-24 — third instance of the same bug
              // (see the remediation sweep and the /gaps/:uuid/fix route).
              // This emitted HEAL_REQUESTED on THIS process's nexus-bus for a
              // ladder that lives in cortex's process, so a detected offline
              // system never actually triggered healing. Routed through
              // cortex's /api/event, which ledgers it and re-emits where the
              // ladder listens. Fire-and-forget by design — gap detection must
              // not block on the heal dispatch — but the failure is REPORTED
              // (§1.2), where the old catch(_) swallowed it.
              const CORTEX_URL = process.env.CORTEX_URL || 'http://127.0.0.1:3748';
              fetch(`${CORTEX_URL}/api/event`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  type: 'HEAL_REQUESTED',
                  payload: {
                    gapType: 'system_offline', modulePath: name,
                    body: gap.body, sigma: 0.8,
                    gapUuid: finalGap.uuid, dedup_key: finalGap.dedup_key,
                  },
                  source: 'diagnostic.remediation', causedBy: finalGap.uuid, ts: Date.now(),
                }),
              }).catch(e => console.error(`[diagnostic] HEAL_REQUESTED (system_offline:${name}) could not reach cortex: ${e.message}`));
            }
          } catch(e) {
            // gap-predicate not available — fall back to original behavior
            const finalGap = { uuid: uid(), ...gap, status: 'open', detectedAt: Date.now() };
            gapUuid = finalGap.uuid;
            openGaps.set(gapKey, finalGap);
            broadcast({ type: 'gap.found', gap: finalGap });
          }

          _logRemediation({ action: 'gap_escalated', ...gap, gapUuid });
          if (!SYSTEMS[name]?.optional) console.log(`[diagnostic] ⚠ ${name} has been offline for ${Math.round(offlineMs/1000)}s — escalating to repair queue`);
        }
      } else {
        // Came back online — clear
        if (_offlineSince[name]) {
          const wasDown = Date.now() - _offlineSince[name];
          _logRemediation({ action: 'system_recovered', system: name, downMs: wasDown });
          console.log(`[diagnostic] ✓  ${name} recovered (was down ${Math.round(wasDown/1000)}s)`);
          delete _offlineSince[name];
          _remediatedGaps.delete(`offline:${name}`);
        }
      }
    }

    // 2. High friction systems — log and suggest diagnosis
    for (const [name] of Object.entries(SYSTEMS)) {
      const state = systemState[name] || {};
      if (state.friction > 0.7 && state.online) {
        const gapKey = `friction:${name}:${Math.floor(Date.now()/60000)}`; // one per minute
        if (!_remediatedGaps.has(gapKey)) {
          _remediatedGaps.add(gapKey);
          _logRemediation({
            action: 'high_friction_detected',
            system: name,
            friction: state.friction,
            sigma: state.sigma,
            fix: `node cli/diagnose.js ${name}`,
          });
          console.log(`[diagnostic] ⚠  ${name} friction=${state.friction?.toFixed(3)} — logged`);
        }
      }
    }

    // 3. Syntax check on boot errors written to data/diagnostic/
    // Only run every 5 minutes to avoid performance hit
    if (!remediationScan._lastSyntax || Date.now() - remediationScan._lastSyntax > 300000) {
      remediationScan._lastSyntax = Date.now();
      const { spawnSync } = require('child_process');
      const criticalFiles = [
        'orchestrator/orchestrator.js', 'lib/ncp.js', 'lib/request-handler.js',
        'cortex/boot.js', 'guardian/server.js', 'lib/intent-classifier.js',
      ];
      for (const file of criticalFiles) {
        const fp = path.join(ROOT, file);
        if (!fs.existsSync(fp)) continue;
        const r = spawnSync('node', ['--check', fp], { encoding: 'utf8', timeout: 5000 });
        if (r.status !== 0) {
          const errLine = (r.stderr || '').split('\n').slice(0,2).join(' ');
          const gapKey = `syntax:${file}`;
          if (!_remediatedGaps.has(gapKey)) {
            _remediatedGaps.add(gapKey);
            _logRemediation({ action: 'syntax_error', file, error: errLine, severity: 'critical' });
            console.log(`[diagnostic] ✗  SYNTAX: ${file} — ${errLine.slice(0,80)}`);
          }
        }
      }
    }

    // 4. Cortex gap load — pull open gaps and re-broadcast any untracked ones
    try {
      await new Promise((resolve) => {
        const req = http.get('http://127.0.0.1:3748/api/gaps?status=open&n=20',
          { timeout: 2000 }, res => {
          let b = ''; res.on('data', d => b += d);
          res.on('end', () => {
            try {
              const d = JSON.parse(b);
              const gaps = Array.isArray(d) ? d : (d.gaps || d.rows || []);
              for (const g of gaps) {
                if (!openGaps.has(g.uuid)) {
                  openGaps.set(g.uuid, g);
                  broadcast({ type: 'gap.found', gap: g, source: 'cortex_sync', ts: Date.now() });
                }
              }
            } catch {}
            resolve();
          });
        });
        req.on('error', () => resolve());
        req.on('timeout', () => { req.destroy(); resolve(); });
      });
    } catch(_) {}

    // 5. Forge Shell availability check — it's a UI, not a service
    // Healthy when orchestrator is healthy and the file exists
    // §0.39.265 — the shell moved into its own folder (ui/forge-shell/); this
    // still looked for ui/forge-shell.html and warned "missing" on every boot.
    const forgeFile = path.join(ROOT, 'ui', 'forge-shell', 'forge-shell.html');
    const forgeShellExists = fs.existsSync(forgeFile);
    const orchState = systemState['orchestrator'] || {};
    const forgeHealthy = forgeShellExists && orchState.online;
    if (!forgeHealthy) {
      const gapKey = 'forge-shell:unavailable';
      if (!_remediatedGaps.has(gapKey)) {
        _remediatedGaps.add(gapKey);
        const reason = !forgeShellExists ? 'ui/forge-shell/forge-shell.html missing' : 'orchestrator offline';
        _logRemediation({ action: 'forge_shell_unavailable', reason, fix: forgeShellExists ? 'Start orchestrator' : 'Deploy ui/forge-shell/forge-shell.html' });
        console.log(`[diagnostic] ⚠  forge-shell unavailable — ${reason}`);
      }
    } else {
      _remediatedGaps.delete('forge-shell:unavailable');
    }

    // 6. Run escalation for any high-severity gaps that exceeded safe-fix threshold
    await _escalateHighSeverityGaps();

    return issues;
  }

  // §DIAGNOSTIC-AWARE 2026-08-28 — James: "measure deviation or when it
  // fails to spawn. then log the error/gap." Real, precise deviation
  // detection for Clear Glass, separate from the generic offline-poll
  // above (which is deliberately blind to it now — optional:true). This
  // reads cortex's real, existing event log (GET /api/events, confirmed
  // directly — the same endpoint orchestrator.js's own POSTs land in)
  // for the two real events this session's earlier fixes now actually
  // write: orchestrator.ui.open_failed (the boot-time spawn-and-poll
  // sequence gave up) and clear-glass.spawn.lock_collision (a second
  // instance died on the lock before ever reaching that sequence). Each
  // NEW occurrence (deduped by the event's own real id, not reprocessed
  // on every poll) becomes a real, structured gap with the full
  // diagnostic payload attached — spawnRequestOutcome, attempts,
  // elapsedMs, or the lock-collision reason/pid — not a generic
  // "offline" gap with none of that detail.
  const _seenClearGlassEventIds = new Set();
  async function checkClearGlassSpawnFailures() {
    const CORTEX_URL = process.env.CORTEX_URL || 'http://127.0.0.1:3748';
    let events = [];
    try {
      events = await new Promise((resolve) => {
        const req = http.get(`${CORTEX_URL}/api/events?source=orchestrator&n=20`, { timeout: 2000 }, res => {
          let b = ''; res.on('data', d => b += d);
          res.on('end', () => { try { resolve(JSON.parse(b).events || []); } catch { resolve([]); } });
        });
        req.on('error', () => resolve([]));
        req.on('timeout', () => { req.destroy(); resolve([]); });
      });
    } catch (_) { return; }

    // §HONEST LIMIT — clear-glass.spawn.lock_collision is posted with
    // source:'clear-glass', not 'orchestrator' (it's written from Clear
    // Glass's own process, before orchestrator is even involved) — the
    // ?source=orchestrator filter above only catches ui.open_failed. A
    // second, separate fetch for source=clear-glass would double real
    // cortex round trips every 30s for a type this rare; named here
    // rather than silently caught by widening the filter without saying
    // so.
    const failures = events.filter(e => e.type === 'orchestrator.ui.open_failed' && !_seenClearGlassEventIds.has(e.id));
    for (const ev of failures) {
      _seenClearGlassEventIds.add(ev.id);
      let payload = {};
      try { payload = typeof ev.payload === 'string' ? JSON.parse(ev.payload) : (ev.payload || {}); } catch (_) {}

      const gap = {
        type: 'clear-glass_spawn_failed', system: 'clear-glass',
        severity: 'high',
        body: payload.reason || `Clear Glass failed to open after ${payload.attempts || '?'} attempt(s)`,
        fix: payload.spawnRequestOutcome && payload.spawnRequestOutcome !== 'ok'
          ? `Autopilot spawn request itself failed (${payload.spawnRequestOutcome}) — check whether autopilot is running on :7799`
          : `Autopilot spawn request succeeded but Clear Glass never became reachable on :7704 — check for an orphaned instance already holding the single-instance lock, or a crash after launch`,
        meta: payload,
      };
      let gapUuid;
      try {
        const gp = require('../intelligence/gap/predicate');
        const { enriched_gap, existing_uuid } = gp.enrichGap(gap);
        if (existing_uuid) { gapUuid = existing_uuid; }
        else {
          const finalGap = { uuid: uid(), ...enriched_gap, status: 'open', detectedAt: Date.now() };
          gapUuid = finalGap.uuid;
          openGaps.set(`clear-glass-spawn:${ev.id}`, finalGap);
          broadcast({ type: 'gap.found', gap: finalGap });
        }
      } catch (_) {
        const finalGap = { uuid: uid(), ...gap, status: 'open', detectedAt: Date.now() };
        gapUuid = finalGap.uuid;
        openGaps.set(`clear-glass-spawn:${ev.id}`, finalGap);
        broadcast({ type: 'gap.found', gap: finalGap });
      }
      _logRemediation({ action: 'gap_escalated', ...gap, gapUuid, sourceEventId: ev.id });
      console.log(`[diagnostic] ⚠ Clear Glass spawn failure detected (event ${ev.id}) — real gap raised: ${gapUuid}`);
    }
  }

  // §23.10 — gaps come from (at least) two unrelated taxonomies sharing the
  // same 'gaps' table: system/structural gaps (stale_module, cluster_misfire,
  // seam_orphan_resume — carry path/body/severity, defined in gap-lifecycle.spec)
  // and GapHunter's epistemic gaps (assumption/obligation/contradiction/logical
  // — carry description/question/evidence/domain, defined in guardian/lib/
  // gap-hunter.js, inserted with NO path/body/severity field at all — see
  // guardian/server.js's SISOGate('guardian.gaps', ...) insert). This function
  // templated path/body/severity unconditionally, so every epistemic gap sent
  // to Ollama read as "Path: ?  Body:  Severity: undefined" — confirmed
  // directly in the Jobs tab screenshot, where Ollama's only honest move was
  // to echo the empty shape back. Building the right prompt for the shape
  // that's actually there, instead of one template for both.
  function _buildDiagnosticPrompt(gap) {
    const isEpistemic = (gap.description !== undefined || gap.question !== undefined || gap.evidence !== undefined)
      && gap.path === undefined && gap.body === undefined;

    if (isEpistemic) {
      const evidence = (() => {
        try { return typeof gap.evidence === 'string' ? gap.evidence : JSON.stringify(gap.evidence); }
        catch { return String(gap.evidence); }
      })();
      return [
        'NEXUS DIAGNOSTIC ESCALATION — epistemic gap (GapHunter)',
        `Gap type: ${gap.type}`,
        `Domain: ${gap.domain || 'unspecified'}`,
        `Description: ${gap.description || '(none recorded)'}`,
        gap.question ? `Open question: ${gap.question}` : null,
        evidence && evidence !== '{}' && evidence !== 'null' ? `Evidence: ${evidence.slice(0, 300)}` : null,
        `Score: ${gap.score ?? 'unscored'}`,
        '',
        'This is a gap detected in an AI response\'s text (an unstated assumption, unmet obligation, or similar) — not a code or file path issue.',
        'Analyse what the underlying response was missing and propose what should have been said or checked instead.',
        'Note: this analysis is not automatically applied. No code runs as a result of your response.',
      ].filter(Boolean).join('\n');
    }

    return `NEXUS DIAGNOSTIC ESCALATION\nGap: ${gap.type}\nPath: ${gap.path || '?'}\nBody: ${(gap.body || '').slice(0, 200)}\nSeverity: ${gap.severity || 'unspecified'}\nAttempts: ${gap.attempts || 0}\n\nAnalyse this gap, identify root cause, propose a concrete fix.\nNote: this analysis is not automatically applied. No code runs as a result of your response.`;
  }

  // ── Escalation bridge — calls escalation ladder for persistent gaps ──────────
  const _escalationCooldown = new Map(); // gapKey → last escalated ts
  let _warnedMissingContractModule = false; // §23.20 — warn once, not every sweep
  // §23.18 — "the system needs to prioritize guardian and cortex more than
  // anything when it comes to diagnosing the system." gap-loop's own
  // topology:watch has logged "Stabilize guardian first. Cascade will
  // self-resolve downstream." on every single run shown this entire
  // conversation — DEPENDENCY_CASCADE leverage climbing from 1.5 to 19,
  // loops affected from 11 to 133 — and nothing downstream of that log
  // line ever actually changed dispatch order. The insight existed; the
  // action never happened. This is the action.
  //
  // Two-tier: gaps whose type/path/system point at guardian, cortex, or
  // the NCP connection between them are infrastructure-health gaps — the
  // actual cause. obligation/assumption/seam_orphan_resume/logical/etc are
  // epistemic gaps GapHunter finds IN AI RESPONSE TEXT while Guardian is
  // dispatching jobs — produced BY Guardian while it's struggling, not
  // the reason it's struggling. Dispatching those first while an
  // infrastructure gap sits in the same queue spends every cycle on the
  // symptom while the cause waits its turn.
  const GUARDIAN_CORTEX_PATTERN = /guardian|cortex|ncp[._]|\bncp\b/i;
  function _isInfraGap(gap) {
    // §23.18 — gap.source deliberately excluded. It's almost always
    // 'guardian.lib.gap-hunter' for every epistemic gap (obligation,
    // assumption, logical, etc) because that's where the DETECTING code
    // lives, not what the gap is about — including it made every
    // epistemic gap match "guardian" too, which would have defeated the
    // entire point of this distinction. type/path/system/body are what
    // actually describe the gap's subject.
    const haystack = `${gap.type||''} ${gap.path||''} ${gap.system||''} ${gap.body||''}`;
    return GUARDIAN_CORTEX_PATTERN.test(haystack);
  }

  async function _escalateHighSeverityGaps() {
    // Pull open high-severity gaps from cortex
    let gaps = [];
    try {
      await new Promise(resolve => {
        const req = http.get('http://127.0.0.1:3748/api/gaps?status=open&severity=high&n=10',
          { timeout: 2000 }, res => {
          let b = ''; res.on('data', d => b += d);
          res.on('end', () => {
            try { const d = JSON.parse(b); gaps = Array.isArray(d) ? d : (d.gaps || d.rows || []); } catch {}
            resolve();
          });
        });
        req.on('error', () => resolve());
        req.on('timeout', () => { req.destroy(); resolve(); });
      });
    } catch(_) {}

    // §23.18 — infra gaps (guardian/cortex/ncp) first, everything else after.
    // Stable sort: within each tier, original order (severity/recency from
    // cortex's own query) is preserved — this only changes WHICH tier goes
    // first, not the ordering within a tier.
    if (gaps.length > 1) {
      const infra = gaps.filter(_isInfraGap);
      const other = gaps.filter(g => !_isInfraGap(g));
      if (infra.length) {
        gaps = [...infra, ...other];
        require('../lib/component-ledger').write({
          system: 'diagnostic', component: 'service.nexus-diagnostic', action: 'priority_reordered',
          status: 'guardian_cortex_first', tags: infra.map(g => g.type),
          detail: `${infra.length} infra gap(s) moved ahead of ${other.length} epistemic gap(s) this sweep`,
          causedBy: null,
        });
      }
    }

    for (const gap of gaps) {
      // §23.7 — skip gaps in terminal or investigating states
      // This is the primary fix for the 300-job flood:
      // gaps that are already being investigated should NOT be re-dispatched
      // on every diagnostic sweep. The gap stays open until the artifact appears.
      // §23.21 — added failure_mode: the same flood pattern recurred through
      // a sibling code path (the escalation-ladder fallback, Phase 3 below)
      // that this earlier fix didn't cover — that branch never updated gap
      // status at all, so it was exempt from this skip-filter by construction,
      // not by oversight in this particular line.
      if (gap.status === 'investigating' || gap.status === 'resolved' ||
          gap.status === 'expired'       || gap.status === 'blocked'  ||
          gap.status === 'archived'      || gap.status === 'failure_mode') continue;

      // Skip gaps already escalated in the last 5 minutes
      const lastEsc = _escalationCooldown.get(gap.uuid) || 0;
      if (Date.now() - lastEsc < 300000) continue;

      // §23.7 — check if the gap predicate is still true before dispatching
      // If the predicate is now false, run closure verifier instead of re-dispatching
      if (gap.predicate) {
        try {
          const gp = require('../intelligence/gap/predicate');
          const stillOpen = gp.checkPredicate(gap.predicate);
          if (!stillOpen) {
            // Predicate became false — try to close the gap
            gp.verifyClosure(gap, { strategy: 'diagnostic.sweep' });
            continue; // don't dispatch a new job — verifier handles it
          }
        } catch(_) {}
      }

      // Phase 1: Try RAID routing first — let it decide the best agent
      let raidDecision = null;
      try {
        await new Promise(resolve => {
          const req = http.get(
            `http://127.0.0.1:3748/api/raid/decide?intent=${encodeURIComponent(gap.type + ' ' + (gap.path || ''))}`,
            { timeout: 2000 }, res => {
            let b = ''; res.on('data', d => b += d);
            res.on('end', () => {
              try { raidDecision = JSON.parse(b); } catch {}
              resolve();
            });
          });
          req.on('error', () => resolve());
          req.on('timeout', () => { req.destroy(); resolve(); });
        });
      } catch(_) {}

      // Phase 2: Dispatch to guardian if RAID has a decision
      let guardianDispatched = false;
      if (raidDecision?.agent) {
        // §23.10 — HONEST NAME CHECK: this command is called diagnose_and_repair
        // but nothing downstream of the model's response ever executes a repair.
        // _dispatchOllamaNative() in guardian/server.js streams the response into
        // the job's text field and chat_log — full stop. gap-loop.js's closure
        // verifier (correctly) only marks a gap resolved when verifyArtifact()
        // finds a real artifact; a paragraph of analysis is not one, so it
        // never does, so the gap stays open, so the next diagnostic sweep
        // dispatches the identical job again. That's not a bug in the verifier
        // — it's doing exactly what gap-lifecycle.spec says. The gap is that
        // "repair" was never wired to anything. Tagging this explicitly so
        // it's visible as diagnosis-only in the ledger, not indistinguishable
        // from a real attempted-and-failed repair.

        // §23.13 — diagnose_and_repair as a real tracked contract, not a
        // bare job. queued here; dispatched() once the HTTP POST to
        // guardian actually succeeds below; diagnosed()/close() happen in
        // cortex/gap-loop.js's guardian.job.complete listener, once the
        // model has actually answered and verifyClosure has actually run.
        //
        // §23.20 — this require was unguarded. A deployment that copies
        // diagnostic/nexus-diagnostic.js without also copying the new
        // lib/diagnostic-contract.js (an easy thing to miss — they're in
        // different directories) crashed this entire function with
        // MODULE_NOT_FOUND, every single sweep, hitting the 6-crashes-in-
        // 5-minutes circuit breaker and taking the whole diagnostic
        // service offline. Contract tracking is a real feature but it is
        // not load-bearing for the escalation dispatch itself — diagnosis
        // and dispatch must keep working even if this one enhancement
        // can't load. Logged loudly once, not every sweep, so it's
        // findable without being noise.
        let contract = null;
        try {
          contract = require('../lib/diagnostic-contract').create({
            gapUuid: gap.uuid, gapType: gap.type, system: gap.system || null,
            tags: ['diagnostic.escalation', raidDecision.agent],
            detail: `escalated gap, severity ${gap.severity || 'unspecified'}`,
          });
        } catch (e) {
          if (!_warnedMissingContractModule) {
            _warnedMissingContractModule = true;
            console.error(`[diagnostic] §1.2 lib/diagnostic-contract failed to load (${e.message}) — ` +
              `contract tracking disabled for this run, escalation dispatch continues without it. ` +
              `If this is MODULE_NOT_FOUND, the file likely wasn't copied alongside this one.`);
          }
        }

        const jobPayload = JSON.stringify({
          command:  'diagnose_and_repair',
          provider: raidDecision.agent,
          prompt:   _buildDiagnosticPrompt(gap),
          meta: {
            gapUuid: gap.uuid, gapType: gap.type, source: 'diagnostic.escalation',
            raidAgent: raidDecision.agent, diagnosisOnly: true,
            contractUuid: contract?.uuid || null,
          },
        });
        try {
          require('../lib/component-ledger').write({
            system: 'diagnostic', component: 'service.nexus-diagnostic', action: 'diagnose_dispatched',
            status: 'diagnosis_only', tags: [gap.type, 'no-repair-action'],
            detail: `prose analysis only — no artifact-producing action wired for ${gap.type}`, causedBy: gap.uuid,
          });
        } catch (_) {}

        // Route: ollama jobs go directly to ollama/server.js (:3749).
        // All other agents (claude, chatgpt, …) go to guardian (:7820).
        const isOllama = raidDecision.agent === 'ollama';
        const dispatchPort = isOllama ? 3749 : 7820;
        const dispatchPath = isOllama ? '/api/jobs' : '/command';

        guardianDispatched = await new Promise(resolve => {
          const req = http.request({
            hostname: '127.0.0.1', port: dispatchPort, path: dispatchPath, method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(jobPayload) },
            timeout: 5000,
          }, res => {
            let b = ''; res.on('data', d => b += d);
            res.on('end', () => {
              try {
                const d = JSON.parse(b);
                if (contract?.uuid && d.jobId) {
                  try { require('../lib/diagnostic-contract').dispatched(contract.uuid, { agent: raidDecision.agent, jobId: d.jobId }); } catch (_) {}
                }
                resolve(d.jobId || d.ok);
              } catch { resolve(false); }
            });
          });
          req.on('error', () => resolve(false));
          req.on('timeout', () => { req.destroy(); resolve(false); });
          req.write(jobPayload); req.end();
        });
      }

      // Phase 3: If RAID/guardian failed, use escalation ladder (self-heal)
      if (!guardianDispatched) {
        try {
          // §ROOT-CAUSE FIX 2026-07-24 — this block was broken three ways and
          // had NEVER once worked, silently, because the whole thing sits in
          // a catch(e) that swallowed the failure:
          //
          //   1. WRONG MODULE. It required self-heal/escalation.js (the
          //      FRICTION LEDGER) when it wanted self-heal/index.js (the
          //      5-LEVEL LADDER). Two different organs.
          //   2. NONEXISTENT FUNCTION. escalation.js has no escalate() and
          //      never did — its exports are init/stop/health/
          //      wireAnomalyTrigger/recordAttemptOutcome/SEVERITY_TO_LEVEL.
          //      So this threw TypeError on the first line, every time.
          //   3. WRONG TRANSPORT even if 1+2 were right. The ladder is a
          //      CORTEX ORGAN (cortex/boot.js organs[]), running in cortex's
          //      process. This service is a separate process. A direct
          //      require would have loaded a second, uninitialised copy with
          //      no bus and no listeners — not the live ladder.
          //
          // The ladder's real entry is event-driven: it subscribes to
          // HEAL_REQUESTED and expects { gapType, gapUuid, body, modulePath }.
          // The correct cross-process route is cortex's POST /api/event,
          // which writes the event to event_log AND re-emits it on cortex's
          // own bus (cortex/boot.js, §GAP CLOSED 2026-07-19) — so the live
          // ladder actually hears it, and §LAW II is satisfied because the
          // request is ledgered before it acts.
          //
          // This also DELETES a cross-directory require of cortex internals,
          // which is a prerequisite for self-heal ever becoming sovereign.
          const CORTEX = process.env.CORTEX_URL || 'http://127.0.0.1:3748';
          const hres = await fetch(`${CORTEX}/api/event`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              type: 'HEAL_REQUESTED',
              payload: {
                gapUuid:    gap.uuid,
                gapType:    gap.type,
                modulePath: gap.file || gap.system || '',
                body:       gap.body || '',
                sigma:      gap.sigma || 0,
              },
              source:   'diagnostic.remediation',
              causedBy: gap.uuid,
              ts:       Date.now(),
            }),
          });
          if (!hres.ok) throw new Error(`cortex /api/event returned ${hres.status}`);
          const result = await hres.json();
          _logRemediation({ action: 'escalation_ladder', gapUuid: gap.uuid, gapType: gap.type });

          // §23.21 — THE SPAM FIX. This branch never updated gap status, so
          // the gap stayed 'open' and got re-fetched by the NEXT sweep's
          // `status=open` query, re-attempted, forever — regardless of what
          // the escalation ladder's own per-type friction state said. With
          // ~38 open obligation gaps alone, every sweep was re-running this
          // whole branch for all of them, every 15-30s, indefinitely. The
          // ladder's friction tracking is per-TYPE ('obligation'), not
          // per-gap-instance, so it can say "already in failure mode" for
          // the bucket while this code kept re-presenting the same
          // individual gaps as if they'd never been seen.
          //
          // Once a type hits FAILURE_MODE, there is nothing more this loop
          // can usefully do to any individual gap of that type — repeating
          // the attempt every sweep was pure waste, and was very likely
          // *part of* why cortex was timing out: each attempt that reaches
          // level 2 takes a real snapshot.
          try {
            const jaaDB = require('../cortex/memory/jaa-db').jaaDB;
            if (result?.alreadyFailureMode) {
              // The bucket is saturated — this individual gap can't be
              // usefully re-attempted until a human or a forge patch
              // clears it. Mark it so, don't re-fetch it every sweep.
              jaaDB.update('gaps', gap.uuid, { status: 'failure_mode', failureModeAt: Date.now() });
            } else {
              // A real escalation attempt happened (levels 0-3.5) — same
              // 'investigating' convention the successful-dispatch branch
              // already uses, so the existing TTL/predicate sweep picks it
              // up the same way.
              jaaDB.update('gaps', gap.uuid, { status: 'investigating', investigatingAt: Date.now() });
            }
          } catch(_) {}
        } catch(e) {
          _logRemediation({ action: 'escalation_failed', gapUuid: gap.uuid, error: e.message });
          console.warn(`[diagnostic] escalation failed for ${gap.uuid}: ${e.message}`);
        }
      } else {
        _logRemediation({ action: 'guardian_dispatched', gapUuid: gap.uuid, gapType: gap.type,
          agent: raidDecision?.agent, note: 'RAID→Guardian dispatch' });
        const agentLabel = raidDecision?.agent || 'unknown';
        const gapDesc = gap.body ? gap.body.slice(0, 60) : gap.type;
        console.log(`[diagnostic] ▶ Sending to ${agentLabel}: ${gap.system ? gap.system + ' — ' : ''}${gapDesc}${gap.body?.length > 60 ? '…' : ''}`);

        // §23.7 — mark gap as 'investigating' so the next diagnostic sweep
        // does not re-dispatch it. The gap stays investigating until the
        // closure verifier runs (after guardian.job.complete) and either
        // resolves it or marks it open for retry.
        try {
          const jaaDB = require('../cortex/memory/jaa-db').jaaDB;
          jaaDB.update('gaps', gap.uuid, { status: 'investigating', investigatingAt: Date.now() });
        } catch(_) {}
      }

      _escalationCooldown.set(gap.uuid, Date.now());
    }
  }

  // Run remediation scan every 30s (staggered from pollAll)
  setTimeout(() => {
    remediationScan();
    setInterval(remediationScan, 30000);
    checkClearGlassSpawnFailures();
    setInterval(checkClearGlassSpawnFailures, 30000);
  }, 15000);

  // Live ledger watching — detect new events within milliseconds
  for (const [name, cfg] of Object.entries(SYSTEMS)) {
    const ledgerDir = path.join(ROOT, cfg.dataDir || cfg.ledgerDir || 'data');
    fs.mkdirSync(ledgerDir, { recursive: true });
    try {
      fs.watch(ledgerDir, { recursive: true }, (event, filename) => {
        if (!filename || !filename.endsWith('.ndjson')) return;
        // Debounce — only process once per 500ms per system
        clearTimeout(monitors[name]._watchDebounce);
        monitors[name]._watchDebounce = setTimeout(async () => {
          await pollSystem(name, cfg);
          const state = systemState[name] || {};
          broadcast({ type: 'ledger.updated', system: name,
            friction: state.friction, sigma: state.sigma, ts: Date.now() });
        }, 500);
      });
    } catch(_) {} // fs.watch may not support recursive on all platforms
  }

  // ── Audit ─────────────────────────────────────────────────────────────────

  async function runAuditInternal() {
    const issues = [];

    // 1. Syntax check all JS files
    const { spawnSync } = require('child_process');
    // §CRASH-FIX 2026-08-13 — was `results.push(...walkJs(fp))`: each
    // directory level spread its ENTIRE subtree back through the parent
    // call's arguments. On a repo this size (1000+ .js files once
    // node_modules/.git/data are excluded, everything else walked) the
    // near-root calls were spreading thousands of array elements as
    // individual function arguments. That's not a RangeError V8 catches
    // cleanly — a single oversized push(...) can write past the guard page
    // in one shot, which is exactly what a native STATUS_STACK_BUFFER_OVERRUN
    // (0xC0000409) crash looks like, not a normal recursion-depth overflow.
    // An explicit iterative stack with array concatenation never puts more
    // than one path on the JS call stack at a time and never spreads a
    // large array into a call, so it can't reproduce this failure mode
    // regardless of tree size.
    function walkJs(root) {
      const results = [];
      const stack = [root];
      while (stack.length) {
        const dir = stack.pop();
        if (!fs.existsSync(dir)) continue;
        for (const f of fs.readdirSync(dir)) {
          if (['node_modules', '.git', 'data'].includes(f)) continue;
          const fp = path.join(dir, f);
          const st = fs.statSync(fp);
          if (st.isDirectory()) stack.push(fp);
          else if (f.endsWith('.js')) results.push(fp);
        }
      }
      return results;
    }

    let syntaxFails = 0;
    for (const file of walkJs(ROOT)) {
      const r = spawnSync('node', ['--check', file], { encoding: 'utf8', timeout: 5000 });
      if (r.status !== 0) {
        syntaxFails++;
        const errLine = (r.stderr || '').split('\n').slice(0, 2).join(' ');
        issues.push({ type: 'syntax_error', file: file.replace(ROOT + '/', ''), error: errLine, severity: 'critical' });
      }
    }

    // 2. Check all system health endpoints
    for (const [name, cfg] of Object.entries(SYSTEMS)) {
      const state = systemState[name] || {};
      if (!state.online) {
        issues.push({ type: 'system_offline', system: name, port: cfg.port, severity: 'high',
          fix: `Start ${name}: node ${name}/boot.js or service/${name}-service.js` });
      }
      if (state.friction > 0.5) {
        issues.push({ type: 'high_friction', system: name, friction: state.friction, severity: 'medium',
          fix: `Check data/${name}/ledger/ for recent errors` });
      }
    }

    // 3. Check for orphaned pending files (stuck for > 5 minutes)
    for (const [name] of Object.entries(SYSTEMS)) {
      const inputDir = path.join(ROOT, `data/${name}/input`);
      if (!fs.existsSync(inputDir)) continue;
      for (const f of fs.readdirSync(inputDir)) {
        if (!f.includes('.pending.')) continue;
        const fp = path.join(inputDir, f);
        const age = Date.now() - fs.statSync(fp).mtimeMs;
        if (age > 300000) { // 5 min
          issues.push({ type: 'orphaned_pending', system: name, file: f,
            ageMs: age, severity: 'medium',
            fix: `Run: node cli/diagnose.js ${name} or restart ${name} service` });
        }
      }
    }

    // 4. Check for recent failure ledger entries
    // BUG FIXED 2026-07-06 - this loop never destructured cfg from
    // Object.entries(SYSTEMS) (only [name]), and no module-level cfg
    // exists either - every execution of this block has thrown
    // ReferenceError: cfg is not defined since it was written, meaning
    // failure-mode detection has never once completed successfully. It
    // also hand-rolled a directory scan for .ndjson files that never
    // matched what lib/ledger-writer.js actually writes (a single
    // <system>/failures.jsonl file, not a directory of many files) -
    // that function's own comment says "exposed for diagnostic service to
    // use," confirming the two were meant to connect and never did.
    // Using the real readLatest() now instead of re-deriving the same
    // logic a second, differently-broken way.
    const { readLatest } = require('../lib/ledger-writer');
    for (const [name] of Object.entries(SYSTEMS)) {
      const recentFailures = readLatest(name, 'failures', 5);
      for (const entry of recentFailures) {
        if (entry.friction > 0.7) {
          issues.push({ type: 'high_friction_failure', system: name,
            error: entry.error?.slice(0,100), friction: entry.friction, severity: 'medium',
            solution: entry.solution || null });
        }
      }
    }

    // 5. Required files per system
    const REQUIRED_FILES = {
      guardian:  ['guardian/server.js','guardian/userscript-claude.js','guardian/userscript-chatgpt.js'],
      cortex:    ['cortex/boot.js','cortex/core/raid/index.js','cortex/memory/jaa-db.js'],
      idearium:  ['idearium/api/index.js'],
      lib:       ['lib/ess.js','lib/ico.js','lib/baseline.js','lib/queue.js','lib/ncp.js'],
    };
    for (const [group, files] of Object.entries(REQUIRED_FILES)) {
      for (const file of files) {
        if (!fs.existsSync(path.join(ROOT, file))) {
          issues.push({ type:'missing_required_file', group, file, severity:'critical',
            fix:`BUILD REQUIRED: ${file}` });
        }
      }
    }

    // 6. Baseline established per system
    for (const [name, mon] of Object.entries(monitors)) {
      if (!mon.baseline()) {
        issues.push({ type:'baseline_not_established', system:name, severity:'low',
          fix:`Start ${name} service — needs ${mon.baselineN} events to establish baseline` });
      }
    }

    // 7. Ledger health — is each system writing?
    for (const [name, cfg] of Object.entries(SYSTEMS)) {
      const ledgerDir = path.join(ROOT, cfg.dataDir || cfg.ledgerDir || 'data');
      if (!fs.existsSync(ledgerDir)) {
        issues.push({ type:'ledger_missing', system:name, severity:'medium',
          fix:`Start ${name} service to create ledger` }); continue;
      }
      let lastWrite = 0;
      const streams = fs.readdirSync(ledgerDir)
        .filter(f => { try { return fs.statSync(path.join(ledgerDir,f)).isDirectory(); } catch { return false; } });
      for (const stream of streams) {
        const evFile = path.join(ledgerDir, stream, 'events.ndjson');
        if (fs.existsSync(evFile)) {
          const mt = fs.statSync(evFile).mtimeMs;
          if (mt > lastWrite) lastWrite = mt;
        }
      }
      if (lastWrite > 0 && Date.now() - lastWrite > 600000) {
        issues.push({ type:'ledger_stale', system:name, ageMinutes:Math.round((Date.now()-lastWrite)/60000),
          severity:'low', fix:`${name} ledger stale — check if service is running` });
      }
    }

    // 8. Cortex push/recall boundary self-test — §ADDED 2026-07-06.
    // Turns this session's adversarial findings into a permanent,
    // repeatable check instead of a one-off script: does the real
    // /api/push endpoint still reject an oversized payload? If this ever
    // starts passing (i.e. an oversized push succeeds), the size-limit
    // fix has regressed — exactly the kind of silent drift this whole
    // diagnostic service exists to catch. Skips cleanly if Cortex is
    // unreachable — this is a live-endpoint check, not a unit test, and
    // an unreachable Cortex is already reported by check #2 above.
    try {
      const http2 = require('http');
      const oversized = 'x'.repeat(300 * 1024); // over the real 256KB limit
      const pushBody = JSON.stringify({ content: oversized, tags: ['diag-selftest'], tier: 'recent' });
      const pushResult = await new Promise((resolve) => {
        const req2 = http2.request({ hostname: '127.0.0.1', port: SYSTEMS.cortex.port, path: '/api/push', method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(pushBody) }, timeout: 2000 },
          r => { let d=''; r.on('data',c=>d+=c); r.on('end',()=>{ try { resolve(JSON.parse(d)); } catch(_) { resolve(null); } }); });
        req2.on('error', () => resolve(null));
        req2.on('timeout', () => { req2.destroy(); resolve(null); });
        req2.write(pushBody); req2.end();
      });
      if (pushResult && pushResult.ok === true) {
        issues.push({ type: 'size_limit_regression', system: 'cortex', severity: 'high',
          error: 'push() accepted a 300KB payload — the 256KB limit added 2026-07-06 has regressed',
          fix: 'Check cortex/push-recall.js MAX_CONTENT_CHARS is still enforced in push()' });
      }
      // pushResult === null means Cortex unreachable — already covered by check #2, not double-reported here.
    } catch (_) { /* best-effort self-test, never blocks the rest of the diagnostic pass */ }

    // 9. Upload filename sanitization self-test — §ADDED 2026-07-06.
    // Loom's /api/ingest-upload sanitizes filenames before writing to
    // disk; this confirms the actual regex still neutralizes every
    // path-traversal pattern tested during this session's adversarial
    // pass, without needing a live server (pure function check).
    {
      const traversalTests = ['../../../etc/passwd', '..\\..\\windows\\system32\\config', '....//....//etc/passwd'];
      const sanitize = (raw) => raw.replace(/[^a-zA-Z0-9._-]/g, '_');
      const stillDangerous = traversalTests.filter(t => { const s = sanitize(t); return s.includes('/') || s.includes('\\'); });
      if (stillDangerous.length) {
        issues.push({ type: 'path_traversal_regression', system: 'loom', severity: 'critical',
          error: `filename sanitizer no longer neutralizes: ${stillDangerous.join(', ')}`,
          fix: 'Check loom/server.js /api/ingest-upload — the sanitize regex has changed or was removed' });
      }
    }

    // 10. Failure-ledger causal chain self-test — §ADDED 2026-07-06.
    // Check #4 above (readLatest-based high-friction detection) was
    // completely broken (ReferenceError on every execution) until this
    // session found and fixed it. This writes a synthetic failure and
    // confirms it's actually detected end-to-end, so if #4 regresses
    // again — wrong system name, wrong field name, reintroduced scope
    // bug — this check catches it rather than the whole chain going
    // silently dark a second time.
    try {
      const { writeFailure, readLatest } = require('../lib/ledger-writer');
      const marker = 'diag-selftest-' + crypto.randomUUID();
      writeFailure('diagnostic-selftest', new Error(marker), { friction: 0.9 });
      const found = readLatest('diagnostic-selftest', 'failures', 5).some(e => e.error === marker);
      if (!found) {
        issues.push({ type: 'failure_chain_regression', system: 'diagnostic', severity: 'critical',
          error: 'a synthetic high-friction failure was written but not read back — the failure-ledger causal chain (check #4) is broken again',
          fix: 'Check lib/ledger-writer.js writeFailure()/readLatest() path agreement and diagnostic/nexus-diagnostic.js check #4' });
      }
      // Clean up the self-test's own trace — this check should be
      // invisible in real failure data, not add noise to what it's testing.
      const fp = path.join(ROOT, 'data', 'diagnostic-selftest', 'failures.jsonl');
      if (fs.existsSync(fp)) fs.unlinkSync(fp);
    } catch (_) { /* best-effort — a broken self-test must not crash the diagnostic pass it's checking */ }

    return {
      ts:          Date.now(),
      totalIssues: issues.length,
      critical:    issues.filter(i => i.severity === 'critical').length,
      high:        issues.filter(i => i.severity === 'high').length,
      medium:      issues.filter(i => i.severity === 'medium').length,
      low:         issues.filter(i => i.severity === 'low').length,
      syntaxFails,
      systems: Object.fromEntries(Object.entries(systemState).map(([k,v])=>[k,{online:v.online,friction:v.friction}])),
      issues,
    };
  }

  // ── HTTP server ───────────────────────────────────────────────────────────

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://127.0.0.1:${PORT}`);
    const CORS = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' };

    if (req.method === 'OPTIONS') { res.writeHead(204, CORS); res.end(); return; }

    // §LEDGER-WIRE 2026-08-17 — canonical ledger stream, component-ledger
    // schema, for machine consumers. /events below is unchanged: it is the
    // UI's stream and carries a looser shape that its readers already parse
    // (§5.14 zero behaviour change for anything working today).
    if (url.pathname === '/ledger/stream') {
      try { return require('../lib/ledger-sse').mount(res, { system: 'diagnostic' }); }
      catch (e) {
        res.writeHead(503, { 'Content-Type': 'application/json', ...CORS });
        res.end(JSON.stringify({ ok: false, error: `ledger stream unavailable: ${e.message}` }));
        return;
      }
    }

    // SSE stream
    if (url.pathname === '/events') {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*',
      });
      res.write('data: ' + JSON.stringify({ type: 'connected', ts: Date.now() }) + '\n\n');
      sseClients.add(res);
      req.on('close', () => sseClients.delete(res));
      return;
    }

    // Status
    // §CRITICAL FIX 2026-07-30 — found by James's real boot log, and it was
    // the highest-impact defect of the session.
    //
    // This service served /cfr/health, /audit/health and /status but NEVER
    // /health — while autopilot has always gated it on
    // http://127.0.0.1:7825/health. So diagnostic could NEVER pass its phase
    // gate. That was survivable while a stalled gate only logged a warning,
    // which is precisely why it went unnoticed for so long: the boot printed a
    // warning nobody read and carried on.
    //
    // Today's halt-on-fault turned that latent misconfiguration into a TOTAL
    // OUTAGE: boot halted at phase 2, so phases 3-4 never started and
    // idearium, architect, eravos, ollama-bridge, copilot, emerge and loom all
    // failed to boot. Diagnostic then correctly reported "idearium has been
    // offline for 30s" — it was right, and the reason was that the gate had
    // stopped the boot.
    //
    // The halt behaved exactly as designed and exposed a real defect. But a
    // system that is alive and serving MUST be able to say so on the
    // universal route every other kernel honours (§10.3: one way to ask
    // "are you healthy"). Reports degraded rather than merely ok:true —
    // liveness and correctness are different questions.
    if (url.pathname === '/health') {
      const monitored = Object.keys(systemState).length;
      const offline = Object.values(systemState).filter(s => !s.online).length;
      res.writeHead(200, CORS);
      res.end(JSON.stringify({
        ok: true,                       // this service is alive and serving
        system: 'diagnostic',
        // no VERSION constant exists in this module's scope — caught by RUNNING
        // the route, not by reading it back. Reported from the spec-drift
        // source of truth instead of inventing a second version string (§5.4).
        version: require('../package.json').version || null,
        uptimeMs: Date.now() - _bootedAt,
        monitoring: monitored,
        systemsOffline: offline,        // what it OBSERVES, not its own health
        openGaps: openGaps.size,
        ts: Date.now(),
      }));
      return;
    }

    if (url.pathname === '/status') {
      const summary = {};
      for (const [name, state] of Object.entries(systemState)) {
        summary[name] = { online: state.online, friction: state.friction, sigma: state.sigma, openGaps: state.openGaps };
      }
      res.writeHead(200, CORS);
      res.end(JSON.stringify({ ok: true, summary, openGaps: openGaps.size,
        cfr: guardianCFR ? guardianCFR.cfr : cfrField.snapshot(),
        cfrSource: guardianCFR ? 'guardian' : 'diagnostic',
        uptime: process.uptime(), ts: Date.now() }));
      return;
    }

    // ── CFR field state ─────────────────────────────────────────────────────
    // GET /cfr/health — { ok, status, regime, cfr } (Guardian primary, local fallback)
    if (url.pathname === '/cfr/health') {
      const localSnap = cfrField.snapshot();
      const source = guardianCFR ? 'guardian' : 'diagnostic';
      const cfr = guardianCFR ? guardianCFR.cfr : localSnap;
      const regime = guardianCFR ? guardianCFR.regime : localSnap.regime;
      res.writeHead(200, CORS);
      res.end(JSON.stringify({ ok: true, status: 'online', source, regime, cfr, local: localSnap, ts: Date.now() }));
      return;
    }

    // GET /cfr/state — full field state + system summary. Guardian's ledger-backed
    // field is the source of truth when reachable; local diagnostic field is
    // always included so the panel never reports "module offline".
    if (url.pathname === '/cfr/state') {
      const localSnap = cfrField.snapshot();
      const summary = {};
      for (const [name, state] of Object.entries(systemState)) {
        summary[name] = { online: state.online, friction: state.friction, sigma: state.sigma, openGaps: state.openGaps };
      }
      const source = guardianCFR ? 'guardian' : 'diagnostic';
      const cfr = guardianCFR ? guardianCFR.cfr : localSnap;
      const regime = guardianCFR ? guardianCFR.regime : localSnap.regime;
      res.writeHead(200, CORS);
      res.end(JSON.stringify({
        ok: true, source, cfr, regime,
        guardian: guardianCFR,   // null if guardian :7820/cfr/state unreachable
        diagnostic: localSnap,   // always present
        openGaps: openGaps.size, systems: summary, ts: Date.now(),
      }));
      return;
    }

    // GET /cfr/field — raw field dimensions (local diagnostic field only)
    if (url.pathname === '/cfr/field') {
      res.writeHead(200, CORS);
      res.end(JSON.stringify({ ok: true, ...cfrField.get(), guardianReachable: !!guardianCFR, ts: Date.now() }));
      return;
    }

    // Contract audit
    if (url.pathname === '/audit/contracts') {
      const report = _verifier?.auditReport() || {};
      res.writeHead(200, CORS);
      res.end(JSON.stringify({ ok: true, report, ts: Date.now() }));
      return;
    }

    // Audit health
    if (url.pathname === '/audit/health') {
      const health = {};
      for (const [name, cfg] of Object.entries(SYSTEMS)) {
        const lp  = require('path').join(ROOT, cfg.dataDir || cfg.ledgerDir || 'data', 'event_log.jsonl');
        const ex  = require('fs').existsSync(lp);
        const st  = ex ? require('fs').statSync(lp) : null;
        health[name] = { ledgerExists: ex, ledgerSizeKB: st ? Math.round(st.size/1024) : 0, port: cfg.port };
      }
      res.writeHead(200, CORS);
      res.end(JSON.stringify({ ok: true, health, ts: Date.now() }));
      return;
    }

    // Gaps
    if (url.pathname === '/gaps') {
      const status = url.searchParams.get('status') || 'open';
      const system = url.searchParams.get('system');
      let gaps = [...openGaps.values()];
      if (status !== 'all') gaps = gaps.filter(g => g.status === status);
      if (system) gaps = gaps.filter(g => g.system === system);
      res.writeHead(200, CORS);
      res.end(JSON.stringify({ ok: true, count: gaps.length, gaps }));
      return;
    }

    // Close a gap
    if (url.pathname.startsWith('/gaps/') && req.method === 'DELETE') {
      const gapId = url.pathname.split('/')[2];
      const gap   = openGaps.get(gapId);
      if (gap) { gap.status = 'closed'; gap.closedAt = Date.now(); }
      res.writeHead(200, CORS);
      res.end(JSON.stringify({ ok: !!gap }));
      return;
    }

    // Friction
    if (url.pathname === '/friction') {
      const friction = {};
      for (const [name, mon] of Object.entries(monitors)) {
        friction[name] = { friction: mon.friction(), sigma: mon.stats().sigma,
          errorRate: mon.stats().errorRate, slope: mon.stats().slope };
      }
      res.writeHead(200, CORS);
      res.end(JSON.stringify({ ok: true, friction, ts: Date.now() }));
      return;
    }

    // Baseline for a system
    if (url.pathname.startsWith('/baseline/')) {
      const system = url.pathname.split('/')[2];
      const mon    = monitors[system];
      if (!mon) { res.writeHead(404, CORS); res.end(JSON.stringify({ ok: false, error: 'unknown system' })); return; }
      res.writeHead(200, CORS);
      res.end(JSON.stringify({ ok: true, system, stats: mon.stats(), baseline: mon.baseline(), gaps: mon.gaps() }));
      return;
    }

    // Ledger tail for a system
    if (url.pathname.startsWith('/ledger/')) {
      const system = url.pathname.split('/')[2];
      const stream = url.pathname.split('/')[3] || 'events';
      const n      = parseInt(url.searchParams.get('n') || '20');
      const cfg    = SYSTEMS[system];
      if (!cfg) { res.writeHead(404, CORS); res.end(JSON.stringify({ ok: false, error: 'unknown system' })); return; }
      const ledgerFile = path.join(ROOT, cfg.dataDir || cfg.ledgerDir || 'data', stream, 'events.ndjson');
      let events = [];
      if (fs.existsSync(ledgerFile)) {
        const lines = fs.readFileSync(ledgerFile, 'utf8').trim().split('\n').filter(Boolean);
        events = lines.slice(-n).map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
      }
      res.writeHead(200, CORS);
      res.end(JSON.stringify({ ok: true, system, stream, events }));
      return;
    }

    // Trace a specific UUID across all system ledgers
    if (url.pathname.startsWith('/trace/')) {
      const traceId = url.pathname.split('/')[2];
      if (!traceId) { res.writeHead(400, CORS); res.end(JSON.stringify({ ok:false, error:'uuid required' })); return; }
      const trace = [];
      for (const [name, cfg] of Object.entries(SYSTEMS)) {
        const ledgerDir = path.join(ROOT, cfg.dataDir || cfg.ledgerDir || 'data');
        if (!fs.existsSync(ledgerDir)) continue;
        const streams = fs.readdirSync(ledgerDir).filter(f => {
          try { return fs.statSync(path.join(ledgerDir,f)).isDirectory(); } catch { return false; }
        });
        for (const stream of streams) {
          const evFile = path.join(ledgerDir, stream, 'events.ndjson');
          if (!fs.existsSync(evFile)) continue;
          const lines = fs.readFileSync(evFile,'utf8').trim().split('\n').filter(Boolean);
          for (const line of lines) {
            try {
              const ev = JSON.parse(line);
              const evStr = JSON.stringify(ev);
              if (evStr.includes(traceId)) {
                trace.push({ system: name, stream, event: ev });
              }
            } catch {}
          }
        }
      }
      trace.sort((a,b) => (a.event._ts||0) - (b.event._ts||0));
      res.writeHead(200, CORS);
      res.end(JSON.stringify({ ok:true, traceId, count:trace.length, trace }));
      return;
    }

    // Gap resolution — POST /gaps/:uuid/fix triggers HEAL_REQUESTED on nexus-bus
    // The diagnostic UI calls this when you click HEAL on an open loop.
    // Self-heal subscribes to HEAL_REQUESTED and runs the forge pipeline.
    if (url.pathname.startsWith('/gaps/') && url.pathname.endsWith('/fix') && req.method === 'POST') {
      const gapId = url.pathname.split('/')[2];
      const gap   = openGaps.get(gapId);
      if (!gap) { res.writeHead(404, CORS); res.end(JSON.stringify({ ok:false, error:'gap not found' })); return; }

      let triggered = false;
      try {
        // §ROOT-CAUSE FIX 2026-07-24 — this had the same defect as the
        // remediation sweep's Phase 3 (fixed above): it emitted
        // HEAL_REQUESTED on THIS process's nexus-bus and set triggered=true,
        // but the 5-level ladder is a CORTEX ORGAN in cortex's process. A
        // nexus-bus emit is an in-process EventEmitter call — it reached
        // nobody. And because require('../nexus-bus') never throws, the
        // catch() fallback that DID work (POST to cortex) was dead code that
        // could not run. Net effect: the UI's "fix this gap" button reported
        // success and healed nothing, every time.
        //
        // The HTTP route is now the PRIMARY path, not the fallback: cortex's
        // POST /api/event writes to event_log AND re-emits on cortex's own
        // bus, where the ladder actually listens. Ledger-first satisfies
        // §LAW II; nothing acts on an event that was not written down.
        const CORTEX = process.env.CORTEX_URL || 'http://127.0.0.1:3748';
        const hres = await fetch(`${CORTEX}/api/event`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: 'HEAL_REQUESTED',
            payload: {
              gapUuid:    gapId,
              gapType:    gap.type,
              modulePath: gap.file || gap.system || '',
              body:       gap.body || '',
              sigma:      gap.sigma || 0,
            },
            source:   'diagnostic.ui',
            causedBy: gapId,
            ts:       Date.now(),
          }),
        });
        if (!hres.ok) throw new Error(`cortex /api/event returned ${hres.status}`);
        triggered = true;
      } catch(err) {
        // §1.2 — cortex unreachable is a REAL, reportable failure, not a
        // silent no-op. It was previously swallowed as `catch(_)`.
        console.error(`[diagnostic] HEAL_REQUESTED for gap ${gapId} could not reach cortex: ${err.message}`);
        // §16.5 — the old fallback here POSTed to the SAME cortex endpoint
        // that just failed, so it could only ever fail again. Retrying an
        // identical call is not resilience, it is theatre that makes a dead
        // path look like a guarded one. Removed. triggered stays false and
        // the caller is told the truth below.
      }

      res.writeHead(200, CORS);
      res.end(JSON.stringify({ ok: true, triggered, gapId, ts: Date.now() }));
      return;
    }

    // System summary with trend data
    if (url.pathname.startsWith('/summary/')) {
      const system = url.pathname.split('/')[2];
      const cfg    = SYSTEMS[system];
      if (!cfg) { res.writeHead(404, CORS); res.end(JSON.stringify({ ok:false, error:'unknown system' })); return; }
      const state  = systemState[system] || {};
      const mon    = monitors[system];
      const stats  = mon.stats();
      const base   = mon.baseline();
      const gaps   = mon.gaps();
      const recentFailures = [];
      const failDir = path.join(ROOT, `data/${system}/failures`);
      if (fs.existsSync(failDir)) {
        for (const ff of fs.readdirSync(failDir).filter(f=>f.endsWith('.ndjson')).slice(-3)) {
          const lines = fs.readFileSync(path.join(failDir,ff),'utf8').trim().split('\n').filter(Boolean);
          lines.slice(-5).forEach(l => { try { recentFailures.push(JSON.parse(l)); } catch {} });
        }
      }
      res.writeHead(200, CORS);
      res.end(JSON.stringify({
        ok: true, system,
        state, stats, baseline: base,
        openGaps: gaps,
        recentFailures: recentFailures.sort((a,b)=>(b.loggedAt||0)-(a.loggedAt||0)).slice(0,10),
        pendingQueue: (() => {
          const qDir = path.join(ROOT, `data/${system}/input`);
          if (!fs.existsSync(qDir)) return 0;
          return fs.readdirSync(qDir).filter(f=>f.includes('.pending.')).length;
        })(),
      }));
      return;
    }

    // Audit
    if (url.pathname === '/decay') {
    // Memory pressure — reads cortex decay_log directly
    // Returns: eviction rate, pressure per tier, cycle summaries, working memory size
    const decayFile = path.join(ROOT, 'cortex/data/decay_log.jsonl');
    try {
      if (!fs.existsSync(decayFile)) {
        res.writeHead(200, CORS); res.end(JSON.stringify({ cycles:[], pressure:[], evictions:[], workingMemorySize:0 })); return;
      }
      const lines = fs.readFileSync(decayFile,'utf8').trim().split('\n').filter(Boolean);
      const entries = lines.slice(-500).map(l=>{ try{return JSON.parse(l);}catch{return null;} }).filter(Boolean);

      const cycles    = entries.filter(e => e._isCycleSummary).slice(-20);
      const evictions = entries.filter(e => !e._isCycleSummary);

      const byTable = {};
      for (const e of evictions) {
        if (!byTable[e.table]) byTable[e.table] = { count:0, totalAgeHours:0, tier:e.tier };
        byTable[e.table].count++;
        byTable[e.table].totalAgeHours += e.ageHours || 0;
      }
      const pressure = Object.entries(byTable).map(([table,d]) => ({
        table, tier: d.tier, evictions: d.count,
        avgAgeHours: d.count ? Math.round(d.totalAgeHours / d.count * 10) / 10 : 0,
      })).sort((a,b) => b.evictions - a.evictions);

      const lastCycle = cycles[cycles.length-1] || {};
      res.writeHead(200, CORS);
      res.end(JSON.stringify({
        cycles: cycles.slice(-10), pressure,
        evictions: evictions.slice(-50),
        workingMemorySize: lastCycle.workingMemorySize || 0,
        totalEvictions: evictions.length,
      }));
    } catch(e) { res.writeHead(500,CORS); res.end(JSON.stringify({error:e.message})); }
    return;
  }

  // ── /engines — all 12 diagnostic engines ──────────────────────────────────
  if (url.pathname === '/engines') {
    const de = _getDiagEngines();
    if (!de) {
      res.writeHead(503, CORS);
      return res.end(JSON.stringify({ok:false, error:'diagnostic engines unavailable'}));
    }
    try {
      const allEvents = [];
      for (const [, state] of Object.entries(systemState)) {
        if (Array.isArray(state.recentEvents)) allEvents.push(...state.recentEvents);
      }
      const states = {};
      for (const [name, state] of Object.entries(systemState)) {
        states[name] = { online: state.online, friction: state.friction||0, sigma: state.sigma||0 };
      }
      const result = de.runAllEngines({ events: allEvents, systemStates: states });
      res.writeHead(200, CORS);
      return res.end(JSON.stringify({ ok:true, ...result }));
    } catch(e) {
      res.writeHead(500, CORS);
      return res.end(JSON.stringify({ok:false, error:e.message}));
    }
  }

  if (url.pathname === '/tension') {
    // §TENSION-05: per-system tension score
    // tension = friction × (1 + openGaps × 0.2) × (1 + max(0, slope) × 2)
    // Open gaps are open loops — they accumulate tension via healer.scoreTension()
    const result = {};

    // Load gap-based tension from JAA (open loops)
    let allOpenGaps = [];
    try {
      const cortexUrl = 'http://127.0.0.1:3748';
      const gapRes = await fetch(cortexUrl + '/api/gaps?status=open', {
        signal: AbortSignal.timeout(2000)
      }).catch(() => null);
      if (gapRes?.ok) {
        const gapData = await gapRes.json();
        allOpenGaps = gapData.gaps || gapData.rows || (Array.isArray(gapData) ? gapData : []);
      }
    } catch(_) {}

    // Score each open gap and group by system
    let scoreTension;
    try { scoreTension = require('../cortex/self-heal/fault-taxonomy').scoreTension; }
    catch (e) {
      // §R7 2026-08-12 FIXED — was require('../cortex/healer/index'), a
      // directory that never existed (confirmed: MODULE_NOT_FOUND, meaning
      // this whole session's worth of /tension calls used the crude
      // severity fallback below, never real scoring). cortex/self-heal is
      // the real module; it now has scoreTension() too (built this phase,
      // using fault-taxonomy's own real FRICTION_DELTA_BY_LEVEL, not an
      // invented number). meta/gap/predicate.js:435 requires the same
      // phantom path — separate fix, out of R7's scope, not chased here.
      // This catch now only fires if self-heal itself is somehow
      // unreachable, a genuinely different and rarer situation than before.
      if (!_tensionWarned) {
        _tensionWarned = true;
        console.warn(`[diagnostic] cortex/self-heal/fault-taxonomy.js unreachable (${e.code}) — gap tension is the crude severity fallback, not real scoring.`);
      }
    }
    const gapTensionBySystem = {};
    if (!Array.isArray(allOpenGaps)) allOpenGaps = [];
    for (const gap of allOpenGaps) {
      const sys = gap.source?.split('/')?.[0] || gap.system || 'unknown';
      if (!gapTensionBySystem[sys]) gapTensionBySystem[sys] = { total: 0, count: 0, gaps: [] };
      const t = scoreTension ? scoreTension(gap) : (gap.severity === 'high' ? 2 : 1);
      gapTensionBySystem[sys].total += t;
      gapTensionBySystem[sys].count++;
      gapTensionBySystem[sys].gaps.push({ uuid: gap.uuid, type: gap.type, tension: t, severity: gap.severity });
    }

    for (const [name, mon] of Object.entries(monitors)) {
      const s       = mon.stats();
      const fric    = mon.friction();
      const monGaps = mon.gaps().length;
      const slope   = Math.max(0, s.slope || 0);
      const gapData = gapTensionBySystem[name] || { total: 0, count: 0, gaps: [] };

      // Combined tension: monitoring signal + open loop accumulation
      const monitorTension = fric * (1 + monGaps * 0.2) * (1 + slope * 2);
      const loopTension    = gapData.total;
      const tension        = monitorTension + loopTension * 0.3; // loops add 30% weight

      result[name] = {
        tension:        Math.round(tension * 1000) / 1000,
        monitorTension: Math.round(monitorTension * 1000) / 1000,
        loopTension:    Math.round(loopTension * 1000) / 1000,
        friction:       fric,
        openGaps:       monGaps + gapData.count,
        openLoops:      gapData.count,
        topLoops:       gapData.gaps.slice(0, 3),
        slope:          s.slope || 0,
        sigma:          s.sigma || 0,
        online:         (systemState[name] || {}).online || false,
        regime: tension > 2.0 ? 'critical' : tension > 1.0 ? 'turbulent' : tension > 0.4 ? 'elevated' : 'stable',
      };
    }

    // System-wide tension summary
    const tensions = Object.values(result).map(r => r.tension);
    const maxTension = tensions.length ? Math.max(...tensions) : 0;
    const totalLoops = allOpenGaps.length;

    res.writeHead(200, CORS);
    // Engine summary for composite health picture
    let engineSummary = null;
    const de2 = _getDiagEngines();
    if (de2) {
      try {
        const evts = []; for (const [,s] of Object.entries(systemState)) { if (Array.isArray(s.recentEvents)) evts.push(...s.recentEvents); }
        const sts  = {}; for (const [n,s] of Object.entries(systemState)) { sts[n]={online:s.online,friction:s.friction||0,sigma:s.sigma||0}; }
        const er = de2.runAllEngines({ events: evts, systemStates: sts });
        engineSummary = { healthScore:er.healthScore, alertCount:er.alertCount, alerts:er.alerts.slice(0,3),
          entropyRegime:er.engines?.entropy_rate?.regime, snrRegime:er.engines?.snr_floor?.regime,
          homeostasis:er.engines?.homeostasis?.regime, faultTree:er.engines?.fault_tree?.topEventActive,
          cascadeRisks:(er.engines?.cascade_risk||[]).length, fingerprint:er.engines?.fingerprint?.regime };
      } catch(_) {}
    }
    res.end(JSON.stringify({ systems: result, maxTension, totalLoops, openGapCount: allOpenGaps.length, engines: engineSummary }));
    return;
  }

  if (url.pathname === '/tension/edges') {
    // §TENSION-05: per-edge tension (sigma divergence between communicating system pairs)
    // Edges = system pairs that share data flow in the architecture
    const EDGES = [
      ['orchestrator','guardian'],
      ['orchestrator','cortex'],
      ['guardian','cortex'],
      ['cortex','idearium'],
      ['cortex','architect'],
      ['cortex','diagnostic'],
      ['diagnostic','orchestrator'],
    ];
    const edges = [];
    for (const [a, b] of EDGES) {
      const ma = monitors[a], mb = monitors[b];
      if (!ma || !mb) continue;
      const sa   = ma.stats(), sb = mb.stats();
      const diff = Math.abs((sa.sigma||0) - (sb.sigma||0));
      const fric = ((ma.friction()||0) + (mb.friction()||0)) / 2;
      const edgeTension = diff * (1 + fric * 2);
      edges.push({
        from: a, to: b,
        tension:    Math.round(edgeTension * 1000) / 1000,
        sigmaDiff:  Math.round(diff * 1000) / 1000,
        sigmaA:     sa.sigma || 0,
        sigmaB:     sb.sigma || 0,
        regime: edgeTension > 1.5 ? 'critical' : edgeTension > 0.7 ? 'turbulent' : edgeTension > 0.2 ? 'elevated' : 'stable',
      });
    }
    edges.sort((a,b) => b.tension - a.tension);
    res.writeHead(200, CORS);
    res.end(JSON.stringify(edges));
    return;
  }

  if (url.pathname === '/self-heal') {
    // Self-heal status — open loops, pending patches, human-required gaps
    // This is what the diagnostic UI shows in the self-heal panel
    try {
      const cortexUrl = 'http://127.0.0.1:3748';
      const [gapsRes, patchRes] = await Promise.all([
        fetch(cortexUrl + '/api/gaps?status=all', { signal: AbortSignal.timeout(2000) }).catch(() => null),
        fetch(cortexUrl + '/api/gaps?status=forge_patch_ready', { signal: AbortSignal.timeout(2000) }).catch(() => null),
      ]);
      const allGaps   = gapsRes?.ok   ? (await gapsRes.json()).gaps   || [] : [];
      const readyPatch= patchRes?.ok  ? (await patchRes.json()).gaps  || [] : [];

      let scoreTension;
      try { scoreTension = require('../cortex/self-heal/fault-taxonomy').scoreTension; } catch(_) {}   // §R7 2026-08-12 — same fix as line ~1796

      const byStatus = {};
      let totalTension = 0;
      for (const g of allGaps) {
        byStatus[g.status] = (byStatus[g.status] || 0) + 1;
        if (g.status !== 'resolved' && g.status !== 'forge_applied') {
          totalTension += scoreTension ? scoreTension(g) : 1;
        }
      }

      const humanRequired = allGaps.filter(g => g.status === 'human_required');
      const openLoops     = allGaps.filter(g => !['resolved','forge_applied'].includes(g.status));

      res.writeHead(200, CORS);
      res.end(JSON.stringify({
        ok:             true,
        totalGaps:      allGaps.length,
        openLoops:      openLoops.length,
        totalTension:   Math.round(totalTension * 100) / 100,
        byStatus,
        pending:        byStatus['pending']        || 0,
        processing:     byStatus['processing']     || 0,
        needsManual:    byStatus['needs_manual']   || 0,
        forgeReady:     readyPatch.length,
        humanRequired:  humanRequired.length,
        humanRequiredGaps: humanRequired.slice(0,5).map(g => ({
          uuid: g.uuid, type: g.type, path: g.path, body: g.body?.slice(0,100)
        })),
        recentPatches:  byStatus['forge_applied']  || 0,
      }));
    } catch(e) {
      res.writeHead(500, CORS);
      res.end(JSON.stringify({ ok: false, error: e.message }));
    }
    return;
  }

  if (url.pathname === '/audit') {
      const result = await runAuditInternal();
      res.writeHead(200, CORS);
      res.end(JSON.stringify({ ok: true, ...result }));
      return;
    }

  // ── Component + SEAM map routes ───────────────────────────────────────────
  // GET /components — all registered components across every system
  if (url.pathname === '/components') {
    try {
      const map = _buildSeamMap();
      res.writeHead(200, CORS);
      res.end(JSON.stringify({
        ok: true, ts: map.ts,
        summary: map.summary,
        systems: Object.fromEntries(
          Object.entries(map.systems).map(([ns, r]) => [ns, {
            count: (r.components||[]).length,
            error: r.error || null,
            meta:  r.meta || null,
          }])
        ),
        components: map.components.map(c => ({
          id: c.id, namespace: c.namespace, name: c.name,
          version: c.version, description: c.description,
          route: c.route, tags: c.tags,
          hasHooks: !!(c.hooks && (c.hooks.in?.length || c.hooks.out?.length)),
          hookCount: { in: (c.hooks?.in||[]).length, out: (c.hooks?.out||[]).length },
        })),
      }));
    } catch(e) {
      res.writeHead(500, CORS);
      res.end(JSON.stringify({ ok: false, error: e.message }));
    }
    return;
  }

  // GET /components/wires — all declared SEAM wires + validation
  if (url.pathname === '/components/wires') {
    try {
      const map = _buildSeamMap();
      res.writeHead(200, CORS);
      res.end(JSON.stringify({
        ok: true, ts: map.ts,
        summary: {
          total:   map.wires.length,
          valid:   map.wires.filter(w=>w.status==='valid').length,
          broken:  map.brokenWires.length,
          orphaned: map.orphanedInHooks.length,
        },
        wires:            map.wires,
        brokenWires:      map.brokenWires,
        orphanedInHooks:  map.orphanedInHooks,
      }));
    } catch(e) {
      res.writeHead(500, CORS);
      res.end(JSON.stringify({ ok: false, error: e.message }));
    }
    return;
  }

  // GET /seam/map — full topology: components, hooks, wires, gaps
  if (url.pathname === '/seam/map') {
    try {
      const map = _buildSeamMap();
      // Enrich with live system health from monitors
      const liveHealth = {};
      for (const [name, cfg] of Object.entries(SYSTEMS)) {
        liveHealth[name] = { online: !!cfg._online, friction: cfg._friction || 0 };
      }
      res.writeHead(200, CORS);
      res.end(JSON.stringify({
        ok: true, ts: map.ts,
        summary:          map.summary,
        systems:          map.systems,
        wires:            map.wires,
        brokenWires:      map.brokenWires,
        orphanedInHooks:  map.orphanedInHooks,
        missingRegistries:map.missingRegistries,
        liveHealth,
      }));
    } catch(e) {
      res.writeHead(500, CORS);
      res.end(JSON.stringify({ ok: false, error: e.message }));
    }
    return;
  }

  // GET /seam/health — wire health scored: broken, missing endpoints, orphans
  if (url.pathname === '/seam/health') {
    try {
      const map = _buildSeamMap();
      const total    = map.wires.length || 1;
      const wireScore = map.wires.filter(w=>w.status==='valid').length / total;
      const regScore  = (Object.keys(_REGISTRY_PATHS).length - map.missingRegistries.length)
                        / Object.keys(_REGISTRY_PATHS).length;
      const score = Math.round(((wireScore * 0.6) + (regScore * 0.4)) * 100);

      const alerts = [];
      for (const w of map.brokenWires) {
        alerts.push({ severity: 'high', type: 'broken_wire',
          message: `${w.from} → ${w.to}: ${w.issue}`, wire: w });
      }
      for (const r of map.missingRegistries) {
        alerts.push({ severity: 'medium', type: 'missing_registry',
          message: `${r.ns}: ${r.error}` });
      }
      for (const h of map.orphanedInHooks) {
        alerts.push({ severity: 'low', type: 'orphaned_hook',
          message: `${h.hookId} on ${h.componentId} — no wire points to this IN hook` });
      }

      res.writeHead(200, CORS);
      res.end(JSON.stringify({
        ok: true, ts: map.ts,
        score,
        regime: score >= 80 ? 'healthy' : score >= 50 ? 'degraded' : 'critical',
        summary: map.summary,
        alerts,
        wireIntegrity: Math.round(wireScore * 100),
        registryIntegrity: Math.round(regScore * 100),
      }));
    } catch(e) {
      res.writeHead(500, CORS);
      res.end(JSON.stringify({ ok: false, error: e.message }));
    }
    return;
  }

    // ── File + registry + SEAM integrity ──────────────────────────────────────
    if (url.pathname === '/integrity') {
      try {
        const fi = require('../lib/file-integrity');
        const result = fi.check();
        res.writeHead(200, CORS);
        res.end(JSON.stringify({ ok: true, ...result }));
      } catch(e) { res.writeHead(500, CORS); res.end(JSON.stringify({ ok: false, error: e.message })); }
      return;
    }
    if (url.pathname === '/integrity/snapshot') {
      try {
        const fi = require('../lib/file-integrity');
        const snap = fi.snapshot();
        res.writeHead(200, CORS);
        res.end(JSON.stringify({ ok: true, entries: snap, count: snap.length, ts: Date.now() }));
      } catch(e) { res.writeHead(500, CORS); res.end(JSON.stringify({ ok: false, error: e.message })); }
      return;
    }
    if (url.pathname === '/integrity/accept' && req.method === 'POST') {
      try {
        const fi = require('../lib/file-integrity');
        const entries = fi.acceptBaseline();
        broadcast({ type: 'integrity.baseline.accepted', count: entries.length, ts: Date.now() });
        res.writeHead(200, CORS);
        res.end(JSON.stringify({ ok: true, accepted: entries.length, ts: Date.now() }));
      } catch(e) { res.writeHead(500, CORS); res.end(JSON.stringify({ ok: false, error: e.message })); }
      return;
    }

    res.writeHead(404, CORS);
    res.end(JSON.stringify({ ok: false, error: 'not found' }));
  });

  server.listen(PORT, '127.0.0.1', () => {
    console.log(`[nexus-diagnostic] running :${PORT} pid=${process.pid}`);
    console.log(`[nexus-diagnostic] monitoring: ${Object.keys(SYSTEMS).join(', ')}`);
    ico.ledger.append('boot', { type: 'service.start', port: PORT, pid: process.pid, ts: Date.now() });
    broadcast({ type: 'service.start', port: PORT, ts: Date.now() });
  });

  // ── Shutdown ──────────────────────────────────────────────────────────────

  process.on('SIGTERM', () => {
    clearInterval(pollTimer);
    server.close();
    if (fs.existsSync(PID_FILE)) fs.unlinkSync(PID_FILE);
    ico.ledger.append('boot', { type: 'service.stop', reason: 'SIGTERM', ts: Date.now() });
    process.exit(0);
  });

  process.on('SIGINT', () => {
    clearInterval(pollTimer);
    server.close();
    if (fs.existsSync(PID_FILE)) fs.unlinkSync(PID_FILE);
    process.exit(0);
  });
}

// Export for use by other modules
module.exports = { SYSTEMS };

// Make runAudit available as CLI
async function runAudit() {
  // Stub for CLI usage without running service
  const issues = [];
  const { spawnSync } = require('child_process');
  // §CRASH-FIX 2026-08-13 — see matching fix + full explanation in
  // runAuditInternal() above; same push(...recursiveCall) bug, same fix.
  function walkJs(root) {
    const results = [];
    const stack = [root];
    while (stack.length) {
      const dir = stack.pop();
      if (!fs.existsSync(dir)) continue;
      for (const f of fs.readdirSync(dir)) {
        if (['node_modules', '.git', 'data'].includes(f)) continue;
        const fp = path.join(dir, f);
        if (fs.statSync(fp).isDirectory()) stack.push(fp);
        else if (f.endsWith('.js')) results.push(fp);
      }
    }
    return results;
  }
  let syntaxFails = 0;
  for (const file of walkJs(ROOT)) {
    const r = spawnSync('node', ['--check', file], { encoding:'utf8', timeout:5000 });
    if (r.status !== 0) { syntaxFails++; issues.push({ type:'syntax_error', file: file.replace(ROOT+'/',''), error:(r.stderr||'').split('\n')[0] }); }
  }
  return { ts: Date.now(), syntaxFails, totalIssues: issues.length, issues };
}

// ─────────────────────────────────────────────────────────────────────────────
// lib/component-seam-map.js — Component + SEAM map for diagnostic service
// Injected at end of nexus-diagnostic.js — aggregates all registry-components
// files and validates declared SEAM wires. Exposes:
//   GET /components        — all registered components across all systems
//   GET /components/wires  — all declared SEAM wires + validation status
//   GET /seam/map          — full topology: components, hooks, wires, gaps
//   GET /seam/health       — wire health: broken wires, missing endpoints, orphaned hooks
// ─────────────────────────────────────────────────────────────────────────────

const _REGISTRY_PATHS = {
  cortex:       path.join(ROOT, 'cortex/registry-components.js'),
  guardian:     path.join(ROOT, 'guardian/registry-components.js'),
  architect:    path.join(ROOT, 'architect/registry-components.js'),
  emerge:       path.join(ROOT, 'emerge/registry-components.js'),
  copilot:      path.join(ROOT, 'copilot/registry-components.js'),
  idearium:     path.join(ROOT, 'idearium/registry-components.js'),
  ollama:       path.join(ROOT, 'ollama/registry-components.js'),
  'clear-glass':path.join(ROOT, 'clear-glass/registry-components.js'),
};

function _loadAllRegistries() {
  const all = {};
  for (const [ns, p] of Object.entries(_REGISTRY_PATHS)) {
    try {
      if (!fs.existsSync(p)) { all[ns] = { error: 'registry-components.js not found', components: [] }; continue; }
      const m = require(p);
      const comps = Array.isArray(m) ? m : (m.components || []);
      all[ns] = { components: comps, count: comps.length, meta: Array.isArray(m) ? null : { systemId: m.systemId, version: m.version, port: m.port, events: m.events } };
    } catch(e) {
      all[ns] = { error: e.message, components: [] };
    }
  }
  return all;
}

function _extractWires(registries) {
  const wires = [];
  const hookIndex = {}; // hookId -> { componentId, ns, type: 'in'|'out' }

  for (const [ns, reg] of Object.entries(registries)) {
    for (const comp of (reg.components || [])) {
      const hooks = comp.hooks || {};
      for (const hookIn of (hooks.in || [])) {
        hookIndex[hookIn.id] = { componentId: comp.id, ns, type: 'in', intent: hookIn.intent, tags: hookIn.tags };
      }
      for (const hookOut of (hooks.out || [])) {
        hookIndex[hookOut.id] = { componentId: comp.id, ns, type: 'out', tags: hookOut.tags };
        for (const target of (hookOut.wires_to || [])) {
          wires.push({
            from:       comp.id,
            fromNs:     ns,
            hookId:     hookOut.id,
            to:         target,      // hookId of the receiving end
            toNs:       target.split('.')[0],
            tags:       hookOut.tags || [],
          });
        }
      }
    }
  }
  return { wires, hookIndex };
}

function _validateWires(wires, hookIndex) {
  const results = [];
  for (const wire of wires) {
    const targetHook = hookIndex[wire.to];
    const status = targetHook
      ? (targetHook.type === 'in' ? 'valid' : 'wrong_direction')
      : 'broken';  // wires_to points at a hook that doesn't exist in any registry
    results.push({
      ...wire,
      status,
      targetComponent: targetHook?.componentId || null,
      issue: status === 'broken'
        ? `Target hook "${wire.to}" not declared in any registry-components.js`
        : status === 'wrong_direction'
        ? `Wire points to an OUT hook — should point to an IN hook`
        : null,
    });
  }
  return results;
}

function _buildSeamMap() {
  const registries = _loadAllRegistries();
  const { wires, hookIndex } = _extractWires(registries);
  const validatedWires = _validateWires(wires, hookIndex);

  const allComponents = [];
  for (const [ns, reg] of Object.entries(registries)) {
    for (const c of (reg.components || [])) {
      allComponents.push({ ...c, _ns: ns, _registryError: reg.error || null });
    }
  }

  const broken   = validatedWires.filter(w => w.status !== 'valid');
  const valid    = validatedWires.filter(w => w.status === 'valid');

  // Orphaned hooks: IN hooks that no wire points to
  const wiredTargets = new Set(validatedWires.map(w => w.to));
  const orphanedInHooks = Object.entries(hookIndex)
    .filter(([id, h]) => h.type === 'in' && !wiredTargets.has(id))
    .map(([id, h]) => ({ hookId: id, componentId: h.componentId, ns: h.ns, intent: h.intent }));

  // Missing registries
  const missingRegistries = Object.entries(registries)
    .filter(([, r]) => r.error)
    .map(([ns, r]) => ({ ns, error: r.error }));

  return {
    ts: Date.now(),
    summary: {
      totalComponents:   allComponents.length,
      totalWires:        validatedWires.length,
      validWires:        valid.length,
      brokenWires:       broken.length,
      orphanedInHooks:   orphanedInHooks.length,
      missingRegistries: missingRegistries.length,
      systemsWithRegistry: Object.keys(registries).filter(ns => !registries[ns].error).length,
    },
    systems:           registries,
    components:        allComponents,
    wires:             validatedWires,
    brokenWires:       broken,
    orphanedInHooks,
    missingRegistries,
    hookIndex,
  };
}

// Attach routes to the diagnostic HTTP server — called from startService()
// These are appended here; the server's request handler checks them after
// all existing routes so there are no conflicts.
// §FIX 2026-06-28: removed const _origStartService re-assignment — was a TDZ
// crash because `const` is not hoisted but the function reference was used at
// module init time (line 130 calls startService() before this block).
// The original startService() defined above is used directly at init.
// This block is now a no-op export placeholder.

// Export the map builder so orchestrator/copilot can consume it too
module.exports.buildSeamMap    = _buildSeamMap;
module.exports.loadRegistries  = _loadAllRegistries;
module.exports.extractWires    = _extractWires;
module.exports.validateWires   = _validateWires;
