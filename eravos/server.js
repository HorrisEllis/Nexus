'use strict';
/**
 * eravos/server.js — ERAVOS Sovereign System
 * UUID: nexus-eravos-server-v1-0000-2026-0627-jamesbrooks-001
 * Port: 3751
 *
 * ERAVOS is a sovereign system. Not a UI folder. A peer.
 * It has a kernel, runtime, mod registry, wire system,
 * audio engine, catalog, pack loader, and nexus bridge.
 * It registers with orchestrator. RAID routes compose/visualize/sequence
 * intents here. Guardian delivers built mods here.
 */

const http   = require('http');
const fs     = require('fs');
const path   = require('path');
const crypto = require('crypto');

// §WIRED — real, distinct config, not inline constants. See
// eravos/config.js's own header. Matches the established pattern.
const config = require('./config.js');
const PORT    = config.PORT;
const ROOT    = __dirname;
const UI_DIR  = path.join(ROOT, 'ui');
const DATA_DIR = config.DATA_DIR;

try { fs.mkdirSync(DATA_DIR, { recursive: true }); } catch(_) {}

const _cw = require('../lib/cortex-write')('eravos');
const SYSTEM_ID = 'eravos';
// §5.4 2026-08-14 — was hardcoded, coincidentally matching lib/version.js's
// services.eravos ('3.0.0') right now, but not reading from it — the next
// time that canonical value bumps, this would silently drift again exactly
// the way cortex/boot.js's VERSION already had. Fixed the same way.
const VERSION   = (() => { try { return require('../lib/version').services.eravos; } catch (_) { return '3.0.0'; } })();

// ── In-memory mod state ──────────────────────────────────────────────────
const _mounted    = new Map();   // id → mod descriptor
const _wires      = new Map();   // wireId → { from, to }
const _queue      = [];          // mod packs waiting for browser to install
const _sseClients = new Set();

// ── SSE broadcast ─────────────────────────────────────────────────────────────
function broadcast(type, payload) {
  const msg = `data: ${JSON.stringify({ type, payload, ts: Date.now() })}\n\n`;
  for (const res of _sseClients) {
    try { res.write(msg); } catch(_) { _sseClients.delete(res); }
  }
}

// ── Static file server ────────────────────────────────────────────────────────
const MIME = {
  '.html':'text/html', '.js':'application/javascript',
  '.css':'text/css', '.json':'application/json',
  '.png':'image/png', '.svg':'image/svg+xml',
  '.mp3':'audio/mpeg', '.wav':'audio/wav',
};

function serveStatic(res, filePath) {
  try {
    const data = fs.readFileSync(filePath);
    const ext  = path.extname(filePath).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(data);
  } catch(_) {
    res.writeHead(404); res.end('Not found');
  }
}

// ── HTTP handler ──────────────────────────────────────────────────────────────
function json(res, status, data) {
  res.writeHead(status, { 'Content-Type':'application/json',
    'Access-Control-Allow-Origin':'*', 'Access-Control-Allow-Methods':'*',
    'Access-Control-Allow-Headers':'Content-Type' });
  res.end(JSON.stringify(data));
}

async function readBody(req) {
  return new Promise((res, rej) => {
    let d = '';
    req.on('data', c => d += c);
    req.on('end', () => { try { res(JSON.parse(d)); } catch(_) { res({}); } });
    req.on('error', rej);
  });
}

