'use strict';
// ── cortex/boot.js ────────────────────────────────────────────────────────────
// UUID: cortex-boot-v3-0000-4000-0000-000000000001
// Version: 3.0.0
//
// §3.1  Bottom-up boot: wm → storage → siso → jaa → modules → admin → bridge
// §WM.1 Working memory is opened in Phase 1 — before every other module.
//       Everything that follows writes to wm first.
// §1.2  Every failure loud, specific, halts boot (HARD phases)
// §2.1  Persistence before everything else
// §5.2  Registers with bridge after boot
// §LAW_III mind-bridge wired in Phase 5 (after admin-server)

const path        = require('path');
const nc          = require('../nexus-connect');
const { JaaDB, uid }     = require('./memory/jaa-db');
const { ALL_TABLES }     = require('./memory/jaa-tables');
const { FileStore }      = require('./foundation/store/FileStore');
const { FileRefs }       = require('./foundation/store/FileRefs');
const { core }           = require('./foundation/cobalt-core');
const { AdminServer }    = require('./foundation/admin-server');
const pollRegistry       = require('./foundation/poll-registry');
const versionium         = require('./versionium');
const agentDispatch      = require('./agents');
const ollamaAgent        = require('./agents/ollama');
const claudeAgent        = require('./agents/claude');
const mindBridge         = require('./guardian/mind-bridge');
const siphon             = require('./guardian/siphon');
const pulse              = require('./guardian/pulse');
const watchman           = require('./guardian/watchman');
const { getWM, makeHelpers } = require('./working-memory');

const DATA_DIR  = process.env.NEXUS_DATA_DIR  || path.join(__dirname, 'data');
const STORE_DIR = process.env.NEXUS_STORE_DIR || path.join(__dirname, 'store');
const PORT      = parseInt(process.env.NEXUS_PORT || '3748');
const VERSION   = '3.0.0';

let jaaDB, fileStore, fileRefs, adminServer;

