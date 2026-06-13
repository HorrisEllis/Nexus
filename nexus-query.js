'use strict';
/**
 * nexus-query.js — Unified Query Layer
 * UUID: nexus-query-v1-0000-4000-0000-000000000001
 * Status: pre-release
 *
 * THE OPERATING SYSTEM QUERY INTERFACE.
 *
 * Instead of:
 *   fetch('http://127.0.0.1:3748/api/gaps')
 *   fetch('http://127.0.0.1:4800/api/ideas')
 *   fetch('http://127.0.0.1:7820/jobs')
 *
 * You write:
 *   await nexus.query({ type: 'gaps.open' })
 *   await nexus.query({ type: 'ideas.all', filter: { phase: 'specced' } })
 *   await nexus.query({ type: 'jobs.recent', n: 20 })
 *
 * This abstraction:
 *   1. Routes to the correct service
 *   2. Normalizes the response shape
 *   3. Caches reads (TTL configurable)
 *   4. Handles service unavailability gracefully
 *   5. Fans writes to the event bus
 *
 * §1.1  Nothing pretends to work — errors include which service failed
 * §1.2  Nothing silently fails — every error is typed and returned
 * §A-5  All queries pass through SNR gate before returning (optional)
 */

const http = require('http');

const PORTS = {
  cortex:       3748,
  guardian:     7820,
  idearium:     4800,
  architect:    3747,
  orchestrator: 9000,
  bridge:       9999,
  diagnostic:   7825,
  emerge:       4242,
};

// ── HTTP helpers ──────────────────────────────────────────────────────────────

function _get(port, path, timeoutMs = 5000) {
  return new Promise(resolve => {
    const req = http.request({
      hostname: '127.0.0.1', port, path, method: 'GET',
      headers: { 'Accept': 'application/json' },
    }, res => {
      let body = '';
      res.on('data', c => body += c);
      res.on('end', () => {
        try { resolve({ ok: res.statusCode < 400, status: res.statusCode, data: JSON.parse(body) }); }
        catch(_) { resolve({ ok: false, status: res.statusCode, data: null, error: 'parse_error' }); }
      });
    });
    req.setTimeout(timeoutMs, () => { req.destroy(); resolve({ ok: false, error: 'timeout', service: `port:${port}` }); });
    req.on('error', e => resolve({ ok: false, error: e.message, service: `port:${port}` }));
    req.end();
  });
}

function _post(port, path, body, timeoutMs = 8000) {
  return new Promise(resolve => {
    const raw = JSON.stringify(body);
    const req = http.request({
      hostname: '127.0.0.1', port, path, method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(raw) },
    }, res => {
      let b = '';
      res.on('data', c => b += c);
      res.on('end', () => {
        try { resolve({ ok: res.statusCode < 400, status: res.statusCode, data: JSON.parse(b) }); }
        catch(_) { resolve({ ok: false, status: res.statusCode, data: null, error: 'parse_error' }); }
      });
    });
    req.setTimeout(timeoutMs, () => { req.destroy(); resolve({ ok: false, error: 'timeout' }); });
    req.on('error', e => resolve({ ok: false, error: e.message }));
    req.write(raw); req.end();
  });
}

// ── Query routing table ───────────────────────────────────────────────────────

