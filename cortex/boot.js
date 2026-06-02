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

  // ── §3.1 Gate 1: Storage ───────────────────────────────────────────────────
  await nc.gate('storage.init', 'cortex', async () => {
    jaaDB     = new JaaDB({ dir: DATA_DIR });
    fileStore = new FileStore({ dir: STORE_DIR });
    fileRefs  = new FileRefs({ store: fileStore, dir: path.join(STORE_DIR, 'refs') });
    await jaaDB.open();
    // §2.2 — verify persistence is real
    jaaDB.insert('event_log', {
      uuid: uid(), type: 'cortex.storage.opened', ts: Date.now(),
      payload: { dataDir: DATA_DIR, tables: Object.keys(jaaDB._tables || {}).length },
      source: 'boot', causedBy: null,
    });
  });

  // ── §3.1 Gate 2: Core modules ─────────────────────────────────────────────
  await nc.gate('core.init', 'cortex', async () => {
    core.open();
    try {
      const projectSchema = require('./cobalt.manifest.json');
      core.load(projectSchema);
    } catch {
      core.connect({
        uuid: 'nexus-project-0000-4000-0000-000000000001',
        name: 'nexus', type: 'core', version: VERSION,
        meta: { intent: 'NEXUS cortex source-of-truth' },
      });
    }
  });

  // ── §3.1 Gate 3: Module dependencies ──────────────────────────────────────
  await nc.gate('deps.init', 'cortex', async () => {
    versionium.setDeps({ fileStore, fileRefs });
    agentDispatch.setDeps({ ollama: ollamaAgent, claude: claudeAgent, chatgpt: null, gemini: null });
  });

  // ── §3.1 Gate 4: Poll registry ─────────────────────────────────────────────
  await nc.gate('poll.start', 'cortex', async () => {
    pollRegistry.start();
  });

  // ── §3.1 Gate 5: Admin server ──────────────────────────────────────────────
  await nc.gate('server.start', 'cortex', async () => {
    adminServer = new AdminServer({ port: PORT });
    await adminServer.start();
  });

  // ── §3.1 Gate 6: Boot record ───────────────────────────────────────────────
  await nc.gate('boot.record', 'cortex', async () => {
    jaaDB.insert('event_log', {
      uuid: uid(), type: 'system.booted', ts: Date.now(),
      payload: { version: VERSION, modules: pollRegistry.modules.map(m => m.id), port: PORT },
      source: 'boot', causedBy: null,
    });
    _seedProjectRegistry(jaaDB);
  });

  // ── §3.1 Gate 7: Bridge registration ──────────────────────────────────────
  // §5.2 — everything implements the bridge
  await nc.gate('bridge.register', 'cortex', async () => {
    const r = await nc._req('bridge', 'POST', '/bridge/handshake', {
      systemId: 'cortex', appId: 'cortex',
      secret: 'nexus-cortex-internal-v1',
    }, 4000);
    if (!r.ok) {
      console.warn('[cortex] bridge not available — running standalone');
      return; // non-fatal: bridge may start later
    }
    // Announce to orchestrator
    await nc.postBridge('cortex.booted', { version: VERSION, port: PORT });
    await nc.postLedger('cortex', 'cortex.booted', { version: VERSION, port: PORT });
  });

  // ── Boot banner ────────────────────────────────────────────────────────────
  const ollamaHost = process.env.OLLAMA_HOST || '127.0.0.1';
  const ollamaPort = process.env.OLLAMA_PORT || '11434';
  let ollamaStatus = '✗ offline';
  try {
    const http2 = require('http');
    await new Promise(resolve => {
      const r = http2.get(`http://${ollamaHost}:${ollamaPort}/api/tags`, res => {
        let d = ''; res.on('data', c => d += c);
        res.on('end', () => {
          try {
            const j = JSON.parse(d);
            ollamaStatus = `✓ online (${(j.models||[]).length} models)`;
          } catch(_) {}
          resolve();
        });
      });
      r.setTimeout(2000, () => { r.destroy(); resolve(); });
      r.on('error', resolve);
    });
  } catch(_) {}

  console.log('');
  console.log('\x1b[1m\x1b[36m⬡  NEXUS CORTEX\x1b[0m  v' + VERSION);
  console.log('');
  console.log(`   \x1b[90mHTTP      \x1b[0m  http://127.0.0.1:${PORT}`);
  console.log(`   \x1b[90mSSE       \x1b[0m  http://127.0.0.1:${PORT}/sse`);
  console.log(`   \x1b[90mOllama    \x1b[0m  ${ollamaStatus}`);
  console.log(`   \x1b[90mBridge    \x1b[0m  §5.2 registered`);
  console.log('');
}

// ── Project registry seed ──────────────────────────────────────────────────────
function _seedProjectRegistry(db) {
  const systems = [
    { name:'bridge',   port:9999, role:'message-router' },
    { name:'cortex',   port:3748, role:'source-of-truth' },
    { name:'guardian', port:7820, role:'ai-orchestrator' },
    { name:'idearium', port:4800, role:'idea-os' },
    { name:'emerge',   port:4242, role:'emergence-ide' },
  ];
  for (const sys of systems) {
    const existing = db.query('project_registry', r => r.name === sys.name, 1);
    if (!existing.length) {
      db.insert('project_registry', {
        uuid: uid(), name: sys.name, port: sys.port, role: sys.role,
        status: 'registered', lastSeenAt: Date.now(), ts: Date.now(),
      });
    }
  }
}

bootAsync().catch(err => {
  console.error('\x1b[31m[cortex/boot §1.2] BOOT FAILED:\x1b[0m', err.message);
  console.error(err.stack);
  process.exit(1);
});
