'use strict';
/**
 * bridge/causal/server.js — Causal Spine HTTP Routes
 * UUID: nexus-bridge-causal-server-v1-0000-4000-000000000001
 * Status: pre-release
 *
 * Routes:
 *   POST /bridge/causal/emit                       — services emit causal events here
 *   GET  /bridge/trace/:eventId                    — causal tree from this event
 *   GET  /bridge/trace?source=X&action=Y&since=T   — filtered event history
 *   GET  /bridge/trace/session/:id                 — full session timeline
 *   GET  /bridge/trace/session/:id?mode=forensics  — CompoundEngine over session
 *   GET  /bridge/project/:view                     — current projection (raid|health|economy)
 *   GET  /bridge/project/session/:id               — session projection
 *   GET  /bridge/replay/:eventId                   — ordered causal subtree replay (SSE stream)
 *   GET  /bridge/causal/stats                      — ledger + graph stats
 *
 * §1.2  Every bad input returns specific error.
 * §2.3  All state observable — projections available at any time.
 * §5.5  Zero external runtime dependencies.
 */

'use strict';

const path   = require('path');
const crypto = require('crypto');

const { createCausalEvent, validateCausalEvent, canonicalize } = require('./schema');
const { CausalLedger }     = require('./ledger');
const { CausalSpineGraph } = require('./graph');
const {
  raidProjection, healthProjection, economyProjection,
  sessionProjection, sessionForensics, ProjectionCache,
} = require('./projections');

const DATA_DIR = path.join(__dirname, '../../data/bridge/causal');

// ── Singleton instances ───────────────────────────────────────────────────────
let _ledger   = null;
let _graph    = null;
let _cache    = null;
let _bridgePrivKey = null;  // Ed25519 private key — generated on first open

// ── SSE replay clients ────────────────────────────────────────────────────────
const _replayClients = new Set();

// ── Body reader ───────────────────────────────────────────────────────────────
function _readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end', () => {
      try { resolve(JSON.parse(Buffer.concat(chunks).toString() || '{}')); }
      catch (e) { reject(new Error('invalid JSON')); }
    });
    req.on('error', reject);
  });
}