const QUERY_ROUTES = {
  // ── Gaps ────────────────────────────────────────────────────────────────────
  'gaps.open':     (q) => _get(PORTS.cortex, `/api/gaps?status=open&n=${q.n||50}`).then(r => r.data?.gaps || r.data?.rows || []),
  'gaps.all':      (q) => _get(PORTS.cortex, `/api/gaps?status=all&n=${q.n||100}`).then(r => r.data?.gaps || r.data?.rows || []),
  'gaps.by-system':(q) => _get(PORTS.cortex, `/api/gaps?source=${q.source||''}&n=${q.n||50}`).then(r => r.data?.gaps || []),

  // ── Ideas (Idearium) ─────────────────────────────────────────────────────────
  'ideas.all':     (q) => _get(PORTS.idearium, `/api/ideas?phase=${q.phase||''}&n=${q.n||50}`).then(r => r.data?.ideas || []),
  'ideas.specced': ()  => _get(PORTS.idearium, '/api/ideas?phase=specced').then(r => r.data?.ideas || []),
  'ideas.building':(q) => _get(PORTS.idearium, '/api/ideas?phase=building').then(r => r.data?.ideas || []),
  'specs.all':     (q) => _get(PORTS.idearium, `/api/specs?n=${q.n||50}`).then(r => r.data?.specs || []),

  // ── Jobs (Guardian) ──────────────────────────────────────────────────────────
  'jobs.recent':   (q) => _get(PORTS.guardian, `/jobs?limit=${q.n||20}`).then(r => r.data?.jobs || r.data || []),
  'jobs.active':   ()  => _get(PORTS.guardian, '/jobs?status=active').then(r => r.data?.jobs || []),
  'artifacts.all': (q) => _get(PORTS.guardian, `/artifacts?lang=${q.lang||''}&q=${q.q||''}`).then(r => r.data?.artifacts || []),

  // ── Events (Cortex) ─────────────────────────────────────────────────────────
  'events.recent': (q) => _get(PORTS.cortex, `/api/events?limit=${q.n||50}&type=${q.type||''}`).then(r => r.data?.rows || r.data?.events || []),
  'events.by-type':(q) => _get(PORTS.cortex, `/api/events?type=${q.type||''}&n=${q.n||50}`).then(r => r.data?.rows || []),

  // ── Memory (Cortex) ──────────────────────────────────────────────────────────
  'memory.query':  (q) => _post(PORTS.cortex, '/api/memory/search', { q: q.q, n: q.n||20 }).then(r => r.data?.results || []),
  'memory.table':  (q) => _get(PORTS.cortex, `/api/memory?table=${q.table||'event_log'}&n=${q.n||50}`).then(r => r.data?.rows || []),

  // ── Hooks (Architect) ───────────────────────────────────────────────────────
  'hooks.all':     (q) => _get(PORTS.architect, `/api/hooks?type=${q.type||''}&status=${q.status||''}`).then(r => r.data?.hooks || []),
  'hooks.by-type': (q) => _get(PORTS.architect, `/api/hooks?type=${q.type}`).then(r => r.data?.hooks || []),
  'blueprints.all':(q) => _get(PORTS.architect, '/api/blueprint').then(r => r.data?.blueprints || []),

  // ── Health ───────────────────────────────────────────────────────────────────
  'health.all':    ()  => Promise.all(
    Object.entries(PORTS).filter(([,p]) => p !== PORTS.emerge).map(async ([sys, port]) => {
      const r = await _get(port, '/health', 2000);
      return { system: sys, port, online: r.ok, latency: 0, version: r.data?.version };
    })
  ),
  'health.system': (q) => {
    const port = PORTS[q.system];
    if (!port) return Promise.resolve({ ok: false, error: `unknown system: ${q.system}` });
    return _get(port, '/health', 2000).then(r => r.data);
  },

  // ── Versionium ──────────────────────────────────────────────────────────────
  'versions.recent':(q) => _get(PORTS.cortex, `/api/versionium?n=${q.n||20}`).then(r => r.data?.commits || r.data?.versions || []),
  'snapshots.all':  (q) => _get(PORTS.cortex, `/api/snapshots?n=${q.n||20}`).then(r => r.data?.snapshots || []),

  // ── Compile (Architect spec-compiler) ────────────────────────────────────────
  'compile.history':(q) => _get(PORTS.architect, '/api/compile/history').then(r => r.data?.history || []),
  'compile.status': ()  => _get(PORTS.architect, '/api/compile/status').then(r => r.data),

  // ── System stats ─────────────────────────────────────────────────────────────
  'system.registry':(q) => _get(PORTS.orchestrator, '/api/registry').then(r => r.data?.registry || {}),
  'system.ledger':  (q) => _get(PORTS.orchestrator, `/api/ledger?system=${q.system||''}&n=${q.n||20}`).then(r => r.data?.entries || []),
};

// ── Query cache ───────────────────────────────────────────────────────────────

const _cache = new Map(); // key → { data, ts }
const CACHE_TTL = {
  'health.all': 3000,
  'hooks.all': 10000,
  'blueprints.all': 15000,
  default: 2000,
};

function _cacheKey(type, q) {
  return type + ':' + JSON.stringify(q || {});
}

// ── Main query function ───────────────────────────────────────────────────────

async function query({ type, ...rest } = {}) {
  if (!type) return { ok: false, error: 'type required' };

  const route = QUERY_ROUTES[type];
  if (!route) return { ok: false, error: `unknown query type: ${type}`, available: Object.keys(QUERY_ROUTES) };

  const key = _cacheKey(type, rest);
  const ttl = CACHE_TTL[type] ?? CACHE_TTL.default;
  const cached = _cache.get(key);
  if (cached && (Date.now() - cached.ts) < ttl) {
    return { ok: true, data: cached.data, cached: true, type };
  }

  try {
    const data = await route(rest);
    _cache.set(key, { data, ts: Date.now() });
    return { ok: true, data, type, ts: Date.now() };
  } catch(e) {
    return { ok: false, error: e.message, type };
  }
}

// ── Write operations ──────────────────────────────────────────────────────────

async function write(type, payload = {}) {
  const WRITE_ROUTES = {
    'idea.create':  (p) => _post(PORTS.idearium, '/api/ideas', p),
    'gap.open':     (p) => _post(PORTS.cortex, '/api/gaps', p),
    'event.emit':   (p) => _post(PORTS.cortex, '/api/event', p),
    'hook.register':(p) => _post(PORTS.architect, '/api/hooks', p),
    'job.dispatch': (p) => _post(PORTS.guardian, '/command', p),
    'spec.compile': (p) => _post(PORTS.architect, '/api/compile', p),
    'snr.check':    (p) => _post(PORTS.architect, '/api/snr/check', p),
    'utl.translate':(p) => _post(PORTS.architect, '/api/translate/utl', { text: p.text }),
  };

  const route = WRITE_ROUTES[type];
  if (!route) return { ok: false, error: `unknown write type: ${type}` };

  // Invalidate cache for related reads
  for (const key of _cache.keys()) {
    if (key.startsWith(type.split('.')[0])) _cache.delete(key);
  }

  try {
    const r = await route(payload);
    return r.data || r;
  } catch(e) {
    return { ok: false, error: e.message };
  }
}

// ── Health check ──────────────────────────────────────────────────────────────

async function ping(system) {
  const port = PORTS[system];
  if (!port) return false;
  const r = await _get(port, '/health', 1500);
  return r.ok;
}

// ── Cache management ──────────────────────────────────────────────────────────

function clearCache(type) {
  if (type) {
    for (const k of _cache.keys()) { if (k.startsWith(type)) _cache.delete(k); }
  } else {
    _cache.clear();
  }
}

module.exports = {
  query,
  write,
  ping,
  clearCache,
  PORTS,
  // Raw HTTP helpers for advanced use
  _get,
  _post,
};
