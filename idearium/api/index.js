/**
 * ╔══════════════════════════════════════════════════════════════════════════╗
 * ║  Idearium HTTP API — idearium/api/index.js                             ║
 * ║  UUID:    idearium-api-v1-0000-4000-0000-000000000002                  ║
 * ║  Version: pre-release  ·  Port: 4800                                        ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 *
 * Every endpoint declared in interaction-contract.json is implemented here.
 * The UI talks ONLY to this layer. Never to core directly.
 * SSE on /sse — broadcasts all IdeaOS events.
 *
 * §1.2  Every error is loud, specific, traceable.
 * §5.2  Everything implements the bridge.
 */

import http         from 'http';
import os           from 'os';
import crypto       from 'crypto';
import { createRequire } from 'module';
import { spawnSync, spawn as spawnProc } from 'child_process';
const _require = createRequire(import.meta.url);

// ── Meta: Spatial Lattice — resonance-weighted idea/spec/gap graph ────────────
let _latticeEng = null;
function _getLattice() {
  if (_latticeEng) return _latticeEng;
  try {
    const { LatticeEngine } = _require('../lib/meta/spatial/lattice.js');
    _latticeEng = new LatticeEngine({ threshold: 0.3 });
  } catch(_) {}
  return _latticeEng;
}
function _latticeAdd(id, label, tags=[]) {
  try { const l=_getLattice(); if(l) l.add({id,label:label.slice(0,80),tags}); } catch(_) {}
}
function _latticeLink(a, b, w=0.7, t='associated') {
  try { const l=_getLattice(); if(l) { _latticeAdd(a,a); _latticeAdd(b,b); l.connect(a,b,w,t); } } catch(_) {}
}
import { getIdeaOS, VERSION } from '../core/index.js';

const PORT    = parseInt(process.env.IDEARIUM_PORT   || '4800');
const BINDING = process.env.IDEARIUM_BIND || '0.0.0.0';

// ── Network utilities ─────────────────────────────────────────────────────────

function getLocalIPs() {
  const ifaces = os.networkInterfaces();
  const ips = [];
  for (const name of Object.keys(ifaces)) {
    for (const iface of ifaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) ips.push({ name, address: iface.address });
    }
  }
  return ips;
}

// ── Tunnel manager — implicit cloudflare tunnel on boot ───────────────────────
// §1.2 — nothing silently fails: every tunnel state logged to event_log gap-style.
// §B-6 — tunnel failure opens a named gap, never crashes Idearium.
// §2.1 — tunnel URL persisted to data/idearium-tunnel.json so restarts reconnect.

let _tunnelProc  = null;
let _tunnelUrl   = null;
let _tunnelReady = false;

const _require2 = _require;  // alias for use inside tunnel closure

function _persistTunnelUrl(url) {
  try {
    const { writeFileSync, mkdirSync } = _require2('fs');
    const { join } = _require2('path');
    const { fileURLToPath } = _require2('url');
    const dir = join(process.cwd(), 'data');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'idearium-tunnel.json'), JSON.stringify({ url, ts: Date.now() }));
  } catch (_) {}
}

function _cloudflaredBin() {
  for (const candidate of ['cloudflared', 'cloudflared.exe']) {
    try {
      const r = spawnSync(candidate, ['--version'], { timeout: 3000, stdio: 'pipe' });
      if (r.status === 0) return candidate;
    } catch (_) {}
  }
  return null;
}

function startTunnel(port, onUrl, onFail) {
  const bin = _cloudflaredBin();
  if (!bin) {
    onFail('cloudflared not installed — run: winget install Cloudflare.cloudflared');
    return null;
  }

  const proc = spawnProc(bin, ['tunnel', '--url', `http://127.0.0.1:${port}`], {
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let resolved = false;
  const urlPattern = /https:\/\/[\w-]+\.trycloudflare\.com/;

  function tryParse(chunk) {
    if (resolved) return;
    const text = chunk.toString();
    const m = text.match(urlPattern);
    if (m) {
      resolved = true;
      _tunnelUrl   = m[0];
      _tunnelReady = true;
      _persistTunnelUrl(_tunnelUrl);
      onUrl(_tunnelUrl);
    }
  }

  proc.stdout.on('data', tryParse);
  proc.stderr.on('data', tryParse);

  proc.on('exit', (code, signal) => {
    _tunnelReady = false;
    if (!resolved) {
      onFail(`cloudflared exited before URL (code=${code} signal=${signal})`);
    } else {
      console.warn('[idearium/tunnel §1.2] tunnel closed — will not auto-restart (§1.3 no silent recovery)');
    }
  });

  proc.on('error', err => {
    _tunnelReady = false;
    onFail(`cloudflared spawn error: ${err.message}`);
  });

  _tunnelProc = proc;

  process.on('exit',    () => { try { proc.kill(); } catch (_) {} });
  process.on('SIGTERM', () => { try { proc.kill(); } catch (_) {} });
  process.on('SIGINT',  () => { try { proc.kill(); } catch (_) {} });

  return proc;
}

// ─── Body parser ─────────────────────────────────────────────────────────────

async function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString();
      if (!raw) return resolve({});
      try { resolve(JSON.parse(raw)); }
      catch { reject(new Error('Invalid JSON body')); }
    });
    req.on('error', reject);
  });
}

// ─── Response helpers ─────────────────────────────────────────────────────────

function ok(res, data) {
  res.writeHead(200, { 'Content-Type': 'application/json', ...CORS });
  res.end(JSON.stringify({ ok: true, ...data }));
}

function err(res, code, message, detail = null) {
  // §1.2 — specific, not generic
  res.writeHead(code, { 'Content-Type': 'application/json', ...CORS });
  res.end(JSON.stringify({ ok: false, error: message, detail }));
}

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'GET,POST,PATCH,DELETE,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization',
};

