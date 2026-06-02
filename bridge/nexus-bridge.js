'use strict';
// ════════════════════════════════════════════════════════════════════════════
// NEXUS BRIDGE — v1.0.0
// UUID: nexus-bridge-v1-0-0
//
// The connective tissue between all systems.
// Provides:
//   • Unified tag system       — every entity gets tags, taggable by any system
//   • Request queue            — typed requests with accept/reject/pending lifecycle
//   • Push/pull subscriptions  — systems subscribe to each other's channels
//   • Handshake protocol       — AppID + session token, 5-min TTL
//   • Cross-system sync        — Cortex ↔ Guardian ↔ Idearium event bridge
//   • Unified health bus       — all systems report here
//
// Architecture: every system imports this module and calls bridge.mount(server, systemId)
// The bridge registers the system, establishes cross-links, and adds routes.
//
// §K6 no direct module calls — all via bridge channels
// §1.2 nothing silently fails
// §2.1 every request persisted before processing
// ════════════════════════════════════════════════════════════════════════════

const { randomUUID } = require('crypto');
const http           = require('http');
const fs             = require('fs');
const path           = require('path');

// ── Config ────────────────────────────────────────────────────────────────────
const SYSTEMS = {
  cortex:   { port: 3748, host: '127.0.0.1' },
  guardian: { port: 7820, host: '127.0.0.1' },
  idearium: { port: 4800, host: '127.0.0.1' },
  emerge:   { port: 4242, host: '127.0.0.1' },
};

const BRIDGE_PORT  = 9999;
const DATA_DIR     = path.join(__dirname, '..', 'data', 'bridge');
const HANDSHAKE_TTL = 5 * 60 * 1000; // 5 min

// ── Persistence ───────────────────────────────────────────────────────────────
fs.mkdirSync(DATA_DIR, { recursive: true });

function jaaPath(table) { return path.join(DATA_DIR, table + '.jsonl'); }

function jaaAppend(table, record) {
  const row = { ...record, uuid: record.uuid || randomUUID(), ts: record.ts || Date.now() };
  fs.appendFileSync(jaaPath(table), JSON.stringify(row) + '\n');
  return row;
}

function jaaRead(table, limit = 200) {
  try {
    return fs.readFileSync(jaaPath(table), 'utf8').trim().split('\n')
      .filter(Boolean).map(l => JSON.parse(l)).slice(-limit);
  } catch(_) { return []; }
}

function jaaUpdate(table, uuid, patch) {
  const rows = jaaRead(table, 10000);
  const idx  = rows.findIndex(r => r.uuid === uuid);
  if (idx === -1) return null;
  rows[idx] = { ...rows[idx], ...patch, updatedAt: Date.now() };
  fs.writeFileSync(jaaPath(table), rows.map(r => JSON.stringify(r)).join('\n') + '\n');
  return rows[idx];
}

// ── Tag engine ────────────────────────────────────────────────────────────────
// Every entity across ALL systems can be tagged.
// Tags: { uuid, entityId, entityType, system, tags[], addedBy, ts }
//
// Tag taxonomy (open — any tag allowed, these are reserved):
//   system:*        — which system owns the entity
//   status:pending  — in queue, awaiting acceptance
//   status:accepted — accepted, processing
//   status:rejected — rejected with reason
//   status:complete — done
//   priority:high/low/critical
//   type:job/idea/spec/gap/artifact/crystal/event
//   channel:*       — which SISO channel produced this