async function bootAsync() {
  const { BootSequence } = require('../lib/boot-sequence');

  const seq = new BootSequence({
    systemId: 'cortex', port: PORT, version: VERSION,
    label: 'Nexus Cortex', maxRetries: 1,
  });

  // ── Phase 0: orchestrator registration (SOFT) ─────────────────────────────
  seq.phase({ name: 'orchestrator.register', type: 'SOFT',
    label: 'Register with orchestrator',
    fn: async () => {
      const r = await nc.registerWithOrchestrator('cortex', PORT, { role: 'source-of-truth', version: VERSION });
      if (r.ok) nc.startHeartbeat('cortex', PORT);
    },
  });

  // ── Phase 1: Working memory open (HARD) ───────────────────────────────────
  // §WM.1 — must open before any other module runs.
  // All subsequent phases write to wm as their first action.
  seq.phase({ name: 'working-memory.open', type: 'HARD',
    label: 'Open working memory — universal event spine (§WM.1)',
    fn: async () => {
      const wm = getWM({ dataDir: DATA_DIR });
      wm.open();
      const wmh = makeHelpers(wm);
      wmh.boot('cortex/boot', { version: VERSION, port: PORT, dataDir: DATA_DIR });
    },
  });

  // ── Phase 2: Storage (HARD) ───────────────────────────────────────────────
  seq.phase({ name: 'storage.init', type: 'HARD',
    label: 'JAA database open + FileStore init (§2.1)',
    fn: async () => {
      const wm = getWM();
      jaaDB = new JaaDB({ dir: DATA_DIR });
      fileStore = new FileStore({ dir: STORE_DIR });
      fileRefs  = new FileRefs({ store: fileStore, dir: path.join(STORE_DIR, 'refs') });
      await jaaDB.open();

      // FIX-3: JaaDB ignores constructor tables param — hardcoded ALL_TABLES.
      // Pre-declare tables from jaa-tables.js that aren't in JaaDB's built-in list.
      // _requireTable() provisions silently after open() — no warn for known tables.
      const { ALL_TABLES: DECLARED } = require('./memory/jaa-tables');
      const builtIn = new Set(Object.keys(jaaDB._tables));
      for (const t of DECLARED) {
        if (!builtIn.has(t)) {
          // Silence the warn for expected tables by pre-inserting the Map directly
          jaaDB._tables[t] = [];
          jaaDB._fds[t]    = require('fs').createWriteStream(
            require('path').join(DATA_DIR, t + '.jsonl'), { flags: 'a' }
          );
        }
      }

      wm.write('cortex.storage.opened', { tables: Object.keys(jaaDB._tables).length }, { source: 'boot' });
      jaaDB.insert('event_log', {
        uuid: uid(), type: 'cortex.storage.opened', ts: Date.now(),
        payload: { dataDir: DATA_DIR, tables: ALL_TABLES.length },
        source: 'boot', causedBy: null,
      });
    },
  });

  // ── Phase 3: Cobalt core (HARD) ───────────────────────────────────────────
  seq.phase({ name: 'core.init', type: 'HARD',
    label: 'Cobalt core open',
    fn: async () => {
      core.open();
      try {
        const schema = require('./cobalt.manifest.json');
        core.load(schema);
      } catch {
        core.connect({
          uuid: 'nexus-project-0000-4000-0000-000000000001',
          name: 'nexus', type: 'core', version: VERSION,
          meta: { intent: 'NEXUS cortex source-of-truth' },
        });
      }
    },
  });

  // ── Phase 4: Module deps (HARD) ───────────────────────────────────────────
  seq.phase({ name: 'deps.init', type: 'HARD',
    label: 'Wire Versionium + AgentDispatch deps',
    fn: async () => {
      versionium.setDeps({ fileStore, fileRefs });
      agentDispatch.setDeps({ ollama: ollamaAgent, claude: claudeAgent, chatgpt: null, gemini: null });
    },
  });

  // ── Phase 5: Poll registry (HARD) ─────────────────────────────────────────
  seq.phase({ name: 'poll.start', type: 'HARD',
    label: 'Start all module poll loops',
    fn: async () => {
      // Register guardian layer modules with poll-registry
      // Boot phase 11 (SOFT) — guardian connection is optional
      pollRegistry.register(siphon,   { id: 'guardian.siphon',   pollMs: 2000, bootPhase: 11 });
      pollRegistry.register(pulse,    { id: 'guardian.pulse',    pollMs: 3000, bootPhase: 11 });
      pollRegistry.register(watchman, { id: 'guardian.watchman', pollMs: 5000, bootPhase: 11 });
      pollRegistry.start();
    },
  });

  // ── Phase 6: Mind-bridge init (SOFT) ─────────────────────────────────────
  // AUDIT-4 FIX: mind-bridge initialises BEFORE the HTTP server starts.
  // This guarantees the relay queue is rehydrated from JAA before any
  // Guardian poll can arrive via GET /api/guardian/relay.
  // §LAW_III — mind-bridge is the only contract surface between Cortex and Guardian.
  seq.phase({ name: 'mind-bridge.init', type: 'SOFT',
    label: 'Guardian mind-bridge init — relay rehydration before HTTP (§LAW_III)',
    fn: async () => {
      mindBridge.init({});
    },
  });

  // ── Phase 7: Admin server (HARD) ──────────────────────────────────────────
  // Server starts AFTER mind-bridge so all /api/guardian/* routes are
  // backed by a fully initialised bridge from first request.
  seq.phase({ name: 'server.start', type: 'HARD',
    label: 'HTTP admin server on :' + PORT,
    fn: async () => {
      adminServer = new AdminServer({ port: PORT });
      await adminServer.start();
    },
  });

  // ── Phase 8: Boot record (SOFT) ───────────────────────────────────────────
  seq.phase({ name: 'boot.record', type: 'SOFT',
    label: 'Write boot record (§M1)',
    fn: async () => {
      const wm = getWM();
      wm.write('system.booted', { version: VERSION, port: PORT, modules: pollRegistry.modules.map(m => m.id) }, { source: 'boot' });
      jaaDB.insert('event_log', {
        uuid: uid(), type: 'system.booted', ts: Date.now(),
        payload: { version: VERSION, modules: pollRegistry.modules.map(m => m.id), port: PORT },
        source: 'boot', causedBy: null,
      });
      // Seed project registry
      try {
        for (const s of ['bridge', 'cortex', 'guardian', 'idearium', 'emerge']) {
          jaaDB.insert('project_registry', {
            uuid: require('crypto').randomUUID(), name: s, system: s,
            ts: Date.now(), source: 'boot',
          });
        }
      } catch (_) {}
    },
  });

  // ── Phase 9: Bridge registration (SOFT) ───────────────────────────────────
  seq.phase({ name: 'bridge.register', type: 'SOFT',
    label: 'Bridge handshake + bus announce (§5.2)',
    fn: async () => {
      const r = await nc._req('bridge', 'POST', '/bridge/handshake', {
        systemId: 'cortex', appId: 'cortex',
        secret: 'nexus-cortex-internal-v1',
      }, 4000);
      if (!r.ok) throw new Error('bridge unavailable');
      await nc.postLedger('cortex', 'cortex.booted', { version: VERSION, port: PORT });
      await nc.postBridge('cortex.booted', { version: VERSION, port: PORT });
    },
  });

  const result = await seq.run();
  if (!result.ok) process.exit(1);
}

bootAsync().catch(err => {
  console.error('\x1b[31m[cortex/boot §1.2] BOOT FAILED:\x1b[0m', err.message);
  console.error(err.stack);
  process.exit(1);
});
