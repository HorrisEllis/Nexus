'use strict';
/**
 * cos/ui/serve.js — COS's cockpit server (MG_D10). MG18, 0.60.336.
 * Spec: cos/spec/cos-manager.spec MOD-MG-UI-SERVE · Map: docs/2026-10-24-cos-manager-phasemap.spec MG18_the_supervisor_screen, MG_D16
 *
 * James, 2026-10-31: "okay. lets build cos ui. floating, above the event bus. all of the phases, build it. do not make this ugly, cluttered,
 * cheap, or lazy".
 *
 * Serves cos/ui's pages on 127.0.0.1 (COS_UI_PORT, default 7797) and forwards to the one endpoint, COS's manager (COS_MANAGER_URL, default
 * http://127.0.0.1:7799), so every page is same-origin and the manager needs no CORS. It forwards only what the manager's contract lists:
 * /api/cos/<route> as itself, autopilot's door routes under /ap/<route>. A POST or PATCH is forwarded only when its Origin is this server's own
 * and its Host is loopback, so no other website a person visits can restart a system through it (§4.3). It writes nothing; stopping it
 * changes nothing that runs (§5.12).
 *   node cos/ui/serve.js [--port 7797] [--manager http://127.0.0.1:7799]      → open http://127.0.0.1:7797/
 */
const http = require('http');
const fs = require('fs');
const path = require('path');

const UI = __dirname;
const CONTRACT = path.join(UI, '..', 'manager', 'contract.json');
const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json',
  '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8', '.png': 'image/png', '.ico': 'image/x-icon' };

/** the contract's routes as matchers: { method, re } — :param one segment, * the rest */
function allowlist(contract) {
  const toRe = (p) => new RegExp('^' + p.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\/\*$/, '(?:/.+)?').replace(/:[a-zA-Z]+/g, '[^/]+') + '$');
  return {
    api: (contract.routes || []).map(r => ({ method: r.method, re: toRe(r.path) })),
    door: ((contract.door && contract.door.routes) || []).map(r => ({ method: r.method, re: toRe(r.path) })),
  };
}

function createServer({ port = 7797, manager = 'http://127.0.0.1:7799', contractFile = CONTRACT } = {}) {
  const target = new URL(manager);
  const loadAllow = () => allowlist(JSON.parse(fs.readFileSync(contractFile, 'utf8')));
  const send = (res, code, body) => { res.writeHead(code, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(body)); };
  const loopback = (h) => /^(127\.0\.0\.1|localhost|\[::1\])(:\d+)?$/.test(String(h || ''));

  function forward(req, res, upstreamPath) {
    const up = http.request({ hostname: target.hostname, port: target.port, path: upstreamPath, method: req.method,
      headers: { 'content-type': req.headers['content-type'] || 'application/json', accept: req.headers.accept || '*/*', 'x-cos-cockpit': '1' } }, (r) => {
      const h = { 'Content-Type': r.headers['content-type'] || 'application/json', 'Cache-Control': 'no-store' };
      if (r.headers['x-nexus-legacy']) h['X-Nexus-Legacy'] = r.headers['x-nexus-legacy'];
      res.writeHead(r.statusCode || 502, h);
      r.pipe(res);   // the manager's answer unchanged, a stream (the event stream included)
      req.on('close', () => { try { r.destroy(); } catch (_) {} });
    });
    up.on('error', (e) => { if (!res.headersSent) send(res, 502, { ok: false, error: `COS's manager at ${manager} did not answer: ${e.message}`, manager, down: true }); });
    if (/^(POST|PATCH|PUT)$/.test(req.method)) req.pipe(up); else up.end();
  }

  function serveStatic(req, res, p) {
    let rel = decodeURIComponent(p.replace(/^\/ui\//, '/').replace(/^\/+/, '')) || 'shell/index.html';
    if (rel === '' || rel === 'index.html') rel = 'shell/index.html';
    if (rel.endsWith('/')) rel += 'index.html';
    const file = path.resolve(UI, rel);
    if (!file.startsWith(UI + path.sep) || /(^|[\\/])\.\.([\\/]|$)/.test(rel) || path.basename(file) === 'serve.js') return send(res, 403, { ok: false, error: `outside cos/ui: ${rel}` });
    fs.readFile(file, (err, buf) => {
      if (err) return send(res, 404, { ok: false, error: `no such file: ${rel}` });
      res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff' });
      res.end(buf);
    });
  }

  return http.createServer((req, res) => {
    const u = new URL(req.url, 'http://x'); const p = u.pathname; const m = req.method;
    if (m !== 'GET' && m !== 'HEAD') {   // GATE-MGSV-002: a write only from this page, on this machine
      const origin = req.headers.origin;
      if (!loopback(req.headers.host)) return send(res, 403, { ok: false, error: `host ${req.headers.host} is not loopback` });
      if (!origin || !loopback(new URL(origin).host) || new URL(origin).port !== String(port)) return send(res, 403, { ok: false, error: `a write from ${origin || 'no origin'} is refused: only the cockpit's own pages may act` });
    }
    let allow; try { allow = loadAllow(); } catch (e) { return send(res, 500, { ok: false, error: `the manager's contract is unreadable: ${e.message}` }); }
    if (p.startsWith('/api/cos/')) {
      if (!allow.api.some(r => r.method === m && r.re.test(p))) return send(res, 404, { ok: false, error: `${m} ${p} is not in the manager's contract` });
      return forward(req, res, p + u.search);
    }
    if (p.startsWith('/ap/')) {
      const dp = p.slice(3);
      if (!allow.door.some(r => r.method === m && r.re.test(dp))) return send(res, 404, { ok: false, error: `${m} ${dp} is not a door route in the contract` });
      return forward(req, res, dp + u.search);
    }
    if (m !== 'GET' && m !== 'HEAD') return send(res, 405, { ok: false, error: `${m} ${p}` });
    if (p === '/' || p === '/ui' || p === '/ui/') { res.writeHead(302, { Location: '/shell/' }); return res.end(); }   // so the shell's relative links resolve
    if (p === '/favicon.ico') return serveStatic(req, res, '/core/mark.svg');
    return serveStatic(req, res, p);
  });
}

if (require.main === module) {
  const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
  const port = Number(arg('port', process.env.COS_UI_PORT || 7797));
  const manager = arg('manager', process.env.COS_MANAGER_URL || 'http://127.0.0.1:7799');
  createServer({ port, manager }).listen(port, '127.0.0.1', () => console.log(`[cos-ui] the cockpit on http://127.0.0.1:${port}/ → COS's manager ${manager}`));
}

module.exports = { createServer, allowlist };
