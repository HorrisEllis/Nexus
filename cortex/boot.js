'use strict';
// ── cortex/boot.js ────────────────────────────────────────────────────────────
// UUID: cortex-boot-v2-0000-4000-0000-000000000001
// Version: 2.0.0
//
// §3.1  Bottom-up boot: storage → siso → jaa → modules → admin → orchestrator
// §1.2  Every failure loud, specific, halts boot
// §2.1  Persistence before everything else
// §8.3  SISO and Jaa are load-order prerequisites

'use strict';

const path        = require('path');
const nc          = require('../nexus-connect');
const { JaaDB, uid } = require('./memory/jaa-db');
const { createCFRLedger } = require('../lib/cfr/ledger');
const { FileStore }  = require('./foundation/store/FileStore');
const { FileRefs }   = require('./foundation/store/FileRefs');
const { core }       = require('./foundation/cobalt-core');
const { AdminServer }= require('./foundation/admin-server');
const pollRegistry   = require('./foundation/poll-registry');
const versionium     = require('./versionium');
const agentDispatch  = require('./agents');
const ollamaAgent    = require('./agents/ollama');
const claudeAgent    = require('./agents/claude');

const DATA_DIR  = process.env.NEXUS_DATA_DIR  || path.join(__dirname, 'data');
const STORE_DIR = process.env.NEXUS_STORE_DIR || path.join(__dirname, 'store');
const PORT      = parseInt(process.env.NEXUS_PORT || '3748');
const VERSION   = '2.0.0';

let jaaDB, fileStore, fileRefs, adminServer;

async function bootAsync() {
  const { BootSequence } = require('../lib/boot-sequence');

  const seq = new BootSequence({
    systemId: 'cortex', port: PORT, version: VERSION,
    label: 'Nexus Cortex', maxRetries: 1,
  });

  // ── Phase 0 SOFT: orchestrator registration ──────────────────────────────
  seq.phase({ name:'orchestrator.register', type:'SOFT',
    label:'Register with orchestrator (§AXIOM)',
    fn: async () => {
      const r = await nc.registerWithOrchestrator('cortex', PORT,
        { role:'source-of-truth', version:VERSION });
      if (r.ok) nc.startHeartbeat('cortex', PORT);
    },
  });

  // ── Phase 1 HARD: storage init ───────────────────────────────────────────
  seq.phase({ name:'storage.init', type:'HARD',
    label:'JAA database open + FileStore init (§2.1)',
    fn: async () => {
      // CRITICAL: open the SHARED singleton at cortex/data — not a private
      // instance. Every module (versionium, admin-server, healer, memory)
      // imports the singleton; a private `new JaaDB()` here creates a second,
      // never-persisted database and all API writes evaporate on restart.
      jaaDB     = require('./memory/jaa-db').jaaDB;
      fileStore = new FileStore({ dir: STORE_DIR });
      fileRefs  = new FileRefs({ store: fileStore,
        dir: path.join(STORE_DIR, 'refs') });
      await jaaDB.open(DATA_DIR);

      // ── CFR-Ω Ledger — cortex kernel ─────────────────────────────────────
      // Every event through cortex bus gets sigma + delta + CFR snapshot.
      // /cfr/* HTTP routes served directly from this ledger instance.
      global._cortexCFRLedger = createCFRLedger({
        ledgerDir: DATA_DIR,
        systemId:  'cortex',
        onGap: (gap) => {
          // Write CFR-triggered gaps into JAA
          try {
            jaaDB.insert('gaps', {
              uuid:      uid(),
              type:      gap.type,
              body:      gap.message,
              severity:  gap.severity > 0.8 ? 'high' : 'medium',
              status:    'open',
              source:    'cfr-ledger',
              causedBy:  gap.entry?.uuid || null,
              createdAt: Date.now(),
              ts:        Date.now(),
            });
          } catch(_) {}
        },
      });
      global._cortexCFRLedger.open();
      global._cortexCFRLedger.startAutoSave(60000);

      jaaDB.insert('event_log', {
        uuid: uid(), type: 'cortex.storage.opened', ts: Date.now(),
        payload: { dataDir: DATA_DIR,
          tables: Object.keys(jaaDB._tables || {}).length },
        source: 'boot', causedBy: null,
      });
      // Record boot event through CFR ledger too
      global._cortexCFRLedger.record('cortex.storage.opened', {
        dataDir: DATA_DIR, tables: Object.keys(jaaDB._tables || {}).length,
      }, { source: 'boot' });
    },
  });

  // ── Phase 2 HARD: cobalt core ────────────────────────────────────────────
  seq.phase({ name:'core.init', type:'HARD',
    label:'Cobalt core open + project connect',
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

  // ── Phase 3 HARD: module dependencies ───────────────────────────────────
  seq.phase({ name:'deps.init', type:'HARD',
    label:'Wire Versionium + AgentDispatch deps',
    fn: async () => {
      versionium.setDeps({ fileStore, fileRefs });
      agentDispatch.setDeps({
        ollama: ollamaAgent, claude: claudeAgent,
        chatgpt: null, gemini: null,
      });
    },
  });

  // ── Phase 4 HARD: poll registry ──────────────────────────────────────────
  seq.phase({ name:'poll.start', type:'HARD',
    label:'Start all module poll loops',
    fn: async () => { pollRegistry.start(); },
  });

  // ── Phase 5 HARD: admin server ───────────────────────────────────────────
  seq.phase({ name:'server.start', type:'HARD',
    label:'HTTP admin server on :' + PORT,
    fn: async () => {
      adminServer = new AdminServer({ port: PORT, deps: { fileStore, fileRefs } });
      await adminServer.start();
    },
  });

  // ── Phase 5.5 SOFT: boot snapshot + agent-tools init ───────────────────────
  seq.phase({ name:'snapshot.boot', type:'SOFT',
    label:'Take boot snapshot (§2.1 persistence baseline)',
    fn: async () => {
      try {
        const snapshotMod = require('./snapshot');
        snapshotMod.bootSnapshot();
      } catch(_) {}
      // Register agent-tools manifest in event_log so agents can discover tools
      try {
        const agentTools = require('./agent-tools');
        jaaDB.insert('event_log', {
          uuid: uid(), type: 'agent-tools.ready',
          payload: { tools: agentTools.manifest().map(t => t.name), count: agentTools.manifest().length },
          source: 'boot', causedBy: null, ts: Date.now(),
        });
      } catch(_) {}
    },
  });

  // ── Phase 6 SOFT: boot record ────────────────────────────────────────────
  seq.phase({ name:'boot.record', type:'SOFT',
    label:'Write boot record to event_log (§M1)',
    fn: async () => {
      jaaDB.insert('event_log', {
        uuid: uid(), type: 'system.booted', ts: Date.now(),
        payload: { version: VERSION,
          modules: pollRegistry.modules.map(m => m.id), port: PORT },
        source: 'boot', causedBy: null,
      });
      // seed project registry with known systems
try {
  const systems = ['cortex','guardian','idearium','emerge'];
  for (const s of systems) {
    jaaDB.insert('project_registry', {
      uuid: require('crypto').randomUUID(), name: s, system: s,
      ts: Date.now(), source: 'boot',
    });
  }
} catch(_) {}
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
