// ═══════════════════════════════════════════════════
// NEXUS — Boot
// boot.js
//
// Wires all modules onto the event bus.
// Constitutional Laws enforced at boot.
// Emits system.booted when all modules ready.
//
// Boot order:
//   kernel → store → [Phase 2: jaaDB] → raid → usage →
//   manifest → agents → gate → healer →
//   [Phase 2: crystalball] → ws-server → system.booted
//
// Phase 2 changes:
//   - JaaDB v2 opened before any module that needs it
//   - CrystalBall module (Lattice + BEP + MCL + MQL) wired
//   - NanoValidator replaces AJV (zero deps)
//   - NanoWSServer replaces ws package (zero deps)
//   - mql/bep/mcl exported for Ollama context builder
// ═══════════════════════════════════════════════════

'use strict';

console.log('[NEXUS] Booting…');

// ── Phase 1: Foundation ───────────────────────────
const { kernel }        = require('./foundation/kernel');
const { FileStore }     = require('./foundation/store/FileStore');
const { FileRefs }      = require('./foundation/store/FileRefs');
const { NanoWSServer }  = require('./foundation/nano-ws');
const { NanoValidator } = require('./foundation/validator');
const path              = require('path');

// JAA: content-addressed store (law-level persistence)
const fileStore = new FileStore(path.join(process.cwd(), 'data', 'store'));
const fileRefs  = new FileRefs(path.join(process.cwd(), 'data', 'store'));

kernel.emit('foundation.ready', {
  laws:       { I: 'LOCAL_FIRST', II: 'EVENT_AUTHORITY', III: 'LAYER_SOVEREIGNTY', IV: 'SCHEMA_OVER_CODE' },
  store:      'content-addressable',
  ringBuffer: 10000,
  deps:       'zero',
});

// ── Phase 2: JaaDB — open first (G8 blocker) ─────
// Must be open before RAID, agents, or CrystalBall
// attempt to read/write (§M1 — everything stored).
const { jaaDB } = require('./memory/jaa-db');

kernel.emit('jaadb.opening', {
  backend: typeof process !== 'undefined' ? 'node-jsonl' : 'indexeddb',
});

// ── Phase 1: Core pipeline ────────────────────────
const { usage }     = require('./core/usage');
const { raid }      = require('./core/raid');
const { generator } = require('./core/manifest');
const { gapHunter } = require('./gate/gap-finder');
const { healer }    = require('./healer');

// Wire GapHunter into manifest generator
generator.setGapHunter(gapHunter);

kernel.emit('core.ready', {
  modules: ['usage', 'raid', 'manifest', 'gap-hunter', 'healer'],
});

// ── Phase 1: Agents ───────────────────────────────
const { pingAll, AGENTS } = require('./agents');

// Ping all agents on boot (non-blocking — results in agents.ready)
pingAll().then(results => {
  kernel.emit('agents.ready', {
    results,
    available: Object.entries(results).filter(([, v]) => v).map(([k]) => k),
  });
});

// ── Constitutional Law enforcement ────────────────

// Law I: Ollama always attempted first — enforced in RAID engine
kernel.on('raid.routed', e => {
  const { agent, task } = e.payload;
  const ollamaUsage = usage.get('ollama').percent;
  if (agent !== 'ollama' && ollamaUsage < 90) {
    kernel.emit('law.violation', {
      law:     'I',
      message: `RAID routed to '${agent}' for task '${task}' but Ollama is available (${ollamaUsage}%)`,
      payload: e.payload,
    });
  }
});

// Law II: every state-change must go through the bus
// (Structural — kernel design prevents direct calls.
//  This hook catches any attempt that leaks through.)
kernel.on('law.violation', e => {
  console.error('[LAW VIOLATION]', JSON.stringify(e.payload, null, 2));
  require('./core/index/query').storeContent(e.payload, `violations:${e.tick}`).catch(err => kernel.emit('boot.store.error', { op: 'violation.store', tick: e.tick, error: err.message }));
});

// Law IV: manifest.rejected → re-generation at temp:0
kernel.on('manifest.rejected', e => {
  console.warn('[LAW IV] Manifest rejected — schema violation:', e.payload.errorText);
  kernel.emit('manifest.retry_scheduled', {
    attempt:   e.payload.attempt,
    errorText: e.payload.errorText,
  }, { causedBy: e.id });
});

