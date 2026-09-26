'use strict';
/**
 * intelligence/server.js — NEXUS Intelligence Service v1.0.0
 * UUID: nexus-intelligence-server-v1-0000-2026-0822-jamesbrooks-001
 * Port: 3753
 *
 * The intelligence system is NEXUS's cognition + system-health layer,
 * extracted from cortex/lib/meta across 4 real phases this session (see
 * intelligence/spec/intelligence.spec for the full record). This is the
 * first time it runs as its own real, standalone process — every real
 * function it exposes already existed and was already tested; this file
 * is the wiring, not new logic.
 *
 * Routes (matches intelligence/registry-components.js exactly):
 *   GET  /health                        — liveness
 *   GET  /api/intelligence/patterns     — crystallised behavioral patterns
 *   GET  /api/intelligence/context      — assembled intelligence context
 *   GET  /api/intelligence/status       — intelligence subsystem health
 *   GET  /api/intelligence/failures     — failure mode index
 *   GET  /api/intelligence/reuse        — reuse index
 *   GET  /api/intelligence/map          — real, live loom map
 *   POST /api/adversarial               — inner-critic reconciliation
 *   GET  /cfr/field                     — CFR field state
 *   GET  /cfr/health                    — CFR ledger health
 *   GET  /cfr/events                    — CFR event ledger tail
 *   GET  /cfr/sse                       — CFR real-time stream (ledger's own, built-in)
 *   POST /api/framework/create          — generate a real WARP framework skeleton
 *   GET  /sse                           — general intelligence event stream
 */
const http = require('http');
const path = require('path');
const fs = require('fs');
const url = require('url');

const config = require('./config.js');
const PORT = config.PORT;
const DATA_DIR = config.DATA_DIR;

const intelligence = require('./index.js');
const { createCFRLedger } = require('./cfr');
const frameworkBuilder = require('./framework-builder.js');

// §BUILT 2026-09-19 — the intelligence-domain routes cortex used to host
// (intuition/mastermind/adversarial/rca/query/lattice/liminal-space/context).
// Sovereign: the field comes from the orchestrator (the authority), never
// via cortex. See routes.js and field-provider.js headers.
const { createFieldProvider } = require('./field-provider.js');
const { createRoutes } = require('./routes.js');
const fieldProvider = createFieldProvider({ url: config.ORCHESTRATOR_URL, intervalMs: config.FIELD_POLL_MS });
const liminal = require('./liminal-space');
const nexusBus = require('../nexus/nexus-bus');
const { registerSelfRemote } = require('../lib/self-register-remote.js');

// §BUILT 2026-09-19 — RAID: intelligence announces itself to RAID as a client
// (RAID's router + capability registry live in cortex), exactly as guardian does
// (RAID-FIX 2026-09-16). Idempotent (CR-002) and persisted, so re-announcing is
// harmless and heals a wiped registry. Retries while cortex is not up yet.
const raid = { ok: false, registered: 0, failed: 0, error: 'not attempted yet', at: null, attempts: 0 };
let _raidTimer = null;
async function announceToRaid() {
  raid.attempts++;
  let r;
  try { r = await registerSelfRemote('intelligence', intelligence.CAPABILITIES, { registeredBy: 'intelligence/server.js', version: '1.0.0' }); }
  catch (e) { r = { ok: false, error: e.message, registered: 0, failed: 0 }; }
  raid.ok = !!r.ok; raid.registered = r.registered || 0; raid.failed = r.failed || 0; raid.error = r.ok ? null : (r.error || 'registration failed'); raid.at = Date.now();
  if (r.ok) console.log(`[intelligence] registered ${raid.registered} capabilit${raid.registered === 1 ? 'y' : 'ies'} with RAID`);
  else console.warn(`[intelligence] RAID registration incomplete (attempt ${raid.attempts}): ${raid.error} — will retry`);
  _raidTimer = setTimeout(announceToRaid, r.ok ? config.RAID_REANNOUNCE_MS : Math.min(config.RAID_RETRY_BASE_MS * raid.attempts, config.RAID_RETRY_BASE_MS * 4));
  if (_raidTimer.unref) _raidTimer.unref();
}

const routes = createRoutes({
  jaaDB: require('../cortex/memory/jaa-db.js').jaaDB,
  getField: () => fieldProvider.get(),
  intelligence,
  refreshMs: config.DB_REFRESH_MS,
});

