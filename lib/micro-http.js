'use strict';
/**
 * lib/micro-http.js — the part of express Nexus actually uses, on node:http.
 * UUID: nexus-lib-micro-http-v1-0000-2026-0926-jamesbrooks-001
 * Version: 1.0.0
 *
 * §0.39.261 — James: "remove as much external dependancies as possible …
 * invent anything needed … it needs to earn its place." express (and its ~60
 * transitive packages) was used by three Clear Glass files — the SSE server,
 * the IPC bridge and the wire — for exactly this surface, measured by reading
 * every call site:
 *
 *   app.get/post/put/patch/delete/all(path, ...handlers)   app.use([path,] fn)
 *   app.listen(port[, host][, cb]) -> http.Server           app(req, res) as a request handler
 *   express.json({ limit })                                  express.static(dir)
 *   req.body  req.params  req.query  req.path  req.method
 *   res.status(n) res.json(v) res.send(v) res.sendStatus(n) res.set/header(k, v) res.type(t)
 *   routes: '/a/:id', '/a/*name' (named wildcard, express 5), '*'
 *
 * Handlers run in order; next() moves on, next(err) skips to the first error
 * handler (4 arguments). An async handler's rejection goes to next(err). An
 * unhandled request is 404 JSON; an unhandled error is 500 JSON — never a hung
 * socket. Everything else a handler needs is the raw node req/res, untouched.
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

function compile(pattern) {
  if (pattern === '*' || pattern === '/*') return { re: /^\/(.*)$/, keys: ['0'], splat: new Set(['0']) };
  const keys = [], splat = new Set();
  const src = String(pattern).replace(/\/+$/, '').split('/').map(seg => {
    if (seg.startsWith(':')) { keys.push(seg.slice(1).replace(/\?$/, '')); return seg.endsWith('?') ? '(?:/([^/]+))?' : '/([^/]+)'; }
    if (seg.startsWith('*')) { const k = seg.slice(1) || '0'; keys.push(k); splat.add(k); return '/(.*)'; }
    return seg ? '/' + seg.replace(/[.+?^${}()|[\]\\]/g, '\\$&') : '';
  }).join('').replace(/^\/?/, '');
  return { re: new RegExp(`^/${src.replace(/^\//, '')}/?$`.replace('^//', '^/')), keys, splat };
}

function parseQuery(qs) {
  const out = {};
  for (const [k, v] of new URLSearchParams(qs || '')) {
    if (k in out) out[k] = Array.isArray(out[k]) ? [...out[k], v] : [out[k], v];
    else out[k] = v;
  }
  return out;
}

function _limitBytes(limit) {
  if (typeof limit === 'number') return limit;
  const m = String(limit || '100kb').match(/^(\d+(?:\.\d+)?)\s*(b|kb|mb|gb)?$/i);
  if (!m) return 100 * 1024;
  return Math.floor(parseFloat(m[1]) * ({ b: 1, kb: 1024, mb: 1048576, gb: 1073741824 }[(m[2] || 'b').toLowerCase()]));
}

function _decorate(req, res) {
  const u = new URL(req.url, 'http://local');
  req.path = u.pathname;
  req.query = parseQuery(u.search);
  req.params = req.params || {};
  if (req.body === undefined) req.body = {};
  res.status = (code) => { res.statusCode = code; return res; };
  res.set = res.header = (k, v) => { if (typeof k === 'object') { for (const [a, b] of Object.entries(k)) res.setHeader(a, b); } else res.setHeader(k, v); return res; };
  res.type = (t) => { res.setHeader('Content-Type', t.includes('/') ? t : ({ json: 'application/json', html: 'text/html; charset=utf-8', text: 'text/plain; charset=utf-8' }[t] || t)); return res; };
  res.json = (v) => {
    if (!res.getHeader('Content-Type')) res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify(v === undefined ? null : v));
    return res;
  };
  res.send = (v) => {
    if (v === undefined || v === null) { res.end(); return res; }
    if (Buffer.isBuffer(v)) { if (!res.getHeader('Content-Type')) res.setHeader('Content-Type', 'application/octet-stream'); res.end(v); return res; }
    if (typeof v === 'object') return res.json(v);
    if (!res.getHeader('Content-Type')) res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.end(String(v)); return res;
  };
  res.sendStatus = (code) => { res.statusCode = code; res.setHeader('Content-Type', 'text/plain; charset=utf-8'); res.end(http.STATUS_CODES[code] || String(code)); return res; };
}

function createApp() {
  const stack = [];   // { method|null, match(path) -> params|null, fn, isError }
  const add = (method, pattern, fns) => {
    const m = pattern === null ? null : compile(pattern);
    for (const fn of fns.flat()) {
      if (typeof fn !== 'function') throw new TypeError(`micro-http: handler for ${method || 'use'} ${pattern} is not a function`);
      stack.push({
        method, fn, isError: fn.length === 4,
        match: (p) => {
          if (!m) return {};
          if (method === null) {  // use(path, fn): a prefix match
            const base = String(pattern).replace(/\/+$/, '');
            return p === base || p.startsWith(base + '/') || base === '' ? {} : null;
          }
          const r = m.re.exec(p);
          if (!r) return null;
          const params = {};
          // express 5: a named wildcard (*name) is the array of its segments
          m.keys.forEach((k, i) => { if (r[i + 1] !== undefined) params[k] = m.splat && m.splat.has(k) ? r[i + 1].split('/').filter(Boolean).map(decodeURIComponent) : decodeURIComponent(r[i + 1]); });
          return params;
        },
      });
    }
  };

  function app(req, res) {
    _decorate(req, res);
    let i = 0;
    const next = (err) => {
      while (i < stack.length) {
        const layer = stack[i++];
        if (layer.method && layer.method !== 'ALL' && layer.method !== req.method && !(layer.method === 'GET' && req.method === 'HEAD')) continue;
        const params = layer.match(req.path);
        if (!params) continue;
        if (!!err !== layer.isError) continue;
        if (layer.method) req.params = params;
        try {
          const out = err ? layer.fn(err, req, res, next) : layer.fn(req, res, next);
          if (out && typeof out.then === 'function') out.catch(next);
        } catch (e) { return next(e); }
        return;
      }
      if (res.headersSent || res.writableEnded) return;
      if (err) { res.statusCode = err.status || err.statusCode || 500; res.json({ ok: false, error: err.expose === false ? 'internal error' : (err.message || String(err)) }); }
      else { res.statusCode = 404; res.json({ ok: false, error: `not found: ${req.method} ${req.path}` }); }
    };
    next();
  }

  for (const m of ['get', 'post', 'put', 'patch', 'delete', 'options', 'head', 'all']) {
    app[m] = (pattern, ...fns) => { add(m.toUpperCase(), pattern, fns); return app; };
  }
  app.use = (a, ...rest) => {
    if (typeof a === 'function') add(null, null, [a, ...rest]);
    else add(null, a, rest);
    return app;
  };
  app.listen = (port, host, cb) => {
    if (typeof host === 'function') { cb = host; host = undefined; }
    const server = http.createServer(app);
    return host ? server.listen(port, host, cb) : server.listen(port, cb);
  };
  return app;
}

/** json({ limit }) — parse an application/json body into req.body (a JSON parse error is a 400, never a crash). */
createApp.json = function json({ limit = '100kb' } = {}) {
  const max = _limitBytes(limit);
  return function jsonBody(req, res, next) {
    const ct = String(req.headers['content-type'] || '');
    if (!/\bjson\b/i.test(ct) || req.method === 'GET' || req.method === 'HEAD') { if (req.body === undefined) req.body = {}; return next(); }
    const chunks = []; let size = 0, done = false;
    req.on('data', (c) => {
      if (done) return;
      size += c.length;
      if (size > max) { done = true; const e = new Error(`request body over ${limit}`); e.status = 413; req.resume(); return next(e); }
      chunks.push(c);
    });
    req.on('end', () => {
      if (done) return; done = true;
      const text = Buffer.concat(chunks).toString('utf8');
      if (!text.trim()) { req.body = {}; return next(); }
      try { req.body = JSON.parse(text); next(); }
      catch (e) { const err = new Error(`invalid JSON body: ${e.message}`); err.status = 400; next(err); }
    });
    req.on('error', (e) => { if (!done) { done = true; next(e); } });
  };
};

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8', '.map': 'application/json' };
/** static(dir) — serve files under dir for GET/HEAD; never a path outside it. */
createApp.static = function serveStatic(dir) {
  const root = path.resolve(dir);
  return function staticFiles(req, res, next) {
    if (req.method !== 'GET' && req.method !== 'HEAD') return next();
    let rel = decodeURIComponent(req.path || '/');
    if (rel.endsWith('/')) rel += 'index.html';
    const abs = path.resolve(root, '.' + rel);
    if (abs !== root && !abs.startsWith(root + path.sep)) return next();
    fs.stat(abs, (err, st) => {
      if (err || !st.isFile()) return next();
      res.setHeader('Content-Type', MIME[path.extname(abs).toLowerCase()] || 'application/octet-stream');
      res.setHeader('Content-Length', st.size);
      if (req.method === 'HEAD') return res.end();
      fs.createReadStream(abs).pipe(res);
    });
  };
};

module.exports = createApp;
module.exports.createApp = createApp;
module.exports.compile = compile;
