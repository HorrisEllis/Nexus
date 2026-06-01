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
  console.log('');
  console.log('╔══════════════════════════════════════════════════╗');
  console.log('║  NEXUS v5.0  ·  memory-first  ·  CORTEX booting ║');
  console.log('╚══════════════════════════════════════════════════╝');
  console.log('');

  // ── 1. Storage ─────────────────────────────────────────────────────────────
  jaaDB     = new JaaDB({ dir: DATA_DIR });
  fileStore = new FileStore({ dir: STORE_DIR });
  fileRefs  = new FileRefs({ store: fileStore, dir: path.join(STORE_DIR, 'refs') });

  await jaaDB.open();
  console.log(`[boot] jaaDB open — ${DATA_DIR}`);

  // Share jaaDB singleton with all modules
  // (they already require('../memory/jaa-db').jaaDB — same singleton)

  // ── 2. Cobalt core ─────────────────────────────────────────────────────────
  core.open();

  // Load nexus project schema onto cobalt
  try {
    const projectSchema = require('./cobalt.manifest.json');
    core.load(projectSchema);
    console.log(`[boot] cobalt core open — project: ${projectSchema.name || 'nexus'}`);
  } catch {
    // Schema file optional — register minimal node
    core.connect({
      uuid:    'nexus-project-0000-4000-0000-000000000001',
      name:    'nexus',
      type:    'core',
      version: '5.0.0',
      meta:    { intent: 'NEXUS v5.0 memory-first orchestration' },
    });
    console.log('[boot] cobalt core open — minimal registration');
  }

  // ── 3. setDeps ─────────────────────────────────────────────────────────────
  versionium.setDeps({ fileStore, fileRefs });

  agentDispatch.setDeps({
    ollama:  ollamaAgent,
    claude:  claudeAgent,
    chatgpt: null,
    gemini:  null,
  });

  console.log('[boot] deps injected');

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

  console.log('');
  console.log(`[boot] ✓ NEXUS v5.0 online`);
  console.log(`[boot]   admin:  http://127.0.0.1:${PORT}/health`);
  console.log(`[boot]   events: http://127.0.0.1:${PORT}/sse`);
  console.log(`[boot]   ollama: ${process.env.OLLAMA_HOST || '127.0.0.1'}:${process.env.OLLAMA_PORT || '11434'}`);
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