const { Stream, Event } = require('../warp/core');

// ── Real event ledger — reused directly, not rebuilt (§8.6). onGap is a
// real, already-existing extension point (confirmed by reading ledger.js
// directly — fires for real sigma spikes and delta-tension conditions);
// relayed into systemStream so the SSE genuinely reflects real CFR
// activity, not just framework creation. ───────────────────────────────────
const ledger = createCFRLedger({
  ledgerDir: DATA_DIR, systemId: 'intelligence', maxHistory: config.MAX_LEDGER_HISTORY,
  onGap: (gap) => systemStream.emit(new Event('intelligence.cfr.gap', gap)),
});

// Real pattern-crystallisation events, relayed from the shared nexus-bus
// (intelligence/index.js's own real bus.emit — confirmed the only one
// that exists) into the system stream, same reasoning as onGap above.
try {
  require('../nexus/nexus-bus').on('cortex.intelligence.pattern_crystallised', (data) => {
    systemStream.emit(new Event('intelligence.pattern.crystallised', data));
  });
} catch (e) { console.warn(`[intelligence] pattern-crystallisation relay unavailable: ${e.message}`); }

// ── Real, general system-event stream — James: "ring buffer." WARP's own
// Stream already has one (tail()/since()), plus real SSE subscription —
// reused whole, not hand-rolled. Every real system-level event (framework
// created, etc.) emits here, so a late-connecting SSE client gets real
// recent history via tail(), not just whatever happens after it connects.
const systemStream = new Stream({ ringCap: config.RING_CAP });

function readBody(req) {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', c => (body += c));
    req.on('end', () => { try { resolve(JSON.parse(body || '{}')); } catch (_) { resolve({}); } });
  });
}

function json(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
  res.end(JSON.stringify(data));
}