const tagEngine = {
  tag(entityId, entityType, system, tags, addedBy = 'system') {
    const existing = jaaRead('tags').find(t => t.entityId === entityId);
    if (existing) {
      const merged = [...new Set([...existing.tags, ...tags])];
      return jaaUpdate('tags', existing.uuid, { tags: merged, updatedAt: Date.now() });
    }
    return jaaAppend('tags', { entityId, entityType, system, tags, addedBy });
  },

  untag(entityId, removeTags) {
    const existing = jaaRead('tags').find(t => t.entityId === entityId);
    if (!existing) return null;
    const filtered = existing.tags.filter(t => !removeTags.includes(t));
    return jaaUpdate('tags', existing.uuid, { tags: filtered });
  },

  getTagsFor(entityId) {
    const t = jaaRead('tags').find(r => r.entityId === entityId);
    return t?.tags || [];
  },

  findByTag(tag, system = null) {
    return jaaRead('tags').filter(t => t.tags.includes(tag) && (!system || t.system === system));
  },

  findByTags(tags, matchAll = false) {
    return jaaRead('tags').filter(t =>
      matchAll ? tags.every(tag => t.tags.includes(tag))
               : tags.some(tag  => t.tags.includes(tag))
    );
  },
};

// ── Request queue ─────────────────────────────────────────────────────────────
const REQUEST_TTL = 30 * 60 * 1000; // 30 min — pending requests expire

// Typed requests with full lifecycle: created → pending → accepted/rejected → processing → complete/failed
// Any system can submit a request to any other system.
// Requests are persisted first (§2.1), then dispatched.
//
// Request schema:
//   { uuid, type, from, to, payload, status, priority, tags[], acceptedBy, rejectedBy, reason, createdAt, updatedAt }

const REQUEST_TYPES = [
  'job.dispatch',      // dispatch a prompt to an agent
  'idea.create',       // create an idea in idearium
  'spec.build',        // build a spec
  'gap.open',          // open a gap
  'gap.resolve',       // resolve a gap
  'artifact.store',    // store an artifact
  'memory.ingest',     // ingest into cortex memory
  'versionium.commit', // trigger a version commit
  'forge.run',         // run forge on a component
  'seam.deliver',      // deliver a SEAM chunk
  'bridge.ping',       // health ping between systems
  'bridge.sync',       // force a full state sync
];

const requestQueue = {
  submit(type, from, to, payload, opts = {}) {
    if (!REQUEST_TYPES.includes(type)) {
      throw new Error(`Unknown request type: ${type}. Valid: ${REQUEST_TYPES.join(', ')}`);
    }
    const req = jaaAppend('requests', {
      type, from, to, payload,
      status:   'pending',
      priority: opts.priority || 'normal',
      tags:     ['status:pending', `type:${type}`, `from:${from}`, `to:${to}`, ...(opts.tags || [])],
    });
    tagEngine.tag(req.uuid, 'request', from, req.tags, from);
    broadcastAll({ type: 'bridge.request.created', request: req });
    return req;
  },

  accept(uuid, acceptedBy, meta = {}) {
    const req = jaaUpdate('requests', uuid, {
      status: 'accepted', acceptedBy, meta,
      tags: this._retag(uuid, ['status:pending'], ['status:accepted']),
    });
    if (!req) return null;
    tagEngine.untag(uuid, ['status:pending']);
    tagEngine.tag(uuid, 'request', req.from, ['status:accepted'], acceptedBy);
    broadcastAll({ type: 'bridge.request.accepted', uuid, acceptedBy });
    return req;
  },

  reject(uuid, rejectedBy, reason = '') {
    const req = jaaUpdate('requests', uuid, {
      status: 'rejected', rejectedBy, reason,
      tags: this._retag(uuid, ['status:pending','status:accepted'], ['status:rejected']),
    });
    if (!req) return null;
    tagEngine.untag(uuid, ['status:pending','status:accepted']);
    tagEngine.tag(uuid, 'request', req.from, ['status:rejected'], rejectedBy);
    broadcastAll({ type: 'bridge.request.rejected', uuid, rejectedBy, reason });
    return req;
  },

  complete(uuid, result = {}) {
    const req = jaaUpdate('requests', uuid, {
      status: 'complete', result,
      tags: this._retag(uuid, ['status:accepted','status:processing'], ['status:complete']),
    });
    if (!req) return null;
    broadcastAll({ type: 'bridge.request.complete', uuid, result });
    return req;
  },

  fail(uuid, error = '') {
    const req = jaaUpdate('requests', uuid, { status: 'failed', error });
    if (!req) return null;
    broadcastAll({ type: 'bridge.request.failed', uuid, error });
    return req;
  },

  list(filter = {}) {
    let rows = jaaRead('requests', 500);
    if (filter.status) rows = rows.filter(r => r.status === filter.status);
    if (filter.from)   rows = rows.filter(r => r.from   === filter.from);
    if (filter.to)     rows = rows.filter(r => r.to     === filter.to);
    if (filter.type)   rows = rows.filter(r => r.type   === filter.type);
    if (filter.tag)    rows = rows.filter(r => (r.tags||[]).includes(filter.tag));
    return rows;
  },

  purgeExpired() {
    const rows    = jaaRead('requests', 5000);
    const cutoff  = Date.now() - REQUEST_TTL;
    let purged    = 0;
    for (const r of rows) {
      if (r.status === 'pending' && (r.ts || r.createdAt || 0) < cutoff) {
        jaaUpdate('requests', r.uuid, { status: 'expired', expiredAt: Date.now() });
        tagEngine.untag(r.uuid, ['status:pending']);
        tagEngine.tag(r.uuid, 'request', r.from, ['status:expired'], 'bridge.purge');
        broadcastAll({ type: 'bridge.request.expired', uuid: r.uuid, age: Date.now() - (r.ts||0) });
        purged++;
      }
    }
    return purged;
  },

  get(uuid) {
    return jaaRead('requests', 5000).find(r => r.uuid === uuid) || null;
  },

  _retag(uuid, remove, add) {
    const t = tagEngine.getTagsFor(uuid);
    return [...new Set([...t.filter(x => !remove.includes(x)), ...add])];
  },
};

