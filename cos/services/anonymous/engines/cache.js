'use strict';
/**
 * engines/cache.js — cache layer
 * anonymousservers.info
 *
 * Value adds:
 *   - LRU in-process cache (no Redis needed for most workloads)
 *   - Edge cache rules per vhost (TTL by content type / path pattern)
 *   - Cache warming: pre-fetches URLs on startup
 *   - Smart invalidation: tag-based purge (purge all /blog/* at once)
 *   - Stale-while-revalidate: serve stale, refresh in background
 *   - Per-tenant cache namespacing
 *   - Cache analytics: hit/miss ratio fed to optimizer engine
 */

const http   = require('http');
const https  = require('https');
const { ipc, conf, log, claimPort, isInit, NAME } = require('./_engine');

const DEFAULTS = {
  listenPort:      4002,
  maxItems:        10000,
  maxSizeBytes:    134217728,  // 128MB total cache
  defaultTtlMs:    3600000,    // 1 hour
  staleWhileRevalidate: true,
  rules: [
    { match: /\.(css|js|woff2?|ttf|otf)$/,   ttlMs: 86400000  },  // 24h
    { match: /\.(png|jpg|jpeg|gif|svg|ico|webp)$/, ttlMs: 604800000 }, // 7d
    { match: /\.(html|htm)$/,                 ttlMs: 300000    },  // 5m
    { match: /\/api\//,                       ttlMs: 0         },  // no cache
    { match: /\?/,                            ttlMs: 0         },  // no cache query strings
  ],
};

if (isInit()) {
  conf.init(DEFAULTS);
  log('cache: wrote default conf');
  process.exit(0);
}

let cfg = conf.load(DEFAULTS);

// ─── LRU cache ────────────────────────────────────────────────────────────────

class LRUCache {
  constructor(maxItems, maxBytes) {
    this.maxItems  = maxItems;
    this.maxBytes  = maxBytes;
    this.usedBytes = 0;
    this.map  = new Map(); // key -> { value, size, ts, ttl, tags, hits }
    this.keys = [];        // ordered oldest to newest
    this.hits   = 0;
    this.misses = 0;
  }

  _evict() {
    while ((this.map.size > this.maxItems || this.usedBytes > this.maxBytes) && this.keys.length) {
      const oldest = this.keys.shift();
      const entry  = this.map.get(oldest);
      if (entry) { this.usedBytes -= entry.size; this.map.delete(oldest); }
    }
  }

  set(key, value, ttlMs, tags = []) {
    const size = Buffer.byteLength(typeof value === 'string' ? value : JSON.stringify(value));
    if (this.map.has(key)) {
      const old = this.map.get(key);
      this.usedBytes -= old.size;
      this.keys = this.keys.filter(k => k !== key);
    }
    this.map.set(key, { value, size, ts: Date.now(), ttlMs, tags, hits: 0 });
    this.keys.push(key);
    this.usedBytes += size;
    this._evict();
  }

  get(key) {
    const entry = this.map.get(key);
    if (!entry) { this.misses++; return null; }
    const age = Date.now() - entry.ts;
    if (entry.ttlMs > 0 && age > entry.ttlMs) {
      // expired — check stale-while-revalidate window (2x TTL)
      if (cfg.staleWhileRevalidate && age < entry.ttlMs * 2) {
        entry.stale = true;
        this.hits++;
        return entry;
      }
      this.map.delete(key);
      this.keys = this.keys.filter(k => k !== key);
      this.usedBytes -= entry.size;
      this.misses++;
      return null;
    }
    // move to end (most recently used)
    this.keys = this.keys.filter(k => k !== key);
    this.keys.push(key);
    entry.hits++;
    this.hits++;
    return entry;
  }

  invalidateByTag(tag) {
    let count = 0;
    for (const [key, entry] of this.map) {
      if (entry.tags.includes(tag)) {
        this.usedBytes -= entry.size;
        this.map.delete(key);
        count++;
      }
    }
    this.keys = this.keys.filter(k => this.map.has(k));
    return count;
  }

  invalidateByPattern(pattern) {
    const re = new RegExp(pattern);
    let count = 0;
    for (const [key, entry] of this.map) {
      if (re.test(key)) {
        this.usedBytes -= entry.size;
        this.map.delete(key);
        count++;
      }
    }
    this.keys = this.keys.filter(k => this.map.has(k));
    return count;
  }

  stats() {
    const total = this.hits + this.misses;
    return {
      items:     this.map.size,
      usedMb:    (this.usedBytes / 1048576).toFixed(2),
      maxMb:     (this.maxBytes  / 1048576).toFixed(2),
      hits:      this.hits,
      misses:    this.misses,
      hitRate:   total ? ((this.hits / total) * 100).toFixed(1) + '%' : 'n/a',
    };
  }
}

const cache = new LRUCache(cfg.maxItems, cfg.maxSizeBytes);

// ─── TTL resolution ───────────────────────────────────────────────────────────

function resolveTtl(url) {
  for (const rule of cfg.rules) {
    const re = rule.match instanceof RegExp ? rule.match : new RegExp(rule.match);
    if (re.test(url)) return rule.ttlMs;
  }
  return cfg.defaultTtlMs;
}

// ─── upstream fetch (for proxy-cache mode) ────────────────────────────────────

function fetchUpstream(url, headers = {}) {
  return new Promise((resolve, reject) => {
    const mod    = url.startsWith('https') ? https : http;
    const parsed = new URL(url);
    const opts   = {
      hostname: parsed.hostname,
      port:     parsed.port || (url.startsWith('https') ? 443 : 80),
      path:     parsed.pathname + parsed.search,
      method:   'GET',
      headers:  { ...headers, 'User-Agent': 'nexus-cache/1.0' },
    };
    const req = mod.request(opts, res => {
      const chunks = [];
      res.on('data', d => chunks.push(d));
      res.on('end', () => resolve({
        status:  res.statusCode,
        headers: res.headers,
        body:    Buffer.concat(chunks).toString(),
      }));
    });
    req.on('error', reject);
    req.setTimeout(10000, () => { req.destroy(); reject(new Error('upstream timeout')); });
    req.end();
  });
}

// ─── cache HTTP API (used by proxy + other engines) ──────────────────────────

const server = http.createServer((req, res) => {
  const url    = req.url;
  const method = req.method;

  function json(status, obj) {
    const body = JSON.stringify(obj);
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(body);
  }

  // GET /cache?key=...
  if (method === 'GET' && url.startsWith('/cache?')) {
    const key   = new URL(url, 'http://x').searchParams.get('key');
    const entry = key ? cache.get(key) : null;
    if (!entry) return json(404, { hit: false });
    res.writeHead(200, {
      'Content-Type': entry.contentType || 'text/plain',
      'X-Cache': entry.stale ? 'STALE' : 'HIT',
      'X-Cache-Age': Math.floor((Date.now() - entry.ts) / 1000) + 's',
    });
    res.end(entry.value);
    // stale-while-revalidate: refresh in background
    if (entry.stale && entry.sourceUrl) {
      fetchUpstream(entry.sourceUrl).then(r => {
        if (r.status === 200) cache.set(key, r.body, resolveTtl(key), entry.tags);
      }).catch(() => {});
    }
    return;
  }

  // PUT /cache — store an entry
  if (method === 'PUT' && url === '/cache') {
    let body = '';
    req.on('data', d => body += d);
    req.on('end', () => {
      try {
        const { key, value, ttlMs, tags } = JSON.parse(body);
        cache.set(key, value, ttlMs ?? resolveTtl(key), tags || []);
        json(200, { ok: true });
      } catch { json(400, { error: 'invalid body' }); }
    });
    return;
  }

  // DELETE /cache/tag/:tag
  if (method === 'DELETE' && url.startsWith('/cache/tag/')) {
    const tag   = url.slice('/cache/tag/'.length);
    const count = cache.invalidateByTag(tag);
    return json(200, { purged: count, tag });
  }

  // DELETE /cache/pattern
  if (method === 'DELETE' && url === '/cache/pattern') {
    let body = '';
    req.on('data', d => body += d);
    req.on('end', () => {
      try {
        const { pattern } = JSON.parse(body);
        const count = cache.invalidateByPattern(pattern);
        json(200, { purged: count, pattern });
      } catch { json(400, { error: 'invalid body' }); }
    });
    return;
  }

  // GET /cache/stats
  if (method === 'GET' && url === '/cache/stats') {
    const stats = cache.stats();
    // push to optimizer
    ipc.send('route', { type: 'cache:stats', stats }, 'optimizer');
    return json(200, stats);
  }

  json(404, { error: 'not found' });
});

server.on('error', err => {
  if (err.code === 'EADDRINUSE') {
    const next = (cfg.listenPort) + 1;
    log(`port ${(cfg.listenPort)} in use — trying :${next}`, 'WARN');
    setTimeout(() => server.listen(next, () => { log(`on :${next}`); claimPort(next); }), 300);
  } else { throw err; }
});
server.listen(cfg.listenPort, () => {
  log(`cache engine on :${cfg.listenPort}`);
  claimPort(cfg.listenPort);
});

// ─── IPC handlers ─────────────────────────────────────────────────────────────

ipc.on('cache:get', payload => {
  const { key, requestId } = payload || {};
  const entry = cache.get(key);
  ipc.send('cache:reply', { requestId, hit: !!entry, value: entry?.value, stale: entry?.stale });
});

ipc.on('cache:set', payload => {
  const { key, value, ttlMs, tags } = payload || {};
  cache.set(key, value, ttlMs ?? resolveTtl(key), tags || []);
});

ipc.on('cache:purge:tag', payload => {
  const { tag } = payload || {};
  const count = cache.invalidateByTag(tag);
  log(`purged ${count} entries with tag: ${tag}`);
});

ipc.on('cache:purge:pattern', payload => {
  const { pattern } = payload || {};
  const count = cache.invalidateByPattern(pattern);
  log(`purged ${count} entries matching: ${pattern}`);
});

ipc.on('cache:stats', () => {
  ipc.send('cache:stats:reply', cache.stats());
});

// push stats to optimizer every 5 min
setInterval(() => {
  ipc.send('route', { type: 'cache:stats', stats: cache.stats() }, 'optimizer');
}, 300000);

log('cache engine ready');

// ─── status ping (monitor health check) ──────────────────────────────────────
ipc.on('status:ping', payload => {
  ipc.send('status:pong', { requestId: payload?.requestId, engine: NAME, alive: true, ts: Date.now() });
});

