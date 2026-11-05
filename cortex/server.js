'use strict';
/**
 * cortex/server.js — Cortex's door: the process COS starts, its component registry, its handshake, its CLI.
 * Phase DO3a (docs/2026-10-31-system-doors-phasemap.spec). Spec: docs/system-doors.spec (MOD-DOOR-CORTEX).
 *
 * James, 2026-11-05: "they all need the door build". 2026-11-03: "the server.js is the process for each system. It’s what cos manages.
 * The spine and component registry for each system routes through there. Cli and api." 2026-11-01: "each server.js in each system needs
 * to connect to the component registry, then cos connects to the server.js."
 *
 * What the door answers itself, from Cortex's own registry (cortex/registry-components.js), before anything else:
 *   GET  /registry    every component Cortex offers: id, route, grammar, description
 *   GET  /handshake   who answers, its version and port, how many components, and the registry's hash (a caller can tell it changed)
 *   POST /cli         { line } → the component whose grammar the line starts with, called through its own route on this door;
 *                     a line that matches none is refused with the grammar list, never guessed
 * Every other request goes to boot.js's routes, unchanged (DO3b moves those handlers into cortex/routes, one registry entry at a time).
 *
 *   createDoor({ boot, registry }) → { handle(req, res) → handled?, handshake(), match(line) }
 *   start({ port }) → http.Server    (also when run directly: node cortex/server.js)
 */
const crypto = require('crypto');
const http = require('http');

function registryHash(registry) {
  const rows = registry.map(c => [c.id, c.route && c.route.method, c.route && c.route.path]).sort((a, b) => String(a[0]).localeCompare(String(b[0])));
  return crypto.createHash('sha256').update(JSON.stringify(rows)).digest('hex').slice(0, 16);
}

function createDoor({ registry = require('./registry-components.js'), version = '0.0.0', port = null, call = null } = {}) {
  const send = (res, code, body) => { res.writeHead(code, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }); res.end(JSON.stringify(body)); };
  const components = registry.filter(c => c && c.route && c.route.path);
  const handshake = () => ({ ok: true, system: 'cortex', version, port, door: 'cortex/server.js', components: components.length, registryHash: registryHash(components), registry: '/registry', cli: '/cli' });
  // the longest grammar that the line starts with wins, so "raid status" is not taken by "raid"
  const grammars = components.flatMap(c => (c.grammar || []).map(g => ({ g: String(g).toLowerCase().trim(), c }))).filter(x => x.g).sort((a, b) => b.g.length - a.g.length);
  const match = (line) => {
    const l = String(line || '').toLowerCase().trim().replace(/\s+/g, ' ');
    const hit = grammars.find(x => l === x.g || l.startsWith(x.g + ' '));
    return hit ? { component: hit.c, rest: l.slice(hit.g.length).trim() } : null;
  };
  const readBody = (req) => new Promise((resolve) => { let b = ''; req.on('data', d => { b += d; if (b.length > 1e6) req.destroy(); }); req.on('end', () => { try { resolve(b ? JSON.parse(b) : {}); } catch (_) { resolve(null); } }); });

  async function handle(req, res) {
    const p = (req.url || '').split('?')[0];
    if (req.method === 'GET' && p === '/registry') { send(res, 200, { ok: true, system: 'cortex', components: components.map(c => ({ id: c.id, route: c.route, grammar: c.grammar, description: c.description, tags: c.tags })) }); return true; }
    if (req.method === 'GET' && p === '/handshake') { send(res, 200, handshake()); return true; }
    if (req.method === 'POST' && p === '/cli') {
      const body = await readBody(req);
      if (!body || typeof body.line !== 'string') { send(res, 400, { ok: false, error: 'POST /cli takes { "line": "<command>" }' }); return true; }
      const m = match(body.line);
      if (!m) { send(res, 404, { ok: false, error: `no Cortex command starts "${body.line}"`, commands: [...new Set(grammars.map(x => x.g))].sort() }); return true; }
      if (/[:*]/.test(m.component.route.path)) { send(res, 400, { ok: false, error: `${m.component.id} takes a value in its route (${m.component.route.path}); call the route itself`, route: m.component.route }); return true; }
      if (!call) { send(res, 200, { ok: true, component: m.component.id, route: m.component.route, called: false }); return true; }
      const r = await call(m.component.route.method, m.component.route.path, body.body || null);
      send(res, 200, { ok: r.status < 400, component: m.component.id, route: m.component.route, status: r.status, result: r.json });
      return true;
    }
    return false;
  }
  return { handle, handshake, match };
}

// one request to this door's own routes, the way any caller would make it (the CLI goes through the API, never around it)
function selfCall(port) {
  return (method, path, body) => new Promise((resolve) => {
    const data = body ? JSON.stringify(body) : null;
    const req = http.request({ hostname: '127.0.0.1', port, path, method, headers: data ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } : {}, timeout: 15000 }, (res) => {
      let b = ''; res.on('data', d => { b += d; }); res.on('end', () => { let json = null; try { json = JSON.parse(b); } catch (_) { json = b.slice(0, 2000); } resolve({ status: res.statusCode, json }); });
    });
    req.on('error', (e) => resolve({ status: 502, json: { ok: false, error: e.message } }));
    req.on('timeout', () => { req.destroy(); resolve({ status: 504, json: { ok: false, error: 'timed out' } }); });
    if (data) req.write(data); req.end();
  });
}

// the door goes in front of boot.js's routes on the one server: it answers its own, the rest fall through unchanged
function start({ port } = {}) {
  const boot = require('./boot.js');
  const p = port != null ? port : boot.PORT;
  const server = boot.server;
  const routes = server.listeners('request');
  server.removeAllListeners('request');
  let door = createDoor({ version: boot.VERSION, port: p });
  server.on('request', async (req, res) => {
    let handled = false;
    try { handled = await door.handle(req, res); } catch (e) { if (!res.headersSent) { res.writeHead(500, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ ok: false, error: `door: ${e.message}` })); } return; }
    if (!handled) for (const h of routes) h.call(server, req, res);
  });
  server.once('listening', () => { const a = server.address(); door = createDoor({ version: boot.VERSION, port: a.port, call: selfCall(a.port) }); console.log(`[cortex] door open on :${a.port} — registry, handshake and CLI from cortex/registry-components.js (${door.handshake().components} components)`); });
  boot.start({ port: p });
  return server;
}

if (require.main === module) start();

module.exports = { createDoor, registryHash, start, MODULE_ID: 'cortex.server', VERSION: '1.0.0' };
