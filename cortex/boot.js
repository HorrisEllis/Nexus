'use strict';
// ── boot.js ───────────────────────────────────────────────────────────────────
// NEXUS v5.0 — memory-first boot sequence.
//
// Order (§3.1 bottom-up):
//   1. storage — jaaDB.open(), FileStore, FileRefs
//   2. cobalt core — open(), register nexus project node
//   3. setDeps — inject shared infrastructure into modules that need it
//   4. pollRegistry.start() — start all polling modules
//   5. admin server — last, so SSE clients see a fully booted system
//   6. write system.booted to JAA
//
// §1.2: All failures are loud, specific, and halt boot.
// §2.1: Persistence before everything.

'use strict';

const path         = require('path');
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

let jaaDB, fileStore, fileRefs, adminServer;

async function bootAsync() {
  // boot banner handled at end

  // ── 1. Storage ─────────────────────────────────────────────────────────────
  jaaDB     = new JaaDB({ dir: DATA_DIR });
  fileStore = new FileStore({ dir: STORE_DIR });
  fileRefs  = new FileRefs({ store: fileStore, dir: path.join(STORE_DIR, 'refs') });

  await jaaDB.open();

  // Share jaaDB singleton with all modules
  // (they already require('../memory/jaa-db').jaaDB — same singleton)

  // ── 2. Cobalt core ─────────────────────────────────────────────────────────
  core.open();

  // Load nexus project schema onto cobalt
  try {
    const projectSchema = require('./cobalt.manifest.json');
    core.load(projectSchema);
    } catch {
    // Schema file optional — register minimal node
    core.connect({
      uuid:    'nexus-project-0000-4000-0000-000000000001',
      name:    'nexus',
      type:    'core',
      version: '5.0.0',
      meta:    { intent: 'NEXUS v5.0 memory-first orchestration' },
    });
    }

  // ── 3. setDeps ─────────────────────────────────────────────────────────────
  versionium.setDeps({ fileStore, fileRefs });

  agentDispatch.setDeps({
    ollama:  ollamaAgent,
    claude:  claudeAgent,
    chatgpt: null,
    gemini:  null,
  });


  // ── 4. Poll registry ───────────────────────────────────────────────────────
  pollRegistry.start();

  // ── 5. Admin server ────────────────────────────────────────────────────────
  adminServer = new AdminServer({ port: PORT });
  await adminServer.start();

  // ── 6. Boot record ─────────────────────────────────────────────────────────
  jaaDB.insert('event_log', {
    uuid:    uid(),
    type:    'system.booted',
    ts:      Date.now(),
    payload: {
      version: '5.0.0',
      modules: pollRegistry.modules.map(m => m.id),
      port:    PORT,
    },
    source:   'boot',
    causedBy: null,
  });

  // Seed project registry
  _seedProjectRegistry(jaaDB);

  const ollamaHost = process.env.OLLAMA_HOST || '127.0.0.1';
  const ollamaPort = process.env.OLLAMA_PORT || '11434';
  // Check ollama
  let ollamaStatus = '✗ offline';
  let ollamaModels = '';
  try {
    const http2 = require('http');
    await new Promise(resolve => {
      const r = http2.get(`http://${ollamaHost}:${ollamaPort}/api/tags`, res => {
        let d = ''; res.on('data', c => d += c);
        res.on('end', () => {
          try {
            const j = JSON.parse(d);
            const models = (j.models||[]).map(m => m.name).join(', ');
            ollamaStatus = '✓ online';
            ollamaModels = models ? `  models: ${models}` : '';
          } catch(_) {}
          resolve();
        });
      });
      r.setTimeout(2000, () => { r.destroy(); resolve(); });
      r.on('error', resolve);
    });
  } catch(_) {}

  console.log('');
  console.log('\x1b[1m\x1b[36m⬡  NEXUS CORTEX\x1b[0m  v5.0');
  console.log('');
  console.log(`   \x1b[90mHTTP API  \x1b[0m  http://127.0.0.1:${PORT}`);
  console.log(`   \x1b[90mHealth    \x1b[0m  http://127.0.0.1:${PORT}/health`);
  console.log(`   \x1b[90mSSE       \x1b[0m  http://127.0.0.1:${PORT}/sse`);
  console.log(`   \x1b[90mMemory UI \x1b[0m  http://127.0.0.1:${PORT}/cortex`);
  console.log(`   \x1b[90mData      \x1b[0m  ${DATA_DIR}`);
  console.log('');
  console.log(`   \x1b[90mOllama    \x1b[0m  ${ollamaStatus === '✓ online' ? '\x1b[32m' : '\x1b[31m'}${ollamaStatus}\x1b[0m  ${ollamaHost}:${ollamaPort}`);
  if (ollamaModels) console.log(`              ${ollamaModels}`);
  console.log('');
  console.log(`   \x1b[90mCLI       \x1b[0m  nexus cortex status`);
  console.log('');

  // ── Graceful shutdown ───────────────────────────────────────────────────────
  async function shutdown(signal) {
    console.log(`\n[boot] ${signal} — shutting down`);
    pollRegistry.stop();
    await adminServer.stop();
    await jaaDB.close();
    console.log('[boot] clean exit');
    process.exit(0);
  }

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT',  () => shutdown('SIGINT'));
}

function _seedProjectRegistry(db) {
  const now     = Date.now();
  const modules = [
    'bus-log', 'raid', 'agents', 'ollama', 'claude',
    'gap-finder', 'healer', 'agent-memory', 'versionium',
    'orion/sensor', 'orion/record', 'orion/policy', 'orion/verify',
  ];

  for (const name of modules) {
    const existing = db.query('project_registry', r => r.name === name, 1);
    if (existing.length) {
      db.update('project_registry', existing[0].uuid, { lastSeenAt: now, status: 'active' });
    } else {
      db.insert('project_registry', {
        uuid:       'mod-' + name.replace(/\//g, '-'),
        name,
        version:    '5.0.0',
        status:     'active',
        intent:     `Module ${name}`,
        lattice:    { layer: _layer(name) },
        lastSeenAt: now,
        source:     'boot',
      });
    }
  }
}

function _layer(name) {
  if (['bus-log'].includes(name))                     return 'foundation';
  if (['raid', 'agents', 'ollama', 'claude'].includes(name)) return 'core';
  if (['gap-finder', 'healer'].includes(name))        return 'gate';
  if (['agent-memory'].includes(name))                return 'memory';
  if (['versionium'].includes(name))                  return 'versionium';
  if (name.startsWith('orion'))                       return 'orion';
  return 'unknown';
}

bootAsync().catch(err => {
  console.error('\n[boot] FATAL:', err.message);
  console.error(err.stack);
  process.exit(1);
});

module.exports = {
  get jaaDB()       { return jaaDB; },
  get fileStore()   { return fileStore; },
  get fileRefs()    { return fileRefs; },
  get adminServer() { return adminServer; },
};