const server = http.createServer(async (req, res) => {
  const u = url.parse(req.url, true);
  const pathname = u.pathname;

  if (pathname === '/api/commands/history') {
    const rows = require('../cortex/memory/jaa-db.js').jaaDB.query('event_log', r => r.type === 'intelligence.command.invoked', 200);
    json(res, 200, { ok: true, history: rows.sort((a, b) => b.ts - a.ts), total: rows.length });
    return;
  }

  // §0.39.265 — the orchestrator's contract poller asks every sovereign system
  // for GET /contract; intelligence had none, so each boot logged
  // "contract.unreachable — intelligence (HTTP 404)". Same shape as eravos.
  if (pathname === '/contract') { json(res, 200, require('./registry-components.js')); return; }
  if (pathname === '/api/commands') { json(res, 200, { ok: true, commands: require('./registry-components.js') }); return; }

  // §WIRED 2026-08-22 — James named this gap directly: the static
  // registry is WHAT'S possible, not a real, queryable history of what
  // actually happened. Logging every real request into the same real
  // event_log every other real event this session already uses — a
  // genuine command index, not just documentation.
  try {
    require('../cortex/memory/jaa-db.js').jaaDB.insert('event_log', {
      type: 'intelligence.command.invoked', method: req.method, path: pathname, ts: Date.now(),
    });
  } catch (_) { /* logging failure never blocks the real request */ }

  if (pathname === '/api/intelligence/topo-kernel/stats') {
    try {
      const { TopoKernel } = require('./topo-kernel/index.js');
      if (!global._topoKernel) global._topoKernel = new TopoKernel();
      json(res, 200, { ok: true, ...global._topoKernel.stats() });
    } catch (e) { json(res, 500, { ok: false, error: e.message }); }
    return;
  }

  if (pathname === '/api/intelligence/telemetry/status') {
    try {
      const tc = require('./telemetry-codec/index.js');
      json(res, 200, { ok: true, moduleId: tc.MODULE_ID, version: tc.VERSION });
    } catch (e) { json(res, 500, { ok: false, error: e.message }); }
    return;
  }

  if (pathname === '/health') { const f = fieldProvider.get(); json(res, 200, { ok: true, system: 'intelligence', port: PORT, field: { source: f.source, stale: f.stale, regime: f.regime }, raid: { registered: raid.ok, capabilities: raid.registered, error: raid.error, lastAttemptAt: raid.at }, ts: Date.now() }); return; }

  if (pathname === '/sse') {
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive', 'Access-Control-Allow-Origin': '*' });
    // Real ring-buffer history first, so a late-connecting client isn't
    // starting blind — genuinely different from a bare 'connected' ping.
    for (const stamped of systemStream.tail(50)) res.write(`data: ${JSON.stringify(stamped)}\n\n`);
    const unsubscribe = systemStream.subscribeSSE(res);
    req.on('close', unsubscribe);
    return;
  }

  // Real CFR routes, including its own built-in /cfr/sse — reused whole.
  if (pathname.startsWith('/cfr')) {
    if (ledger.handleCFRRoute(req, res, u)) return;
  }

  if (pathname === '/api/framework/create' && req.method === 'POST') {
    const body = await readBody(req);
    if (!body.name) { json(res, 400, { ok: false, error: 'name required' }); return; }
    try {
      const result = frameworkBuilder.drop(body.name, { agent: body.agent, description: body.description, tags: body.tags });
      systemStream.emit(new Event('intelligence.framework.created', result));
      json(res, 200, result);
    } catch (e) { json(res, 500, { ok: false, error: e.message }); }
    return;
  }

  if (pathname === '/api/adversarial' && req.method === 'POST') {
    const body = await readBody(req);
    try { json(res, 200, { ok: true, ...require('./adversarial.js').compare(body) }); }
    catch (e) { json(res, 500, { ok: false, error: e.message }); }
    return;
  }

  // §BUILT 2026-09-19 — owned faculty routes. Checked BEFORE handleRequest()
  // so the extended /context (legacy fields, additive) takes precedence.
  if (routes.owns(req.method, pathname)) {
    const rbody = (req.method === 'POST' || req.method === 'PUT') ? await readBody(req) : null;
    try {
      await routes.handle(req.method, pathname, new URLSearchParams(u.query || {}), rbody, (status, data) => json(res, status, data));
    } catch (e) { json(res, 500, { ok: false, error: e.message }); }
    return;
  }

  // The rest of the real routes already exist as intelligence/index.js's
  // own handleRequest() — reused directly, not reimplemented.
  const body = (req.method === 'POST') ? await readBody(req) : null;
  const handled = intelligence.handleRequest(
    req.method, pathname, u.query ? new URLSearchParams(u.query) : null, body,
    (status, data) => json(res, status, data)
  );
  if (handled) return;

  json(res, 404, { ok: false, error: `no route for ${req.method} ${pathname}` });
});

function start() {
  ledger.open();
  intelligence.init({});
  fieldProvider.start();
  liminal.init({ bus: nexusBus });
  announceToRaid();
  routes.startLatticeFeed();
  server.listen(PORT, () => {
    console.log(`[intelligence] :${PORT} — v1.0.0 — cognition + system-health layer online`);
    // §BUILT — real heartbeat/pulse, matching every other sovereign system's
    // established pattern exactly (see versionium/server.js, loom/server.js,
    // ollama/server.js, copilot/server.js for the same call). Before this,
    // intelligence was the one system orchestrator had to actively poll for
    // liveness (HEALTH_PATHS['intelligence']); every sibling system instead
    // announces itself and pulses every 10s via orchestrator/lib/pulse.js's
    // real createPulse (latency ring, p95, honest online/offline transitions
    // on missed beats) — polling never told orchestrator it was there between
    // ticks, and never noticed a hang faster than the next poll interval.
    try {
      const { startHeartbeat } = require('../nexus/nexus-connect');
      startHeartbeat('intelligence', PORT);
    } catch (e) {
      console.warn(`[intelligence] pulse/heartbeat failed to start (non-fatal, falls back to orchestrator polling): ${e.message}`);
    }
  });
  return server;
}

function stop() {
  try { fieldProvider.stop(); } catch (_) {}
  try { liminal.stop(); } catch (_) {}
  if (_raidTimer) { clearTimeout(_raidTimer); _raidTimer = null; }
  try { routes.stopLatticeFeed(); } catch (_) {}
  try { ledger.close && ledger.close(); } catch (_) {}
  try { intelligence.stop && intelligence.stop(); } catch (_) {}
  server.close();
}

if (require.main === module) start();

module.exports = { start, stop, server, systemStream, MODULE_ID: 'intelligence.server', VERSION: '1.0.0' };