const server = http.createServer(async (req, res) => {
  const url    = new URL(req.url, `http://localhost:${PORT}`);
  const method = req.method;
  const p      = url.pathname;

  // CORS preflight
  if (method === 'OPTIONS') { json(res, 200, {}); return; }

  // SSE — all eravos events
  if (p === '/events') {
    res.writeHead(200, {
      'Content-Type':'text/event-stream', 'Cache-Control':'no-cache',
      'Connection':'keep-alive', 'Access-Control-Allow-Origin':'*',
    });
    res.write(`data: ${JSON.stringify({ type:'eravos.connected', ts:Date.now() })}\n\n`);
    _sseClients.add(res);
    req.on('close', () => _sseClients.delete(res));
    return;
  }

  // Health
  if (p === '/health') {
    json(res, 200, {
      ok: true, system: SYSTEM_ID, version: VERSION, port: PORT,
      mods: _mounted.size, wires: _wires.size, queue: _queue.length,
      ts: Date.now(),
    });
    return;
  }

  // Contract
  if (p === '/contract') {
    json(res, 200, require('./registry-components'));
    return;
  }

  // Static UI files
  if (p === '/' || p.startsWith('/ui/') || p === '/index.html') {
    const rel  = p === '/' || p === '/index.html' ? 'index.html'
               : p.replace(/^\/ui\//, '');
    serveStatic(res, path.join(UI_DIR, rel));
    return;
  }

  // ── API routes ────────────────────────────────────────────────────────────

  // GET /api/mods
  if (method === 'GET' && p === '/api/mods') {
    json(res, 200, { ok:true, mods: [..._mounted.values()] });
    return;
  }

  // POST /api/mods — spawn
  if (method === 'POST' && p === '/api/mods') {
    const body = await readBody(req);
    if (!body.id) { json(res, 400, { ok:false, error:'id required' }); return; }
    const org = {
      uuid:      crypto.randomUUID(),
      id:        body.id,
      name:      body.name || body.id,
      category:  body.category || 'general',
      spawnedAt: Date.now(),
      config:    body.config || {},
    };
    _mounted.set(org.uuid, org);
    broadcast('eravos.mod.spawned', org);
    json(res, 200, { ok:true, mod: org });
    return;
  }

  // DELETE /api/mods/:uuid
  if (method === 'DELETE' && p.startsWith('/api/mods/')) {
    const uuid = p.split('/')[3];
    const org  = _mounted.get(uuid);
    if (!org) { json(res, 404, { ok:false, error:'not found' }); return; }
    _mounted.delete(uuid);
    broadcast('eravos.mod.removed', { uuid, id: org.id });
    json(res, 200, { ok:true, removed: uuid });
    return;
  }

  // GET /api/wires
  if (method === 'GET' && p === '/api/wires') {
    json(res, 200, { ok:true, wires: [..._wires.values()] });
    return;
  }

  // POST /api/wires — connect hookId → hookId
  if (method === 'POST' && p === '/api/wires') {
    const body = await readBody(req);
    if (!body.from || !body.to) {
      json(res, 400, { ok:false, error:'from and to hookIds required' }); return;
    }
    const wire = { uuid: crypto.randomUUID(), from: body.from, to: body.to, ts: Date.now() };
    _wires.set(wire.uuid, wire);
    broadcast('eravos.wire.connected', wire);
    json(res, 200, { ok:true, wire });
    return;
  }

  // DELETE /api/wires/:uuid
  if (method === 'DELETE' && p.startsWith('/api/wires/')) {
    const uuid = p.split('/')[3];
    _wires.delete(uuid);
    broadcast('eravos.wire.disconnected', { uuid });
    json(res, 200, { ok:true, removed: uuid });
    return;
  }

  // GET /api/catalog
  if (method === 'GET' && p === '/api/catalog') {
    // Read mod manifests from ui/mods/
    const orgsDir = path.join(UI_DIR, 'mods');
    let mods = [];
    try {
      mods = fs.readdirSync(orgsDir)
        .filter(d => fs.statSync(path.join(orgsDir, d)).isDirectory())
        .map(id => {
          try {
            const s = fs.readFileSync(path.join(orgsDir, id, 'schema', 'manifest.json'), 'utf8');
            return { id, ...JSON.parse(s) };
          } catch(_) { return { id, name: id }; }
        });
    } catch(_) {}
    json(res, 200, { ok:true, mods });
    return;
  }

  // POST /api/pack/install — receive mod zip from Guardian/NEXUS build
  if (method === 'POST' && p === '/api/pack/install') {
    const body = await readBody(req);
    _queue.push({ uuid: crypto.randomUUID(), ...body, ts: Date.now() });
    broadcast('eravos.pack.queued', body);
    json(res, 200, { ok:true, queued: _queue.length });
    return;
  }

  // GET /api/mod-queue — browser polls this to pick up built mods
  if (method === 'GET' && p === '/api/mod-queue') {
    const item = _queue.shift() || null;
    json(res, 200, { ok:true, item, remaining: _queue.length });
    return;
  }

  // Transport
  if (p.startsWith('/api/transport')) {
    if (method === 'GET') {
      json(res, 200, { ok:true, playing:false, bpm:120 }); return;
    }
    if (method === 'POST') {
      const action = p.split('/')[3];
      broadcast(`eravos.transport.${action}`, {});
      json(res, 200, { ok:true, action }); return;
    }
  }

  res.writeHead(404); res.end('Not found');
});

// ── Register with orchestrator ────────────────────────────────────────────────
// §FIX 2026-09-06 — PULSE_ALL_2026-09-06. Same real gap class as
// architect/service.js's own fix this session: a fully separate,
// hand-rolled http.request() to /api/register, retried only if the
// INITIAL attempt failed (setTimeout(register, 5000) on error) — never
// an ongoing heartbeat after a successful register. Replaced with the
// real, shared nexus-connect.js client (nc2.registerWithOrchestrator +
// nc2.startHeartbeat, which wraps createPulse() internally — confirmed
// directly in nexus-connect.js, not assumed).
const nc2 = require('../nexus/nexus-connect');
function register() {
  const components = require('./registry-components');
  nc2.registerWithOrchestrator(SYSTEM_ID, PORT, {
    version: VERSION, status: 'online', label: 'ERAVOS', color: '#a78bfa',
  }, components.components || []).catch(() => {});
  nc2.startHeartbeat(SYSTEM_ID, PORT);
}

server.listen(PORT, () => {
  console.log(`[eravos] :${PORT} — sovereign canvas system`);
  broadcast('eravos.booted', { version: VERSION, port: PORT });
  setTimeout(register, 1000);
});

module.exports = { server };
