'use strict';
/**
 * bridge/server.js — Bridge HTTP Server
 * UUID: nexus-bridge-server-v1-0000-4000-0000-000000000001
 *
 * Thin HTTP layer. Validates → delegates → responds.
 * No business logic. Every route delegates to identity/router/ledger/registry.
 *
 * Routes:
 *   POST /bridge/handshake          — system boot identity handshake
 *   POST /bridge/request            — submit a new cross-system request
 *   POST /bridge/event              — fire-and-forget event (nc.postBridge)
 *   POST /bridge/deliver/ack        — target acknowledges delivery
 *   GET  /bridge/requests           — query request ledger
 *   GET  /bridge/requests/:uuid     — single request
 *   GET  /bridge/registry           — live system health map
 *   GET  /bridge/circuits           — circuit breaker states
 *   GET  /bridge/sse                — SSE stream of bridge events
 *   POST /bridge/revoke             — revoke a token
 *   GET  /health                    — bridge health
 *
 * §1.2  Every bad input returns specific error, never generic 500.
 * §5.1  Every response includes the request UUID.
 */

const http           = require('http');
const { randomUUID } = require('crypto');
const { validateRequest, createRequest, STATUS } = require('./types');
const { routeCausal } = require('./causal/server');

const BRIDGE_PORT = parseInt(process.env.BRIDGE_PORT || '9999');
const BRIDGE_HOST = process.env.BRIDGE_HOST || '127.0.0.1';

// ── SSE client registry ───────────────────────────────────────────────────────
const _sseClients = new Set();

// CFR field ledger ref — set by createBridgeServer, feeds bridge activity
// into the CFR field so /cfr/* reflects real traffic.
let _cfrLedger = null;

function _pushSSE(type, data) {
  const msg = `data: ${JSON.stringify({ type, data, ts: Date.now() })}\n\n`;
  for (const res of _sseClients) {
    try { res.write(msg); }
    catch(_) { _sseClients.delete(res); }
  }
  if (_cfrLedger) {
    try { _cfrLedger.record(`ncp.${type.replace(/^bridge\./,'')}`, data); }
    catch(_) {}
  }
}

// ── Body reader ───────────────────────────────────────────────────────────────
function _readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end', () => {
      try { resolve(JSON.parse(Buffer.concat(chunks).toString() || '{}')); }
      catch(e) { reject(new Error('invalid JSON')); }
    });
    req.on('error', reject);
  });
}