// ── Phase 2: CrystalBall module ───────────────────
// Async boot — system.booted fires only after this resolves.
const { CrystalBall } = require('./crystalball/index');
let crystalball, mql, bep, mcl, lb;

async function bootAsync() {

  // Open JaaDB (must complete before crystalball.init)
  await jaaDB.open();
  kernel.emit('jaadb.ready', { tables: await jaaDB.tables() });

  // Boot CrystalBall
  kernel.emit('crystalball.booting', {});
  crystalball = new CrystalBall({ nexusKernel: kernel, jaaDB });
  await crystalball.init();
  // crystalball.init() emits crystalball.ready internally

  mql = crystalball.mql;   // Ollama context builder: await mql.query(intent, sessionId)
  bep = crystalball.bep;   // BEP pattern library
  mcl = crystalball.mcl;   // Memory crystallization layer
  lb  = crystalball.lb;    // Lattice bridge

  // ── Admin server (SSE + static + Bridge health endpoint) ──
  const { AdminServer } = require('./foundation/admin-server');
  const adminServer = new AdminServer({
    kernel,
    port:     parseInt(process.env.NEXUS_ADMIN_PORT || '3748'),
    adminDir: path.join(__dirname, 'admin'),
    jaaDB,
    mcl,
    bep,
    usage,
  });
  // Await server listen + SSE wiring before emitting pulse
  await adminServer.start();

  // ── Final boot event ────────────────────────────
  kernel.emit('system.booted', {
    version: '2.0.0',
    phase:   2,
    laws:    ['I', 'II', 'III', 'IV'],
    modules: [
      'kernel', 'bus', 'store', 'jaadb',
      'raid', 'usage', 'manifest',
      'agents', 'gate', 'healer',
      'crystalball', 'lattice', 'bep', 'mcl', 'mql',
    ],
    agents:      Object.keys(AGENTS),
    crystalball: {
      latticeSize: lb.stats?.nodeCount ?? 0,
      bepCount:    bep.patternCount,
    },
    deps: 'zero',
  });

  console.log('[NEXUS] Boot complete. Event bus live. Laws enforced. CrystalBall active.');

  // ── NEXUS Pulse — kernel event → SSE → admin panel ──────
  // BroadcastChannel doesn't exist in Node, so we emit on the
  // kernel bus instead. AdminServer forwards every kernel event
  // through SSE (/api/stream) to the browser. Admin panel listens
  // for 'nexus.cli.pulse' and updates the Bridge/CLI status indicator.
  const _pulseBootTs = Date.now();
  const _emitCliPulse = () => {
    const ring   = kernel.ring;
    const lastEv = ring.at(-1);
    kernel.emit('nexus.cli.pulse', {
      ts:        Date.now(),
      tick:      lastEv?.tick ?? 0,
      ringSize:  ring.length,
      uptime:    Date.now() - _pulseBootTs,
      adminPort: parseInt(process.env.NEXUS_ADMIN_PORT || '3748'),
      version:   '2.0.0',
      phase:     2,
      source:    'cli',
    });
  };
  _emitCliPulse();                   // immediate — SSE is wired, this will broadcast
  setInterval(_emitCliPulse, 5_000); // every 5s so browser sees it quickly after connect

  // Also fire a pulse whenever a new SSE client connects
  // (handles page refresh or new tab — they get status within ms)
  kernel.on('admin.sse.connected', () => _emitCliPulse());
}

// Kick off async boot — consumers listen for system.booted
bootAsync().catch(err => {
  // §1.2 — Nothing silently fails.
  console.error('[NEXUS] BOOT FAILED:', err);
  kernel.emit('system.boot.failed', {
    message: err.message,
    stack:   err.stack,
  });
  process.exit(1);
});

// ── Export singletons ─────────────────────────────
// Phase 2 exports (crystalball/mql/bep/mcl/lb) are set after
// bootAsync resolves. Consumers must await system.booted first.
module.exports = {
  kernel,
  fileStore,
  fileRefs,
  jaaDB,
  usage,
  raid,
  generator,
  gapHunter,
  healer,
  AGENTS,
  // Phase 2 — available after system.booted
  get adminServer()  { return adminServer; },
  get crystalball() { return crystalball; },
  get mql()         { return mql; },
  get bep()         { return bep; },
  get mcl()         { return mcl; },
  get lb()          { return lb; },
};
