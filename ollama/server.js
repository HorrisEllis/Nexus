'use strict';
/**
 * ollama/server.js — Sovereign Ollama Bridge
 * UUID: nexus-ollama-server-v1-0000-2026-0627-jamesbrooks-001
 * Port: 3749
 *
 * Ollama is a sovereign system. Not inlined in Guardian. Not blocking Guardian.
 * Guardian goes down → Ollama keeps running.
 * RAID routes directly here by component id, not through Guardian.
 * Every job carries contractId, componentId, hookId, requestId for CFR tracking.
 *
 * This file is a composition root ONLY: it owns the HTTP listener and the
 * route dispatch table. All state lives in lib/state.js, all job logic in
 * lib/dispatch.js, all Ollama-daemon calls in lib/ollama-client.js, and
 * every URL group has its own file in routes/. Route modules are tried in
 * order and the first one whose handle() returns true wins — see
 * routes/stream.js for why order matters within a module, and note that
 * uploads.js is listed before jobs.js/models.js purely for readability,
 * not because any two modules' path prefixes actually collide.
 */

const http = require('http');
const fs   = require('fs');

const config = require('./config.js');
const { state, startChannelSweep } = require('./lib/state.js');
const { checkOllama } = require('./lib/ollama-client.js');
const { pump } = require('./lib/dispatch.js');
const { json } = require('./lib/http-utils.js');

const PORT      = config.PORT;
const ORCH_URL  = config.ORCH_URL;
const SYSTEM_ID = config.SYSTEM_ID;
const VERSION   = config.VERSION;

try { fs.mkdirSync(config.DATA_DIR, { recursive: true }); } catch (_) {}

// Route modules, tried in order. Each exports handle(req,res,ctx) -> boolean.
const routes = [
  require('./routes/system.js'),
  require('./routes/uploads.js'),
  require('./routes/stream.js'),
  require('./routes/jobs.js'),
  require('./routes/queue.js'),
  require('./routes/models.js'),
  require('./routes/tape.js'),     // §0.45.0 CM3 — the Ollama tape: runs and their macros
];

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const ctx = { method: req.method, url, pathname: url.pathname };

  // §PHASE 2 2026-09-03 — docs/command-index-per-system.spec's own real
  // exit criteria for this system. Checked before the routes[] loop
  // (same position system.js's own /health/contract meta-endpoints
  // would occupy if they lived here) because this endpoint needs to
  // read all six route modules including system.js itself — putting it
  // inside one of the six would make that module self-referential for
  // no real benefit.
  if (ctx.method === 'GET' && ctx.pathname === '/commands') {
    json(res, 200, require('./lib/command-index.js').buildCommandIndex());
    return;
  }

  for (const route of routes) {
    try {
      if (await route.handle(req, res, ctx)) return;
    } catch (e) {
      json(res, 500, { ok: false, error: e.message });
      return;
    }
  }

  res.writeHead(404); res.end('Not found');
});

startChannelSweep();

// ── Register with orchestrator ────────────────────────────────────────────
function register() {
  const components = require('./registry-components');
  const body = JSON.stringify({
    systemId: SYSTEM_ID, port: PORT, version: VERSION, status: 'online',
    meta: { label: 'OLLAMA', color: '#00ff88' },
    components: components.components || [],
  });
  const u = new URL(`${ORCH_URL}/api/register`);
  const r = http.request({
    hostname: u.hostname, port: u.port || 9000, path: u.pathname, method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
    timeout: 4000,
  }, () => {
    console.log('[ollama-bridge] registered');
    // Same gap as copilot: registered once, then invisible to
    // nexus-bus._sources. Nerve needs recurring presence data.
    try {
      const { startHeartbeat } = require('../nexus/nexus-connect');
      startHeartbeat(SYSTEM_ID, PORT);
    } catch (_) {}
  });
  r.on('error', () => setTimeout(register, 5000));
  r.write(body); r.end();
}

server.listen(PORT, async () => {
  await checkOllama();
  console.log(`[ollama-bridge] :${PORT} — ollama ${state.ollamaOnline ? 'online' : 'offline'} at ${config.OLLAMA_HOST}`);
  setTimeout(register, 1000);
  pump();
});

setInterval(async () => {
  const { broadcast } = require('./lib/state.js');
  const was = state.ollamaOnline;
  await checkOllama();
  if (was !== state.ollamaOnline) broadcast(state.ollamaOnline ? 'ollama.health.ok' : 'ollama.health.degraded', {});
}, 10000);

module.exports = { server };