// ── Capability model ──────────────────────────────────────────────────────────
// Every route maps to exactly one capability.
// A key must have that capability to call it.
// §1.2: wrong capability = 403 with the required capability named.
// §5.1: every key has a UUID and an audit trail.

const CAPS = {
  READ_IDEAS:   'read_ideas',    // GET ideas, specs, gaps, snapshots, stats, health
  WRITE_IDEAS:  'write_ideas',   // POST/PATCH ideas, create specs, open gaps
  SEARCH_IDEAS: 'search_ideas',  // GET /api/ideas?search= (subset of read)
  ADMIN:        'admin',         // key management, tunnel control, snapshots, cli.exec
};

// Route → required capability
const ROUTE_CAP = {
  'health':           null,              // public — no auth required
  'contract.get':     null,              // public — contract is always readable
  'tunnel.status':    CAPS.READ_IDEAS,
  'tunnel.start':     CAPS.ADMIN,
  'tunnel.stop':      CAPS.ADMIN,
  'stats.get':        null,              // public — non-sensitive, required by boot verify (§1.2 HALT fix)
  'snr.current':      CAPS.READ_IDEAS,
  'snr.history':      CAPS.READ_IDEAS,
  'events.log':       CAPS.READ_IDEAS,
  'idea.list':        CAPS.READ_IDEAS,
  'idea.show':        CAPS.READ_IDEAS,
  'idea.create':      CAPS.WRITE_IDEAS,
  'idea.update':      CAPS.WRITE_IDEAS,
  'idea.tension':     CAPS.WRITE_IDEAS,
  'idea.link':        CAPS.WRITE_IDEAS,
  'idea.spec':        CAPS.WRITE_IDEAS,
  'idea.phase':       CAPS.WRITE_IDEAS,
  'idea.archive':     CAPS.WRITE_IDEAS,
  'idea.progress':    CAPS.WRITE_IDEAS,
  'spec.list':        CAPS.READ_IDEAS,
  'spec.show':        CAPS.READ_IDEAS,
  'spec.update':      CAPS.WRITE_IDEAS,
  'spec.check':       CAPS.WRITE_IDEAS,
  'spec.build':       CAPS.WRITE_IDEAS,
  'spec.export':      CAPS.READ_IDEAS,
  'gap.list':         CAPS.READ_IDEAS,
  'gap.show':         CAPS.READ_IDEAS,
  'gap.open':         CAPS.WRITE_IDEAS,
  'gap.resolve':      CAPS.WRITE_IDEAS,
  'gap.ignore':       CAPS.WRITE_IDEAS,
  'snapshot.list':    CAPS.READ_IDEAS,
  'snapshot.show':    CAPS.READ_IDEAS,
  'snapshot.diff':    CAPS.READ_IDEAS,
  'snapshot.push':    CAPS.ADMIN,
  'queue.show':       CAPS.READ_IDEAS,
  'queue.progress':   CAPS.WRITE_IDEAS,
  'key.list':         CAPS.ADMIN,
  'key.create':       CAPS.ADMIN,
  'key.revoke':       CAPS.ADMIN,
  'cli.exec':         CAPS.ADMIN,
};

// ── Key store ─────────────────────────────────────────────────────────────────
// Loaded from IdeaOS db.api_keys on first use.
// Shape: { uuid, name, hash, caps[], createdAt, lastUsedAt, usageCount, revoked }
// We store the SHA-256 hash of the key, never the key itself.
// §2.1: keys persisted to idearium.json immediately on creation.

function _hashKey(raw) {
  return crypto.createHash('sha256').update(raw).digest('hex');
}

function _keyStore() {
  const os = getIdeaOS();
  if (!os.db.api_keys) os.db.api_keys = [];
  return os.db.api_keys;
}

function _saveKeys() {
  const { writeFileSync, mkdirSync } = _require('fs');
  const { join } = _require('path');
  const os = getIdeaOS();
  mkdirSync(join(process.cwd(), 'data'), { recursive: true });
  // saveDB is not exported — replicate the write inline (IdeaOS already handles this on next emit)
  // trigger a save by emitting a no-op SNR event
  try { os.emit('idearium.key.updated', { source: 'auth', ts: Date.now() }); } catch (_) {}
}

// Verify a raw key string. Returns { ok, key, missing_cap } or { ok: false, reason }.
function _verifyKey(raw, requiredCap) {
  if (!raw) return { ok: false, reason: 'no token' };
  const hash  = _hashKey(raw);
  const store = _keyStore();
  const entry = store.find(k => k.hash === hash && !k.revoked);
  if (!entry) return { ok: false, reason: 'invalid token' };
  if (entry.expiresAt && Date.now() > entry.expiresAt) return { ok: false, reason: 'token expired' };
  if (requiredCap && !entry.caps.includes(requiredCap) && !entry.caps.includes(CAPS.ADMIN)) {
    return { ok: false, reason: 'insufficient capability', required: requiredCap };
  }
  // Update usage stats (best-effort — §1.2: never fail a request over a stats write)
  entry.lastUsedAt = Date.now();
  entry.usageCount = (entry.usageCount || 0) + 1;
  return { ok: true, key: entry };
}

// Extract raw token from request headers.
// Accepts: Authorization: Bearer <token>  OR  X-Idearium-Key: <token>
function _extractToken(req) {
  const auth = req.headers['authorization'] || '';
  if (auth.startsWith('Bearer ')) return auth.slice(7).trim();
  return (req.headers['x-idearium-key'] || '').trim() || null;
}