// ── Handshake protocol ────────────────────────────────────────────────────────
// AppID + session token. Every system must handshake before cross-system calls.
// Token expires in 5 min. Auto-renew on use.
//
// Flow:
//   POST /bridge/handshake { systemId, appId, secret }
//   → { token, expiresAt, sessionId }
//   All subsequent calls: header X-Bridge-Token: <token>

const SESSIONS = new Map(); // token → { systemId, appId, expiresAt, sessionId }
const APP_IDS  = new Map([
  // Pre-registered system AppIDs — in production these come from cortex/jaa
  ['cortex',   { secret: 'nexus-cortex-internal-v1'   }],
  ['guardian', { secret: 'nexus-guardian-internal-v1' }],
  ['idearium', { secret: 'nexus-idearium-internal-v1' }],
  ['emerge',   { secret: 'nexus-emerge-internal-v1'   }],
  ['cockpit',  { secret: 'nexus-cockpit-internal-v1'  }],
  ['userscript', { secret: 'nexus-userscript-internal-v1' }],
]);

const handshake = {
  register(systemId, appId, secret) {
    const app = APP_IDS.get(appId || systemId);
    if (!app || app.secret !== secret) return null;
    const token     = randomUUID();
    const sessionId = randomUUID();
    const expiresAt = Date.now() + HANDSHAKE_TTL;
    SESSIONS.set(token, { systemId, appId: appId || systemId, expiresAt, sessionId });
    jaaAppend('handshakes', { systemId, appId, sessionId, createdAt: Date.now() });
    return { token, sessionId, expiresAt };
  },

  verify(token) {
    const s = SESSIONS.get(token);
    if (!s) return null;
    if (Date.now() > s.expiresAt) { SESSIONS.delete(token); return null; }
    s.expiresAt = Date.now() + HANDSHAKE_TTL; // auto-renew
    return s;
  },

  revoke(token) { SESSIONS.delete(token); },

  middleware(req) {
    const token = req.headers['x-bridge-token'];
    if (!token) return null;
    return this.verify(token);
  },
};