function _json(res, code, data) {
  if (res.headersSent) return;
  res.writeHead(code, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
  res.end(JSON.stringify(data));
}

function _sse(res, type, data) {
  try { res.write(`data: ${JSON.stringify({ type, data, ts: Date.now() })}\n\n`); }
  catch (_) { _replayClients.delete(res); }
}

// ── Init ──────────────────────────────────────────────────────────────────────

function _ensureInit() {
  if (_ledger && _graph && _cache) return;

  _ledger = new CausalLedger(DATA_DIR);
  _ledger.open();

  _graph = new CausalSpineGraph();
  _cache = new ProjectionCache();

  // Hydrate graph from ledger on open (recent events only — last 10k)
  try {
    const recent = _ledger.query({ limit: 10_000 }).reverse();
    for (const ev of recent) _graph.ingest(ev);
    console.log(`[causal/server] hydrated graph from ${recent.length} events`);
  } catch (e) {
    console.warn(`[causal/server] hydration failed: ${e.message}`);
  }
}

// ── Ed25519 signing (tweetnacl if available, skip if not) ─────────────────────
function _sign(event) {
  try {
    const nacl = require('tweetnacl');
    if (!_bridgePrivKey) {
      const keyPath = path.join(__dirname, '../../data/bridge/identity.key');
      const fs = require('fs');
      if (!require('fs').existsSync(keyPath)) {
        const pair = nacl.sign.keyPair();
        fs.mkdirSync(path.dirname(keyPath), { recursive: true });
        fs.writeFileSync(keyPath, Buffer.from(pair.secretKey).toString('hex'), 'utf8');
        _bridgePrivKey = pair.secretKey;
      } else {
        _bridgePrivKey = Buffer.from(fs.readFileSync(keyPath, 'utf8'), 'hex');
      }
    }
    const canonical = canonicalize(event);
    const sig = nacl.sign.detached(Buffer.from(canonical), _bridgePrivKey);
    return Buffer.from(sig).toString('hex');
  } catch (_) {
    // tweetnacl not installed — skip signing, don't fail
    return null;
  }
}

// ── Projection refresh ────────────────────────────────────────────────────────
function _refreshProjections() {
  try {
    const events = _ledger.query({ limit: 5_000 }).reverse();
    _cache.set('raid',    raidProjection(events));
    _cache.set('health',  healthProjection(events));
    _cache.set('economy', economyProjection(events));
  } catch (e) {
    _cache.markAllStale();
    console.warn(`[causal/server] projection refresh failed: ${e.message}`);
  }
}

// ── Route handlers ────────────────────────────────────────────────────────────

async function handleEmit(req, res) {
  _ensureInit();
  let body;
  try { body = await _readBody(req); }
  catch (e) { return _json(res, 400, { ok: false, error: e.message }); }

  const errs = validateCausalEvent(body);
  if (errs.length) return _json(res, 400, { ok: false, errors: errs });

  const event = {
    ...body,
    uuid: body.uuid || crypto.randomUUID(),
    ts:   body.ts   || Date.now(),
    sig:  null,
  };

  // Sign before persisting
  event.sig = _sign(event);

  try {
    const stored = _ledger.append(event);
    _graph.ingest(stored);
    // Invalidate projection cache — will be refreshed on next read
    _cache.markAllStale();
    return _json(res, 200, { ok: true, uuid: stored.uuid });
  } catch (e) {
    return _json(res, 500, { ok: false, error: e.message });
  }
}

function handleTraceById(req, res, eventId, url) {
  _ensureInit();
  const event = _ledger.get(eventId);
  if (!event) return _json(res, 404, { ok: false, error: `event not found: ${eventId}` });

  const ancestors   = _graph.rootCause(eventId);
  const descendants = _graph.affectedBy(eventId);
  const parents     = _ledger.parents(eventId);

  return _json(res, 200, { ok: true, event, ancestors, descendants, parents });
}

function handleTraceQuery(req, res, url) {
  _ensureInit();
  const source    = url.searchParams.get('source')    || undefined;
  const action    = url.searchParams.get('action')    || undefined;
  const sessionId = url.searchParams.get('sessionId') || undefined;
  const since     = url.searchParams.get('since')     ? parseInt(url.searchParams.get('since')) : undefined;
  const until     = url.searchParams.get('until')     ? parseInt(url.searchParams.get('until')) : undefined;
  const limit     = parseInt(url.searchParams.get('limit') || '100');

  const events = _ledger.query({ source, action, sessionId, since, until, limit });
  return _json(res, 200, { ok: true, events, count: events.length });
}

async function handleTraceSession(req, res, sessionId, url) {
  _ensureInit();
  const mode = url.searchParams.get('mode');

  if (mode === 'forensics') {
    const events = _ledger.querySession(sessionId);
    if (!events.length) return _json(res, 404, { ok: false, error: `no events for session: ${sessionId}` });
    try {
      const report = await sessionForensics(sessionId, events, _graph._graph);
      return _json(res, 200, { ok: true, ...report });
    } catch (e) {
      return _json(res, 500, { ok: false, error: e.message });
    }
  }

  const timeline = _graph.sessionTimeline(sessionId);
  return _json(res, 200, { ok: true, ...timeline });
}

function handleProject(req, res, view, url) {
  _ensureInit();
  _refreshProjections();

  const allowStale = url.searchParams.has('stale');
  const projection = _cache.get(view, { allowStale });

  if (!projection) return _json(res, 404, { ok: false, error: `unknown projection: ${view}. Valid: raid, health, economy` });
  return _json(res, 200, { ok: true, view, projection });
}

function handleProjectSession(req, res, sessionId, url) {
  _ensureInit();
  const events    = _ledger.querySession(sessionId);
  const projection = sessionProjection(sessionId, events, _graph);
  return _json(res, 200, { ok: true, view: 'session', projection });
}

function handleReplay(req, res, eventId) {
  _ensureInit();
  const events = _graph.replayFrom(eventId);
  if (!events.length) {
    return _json(res, 404, { ok: false, error: `no events found from: ${eventId}` });
  }

  // SSE stream — emit events at 100ms intervals (10x speed simulation)
  res.writeHead(200, {
    'Content-Type':  'text/event-stream',
    'Cache-Control': 'no-cache',
    'Access-Control-Allow-Origin': '*',
  });
  _replayClients.add(res);
  req.on('close', () => _replayClients.delete(res));

  let i = 0;
  const interval = setInterval(() => {
    if (i >= events.length) {
      _sse(res, 'replay.complete', { eventId, count: events.length });
      clearInterval(interval);
      _replayClients.delete(res);
      return;
    }
    _sse(res, 'replay.event', events[i]);
    i++;
  }, 100);
}

function handleStats(req, res) {
  _ensureInit();
  return _json(res, 200, {
    ok:     true,
    ledger: _ledger.stats(),
    graph:  _graph.graphStats(),
  });
}

// ── Route table ───────────────────────────────────────────────────────────────

/**
 * routeCausal — called by bridge/server.js before its 404 handler.
 * Returns true if the route was handled, false to fall through.
 *
 * @param {string}              method
 * @param {string}              pathname
 * @param {URL}                 url
 * @param {IncomingMessage}     req
 * @param {ServerResponse}      res
 */
async function routeCausal(method, pathname, url, req, res) {
  // POST /bridge/causal/emit
  if (pathname === '/bridge/causal/emit' && method === 'POST') {
    await handleEmit(req, res);
    return true;
  }

  // GET /bridge/causal/stats
  if (pathname === '/bridge/causal/stats' && method === 'GET') {
    handleStats(req, res);
    return true;
  }

  // GET /bridge/project/session/:id
  const sessionProjMatch = pathname.match(/^\/bridge\/project\/session\/([^/]+)$/);
  if (sessionProjMatch && method === 'GET') {
    handleProjectSession(req, res, sessionProjMatch[1], url);
    return true;
  }

  // GET /bridge/project/:view
  const projectMatch = pathname.match(/^\/bridge\/project\/([^/]+)$/);
  if (projectMatch && method === 'GET') {
    handleProject(req, res, projectMatch[1], url);
    return true;
  }

  // GET /bridge/trace/session/:id
  const sessionMatch = pathname.match(/^\/bridge\/trace\/session\/([^/]+)$/);
  if (sessionMatch && method === 'GET') {
    await handleTraceSession(req, res, sessionMatch[1], url);
    return true;
  }

  // GET /bridge/replay/:eventId
  const replayMatch = pathname.match(/^\/bridge\/replay\/([^/]+)$/);
  if (replayMatch && method === 'GET') {
    handleReplay(req, res, replayMatch[1]);
    return true;
  }

  // GET /bridge/trace/:eventId (not 'session')
  const traceMatch = pathname.match(/^\/bridge\/trace\/([^/]+)$/);
  if (traceMatch && method === 'GET') {
    handleTraceById(req, res, traceMatch[1], url);
    return true;
  }

  // GET /bridge/trace (query)
  if (pathname === '/bridge/trace' && method === 'GET') {
    handleTraceQuery(req, res, url);
    return true;
  }

  return false;
}

module.exports = { routeCausal };
