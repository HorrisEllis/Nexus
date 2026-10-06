'use strict';
// server.js — the API server. It serves the route nodes (data/nodes/route/): each one names a method, a path and the
// command it runs. A new route is a node dropped in its folder; this file does not change.
//   GET /health  the heartbeat snapshot · GET /contract  the contract with every route node · GET /nodes/:type[/:id]
const http = require('http');
const fs = require('fs');
const path = require('path');
const { boot } = require('./lib/system.js');
const commands = require('./lib/commands.js');

function _match(pattern, actual) {
  const p = pattern.split('/').filter(Boolean), a = actual.split('/').filter(Boolean);
  if (p.length !== a.length) return null;
  const params = {};
  for (let i = 0; i < p.length; i++) {
    if (p[i].startsWith(':')) params[p[i].slice(1)] = decodeURIComponent(a[i]);
    else if (p[i] !== a[i]) return null;
  }
  return params;
}

function contract(ctx) {
  const base = JSON.parse(fs.readFileSync(path.join(ctx.root, 'interaction-contract.json'), 'utf8'));
  const routes = ctx.index.list('route').map(r => ({ method: r.method, path: r.path, command: r.command }));
  return { ...base, resources: [...base.resources, ...routes] };
}

function _body(req) {
  return new Promise((resolve) => {
    let s = '';
    req.on('data', (c) => { s += c; });
    req.on('end', () => { try { resolve(s ? JSON.parse(s) : {}); } catch (_) { resolve({}); } });
  });
}

function create(ctx) {
  return http.createServer(async (req, res) => {
    const send = (status, data) => { res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify(data)); };
    const url = new URL(req.url, 'http://local');
    try {
      if (req.method === 'GET' && url.pathname === '/health') return send(200, ctx.heartbeat.snapshot());
      if (req.method === 'GET' && url.pathname === '/contract') return send(200, contract(ctx));
      let p = _match('/nodes/:type/:id', url.pathname);
      if (req.method === 'GET' && p) { const n = ctx.index.get(p.type, p.id); return n ? send(200, n) : send(404, { error: `no ${p.type} ${p.id}` }); }
      p = _match('/nodes/:type', url.pathname);
      if (req.method === 'GET' && p) return send(200, { type: p.type, nodes: ctx.index.list(p.type) });
      for (const r of ctx.index.list('route')) {
        if (r.method !== req.method) continue;
        const params = _match(r.path, url.pathname);
        if (!params) continue;
        const args = { ...Object.fromEntries(url.searchParams), ...(req.method === 'GET' ? {} : await _body(req)), ...params };
        return send(200, await commands.run(ctx, r.command, args));
      }
      send(404, { error: `no route ${req.method} ${url.pathname}` });
    } catch (e) { send(e.status || 500, { error: e.message }); }
  });
}

function start({ port, root } = {}) {
  const ctx = boot({ root, watch: true, beat: true });
  const server = create(ctx);
  return new Promise((resolve) => server.listen(port !== undefined ? port : ctx.config.port, '127.0.0.1', () => {
    server.on('close', () => ctx.stop());
    resolve({ server, ctx, port: server.address().port });
  }));
}

if (require.main === module) {
  start().then(({ ctx, port }) => console.log(`[${ctx.system}] listening on http://127.0.0.1:${port}`));
}

module.exports = { create, start, contract };