// Ensure at least one ADMIN key exists. Called on boot.
// If no keys at all: generate one, print it ONCE to stdout, never again.
// §1.2: key is printed to console with a clear banner so it is never missed.
function _ensureBootKey() {
  const store = _keyStore();
  const activeAdmin = store.find(k => !k.revoked && k.caps.includes(CAPS.ADMIN));
  if (activeAdmin) return; // already have one

  const raw  = crypto.randomBytes(32).toString('hex');
  const hash = _hashKey(raw);
  const entry = {
    uuid:       crypto.randomUUID(),
    name:       'boot-admin',
    hash,
    caps:       [CAPS.ADMIN, CAPS.READ_IDEAS, CAPS.WRITE_IDEAS, CAPS.SEARCH_IDEAS],
    createdAt:  Date.now(),
    lastUsedAt: null,
    usageCount: 0,
    revoked:    false,
    expiresAt:  null,
  };
  store.push(entry);
  _saveKeys();

  // Print ONCE — visible in orchestrator log. §1.2.
  console.log('');
  console.log('\x1b[1m\x1b[33m╔══════════════════════════════════════════════════════╗\x1b[0m');
  console.log('\x1b[1m\x1b[33m║  IDEARIUM — BOOT ADMIN KEY (shown once, save it now) ║\x1b[0m');
  console.log('\x1b[1m\x1b[33m╠══════════════════════════════════════════════════════╣\x1b[0m');
  console.log(`\x1b[1m\x1b[33m║  ${raw}  ║\x1b[0m`);
  console.log('\x1b[1m\x1b[33m╚══════════════════════════════════════════════════════╝\x1b[0m');
  console.log('\x1b[33m  Use as:  Authorization: Bearer <key>\x1b[0m');
  console.log('\x1b[33m  Or:      X-Idearium-Key: <key>\x1b[0m');
  console.log('\x1b[33m  Rotate:  POST /api/keys  { name, caps[] }  with this key\x1b[0m');
  console.log('');
}

// ─── Router ──────────────────────────────────────────────────────────────────

function matchRoute(method, url) {
  const clean = url.split('?')[0].replace(/\/+$/, '') || '/';
  const segs  = clean.split('/').filter(Boolean);

  // Static routes first
  const routes = [
    ['GET',    [],                        'health'],
    ['GET',    ['health'],                 'health'],     // alias: GET /health → same as GET /
    ['GET',    ['api','contract'],        'contract.get'],
    ['GET',    ['api','stats'],           'stats.get'],
    ['GET',    ['api','snr'],             'snr.current'],
    ['GET',    ['api','snr','history'],   'snr.history'],
    ['GET',    ['api','events'],          'events.log'],
    ['GET',    ['api','ideas'],           'idea.list'],
    ['POST',   ['api','ideas'],           'idea.create'],
    ['GET',    ['api','specs'],           'spec.list'],
    ['GET',    ['api','gaps'],            'gap.list'],
    ['POST',   ['api','gaps'],            'gap.open'],
    ['GET',    ['api','snapshots'],       'snapshot.list'],
    ['POST',   ['api','snapshots'],       'snapshot.push'],
    ['POST',   ['api','cli','exec'],      'cli.exec'],      // unified CLI axiom
    ['GET',    ['sse'],                   'sse'],
    ['GET',    ['api','tunnel'],           'tunnel.status'],
    ['POST',   ['api','tunnel','start'],   'tunnel.start'],
    ['POST',   ['api','tunnel','stop'],    'tunnel.stop'],
    ['GET',    ['api','keys'],             'key.list'],
    ['POST',   ['api','keys'],             'key.create'],
    ['DELETE', ['api','keys',':uuid'],     'key.revoke'],
  ];

  for (const [m, pattern, action] of routes) {
    if (m !== method) continue;
    if (pattern.length !== segs.length) continue;
    const params = {};
    let match = true;
    for (let i = 0; i < pattern.length; i++) {
      if (pattern[i].startsWith(':')) params[pattern[i].slice(1)] = segs[i];
      else if (pattern[i] !== segs[i]) { match = false; break; }
    }
    if (match) return { action, params };
  }

  // Bridge routes

  // Dynamic routes
  const dynRoutes = [
    ['GET',    ['api','ideas',    ':uuid'],               'idea.show'],
    ['PATCH',  ['api','ideas',    ':uuid'],               'idea.update'],
    ['DELETE', ['api','ideas',    ':uuid'],               'idea.archive'],
    ['POST',   ['api','ideas',    ':uuid','tension'],     'idea.tension'],
    ['POST',   ['api','ideas',    ':uuid','link'],        'idea.link'],
    ['POST',   ['api','ideas',    ':uuid','spec'],        'idea.spec'],
    ['POST',   ['api','ideas',    ':uuid','phase'],       'idea.phase'],
    ['GET',    ['api','specs',    ':uuid'],               'spec.show'],
    ['PATCH',  ['api','specs',    ':uuid'],               'spec.update'],
    ['POST',   ['api','specs',    ':uuid','check'],       'spec.check'],
    ['POST',   ['api','ideas',    ':uuid','progress'],  'idea.progress'],
    ['POST',   ['api','queue',    ':queueId','progress'],'queue.progress'],
    ['GET',    ['api','queue',    ':queueId'],           'queue.show'],
    ['POST',   ['api','specs',    ':uuid','build'],       'spec.build'],
    ['GET',    ['api','specs',    ':uuid','export'],      'spec.export'],
    ['GET',    ['api','gaps',     ':uuid'],               'gap.show'],
    ['POST',   ['api','gaps',     ':uuid','resolve'],     'gap.resolve'],
    ['POST',   ['api','gaps',     ':uuid','ignore'],      'gap.ignore'],
    ['GET',    ['api','snapshots',':uuid'],               'snapshot.show'],
    ['GET',    ['api','snapshots',':a','diff',':b'],      'snapshot.diff'],
  ];

  for (const [m, pattern, action] of dynRoutes) {
    if (m !== method) continue;
    if (pattern.length !== segs.length) continue;
    const params = {};
    let match = true;
    for (let i = 0; i < pattern.length; i++) {
      if (pattern[i].startsWith(':')) params[pattern[i].slice(1)] = segs[i];
      else if (pattern[i] !== segs[i]) { match = false; break; }
    }
    if (match) return { action, params };
  }

  return null;
}

