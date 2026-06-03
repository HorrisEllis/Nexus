'use strict';
// ── cortex/boot.js ────────────────────────────────────────────────────────────
// UUID: cortex-boot-v2-0000-4000-0000-000000000001
// Version: 2.0.0
//
// §3.1  Bottom-up boot: storage → siso → jaa → modules → admin → bridge register
// §1.2  Every failure loud, specific, halts boot
// §2.1  Persistence before everything else
// §5.2  Registers with bridge after boot
// §8.3  SISO and Jaa are load-order prerequisites

'use strict';

const path        = require('path');
const nc          = require('../nexus-connect');
const { JaaDB, uid } = require('./memory/jaa-db');
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
      jaaDB     = new JaaDB({ dir: DATA_DIR });
      fileStore = new FileStore({ dir: STORE_DIR });
      fileRefs  = new FileRefs({ store: fileStore,
        dir: path.join(STORE_DIR, 'refs') });
      await jaaDB.open();
      jaaDB.insert('event_log', {
        uuid: uid(), type: 'cortex.storage.opened', ts: Date.now(),
        payload: { dataDir: DATA_DIR,
          tables: Object.keys(jaaDB._tables || {}).length },
        source: 'boot', causedBy: null,
      });
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
      adminServer = new AdminServer({ port: PORT });
      await adminServer.start();
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
  const systems = ['bridge','cortex','guardian','idearium','emerge'];
  for (const s of systems) {
    jaaDB.insert('project_registry', {
      uuid: require('crypto').randomUUID(), name: s, system: s,
      ts: Date.now(), source: 'boot',
    });
  }
} catch(_) {}
    },
  });

  // ── Phase 7 SOFT: bridge registration ───────────────────────────────────
  seq.phase({ name:'bridge.register', type:'SOFT',
    label:'Bridge handshake + bus announce (§5.2)',
    fn: async () => {
      const r = await nc._req('bridge', 'POST', '/bridge/handshake', {
        systemId: 'cortex', appId: 'cortex',
        secret: 'nexus-cortex-internal-v1',
      }, 4000);
      if (!r.ok) throw new Error('bridge unavailable');
      await nc.postLedger('cortex', 'cortex.booted', { version:VERSION, port:PORT });
      await nc.postBridge('cortex.booted', { version:VERSION, port:PORT });
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