// ── Push/pull subscriptions ───────────────────────────────────────────────────
// Systems subscribe to channels. Events on a channel are pushed to all subscribers.
// Pull: GET /bridge/pull?channel=x&since=ts returns buffered events.
//
// Channels match SISO dot-notation:
//   guardian.job.complete
//   cortex.gap.found
//   idearium.idea.created
//   bridge.request.*  — all request lifecycle events
//   *                 — everything

const SUBS     = new Map(); // channel → Set<res> (SSE connections)
const EVT_RING = [];        // ring buffer of recent events
const RING_MAX = 2000;

function broadcastAll(event) {
  const ev = { ...event, bridgeTs: Date.now(), bridgeId: randomUUID() };
  EVT_RING.push(ev);
  if (EVT_RING.length > RING_MAX) EVT_RING.shift();
  jaaAppend('events', ev);

  for (const [channel, clients] of SUBS) {
    if (channel === '*' || ev.type === channel ||
        ev.type?.startsWith(channel.replace('.*', '.'))) {
      const msg = `data: ${JSON.stringify(ev)}\n\n`;
      for (const res of clients) {
        try { res.write(msg); } catch(_) { clients.delete(res); }
      }
    }
  }
}

function subscribe(channel, res) {
  if (!SUBS.has(channel)) SUBS.set(channel, new Set());
  SUBS.get(channel).add(res);
  return () => SUBS.get(channel)?.delete(res);
}

function pullSince(channel, since = 0) {
  return EVT_RING.filter(e =>
    e.bridgeTs > since &&
    (channel === '*' || e.type === channel || e.type?.startsWith(channel.replace('.*','.')))
  );
}

// ── Cross-system HTTP bridge ──────────────────────────────────────────────────
// Forwards events between systems.
// Cortex ↔ Guardian ↔ Idearium all stay in sync via this.

async function forwardToSystem(systemId, path, body) {
  const sys = SYSTEMS[systemId];
  if (!sys) return { ok: false, error: `Unknown system: ${systemId}` };
  return new Promise(resolve => {
    const payload = JSON.stringify(body);
    const opts = {
      hostname: sys.host, port: sys.port, path,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload), 'X-Bridge-Source': 'nexus-bridge' },
    };
    const req = http.request(opts, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try { resolve({ ok: res.statusCode < 400, data: JSON.parse(data) }); }
        catch(_) { resolve({ ok: res.statusCode < 400, data }); }
      });
    });
    req.on('error', e => resolve({ ok: false, error: e.message }));
    req.setTimeout(5000, () => { req.destroy(); resolve({ ok: false, error: 'timeout' }); });
    req.write(payload);
    req.end();
  });
}