// ── Response helpers ──────────────────────────────────────────────────────────
function _json(res, code, data) {
  if (res.headersSent) return;
  res.writeHead(code, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
  res.end(JSON.stringify(data));
}

function _cors(res) {
  res.writeHead(204, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET,POST,OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type,X-Bridge-Token,Authorization' });
  res.end();
}

// ── Route handlers ────────────────────────────────────────────────────────────

async function handleHandshake(req, res, { identity, registry }) {
  const body = await _readBody(req);
  const { systemId, secret, port } = body;
  if (!systemId) return _json(res, 400, { ok: false, error: 'systemId required' });

  try {
    const result = await identity.handshake(systemId, secret, port);
    // Register/update in registry with live port
    if (port) await registry.register(systemId, port, { source: 'handshake' });
    _pushSSE('bridge.system.handshake', { systemId, port });
    _json(res, 200, result);
  } catch(e) {
    _json(res, 401, { ok: false, error: e.message });
  }
}

async function handleRequest(req, res, { identity, router, ledger }) {
  // Verify token
  const token = req.headers['x-bridge-token'] || req.headers['authorization']?.replace('Bearer ', '');
  const auth  = await identity.verify(token || '');
  if (!auth.ok) return _json(res, 401, { ok: false, error: `unauthorized: ${auth.reason}` });

  const body = await _readBody(req);
  const errs = validateRequest(body);
  if (errs.length) return _json(res, 400, { ok: false, errors: errs });

  // Create canonical request
  const request = createRequest({
    type:     body.type,
    source:   body.source || auth.systemId,
    target:   body.target,
    payload:  body.payload || {},
    tags:     body.tags || [],
    causedBy: body.causedBy || null,
  });

  // §2.1 — ledger write BEFORE dispatch
  await ledger.write(request);
  _pushSSE('bridge.request.created', { uuid: request.uuid, type: request.type, source: request.source, target: request.target });

  // Dispatch
  const result = await router.dispatch(request);
  _pushSSE('bridge.request.updated', { uuid: request.uuid, status: result.status });

  _json(res, 200, { ok: true, uuid: request.uuid, status: result.status, result });
}

async function handleEvent(req, res, { identity, ledger }) {
  // nc.postBridge fires this — fire-and-forget events become ledger records
  const token = req.headers['x-bridge-token'] || '';
  const auth  = await identity.verify(token);
  // Events are lower trust — allow even if not verified (nc.postBridge has no token yet during boot)

  const body   = await _readBody(req);
  const { type, payload, source, causedBy, uuid: callerUuid } = body;
  if (!type) return _json(res, 400, { ok: false, error: 'type required' });

  // Store as a lightweight event record — not a full request (no routing needed)
  const record = {
    uuid:      callerUuid || randomUUID(),
    bridgeUuid: callerUuid || randomUUID(),
    type:      type,
    source:    source || auth.systemId || 'unknown',
    target:    'bridge',
    payload:   payload || {},
    status:    STATUS.FULFILLED,   // events are self-fulfilling
    attempts:  1,
    tags:      [],
    routeHistory: [],
    causedBy:  causedBy || null,
    createdAt:  Date.now(),
    updatedAt:  Date.now(),
    dispatchedAt: Date.now(),
    heldAt:     null,
    completedAt: Date.now(),
    failedAt:   null,
    error:      null,
  };

  await ledger.write(record);
  _pushSSE('bridge.event', { uuid: record.uuid, type, source: record.source });

  _json(res, 200, { ok: true, uuid: record.uuid });
}

async function handleRequests(req, res, { ledger }) {
  const url    = new URL(req.url, 'http://localhost');
  const filter = {};
  if (url.searchParams.get('status')) filter.status = url.searchParams.get('status');
  if (url.searchParams.get('type'))   filter.type   = url.searchParams.get('type');
  if (url.searchParams.get('source')) filter.source = url.searchParams.get('source');
  if (url.searchParams.get('target')) filter.target = url.searchParams.get('target');
  if (url.searchParams.get('tag'))    filter.tag    = url.searchParams.get('tag');
  const limit = parseInt(url.searchParams.get('limit') || '100');

  const rows = await ledger.query(filter, limit);
  _json(res, 200, { ok: true, requests: rows, total: rows.length });
}

async function handleRequestById(req, res, uuid, { ledger }) {
  const record = ledger.get(uuid);
  if (!record) return _json(res, 404, { ok: false, error: `request not found: ${uuid}` });
  _json(res, 200, { ok: true, request: record });
}

async function handleRegistry(req, res, { registry }) {
  const snap = await registry.snapshot();
  _json(res, 200, { ok: true, registry: snap });
}

async function handleCircuits(req, res, { router }) {
  _json(res, 200, { ok: true, circuits: router.circuitStatus() });
}

async function handleRevoke(req, res, { identity }) {
  const body = await _readBody(req);
  if (!body.token) return _json(res, 400, { ok: false, error: 'token required' });
  const result = await identity.revoke(body.token);
  _json(res, 200, result);
}

function handleSSE(req, res) {
  res.writeHead(200, {
    'Content-Type':                'text/event-stream',
    'Cache-Control':               'no-cache',
    'Connection':                  'keep-alive',
    'Access-Control-Allow-Origin': '*',
    'X-Accel-Buffering':           'no',
  });
  res.flushHeaders?.();
  res.write(`data: ${JSON.stringify({ type: 'bridge.sse.ready', ts: Date.now() })}\n\n`);
  _sseClients.add(res);
  req.on('close', () => _sseClients.delete(res));

  // SSE keepalive
  const ping = setInterval(() => {
    try { res.write(': ping\n\n'); }
    catch(_) { clearInterval(ping); _sseClients.delete(res); }
  }, 15_000);
  req.on('close', () => clearInterval(ping));
}

function handleHealth(req, res, { ledger, registry, router }) {
  const stats = ledger.stats();
  _json(res, 200, {
    ok:              true,
    status:          'online',
    uptime:          process.uptime(),
    sessions:        stats.total,
    pendingRequests: stats.byStatus?.pending || 0,
    requests:        stats,
    circuits:        router.circuitStatus(),
    sse:             _sseClients.size,
    ts:              Date.now(),
  });
}

async function handleStats(req, res, { ledger, registry }) {
  const snap  = await registry.snapshot();
  const stats = ledger.stats();
  _json(res, 200, { ok: true, requests: stats, registry: snap, uptime: process.uptime() });
}

async function handleBroadcast(req, res, { ledger }) {
  const body = await _readBody(req);
  const { type, payload } = body;
  if (!type) return _json(res, 400, { ok: false, error: 'type required' });
  _pushSSE(type, payload || {});
  // Record as a lightweight event
  const record = {
    uuid: randomUUID(), bridgeUuid: null,
    type, source: 'broadcast', target: 'all',
    payload: payload || {}, status: 'fulfilled',
    attempts: 1, tags: [], routeHistory: [],
    causedBy: null, createdAt: Date.now(), updatedAt: Date.now(),
    dispatchedAt: Date.now(), heldAt: null, completedAt: Date.now(),
    failedAt: null, error: null,
  };
  await ledger.write(record);
  _json(res, 200, { ok: true, uuid: record.uuid, clients: _sseClients.size });
}

async function handleTags(req, res, { ledger }) {
  const body = await _readBody(req);
  const { entityId, entityType, tags, system, addedBy } = body;
  if (!entityId || !Array.isArray(tags))
    return _json(res, 400, { ok: false, error: 'entityId and tags[] required' });

  // Find the request and patch its tags
  const existing = ledger.get(entityId);
  if (existing) {
    const merged = [...new Set([...(existing.tags || []), ...tags])];
    await ledger.update(entityId, { tags: merged });
    _pushSSE('bridge.tags.updated', { entityId, tags: merged });
    _json(res, 200, { ok: true, entityId, tags: merged });
  } else {
    // Entity not a request — store as event for Cortex to project
    _pushSSE('bridge.tags.written', { entityId, entityType, tags, system, addedBy });
    _json(res, 200, { ok: true, entityId, tags });
  }
}

function handleContract(req, res) {
  const { TYPES, STATUS } = require('./types');
  _json(res, 200, {
    id:      'bridge-v1',
    version: '1.0.0',
    port:    BRIDGE_PORT,
    role:    'trust-aware request relay with persistence and degradation management',
    valid_request_types: [...TYPES],
    valid_statuses:      Object.values(STATUS),
    routes: [
      { method: 'POST', path: '/bridge/handshake' },
      { method: 'POST', path: '/bridge/request' },
      { method: 'POST', path: '/bridge/event' },
      { method: 'POST', path: '/bridge/broadcast' },
      { method: 'POST', path: '/bridge/tags' },
      { method: 'POST', path: '/bridge/revoke' },
      { method: 'GET',  path: '/bridge/requests' },
      { method: 'GET',  path: '/bridge/requests/:uuid' },
      { method: 'GET',  path: '/bridge/registry' },
      { method: 'GET',  path: '/bridge/circuits' },
      { method: 'GET',  path: '/bridge/stats' },
      { method: 'GET',  path: '/bridge/contract' },
      { method: 'GET',  path: '/bridge/sse' },
      { method: 'GET',  path: '/bridge/subscribe' },
      { method: 'GET',  path: '/health' },
    ],
    siso: {
      emits: [
        'bridge.system.handshake', 'bridge.request.created', 'bridge.request.updated',
        'bridge.event', 'bridge.tags.updated', 'bridge.tags.written',
        'bridge.booted', 'bridge.sse.ready',
      ],
    },
  });
}

// ── createBridgeServer ────────────────────────────────────────────────────────

function createBridgeServer({ identity, registry, router, ledger, cfrLedger }) {
  const deps = { identity, registry, router, ledger };
  _cfrLedger = cfrLedger || null;

  const server = http.createServer(async (req, res) => {
    const url      = new URL(req.url, 'http://localhost');
    const pathname = url.pathname;
    const method   = req.method;

    if (method === 'OPTIONS') return _cors(res);

    try {
      // ── Routes ──────────────────────────────────────────────────────────
      if (pathname === '/health' && method === 'GET')
        return handleHealth(req, res, deps);

      if (pathname === '/bridge/handshake' && method === 'POST')
        return handleHandshake(req, res, deps);

      if (pathname === '/bridge/request' && method === 'POST')
        return handleRequest(req, res, deps);

      if (pathname === '/bridge/event' && method === 'POST')
        return handleEvent(req, res, deps);

      if (pathname === '/bridge/requests' && method === 'GET')
        return handleRequests(req, res, deps);

      if (/^\/bridge\/requests\/[^/]+$/.test(pathname) && method === 'GET') {
        const uuid = pathname.split('/').pop();
        return handleRequestById(req, res, uuid, deps);
      }

      if (pathname === '/bridge/registry' && method === 'GET')
        return handleRegistry(req, res, deps);

      if (pathname === '/bridge/circuits' && method === 'GET')
        return handleCircuits(req, res, deps);

      if (pathname === '/bridge/revoke' && method === 'POST')
        return handleRevoke(req, res, deps);

      if (pathname === '/bridge/stats' && method === 'GET')
        return handleStats(req, res, deps);

      if (pathname === '/bridge/broadcast' && method === 'POST')
        return handleBroadcast(req, res, deps);

      if (pathname === '/bridge/tags' && method === 'POST')
        return handleTags(req, res, deps);

      if (pathname === '/bridge/contract' && method === 'GET')
        return handleContract(req, res);

      // /bridge/subscribe is an alias for /bridge/sse (integration test compat)
      if ((pathname === '/bridge/sse' || pathname === '/bridge/subscribe') && method === 'GET')
        return handleSSE(req, res);

      // CFR-Ω field routes — /cfr/health, /cfr/state, /cfr/field, /cfr/nodes, etc.
      if (cfrLedger && pathname.startsWith('/cfr')) {
        if (cfrLedger.handleCFRRoute(req, res, url)) return;
      }

      // Causal spine routes (item 1.5)
      if (await routeCausal(method, pathname, url, req, res)) return;

      _json(res, 404, { ok: false, error: `no route: ${method} ${pathname}` });

    } catch(e) {
      console.error(`[bridge/server §1.2] ${method} ${pathname}:`, e.message);
      _json(res, 500, { ok: false, error: e.message });
    }
  });

  function start() {
    return new Promise((resolve, reject) => {
      server.listen(BRIDGE_PORT, BRIDGE_HOST, () => {
        console.log(`\x1b[32m[bridge] listening on ${BRIDGE_HOST}:${BRIDGE_PORT}\x1b[0m`);
        resolve();
      });
      server.on('error', reject);
    });
  }

  function stop() {
    return new Promise(resolve => server.close(resolve));
  }

  return { start, stop, pushSSE: _pushSSE };
}

module.exports = { createBridgeServer, BRIDGE_PORT };