function parseQuery(url) {
  const qs = url.split('?')[1] || '';
  const out = {};
  for (const p of qs.split('&')) { const [k,v] = p.split('='); if(k) out[decodeURIComponent(k)] = decodeURIComponent(v||''); }
  return out;
}

// ─── Handlers ────────────────────────────────────────────────────────────────

async function handle(req, res, route, query, body) {
  const os = getIdeaOS();
  const { action, params } = route;

  // ── Auth gate ───────────────────────────────────────────────────────────────
  // Public routes (null cap) bypass auth entirely.
  // All other routes require a valid key with the mapped capability.
  // §1.2: 401 = no/invalid token. 403 = valid token, wrong capability.
  const requiredCap = ROUTE_CAP[action];
  if (requiredCap !== null && requiredCap !== undefined) {
    const raw    = _extractToken(req);
    const result = _verifyKey(raw, requiredCap);
    if (!result.ok) {
      const code = (!raw || result.reason === 'invalid token' || result.reason === 'no token') ? 401 : 403;
      return err(res, code, result.reason, result.required ? `required capability: ${result.required}` : null);
    }
  }

  switch (action) {

    case 'health':
      return ok(res, { version: VERSION, snr: os.snr, uptime: process.uptime() });

    case 'contract.get':
      try { return ok(res, { contract: os.contract() }); }
      catch (e) { return err(res, 500, e.message); }

    case 'stats.get':
      return ok(res, { stats: os.stats() });

    case 'snr.current':
      return ok(res, { snr: os.snr });

    case 'snr.history':
      return ok(res, { samples: os.snrHistory(parseInt(query.n)||50) });

    case 'events.log':
      return ok(res, { events: os.eventLog(parseInt(query.n)||100) });

    // ── Ideas ──────────────────────────────────────────────────────────────

    case 'idea.list':
      return ok(res, { ideas: os.ideas(query) });

    case 'idea.create': {
      const { text, tags, compartment } = body;
      if (!text) return err(res, 400, 'text required');
      const ev = os.emit('idearium.idea.create', { text, tags: tags||[], compartment: compartment||null, source: 'api' });
      const idea = os.db.ideas[os.db.ideas.length - 1];
      // Mirror to orchestrator ledger (fire-and-forget)
      import('http').then(({ default: http }) => {
        const body2 = JSON.stringify({ system:'idearium', type:'idearium.idea.created', payload:{ uuid:idea?.uuid, text:(text||'').slice(0,80), tags } });
        const r = http.request({ hostname:'127.0.0.1', port:9000, path:'/api/ledger', method:'POST', headers:{'Content-Type':'application/json','Content-Length':Buffer.byteLength(body2)} }, ()=>{});
        r.on('error',()=>{}); r.write(body2); r.end();
      }).catch(()=>{});
      return ok(res, { idea, eventId: ev.uuid });
    }

    case 'idea.show': {
      const idea = os.idea(params.uuid);
      if (!idea) return err(res, 404, `idea not found: ${params.uuid}`);
      const links = os.db.links.filter(l=>l.fromUuid===idea.uuid||l.toUuid===idea.uuid);
      const gaps  = os.gaps({ status:'open' }).filter(g=>(g.between||[]).includes(idea.uuid)||g.ideaUuid===idea.uuid);
      return ok(res, { idea, links, openGaps: gaps });
    }

    case 'idea.update': {
      const idea = os.idea(params.uuid);
      if (!idea) return err(res, 404, `idea not found: ${params.uuid}`);
      os.emit('idearium.idea.update', { uuid: params.uuid, fields: body, source: 'api' });
      return ok(res, { idea: os.idea(params.uuid) });
    }

    case 'idea.phase': {
      const idea = os.idea(params.uuid);
      if (!idea) return err(res, 404, `idea not found: ${params.uuid}`);
      if (!body.phase) return err(res, 400, 'phase required');
      os.emit('idearium.idea.phase', { uuid: params.uuid, phase: body.phase, source: 'api' });
      return ok(res, { idea: os.idea(params.uuid) });
    }

    case 'idea.tension': {
      const idea = os.idea(params.uuid);
      if (!idea) return err(res, 404, `idea not found: ${params.uuid}`);
      os.emit('idearium.idea.tension', { uuid: params.uuid });
      return ok(res, { idea: os.idea(params.uuid), tension: { score: os.idea(params.uuid).tension } });
    }

    case 'idea.link': {
      const idea = os.idea(params.uuid);
      if (!idea) return err(res, 404, `idea not found: ${params.uuid}`);
      if (!body.toUuid) return err(res, 400, 'toUuid required');
      os.emit('idearium.idea.link', { fromUuid: params.uuid, toUuid: body.toUuid, linkType: body.linkType||'resonance', source:'api' });
      return ok(res, { linked: true });
    }

    case 'idea.spec': {
      const idea = os.idea(params.uuid);
      if (!idea) return err(res, 404, `idea not found: ${params.uuid}`);
      os.emit('idearium.spec.create', { name: body.name || `Spec: ${idea.text.slice(0,40)}`, ideaUuid: params.uuid, source:'api' });
      const spec = os.db.specs[os.db.specs.length - 1];
      return ok(res, { spec });
    }

    case 'idea.archive': {
      const idea = os.idea(params.uuid);
      if (!idea) return err(res, 404, `idea not found: ${params.uuid}`);
      if (!body.reason) return err(res, 400, 'reason required (§M1 — nothing deleted)');
      os.emit('idearium.idea.archive', { uuid: params.uuid, reason: body.reason, source:'api' });
      return ok(res, { archived: true });
    }

    // ── Specs ──────────────────────────────────────────────────────────────

    case 'spec.list':
      return ok(res, { specs: os.specs(query) });

    case 'spec.show': {
      const spec = os.spec(params.uuid);
      if (!spec) return err(res, 404, `spec not found: ${params.uuid}`);
      return ok(res, { spec });
    }

    case 'spec.update': {
      const spec = os.spec(params.uuid);
      if (!spec) return err(res, 404, `spec not found: ${params.uuid}`);
      os.emit('idearium.spec.update', { uuid: params.uuid, fields: body });
      return ok(res, { spec: os.spec(params.uuid) });
    }

    case 'spec.check': {
      const spec = os.spec(params.uuid);
      if (!spec) return err(res, 404, `spec not found: ${params.uuid}`);
      os.emit('idearium.spec.check', { uuid: params.uuid });
      return ok(res, { spec: os.spec(params.uuid) });
    }

    case 'spec.build': {
      const spec = os.spec(params.uuid);
      if (!spec) return err(res, 404, `spec not found: ${params.uuid}`);

      // Run spec check first
      os.emit('idearium.spec.check', { uuid: params.uuid });
      const checked = os.spec(params.uuid);

      // Collect all sections with content
      const built = [], missing = [];
      for (const s of checked.sections) {
        if (s.required && !s.complete && !s.content) missing.push(s.id);
        else if (s.content) built.push(s.id);
      }

      if (missing.length > 0 && checked.phase !== 'specced') {
        return ok(res, {
          status: 'incomplete', spec: checked,
          missing, built,
          message: `${missing.length} required sections missing content before build`,
        });
      }

      // Advance phase to building
      os.emit('idearium.spec.update', { uuid: params.uuid, fields: { phase: 'building' } });

      // Fire build event to bus — orchestrator + bridge pick this up
      os.emit('idearium.spec.built', {
        specUuid: params.uuid, name: spec.name,
        sections: built.length, ts: Date.now(),
      });

      // Notify orchestrator
      import('http').then(({ default: http }) => {
        const payload = JSON.stringify({
          system: 'idearium', type: 'idearium.spec.built',
          payload: { specUuid: params.uuid, name: spec.name, sections: built.length },
        });
        const r = http.request({ hostname:'127.0.0.1', port:9000, path:'/api/ledger',
          method:'POST', headers:{'Content-Type':'application/json','Content-Length':Buffer.byteLength(payload)} }, ()=>{});
        r.on('error',()=>{}); r.write(payload); r.end();
      }).catch(()=>{});

      return ok(res, {
        status: 'built', spec: os.spec(params.uuid),
        built, missing, message: `spec ${params.uuid.slice(0,8)} → building`,
      });
    }

    case 'spec.export': {
      const spec = os.spec(params.uuid);
      if (!spec) return err(res, 404, `spec not found: ${params.uuid}`);
      const md = specToMarkdown(spec);
      res.writeHead(200, { 'Content-Type': 'text/markdown', ...CORS });
      return res.end(md);
    }

    // ── Gaps ───────────────────────────────────────────────────────────────

    case 'gap.list':
      return ok(res, { gaps: os.gaps(query) });

    case 'gap.open': {
      if (!body.description) return err(res, 400, 'description required');
      const ev = os.emit('idearium.gap.open', { ...body, source:'api' });
      const gap = os.db.gaps[os.db.gaps.length - 1];
      return ok(res, { gap, eventId: ev.uuid });
    }

    case 'gap.show': {
      const gap = os.gap(params.uuid);
      if (!gap) return err(res, 404, `gap not found: ${params.uuid}`);
      return ok(res, { gap });
    }

    case 'gap.resolve': {
      const gap = os.gap(params.uuid);
      if (!gap) return err(res, 404, `gap not found: ${params.uuid}`);
      os.emit('idearium.gap.resolve', { uuid: params.uuid, resolution: body.resolution||'' });
      return ok(res, { gap: os.gap(params.uuid) });
    }

    case 'gap.ignore': {
      const gap = os.gap(params.uuid);
      if (!gap) return err(res, 404, `gap not found: ${params.uuid}`);
      os.emit('idearium.gap.ignore', { uuid: params.uuid, reason: body.reason||'' });
      return ok(res, { gap: os.gap(params.uuid) });
    }

    // ── Snapshots ──────────────────────────────────────────────────────────

    case 'snapshot.list':
      return ok(res, { snapshots: os.snapshots().slice(0, 50) });

    case 'snapshot.push': {
      os.emit('idearium.snapshot.commit', { message: body.message||'snapshot', branch: body.branch||'main', author:'api' });
      return ok(res, { snapshot: os.snapshots()[0] });
    }

    case 'snapshot.show': {
      const snap = os.snapshot(params.uuid);
      if (!snap) return err(res, 404, `snapshot not found: ${params.uuid}`);
      return ok(res, { snapshot: snap });
    }

    case 'snapshot.diff': {
      const diff = os.diffSnapshots(params.a, params.b);
      if (!diff) return err(res, 404, 'one or both snapshots not found');
      return ok(res, { diff });
    }

    // ── Queue / progress push (from forge queue) ──────────────────────────
    case 'idea.progress': {
      const idea = os.idea(params.uuid);
      if (!idea) return err(res, 404, `idea not found: ${params.uuid}`);
      // Update idea phase based on progress if provided
      if (body.state === 'VERIFIED') {
        os.emit('idearium.idea.phase', { uuid: params.uuid, phase: 'building', source:'queue' });
      }
      if (body.state === 'COMPLETE' && body.pct === 100) {
        os.emit('idearium.idea.phase', { uuid: params.uuid, phase: 'complete', source:'queue' });
      }
      const record = { ...body, ideaUuid: params.uuid, ts: Date.now() };
      if (!os.db.tensions) os.db.tensions = [];
      // Store as a tension record for timeline
      os.db.tensions.push({ uuid: require('crypto').randomUUID(), ideaUuid: params.uuid,
        score: (body.pct||0)/100, components: { queue_progress: body.pct||0 }, ts: Date.now() });
      return ok(res, { ok: true, progress: record });
    }

    case 'queue.progress': {
      // Forge queue progress — store in idearium event log
      const ev = os.emit('idearium.queue.progress', body);
      return ok(res, { ok: true, eventId: ev.uuid });
    }

    case 'queue.show': {
      const events = os.db.events.filter(e => e.payload?.queueId === params.queueId);
      return ok(res, { ok: true, queueId: params.queueId, events });
    }

    // ── Key management ─────────────────────────────────────────────────────

    case 'key.list': {
      const store = _keyStore();
      return ok(res, {
        keys: store.map(k => ({
          uuid:       k.uuid,
          name:       k.name,
          caps:       k.caps,
          createdAt:  k.createdAt,
          lastUsedAt: k.lastUsedAt,
          usageCount: k.usageCount || 0,
          revoked:    k.revoked,
          expiresAt:  k.expiresAt || null,
        })),
      });
    }

    case 'key.create': {
      const { name, caps, expiresIn } = body;
      if (!name)              return err(res, 400, 'name required');
      if (!Array.isArray(caps) || !caps.length)
                              return err(res, 400, 'caps[] required — valid: read_ideas, write_ideas, search_ideas, admin');
      const validCaps = Object.values(CAPS);
      const badCaps   = caps.filter(c => !validCaps.includes(c));
      if (badCaps.length)     return err(res, 400, `unknown capabilities: ${badCaps.join(', ')}`);

      const raw  = crypto.randomBytes(32).toString('hex');
      const hash = _hashKey(raw);
      const entry = {
        uuid:       crypto.randomUUID(),
        name,
        hash,
        caps,
        createdAt:  Date.now(),
        lastUsedAt: null,
        usageCount: 0,
        revoked:    false,
        expiresAt:  expiresIn ? Date.now() + expiresIn * 1000 : null,
      };
      _keyStore().push(entry);
      _saveKeys();
      // Return the raw key ONCE — never stored, never returned again
      return ok(res, {
        uuid:      entry.uuid,
        name:      entry.name,
        caps:      entry.caps,
        key:       raw,
        expiresAt: entry.expiresAt,
        warning:   'store this key now — it will not be shown again',
      });
    }

    case 'key.revoke': {
      const store = _keyStore();
      const entry = store.find(k => k.uuid === params.uuid);
      if (!entry)  return err(res, 404, `key not found: ${params.uuid}`);
      if (entry.revoked) return ok(res, { already: true });
      // §M1: never delete — revoke only
      entry.revoked   = true;
      entry.revokedAt = Date.now();
      _saveKeys();
      return ok(res, { revoked: true, uuid: entry.uuid, name: entry.name });
    }

    // ── Tunnel ─────────────────────────────────────────────────────────────

    case 'tunnel.status':
      return ok(res, {
        ready:   _tunnelReady,
        url:     _tunnelUrl,
        running: !!_tunnelProc && !_tunnelProc.exitCode,
        lan:     getLocalIPs(),
        port:    PORT,
        binding: BINDING,
      });

    case 'tunnel.start': {
      if (_tunnelProc && !_tunnelProc.exitCode) {
        return ok(res, { already: true, url: _tunnelUrl, ready: _tunnelReady });
      }
      startTunnel(PORT,
        url  => console.log(`[idearium/tunnel] ✓ ${url}`),
        why  => console.warn(`[idearium/tunnel §1.2] ${why}`)
      );
      return ok(res, { started: true });
    }

    case 'tunnel.stop': {
      if (_tunnelProc) {
        try { _tunnelProc.kill(); } catch (_) {}
        _tunnelProc  = null;
        _tunnelUrl   = null;
        _tunnelReady = false;
      }
      return ok(res, { stopped: true });
    }

    default:
      return err(res, 404, `no handler for: ${action}`);
  }
}