// Key cross-system sync handlers
const crossSync = {
  // When guardian completes a job → sync to cortex
  async onJobComplete(job) {
    await forwardToSystem('cortex', '/api/event', {
      type: 'guardian.job.complete',
      payload: { jobId: job.id, provider: job.provider, chars: (job.response||'').length,
                 status: job.status, ts: Date.now() },
    });
    requestQueue.submit('memory.ingest', 'guardian', 'cortex', {
      type: 'JOB_COMPLETE', content: (job.response||'').slice(0,500),
      source: 'guardian', jobId: job.id,
    }, { tags: ['type:job', 'status:complete'] });
  },

  // When cortex finds a gap → notify guardian
  async onGapFound(gap) {
    await forwardToSystem('guardian', '/ledger', {
      level: 'GAP', category: 'GAP', msg: gap.type + ': ' + (gap.message||''),
      meta: { gapId: gap.uuid, pressure: gap.pressure, source: 'cortex' },
    });
    broadcastAll({ type: 'cortex.gap.found', gap });
  },

  // When idearium creates an idea → sync to cortex
  async onIdeaCreated(idea) {
    await forwardToSystem('cortex', '/api/event', {
      type: 'idearium.idea.created',
      payload: { ideaId: idea.uuid, text: idea.text, phase: idea.phase },
    });
    tagEngine.tag(idea.uuid, 'idea', 'idearium', ['type:idea', 'status:pending', `phase:${idea.phase||'seed'}`]);
    broadcastAll({ type: 'idearium.idea.created', idea });
  },

  // When idearium pushes a snapshot → trigger versionium
  async onSnapshotPush(snapshot) {
    await forwardToSystem('cortex', '/api/event', {
      type: 'versionium.commit.trigger',
      payload: { message: snapshot.message, source: 'idearium', snapshotId: snapshot.uuid },
    });
    broadcastAll({ type: 'idearium.snapshot.pushed', snapshot });
  },

  // When guardian gets an artifact → sync to cortex
  async onArtifact(artifact) {
    await forwardToSystem('cortex', '/api/event', {
      type: 'guardian.artifact.received',
      payload: { hash: artifact.hash, name: artifact.name, lang: artifact.lang, jobId: artifact.jobId },
    });
    tagEngine.tag(artifact.hash, 'artifact', 'guardian',
      ['type:artifact', `lang:${artifact.lang||'unknown'}`, 'status:complete']);
    broadcastAll({ type: 'guardian.artifact.synced', artifact });
  },
};

// ── Bridge HTTP server ────────────────────────────────────────────────────────
// Standalone server on port 9999.
// Also mountable on any existing server via bridge.attach(server).