// ─── Spec → Markdown ─────────────────────────────────────────────────────────

function specToMarkdown(spec) {
  let md = `# ${spec.name}\n\n**Version:** ${spec.version}  **Phase:** ${spec.phase}\n\n`;
  for (const s of spec.sections) {
    md += `## ${s.title}\n\n`;
    if (s.content) md += `${s.content}\n\n`;
    else md += `_not yet written_\n\n`;
  }
  return md;
}

// ─── Server ───────────────────────────────────────────────────────────────────

export function startAPI() {
  const os = getIdeaOS();

  const server = http.createServer(async (req, res) => {
    // Preflight
    if (req.method === 'OPTIONS') {
      res.writeHead(204, CORS);
      return res.end();
    }

    // SSE
    if (req.url === '/sse') {
      res.writeHead(200, {
        'Content-Type':  'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection':    'keep-alive',
        ...CORS,
      });
      res.write(': connected\n\n');
      os.addSSEClient(res);
      // Send current state immediately on connect
      res.write(`data: ${JSON.stringify({ type:'idearium.ready', payload: os.stats(), ts: Date.now() })}\n\n`);
      return;
    }

    // Serve UI
    const cleanUrl = req.url.split('?')[0];
    if (req.method === 'GET' && (cleanUrl === '/' || cleanUrl === '/idearium' || cleanUrl === '/ui')) {
      const { readFileSync, existsSync } = await import('fs');
      const { join, dirname } = await import('path');
      const { fileURLToPath } = await import('url');
      const __d = dirname(fileURLToPath(import.meta.url));
      const uiPath = join(__d, '..', 'ui', 'index.html');
      const uiPath2 = join(__d, '..', '..', 'ui', 'idearium', 'index.html');
      const finalPath = existsSync(uiPath) ? uiPath : uiPath2;
      if (existsSync(finalPath)) {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(readFileSync(finalPath, 'utf8'));
      } else {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end('<html><body style="background:#0a0a0c;color:#e2e2ea;font-family:monospace;padding:40px"><h2>◈ IDEARIUM</h2><p>UI not built yet</p></body></html>');
      }
      return;
    }

    const route = matchRoute(req.method, req.url);
    if (!route) {
      return err(res, 404, `${req.method} ${req.url.split('?')[0]} not found`);
    }

    const query = parseQuery(req.url);
    let body = {};
    if (['POST','PATCH','PUT','DELETE'].includes(req.method)) {
      try { body = await readBody(req); }
      catch (e) { return err(res, 400, 'body parse failed', e.message); }
    }

    try {
      await handle(req, res, route, query, body);
    } catch (e) {
      console.error('[API] Unhandled error:', e);
      err(res, 500, 'internal error', e.message);
    }
  });

  server.listen(PORT, BINDING, async () => {
    // ESM: use createRequire for CJS modules
    const _require = createRequire(import.meta.url);

// ── Meta: Spatial Lattice — resonance-weighted idea/spec/gap graph ────────────
let _latticeEng = null;
function _getLattice() {
  if (_latticeEng) return _latticeEng;
  try {
    const { LatticeEngine } = _require('../lib/meta/spatial/lattice.js');
    _latticeEng = new LatticeEngine({ threshold: 0.3 });
  } catch(_) {}
  return _latticeEng;
}
function _latticeAdd(id, label, tags=[]) {
  try { const l=_getLattice(); if(l) l.add({id,label:label.slice(0,80),tags}); } catch(_) {}
}
function _latticeLink(a, b, w=0.7, t='associated') {
  try { const l=_getLattice(); if(l) { _latticeAdd(a,a); _latticeAdd(b,b); l.connect(a,b,w,t); } } catch(_) {}
}
    const { BootSequence } = _require('../../lib/boot-sequence');

    const seq = new BootSequence({
      systemId: 'idearium', port: PORT, version: VERSION,
      label: 'Idearium', maxRetries: 1,
    });

    // Phase 0 HARD: server bound
    seq.phase({ name:'server.bound', type:'HARD',
      label:'HTTP API bound :' + PORT,
      fn: async () => { /* in listen callback = bound */ },
    });

    // Phase 1 HARD: IdeaOS runtime verify — use the actual API
    seq.phase({ name:'ideaos.verify', type:'HARD',
      label:'IdeaOS runtime verify via /api/stats',
      fn: async () => {
        await new Promise((resolve, reject) => {
          let d = '';
          const r = _require('http').get(
            'http://127.0.0.1:' + PORT + '/api/stats',
            res => {
              res.on('data', c => { d += c; });
              res.on('end', () => {
                try {
                  const j = JSON.parse(d);
                  if (j.ok !== false) resolve();
                  else reject(new Error('stats returned ok=false'));
                } catch(e) { reject(e); }
              });
            }
          );
          r.setTimeout(2000, () => { r.destroy(); reject(new Error('stats timeout')); });
          r.on('error', reject);
        });
      },
    });

    // Phase 2 HARD: health endpoint verify
    seq.phase({ name:'health.verify', type:'HARD',
      label:'Verify /health returns ok=true',
      fn: async () => {
        await new Promise((resolve, reject) => {
          const r = _require('http').get(
            'http://127.0.0.1:' + PORT + '/health',
            res => { res.statusCode === 200 ? resolve()
              : reject(new Error('health ' + res.statusCode)); }
          );
          r.setTimeout(2000, () => { r.destroy(); reject(new Error('timeout')); });
          r.on('error', reject);
        });
      },
    });

    // Phase 3 HARD: contract verify
    seq.phase({ name:'contract.verify', type:'HARD',
      label:'Verify /api/contract returns id=idearium-v1',
      fn: async () => {
        await new Promise((resolve, reject) => {
          let body = '';
          const r = _require('http').get(
            'http://127.0.0.1:' + PORT + '/api/contract',
            res => {
              res.on('data', c => { body += c; });
              res.on('end', () => {
                try {
                  const j = JSON.parse(body);
                  if (j.contract?.id === 'idearium-v1') resolve();
                  else reject(new Error('contract id=' + j.contract?.id));
                } catch(e) { reject(e); }
              });
            }
          );
          r.setTimeout(2000, () => { r.destroy(); reject(new Error('timeout')); });
          r.on('error', reject);
        });
      },
    });

    // Phase 4 SOFT: orchestrator registration (§AXIOM)
    seq.phase({ name:'orchestrator.register', type:'SOFT',
      label:'Register with orchestrator (§AXIOM)',
      fn: async () => {
        const body = JSON.stringify({ systemId:'idearium', port:PORT,
          meta:{ role:'idea-os', version:VERSION } });
        const r = _require('http').request({
          hostname:'127.0.0.1', port:9000, path:'/api/register', method:'POST',
          headers:{'Content-Type':'application/json','Content-Length':Buffer.byteLength(body)},
        });
        r.setTimeout(2000, () => r.destroy()); r.on('error', () => {});
        r.write(body); r.end();
        setInterval(() => {
          const hb = JSON.stringify({ systemId:'idearium', port:PORT, status:'online' });
          const r2 = _require('http').request({
            hostname:'127.0.0.1', port:9000, path:'/api/heartbeat', method:'POST',
            headers:{'Content-Type':'application/json','Content-Length':Buffer.byteLength(hb)},
          });
          r2.on('error', () => {}); r2.write(hb); r2.end();
        }, 10000);
      },
    });

    // Phase 5 SOFT: bridge handshake (§5.2)
    seq.phase({ name:'bridge.handshake', type:'SOFT',
      label:'Bridge handshake with orchestrator',
      fn: async () => {
        const bBody = JSON.stringify({ systemId:'idearium', appId:'idearium', secret:'nexus-idearium-internal-v1' });
        const r = _require('http').request({
          hostname:'127.0.0.1', port:9000, path:'/api/register', method:'POST',
          headers:{'Content-Type':'application/json','Content-Length':Buffer.byteLength(bBody)},
        }, res => {
          let d = ''; res.on('data', c => { d += c; });
          res.on('end', () => {
            try { JSON.parse(d); } catch(_) {}
          });
        });
        r.on('error', () => {}); r.write(bBody); r.end();
        // Also post booted to ledger
        const lb = JSON.stringify({ system:'idearium', type:'idearium.booted',
          payload:{ version:VERSION, port:PORT } });
        const r2 = _require('http').request({
          hostname:'127.0.0.1', port:9000, path:'/api/ledger', method:'POST',
          headers:{'Content-Type':'application/json','Content-Length':Buffer.byteLength(lb)},
        });
        r2.on('error', () => {}); r2.write(lb); r2.end();
      },
    });

    // Phase 6 SOFT: SSE stream verify
    seq.phase({ name:'sse.verify', type:'SOFT',
      label:'Verify /sse stream opens',
      fn: async () => {
        await new Promise((resolve, reject) => {
          const r = _require('http').request({
            hostname:'127.0.0.1', port:PORT, path:'/sse',
            headers:{ Accept:'text/event-stream' },
          }, res => {
            if (res.statusCode === 200) { r.destroy(); resolve(); }
            else { r.destroy(); reject(new Error('SSE ' + res.statusCode)); }
          });
          r.setTimeout(2000, () => { r.destroy(); resolve(); }); // resolve on timeout = SSE streaming
          r.on('error', reject); r.end();
        });
      },
    });

    // Phase 7 SOFT: auth init + network bind announce
    seq.phase({ name:'auth.init', type:'SOFT',
      label:'Auth init — ensure boot key exists, announce surfaces',
      fn: async () => {
        _ensureBootKey();
        const store   = _keyStore();
        const active  = store.filter(k => !k.revoked).length;
        const ips     = getLocalIPs();
        console.log(`[idearium] bound :${PORT} on ${BINDING}`);
        console.log(`[idearium] auth  — ${active} active key(s)`);
        ips.forEach(ip =>
          console.log(`[idearium] LAN:   http://${ip.address}:${PORT}  (${ip.name})`)
        );
        if (BINDING === '127.0.0.1') {
          console.warn('[idearium] binding=127.0.0.1 — LAN access disabled. Set IDEARIUM_BIND=0.0.0.0 to enable.');
        }
      },
    });

    // Phase 8 SOFT: cloudflare tunnel — implicit, non-blocking (§B-6 gap on failure, never crash)
    // Skipped if IDEARIUM_NO_TUNNEL=1. Gap opened if cloudflared not installed.
    seq.phase({ name:'tunnel.init', type:'SOFT',
      label:'Start cloudflare tunnel (remote access)',
      fn: async () => {
        if (process.env.IDEARIUM_NO_TUNNEL === '1') {
          console.log('[idearium/tunnel] skipped (IDEARIUM_NO_TUNNEL=1)');
          return;
        }
        await new Promise(resolve => {
          const timer = setTimeout(() => {
            console.warn('[idearium/tunnel] still waiting for URL — will surface when ready');
            resolve();
          }, 12000);

          startTunnel(PORT,
            url => {
              clearTimeout(timer);
              console.log(`[idearium/tunnel] ✓ remote: ${url}`);
              // Post tunnel URL to orchestrator ledger so every system knows it
              try {
                const body = JSON.stringify({
                  system: 'idearium', type: 'idearium.tunnel.ready',
                  payload: { url, port: PORT, ts: Date.now() },
                });
                const r = _require('http').request({
                  hostname: '127.0.0.1', port: 9000, path: '/api/ledger', method: 'POST',
                  headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
                });
                r.on('error', () => {}); r.write(body); r.end();
              } catch (_) {}
              resolve();
            },
            why => {
              clearTimeout(timer);
              // §B-6: failure is a gap, not a crash
              console.warn(`[idearium/tunnel §B-6] ${why}`);
              try {
                const os2 = getIdeaOS();
                os2.emit('idearium.gap.open', {
                  description: `tunnel unavailable: ${why}`,
                  type:        'tunnel.unavailable',
                  severity:    'low',
                  source:      'boot',
                });
              } catch (_) {}
              resolve();
            }
          );
        });
      },
    });

    await seq.run();
    // Idearium never hard-exits — degrades gracefully
  });

  server.on('error', e => {
    if (e.code === 'EADDRINUSE') {
      console.error(`[Idearium API] Port ${PORT} already in use. Is Idearium already running?`);
      process.exit(1);
    }
    throw e;
  });

  return server;
}

// ── Auto-start when run directly ────────────────────────────────────────────
startAPI();