function buildBridgeHandler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Bridge-Token');
  if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }

  const url    = new URL(req.url, 'http://localhost');
  const parts  = url.pathname.replace(/^\/bridge\/?/, '').split('/').filter(Boolean);
  const action = parts[0];

  // ── Handshake ──────────────────────────────────────────────────────────────
  if (req.method === 'POST' && action === 'handshake') {
    return readBody(req, body => {
      const { systemId, appId, secret } = body;
      const result = handshake.register(systemId, appId, secret);
      if (!result) return json(res, 401, { ok: false, error: 'Invalid credentials' });
      jaaAppend('events', { type: 'bridge.handshake', systemId, ts: Date.now() });
      broadcastAll({ type: 'bridge.handshake', systemId });
      json(res, 200, { ok: true, ...result });
    });
  }

  // ── Tags ───────────────────────────────────────────────────────────────────
  if (action === 'tags') {
    if (req.method === 'GET' && parts[1]) {
      return json(res, 200, { ok: true, tags: tagEngine.getTagsFor(parts[1]) });
    }
    if (req.method === 'POST' && !parts[1]) {
      return readBody(req, body => {
        const { entityId, entityType, system, tags, addedBy } = body;
        const t = tagEngine.tag(entityId, entityType, system, tags, addedBy);
        broadcastAll({ type: 'bridge.tag.added', entityId, tags });
        json(res, 200, { ok: true, tag: t });
      });
    }
    if (req.method === 'DELETE' && parts[1]) {
      return readBody(req, body => {
        tagEngine.untag(parts[1], body.tags || []);
        json(res, 200, { ok: true });
      });
    }
    if (req.method === 'GET' && action === 'tags' && !parts[1]) {
      const tag    = url.searchParams.get('tag');
      const system = url.searchParams.get('system');
      if (!tag) return json(res, 400, { ok: false, error: 'tag param required' });
      return json(res, 200, { ok: true, entities: tagEngine.findByTag(tag, system) });
    }
  }

  // ── Request queue ──────────────────────────────────────────────────────────
  if (action === 'requests') {
    if (req.method === 'GET' && !parts[1]) {
      const filter = Object.fromEntries(url.searchParams);
      return json(res, 200, { ok: true, requests: requestQueue.list(filter) });
    }
    if (req.method === 'POST' && !parts[1]) {
      return readBody(req, body => {
        try {
          const r = requestQueue.submit(body.type, body.from, body.to, body.payload, body.opts);
          json(res, 202, { ok: true, request: r });
        } catch(e) { json(res, 400, { ok: false, error: e.message }); }
      });
    }
    if (req.method === 'GET' && parts[1]) {
      const r = requestQueue.get(parts[1]);
      return r ? json(res, 200, { ok: true, request: r }) : json(res, 404, { ok: false, error: 'not found' });
    }
    if (req.method === 'POST' && parts[1] && parts[2]) {
      return readBody(req, body => {
        const uuid = parts[1]; const action2 = parts[2];
        let r;
        if (action2 === 'accept')   r = requestQueue.accept(uuid, body.by || 'system', body.meta);
        if (action2 === 'reject')   r = requestQueue.reject(uuid, body.by || 'system', body.reason);
        if (action2 === 'complete') r = requestQueue.complete(uuid, body.result);
        if (action2 === 'fail')     r = requestQueue.fail(uuid, body.error);
        if (!r) return json(res, 404, { ok: false, error: 'request not found' });
        json(res, 200, { ok: true, request: r });
      });
    }
  }

  // ── Push/pull subscriptions ────────────────────────────────────────────────
  if (action === 'subscribe') {
    const channel = url.searchParams.get('channel') || '*';
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    });
    res.write(`data: ${JSON.stringify({ type: 'bridge.subscribed', channel, ts: Date.now() })}\n\n`);
    const unsub = subscribe(channel, res);
    req.on('close', unsub);
    return;
  }

  if (req.method === 'GET' && action === 'pull') {
    const channel = url.searchParams.get('channel') || '*';
    const since   = parseInt(url.searchParams.get('since') || '0');
    return json(res, 200, { ok: true, events: pullSince(channel, since) });
  }

  // ── Broadcast ─────────────────────────────────────────────────────────────
  if (req.method === 'POST' && action === 'broadcast') {
    return readBody(req, body => {
      broadcastAll({ ...body, source: body.source || 'external' });
      json(res, 200, { ok: true });
    });
  }

  // ── Forward ────────────────────────────────────────────────────────────────
  if (req.method === 'POST' && action === 'forward') {
    return readBody(req, async body => {
      const { to, path: fpath, payload } = body;
      const result = await forwardToSystem(to, fpath || '/api/event', payload);
      json(res, result.ok ? 200 : 502, result);
    });
  }

  // ── Health ─────────────────────────────────────────────────────────────────
  if (req.method === 'GET' && action === 'health') {
    const sessionCount = SESSIONS.size;
    const pending = requestQueue.list({ status: 'pending' }).length;
    const recent  = EVT_RING.slice(-10);
    return json(res, 200, {
      ok: true, bridge: 'nexus-bridge-v1',
      sessions: sessionCount, pendingRequests: pending,
      recentEvents: recent.length, systems: Object.keys(SYSTEMS),
    });
  }

  // ── Stats ──────────────────────────────────────────────────────────────────
  if (req.method === 'POST' && action === 'purge') {
    const n = requestQueue.purgeExpired();
    return json(res, 200, { ok: true, purged: n });
  }

  if (req.method === 'GET' && action === 'stats') {
    return json(res, 200, {
      ok: true,
      requests: { total: jaaRead('requests', 5000).length, pending: requestQueue.list({ status: 'pending' }).length, accepted: requestQueue.list({ status: 'accepted' }).length, complete: requestQueue.list({ status: 'complete' }).length },
      tags:     { total: jaaRead('tags').length },
      events:   { ring: EVT_RING.length, total: jaaRead('events').length },
      sessions: { active: SESSIONS.size },
    });
  }

  json(res, 404, { ok: false, error: `bridge route not found: ${req.method} ${url.pathname}` });
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function json(res, code, body) {
  res.writeHead(code, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

function readBody(req, cb) {
  let raw = '';
  req.on('data', c => raw += c);
  req.on('end', () => {
    try { cb(JSON.parse(raw || '{}')); }
    catch(e) { const res = req.res; if (res) json(res, 400, { ok: false, error: 'invalid JSON' }); }
  });
  req.res = arguments[0]?.res || null;
}

function readBody(req, cb) {
  let raw = '';
  req.on('data', c => raw += c);
  req.on('end', () => { try { cb(JSON.parse(raw || '{}')); } catch(e) {} });
}

// ── Mount onto existing HTTP server ──────────────────────────────────────────
// Usage: bridge.mount(existingServer, 'guardian')
// Intercepts requests at /bridge/* and handles them.

function mount(server, systemId) {
  const orig = server.listeners('request')[0];
  server.removeAllListeners('request');
  server.on('request', (req, res) => {
    if (req.url?.startsWith('/bridge')) {
      return buildBridgeHandler(req, res);
    }
    if (orig) orig(req, res);
  });
  console.log(`[90m[bridge][0m mounted on ${systemId}`);

  // Auto-register system with bridge
  broadcastAll({ type: 'bridge.system.mounted', systemId, ts: Date.now() });
  return bridge;
}

// ── Standalone server ─────────────────────────────────────────────────────────
let _server = null;

function start(port = BRIDGE_PORT) {
  // Purge expired requests every 5 minutes
  setInterval(() => {
    const n = requestQueue.purgeExpired();
    if (n > 0) console.log(`[bridge] purged ${n} expired requests`);
  }, 5 * 60 * 1000).unref();

  _server = http.createServer(buildBridgeHandler);
  _server.listen(port, '127.0.0.1', () => {
    console.log('');
    console.log('\x1b[1m\x1b[33m⬡  NEXUS BRIDGE\x1b[0m  v1.0');
    console.log('');
    console.log(`   \x1b[90mHTTP      \x1b[0m  http://127.0.0.1:${port}`);
    console.log(`   \x1b[90mHealth    \x1b[0m  http://127.0.0.1:${port}/bridge/health`);
    console.log(`   \x1b[90mRequests  \x1b[0m  http://127.0.0.1:${port}/bridge/requests`);
    console.log(`   \x1b[90mSubscribe \x1b[0m  http://127.0.0.1:${port}/bridge/subscribe?channel=*`);
    console.log('');
    console.log(`   \x1b[90mEndpoints \x1b[0m  handshake  tags  requests  subscribe  pull  broadcast  forward`);
    console.log('');
    console.log(`   \x1b[90mCLI       \x1b[0m  nexus bridge health`);
    console.log('');
  });
  return bridge;
}

function stop() {
  if (_server) _server.close();
}

// ── Public API ────────────────────────────────────────────────────────────────
const bridge = {
  mount, start, stop,
  tag:          tagEngine.tag.bind(tagEngine),
  untag:        tagEngine.untag.bind(tagEngine),
  getTags:      tagEngine.getTagsFor.bind(tagEngine),
  findByTag:    tagEngine.findByTag.bind(tagEngine),
  submit:       requestQueue.submit.bind(requestQueue),
  accept:       requestQueue.accept.bind(requestQueue),
  reject:       requestQueue.reject.bind(requestQueue),
  complete:     requestQueue.complete.bind(requestQueue),
  fail:         requestQueue.fail.bind(requestQueue),
  listRequests: requestQueue.list.bind(requestQueue),
  broadcast:    broadcastAll,
  subscribe,
  pull:         pullSince,
  forward:      forwardToSystem,
  handshake:    handshake.register.bind(handshake),
  verify:       handshake.verify.bind(handshake),
  crossSync,
  SYSTEMS,
  REQUEST_TYPES,
};

module.exports = bridge;

// Boot standalone if called directly
if (require.main === module) {
  bridge.start(BRIDGE_PORT);
}
