'use strict';
/**
 * loom/server.js — Sovereign LOOM system
 * comp_id: nexus.loom.server
 * UUID: nexus-loom-server-v1-0000-2026-0702-jamesbrooks-001
 * Port: 3752
 *
 * §GAP CLOSED 2026-07-02: LOOM (component/hook/wire/seam registry +
 * contracts) has existed since phase 121 as a pure library — LoomDriver
 * and LoomContracts, required in-process by whatever needed the
 * registry. loom/schema/index.js's own header comment names this
 * explicitly: "this is CLI/API's future entry point (Phase 132/133)" —
 * the API layer was planned, never built. Every other real system in
 * NEXUS follows nexus-system-foundation.spec's L0-L5 shape and has a
 * process, a port, and a handshake with the orchestrator. LOOM had L0
 * (schema/registry) and an L2-adjacent CLI, nothing else. This file is
 * L3 (API) + L4 (handshake) — the same boot pattern copilot/server.js
 * and eravos/server.js already use, not a new pattern invented here.
 *
 * Read-only surface wraps LoomDriver.registry directly (has/get/all/
 * graph — already disk-first, already re-reads before every read per
 * the phase-157 staleness fix). Write surface wraps declare() and the
 * three LoomContracts lifecycle calls. Nothing here reimplements gate/
 * axiom logic — this is transport only, same as every other system's
 * server.js is transport in front of its own lib/.
 */

const http = require('http');
const fs   = require('fs');
const { LoomDriver } = require('./schema/index');
const { LoomContracts } = require('./contracts/index');
// §BUGFIX 2026-07-04: this module was built earlier this session
// specifically to give LOOM a durable write path into cortex — and then
// never actually connected to anything. Wiring it in now: every real
// registry mutation below also records through here.
const cortexSync = require('./schema/cortex-sync');
// §GAP CLOSED 2026-07-05: loom/ingest/index.js (LoomIngest.ingestZip) was
// built in phase 144 — sha256 identity, real unzip listing, parent-diff
// lineage, all working and tested — and then never wired to an actual
// endpoint. Same shape as cortexSync's own history two lines above:
// built, correct, disconnected. Wiring it in now via /api/ingest.
const { LoomIngest } = require('./ingest/index');
// §GAP CLOSED 2026-07-05: same pattern a third time — scaffoldSystem
// (loom/templates/system-scaffold.js, phase 145) is a real, tested
// operations-list → CLI+API+contract projector, never wired to an
// endpoint either. /api/scaffold below is what a UI checkbox form
// actually calls.
const { scaffoldSystem } = require('./templates/system-scaffold');
const path = require('path');
// §LP3 2026-08-08 — loom-phasemap-section-phasemap.spec's LP1+LP2 (the
// scanner + bySystem grouping) shipped as a pure lib module and, same
// pattern as cortexSync/LoomIngest/scaffoldSystem above, was never wired to
// an endpoint. /api/phasemap[/:system] below is that wire — loom's roadmap
// section (what each system is BECOMING), served live off loadAll()/
// forSystem(), not cached, same as every other read surface in this file.
const phasemapMap = require('./scanners/phasemap-map');
const gapField = require('../lib/gap-field');
const componentLedger = require('../lib/component-ledger');
const connections = require('../lib/connections');
// §2026-08-09 — friction/tension live IN-MEMORY inside the diagnostic
// kernel's running process (unlike gaps, which share jaaDB's on-disk store
// — a require() can't reach them). loom reaches them the way any cross-
// process call should: scoped, governed, through CA4's connections.js,
// not a raw fetch. Default-deny elsewhere in NEXUS; here the one thing in
// scope is the diagnostic kernel itself, on localhost, nothing else.
connections.registerScope('diagnostic-kernel', { allowedDomains: ['127.0.0.1', 'localhost'], allowedMethods: ['GET'] });
// §WIRED — real, distinct config, not inline constants. See
// loom/config.js's own header. Matches the established pattern.
const config = require('./config.js');
const DIAG_URL = config.DIAG_URL;

const SYSTEM_ID = 'loom';
const PORT      = config.PORT;
const OR_URL    = config.OR_URL;
// §2026-07-04: sourced from the central registry from day one, unlike the
// other systems this session found drifted — loom is new enough to just
// do it right rather than fix it twice.
const VERSION   = require('../lib/version').services.loom;

// ── Scaffold templates — real operations, system-scaffold's own shape ──────
// Not placeholders: each of these is a valid `operations` array on its
// own — scaffoldSystem() has been run against "Basic CRUD" directly
// while wiring this in, same way ingest was proven against a real zip
// before calling it done.
const SCAFFOLD_TEMPLATES = [
  {
    id: 'crud-basic', label: 'Basic CRUD',
    description: 'list/get/create/update/delete over one resource',
    operations: [
      { id: 'list',   verb: 'list',   method: 'GET',    apiPath: '/items',      params: [], description: 'list all items' },
      { id: 'get',    verb: 'get',    method: 'GET',    apiPath: '/items/:id',  params: ['id'], description: 'get one item' },
      { id: 'create', verb: 'create', method: 'POST',   apiPath: '/items',      params: ['data'], description: 'create an item' },
      { id: 'update', verb: 'update', method: 'PATCH',  apiPath: '/items/:id',  params: ['id', 'data'], description: 'update an item' },
      { id: 'delete', verb: 'delete', method: 'DELETE', apiPath: '/items/:id',  params: ['id'], description: 'delete an item' },
    ],
  },
  {
    id: 'read-only-registry', label: 'Read-only registry',
    description: 'query-only surface over a data set — no mutation verbs at all',
    operations: [
      { id: 'list',   verb: 'list',   method: 'GET', apiPath: '/records',       params: [], description: 'list all records' },
      { id: 'get',    verb: 'get',    method: 'GET', apiPath: '/records/:id',   params: ['id'], description: 'get one record' },
      { id: 'search', verb: 'search', method: 'GET', apiPath: '/records/search', params: ['q'], description: 'full-text search' },
    ],
  },
  {
    id: 'job-queue', label: 'Job queue',
    description: 'submit/status/cancel — same shape ollama/copilot/guardian already use for dispatch',
    operations: [
      { id: 'submit', verb: 'submit', method: 'POST', apiPath: '/jobs',          params: ['payload'], description: 'submit a job' },
      { id: 'status', verb: 'status', method: 'GET',  apiPath: '/jobs/:id',      params: ['id'], description: 'check job status' },
      { id: 'cancel', verb: 'cancel', method: 'POST', apiPath: '/jobs/:id/cancel', params: ['id'], description: 'cancel a queued job' },
    ],
  },
];

const driver    = new LoomDriver();
const ingest    = new LoomIngest();
const contracts = new LoomContracts();
const _sseClients = new Set();
function _broadcast(type, payload) {
  const line = `data: ${JSON.stringify({ type, ...payload, ts: Date.now() })}\n\n`;
  for (const res of _sseClients) { try { res.write(line); } catch (_) { _sseClients.delete(res); } }
}

function json(res, code, body) {
  const s = JSON.stringify(body);
  // §BUGFIX 2026-08-23 — James, live, from a real screenshot: CORS
  // blocks on both /contract AND /health for loom specifically — this
  // file's shared json() helper had zero CORS handling anywhere,
  // confirmed by grep before touching it (unlike cortex/architect/
  // bridge, which each had CORS elsewhere but missed it on one raw-
  // writeHead route, loom was missing it everywhere at once, since
  // every route here funnels through this one function). Fixed once,
  // here, rather than patched per-route — every real caller of json()
  // in this file gets it for free now.
  res.writeHead(code, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(s), 'Access-Control-Allow-Origin': '*' });
  res.end(s);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', c => { data += c; if (data.length > 2_000_000) req.destroy(); });
    req.on('end', () => { try { resolve(data ? JSON.parse(data) : {}); } catch (e) { reject(e); } });
    req.on('error', reject);
  });
}

// §ADDED 2026-07-05: readBody above JSON.parses its input, which corrupts
// binary data — no use for actual zip bytes. A typed file path was never
// going to work as the real ingest path anyway: browsers do not expose
// real filesystem paths for dropped/selected files (Windows included —
// drag-and-drop from Explorer hands back a File object with bytes, never
// C:\Users\...\thing.zip). This reads the raw body as a Buffer instead,
// capped generously since real build zips run large (loom/ingest/index.js's
// own header cites a 178MB/10,991-entry example).
function readRawBody(req, maxBytes = 500 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', c => {
      size += c.length;
      if (size > maxBytes) { req.destroy(); reject(new Error(`upload exceeds ${maxBytes} byte limit`)); return; }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}


// ── HOOK REGISTRY — loom is the write authority (docs/hooks-migration.spec) ──
// §2026-07-20: loom's banner claimed "component/hook/wire/seam registry"
// since v1.1.0 with zero hook code behind it; architect carried the duty by
// default and was never meant to. The registry class is shared library
// (lib/hook-registry.js, moved via git mv from architect); loom owns every
// write — seeding, the component-registry sync loop, and all HTTP mutations.
// Architect keeps a read-only view for Blueprint and existing GET consumers.
let hookRegistry = null;
try {
  const { HookRegistry } = require('../lib/hook-registry');
  const { jaaDB } = require('../cortex/memory/jaa-db');
  hookRegistry = new HookRegistry({ jaa: jaaDB });
  hookRegistry.init();
  const _seedBuiltinHooks = (registry) => {
    const seeds = [
      // architect → cortex
      { name: 'architect-event-bus', intent: 'Emit architect events to cortex event_log', type: 'event-bus',
        direction: 'unidirectional', from: { surface: 'architect', layer: 1 }, to: { surface: 'cortex', layer: 1 },
        schema: { input: null, output: { type: 'object', properties: { type: { type: 'string' }, payload: { type: 'object' } } }, errors: [] },
        contract: { axioms: ['§A-2'], sideEffects: ['cortex.event_log.write'], idempotent: false, replayable: true, snrGated: false },
        config: { eventType: 'architect.*', causalEdgeType: 'causal', deduplication: false, ringBuffer: true },
        causedBy: 'seed', status: 'active', tags: ['core','bus'], notes: 'Primary bus wire between architect and cortex',
      },
      // architect → orchestrator registration
      { name: 'architect-orchestrator-register', intent: 'Register architect service with NEXUS orchestrator on boot', type: 'api',
        direction: 'unidirectional', from: { surface: 'architect', layer: 1 }, to: { surface: 'orchestrator', layer: 1 },
        schema: { input: { type: 'object', properties: { systemId: { type: 'string' }, port: { type: 'number' } } }, output: null, errors: [{ code: 'ORCH_OFFLINE', description: 'Orchestrator not reachable', recoverable: true }] },
        contract: { axioms: ['§A-2','§5.2'], sideEffects: ['orchestrator.registry.write'], idempotent: true, replayable: false, snrGated: false, timeout: 5000 },
        config: { method: 'POST', path: '/api/register', timeout: 5000, retryPolicy: { maxAttempts: 3, backoff: 'exponential', baseMs: 1000 } },
        causedBy: 'seed', status: 'active', tags: ['core','registration'],
      },
      // hook registry → JAA write
      { name: 'hook-registry-jaa', intent: 'Persist hook registry mutations to JAA before acting (§I-18)', type: 'direct',
        direction: 'unidirectional', from: { surface: 'hook-registry', layer: 2 }, to: { surface: 'jaa', layer: 0 },
        schema: { input: { type: 'object', properties: { op: { type: 'string' }, data: { type: 'object' } } }, output: null, errors: [] },
        contract: { axioms: ['§I-18','§2.1'], sideEffects: ['jaa.hooks.write'], idempotent: false, replayable: false, snrGated: false },
        config: { functionRef: 'jaa.insert', sync: true },
        causedBy: 'seed', status: 'active', tags: ['persistence','core'],
      },
      // SNR gate → ollama (§I-6: SNR gate runs before any output reaches ollama)
      { name: 'snr-to-ollama', intent: 'Route SNR-scored output to Ollama for local LLM inference (§I-6)', type: 'ollama',
        direction: 'unidirectional', from: { surface: 'snr-gate', layer: 7 }, to: { surface: 'ollama', layer: 7 },
        schema: { input: { type: 'object', properties: { score: { type: 'number' }, recommendation: { type: 'string' } } }, output: { type: 'object', properties: { completion: { type: 'string' } } }, errors: [{ code: 'SNR_TOO_LOW', description: 'SNR score below 0.45 threshold', recoverable: false }] },
        contract: { axioms: ['§I-6','§I-15','§A-5'], sideEffects: ['ollama.inference'], idempotent: false, replayable: false, snrGated: true, timeout: 30000 },
        config: { model: 'qwen2:0.5b', temperature: 0.7, maxTokens: 2000, contextWindow: 4096, snrRequired: true },
        causedBy: 'seed', status: 'seed', tags: ['snr','ollama','output'],
      },
      // Architect webserver hook (self-declaration — §I-3: all surfaces declare hooks)
      { name: 'architect-http-server', intent: 'Architect HTTP API surface at :3747', type: 'webserver',
        direction: 'sink', from: { surface: '*', layer: 0 }, to: { surface: 'architect', layer: 6 },
        schema: { input: null, output: { type: 'object', properties: { ok: { type: 'boolean' } } }, errors: [] },
        contract: { axioms: ['§A-2','§I-3'], sideEffects: [], idempotent: false, replayable: false, snrGated: false },
        config: { port: 3747, method: 'GET', path: '/*', cors: { origins: ['*'], credentials: false }, auth: { required: false, type: 'none' } },
        bindings: { cli: 'architect serve', event: 'architect.http.request' },
        causedBy: 'seed', status: 'active', tags: ['webserver','core'],
      },
    ];

    for (const seed of seeds) {
      try { registry.register(seed); }
      catch(e) { /* already registered or name conflict — skip */ }
    }
    console.log(`[architect] seeded ${seeds.length} built-in hooks`);
    };
  if (hookRegistry.list().length === 0) _seedBuiltinHooks(hookRegistry);
  const { syncFromComponentRegistry } = require('../lib/hook-sync-from-component-registry');
  syncFromComponentRegistry(hookRegistry).catch(e => console.warn(`[loom] hook sync failed: ${e.message}`));
  const _hookSync = setInterval(() => syncFromComponentRegistry(hookRegistry).catch(() => {}), 30000);
  if (_hookSync.unref) _hookSync.unref();
  console.log(`[loom] hook registry active — ${hookRegistry.list().length} hooks (write authority)`);
} catch (e) {
  console.warn('[loom] hook registry init failed:', e.message);
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${PORT}`);
  const p = url.pathname;
  const method = req.method;

  try {
    // ── /api/hooks — full CRUD + wire/unwire (write authority) ──────────────
    if (hookRegistry && p.startsWith('/api/hooks')) {
      const seg = p.split('/').filter(Boolean); // api, hooks, [id], [verb]
      const id = seg[2];
      if (method === 'GET' && !id) {
        const filter = {};
        for (const k of ['type', 'status']) { const v = url.searchParams.get(k); if (v) filter[k] = v; }
        const layer = url.searchParams.get('layer'); if (layer) filter.layer = parseInt(layer);
        return json(res, 200, { ok: true, hooks: hookRegistry.list(filter), summary: hookRegistry.summary() });
      }
      if (method === 'GET' && id) {
        const hook = hookRegistry.get(id);
        return hook ? json(res, 200, { ok: true, hook }) : json(res, 404, { ok: false, error: 'hook not found' });
      }
      if (method === 'POST' && id === 'wire') {
        const { fromId, toId, notes, causedBy } = await readBody(req);
        try { return json(res, 200, { ok: true, binding: hookRegistry.wire(fromId, toId, { notes, causedBy }) }); }
        catch (e) { return json(res, 400, { ok: false, error: e.message }); }
      }
      if (method === 'POST' && id === 'unwire') {
        const { bindingId } = await readBody(req);
        try { hookRegistry.unwire(bindingId); return json(res, 200, { ok: true }); }
        catch (e) { return json(res, 400, { ok: false, error: e.message }); }
      }
      if (method === 'POST' && !id) {
        try { return json(res, 200, { ok: true, hook: hookRegistry.register(await readBody(req)) }); }
        catch (e) { return json(res, 400, { ok: false, error: e.message }); }
      }
      if (method === 'PATCH' && id) {
        try { return json(res, 200, { ok: true, hook: hookRegistry.update(id, await readBody(req)) }); }
        catch (e) { return json(res, 400, { ok: false, error: e.message }); }
      }
      if (method === 'DELETE' && id) {
        const body = await readBody(req).catch(() => ({}));
        if (body && body.hard) { hookRegistry.remove(id); return json(res, 200, { ok: true, removed: id }); }
        hookRegistry.deprecate(id, (body && body.reason) || 'deprecated', (body && body.causedBy) || 'api');
        return json(res, 200, { ok: true, deprecated: id });
      }
    }

    if (method === 'GET' && (p === '/' || p === '/ui')) {
      const html = fs.readFileSync(path.join(__dirname, 'ui', 'index.html'), 'utf8');
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(html);
      return;
    }

    if (method === 'GET' && p === '/events') {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache',
        'Connection': 'keep-alive', 'Access-Control-Allow-Origin': '*',
      });
      res.write(`data: ${JSON.stringify({ type: 'loom.connected', ts: Date.now() })}\n\n`);
      _sseClients.add(res);
      req.on('close', () => _sseClients.delete(res));
      return;
    }

    if (method === 'GET' && p === '/health') {
      // §2026-07-24 — loom is the registry authority (§17.1), so its health
      // reports what it owns. The UI tile binds to these; without them it
      // renders "—" forever. §12.6: every system owes a live diagnostic surface.
      let hooks = null, components = null;
      try { if (hookRegistry) hooks = hookRegistry.list().length; } catch (_) {}
      try { components = require('../lib/component-registry').list().length; } catch (_) {}
      return json(res, 200, {
        ok: true, systemId: SYSTEM_ID, version: VERSION,
        hooks: { total: hooks },
        components: { total: components },
      });
    }

    // §BUGFIX 2026-08-13 (P4) — a duplicate `GET /api/phasemap` handler used
    // to sit here (added while wiring forge-shell's LOOM tab, "§ADDED
    // 2026-08-13"). It matched the exact same route as the real §LP3
    // handler ~90 lines below and, being first in this if/return chain,
    // silently shadowed it on every request — the richer handler's title/
    // dependsOn fields AND its persistHistory() call (R0) never ran again
    // after that commit. Caught by tracing why forge-shell's hydration saw
    // only {id,status} on the wire (§16.5: one real handler, not two doing
    // the same job at different fidelity — the second, richer one below is
    // the one that stays). See loom/server.js's §LP3 comment for the real
    // route.

    // Same shape as every other sovereign system's /contract (phase 137
    // audit — cortex/bridge/architect all needed this added this session).
    if (method === 'GET' && p === '/contract') {
      // §FIXED 2026-09-20 (MCO7f/P2) — this was a hand-typed, 16-route
      // inline list, confirmed stale against loom's own real component
      // count: loom/registry-components.js declares 25. Same drift-proof
      // pattern ollama/clear-glass/versionium's own /contract routes
      // already use for exactly this reason — serve the live module,
      // not a hand-maintained copy of it.
      const components = require('./registry-components.js');
      return json(res, 200, {
        id: 'loom-v1', systemId: SYSTEM_ID, version: VERSION,
        routes: components.map(c => `${c.route.method} ${c.route.path}`),
      });
    }

    // ── Registry (LoomDriver) ────────────────────────────────────────────
    if (method === 'GET' && p.startsWith('/api/registry/')) {
      const parts = p.split('/').filter(Boolean); // ['api','registry',kind,id?]
      const kind = parts[2];
      const id = parts[3];
      if (id) {
        const rec = driver.registry.get(kind, decodeURIComponent(id));
        return rec ? json(res, 200, { ok: true, record: rec }) : json(res, 404, { ok: false, error: 'not found' });
      }
      return json(res, 200, { ok: true, kind, records: driver.registry.all(kind) });
    }

    if (method === 'POST' && p.startsWith('/api/registry/')) {
      const kind = p.split('/')[3];
      const payload = await readBody(req);
      const result = driver.declare(kind, payload);
      if (result.ok !== false) {
        cortexSync.record('add', kind, payload);
        _broadcast('loom.registry.declared', { kind, id: payload?.id });
      }
      return json(res, result.ok === false ? 409 : 200, result);
    }

    if (method === 'GET' && p === '/api/graph') {
      return json(res, 200, { ok: true, graph: driver.registry.graph() });
    }
    // §R5 2026-08-12 — the real zoom-in endpoint. "Look at architect" is the
    // literal gate: loom's structural graph() alone only shows generic
    // auto-scanned export/import edges — the real nuance (deprecated-for-
    // hook-writes, active-for-SNR-scan) lives in hooks/<system>.hooks.js's
    // OWN exported status field, a genuinely separate data source, checked
    // and confirmed before building this (loom's registry.all('hook') does
    // NOT carry it). This combines both, live, plus open gaps + history —
    // a rendering aggregation over real sources, not a cached snapshot that
    // could drift the way hooks/architect.hooks.js itself drifted earlier
    // this session.
    if (method === 'GET' && p.startsWith('/api/component/')) {
      const system = decodeURIComponent(p.slice('/api/component/'.length));
      if (!system) return json(res, 400, { ok: false, error: 'system required' });
      const graph = driver.registry.graph();
      const structuralNodes = graph.nodes.filter(n => n.component_id && n.component_id.includes(`.${system}.`) || n.component_id === `nexus.${system}`);
      let declared = null;
      try {
        const hooksFile = require(`../hooks/${system}.hooks.js`);
        declared = { systemId: hooksFile.systemId, port: hooksFile.port, version: hooksFile.version, updatedAt: hooksFile.updatedAt, hooks: hooksFile.hooks, activeCount: hooksFile.active().length, totalCount: hooksFile.hooks.length };
      } catch (_) { /* not every system has a hand-declared hooks.js — honest absence, not an error */ }
      const gaps = gapField.openGaps({ limit: 500 }).filter(g => (g.source || '').includes(system));
      const history = componentLedger.bySystem(system, 100);
      return json(res, 200, { ok: true, system, structuralNodes, declared, gaps, gapCount: gaps.length, history, historyCount: history.length });
    }
    // §LP3 — the phasemap section. Bare /api/phasemap is the whole roadmap
    // (loadAll() + summary()); /api/phasemap/:system is one system's roadmap
    // (forSystem()) — the same has/get shape /api/registry/:kind already uses
    // below, so the UI's fetch pattern doesn't need anything new either.
    if (method === 'GET' && p === '/api/phasemap') {
      const all = phasemapMap.loadAll();
      // §R0 2026-08-12 — every real query now also persists the history diff,
      // best-effort, never blocking the response. This is what makes
      // "updates over time" actually true instead of a live-only snapshot —
      // James: "loom should already have a phasemap system... log the phase
      // maps." Fire-and-forget on purpose: a slow/failed history write must
      // never make the phasemap view itself unavailable (§1.2).
      try { phasemapMap.persistHistory().catch(() => {}); } catch (_) {}   // 0.39.263 — async (asks versionium)
      return json(res, 200, { ok: true, ...all, summary: phasemapMap.summary() });
    }
    // §R0 2026-08-12 — real transition history for one phase: /api/phasemap/
    // history/:map/:phaseId — "what did this phase's status say last
    // Tuesday," now an actual answerable query, not a live-only snapshot.
    // MUST be checked before the general /api/phasemap/:system route below,
    // or "history" gets swallowed as a bogus system name (caught before
    // shipping, not after — checked route order deliberately, not assumed).
    if (method === 'GET' && p.startsWith('/api/phasemap/history/')) {
      const rest = p.slice('/api/phasemap/history/'.length).split('/');
      const map = decodeURIComponent(rest[0] || '');
      const phaseId = decodeURIComponent(rest[1] || '');
      if (!map || !phaseId) return json(res, 400, { ok: false, error: 'map and phaseId required — /api/phasemap/history/:map/:phaseId' });
      const history = phasemapMap.historyFor(map, phaseId);
      return json(res, 200, { ok: true, map, phaseId, history, count: history.length });
    }
    if (method === 'GET' && p.startsWith('/api/phasemap/')) {
      const system = decodeURIComponent(p.slice('/api/phasemap/'.length));
      if (!system) return json(res, 400, { ok: false, error: 'system required' });
      return json(res, 200, { ok: true, roadmap: phasemapMap.forSystem(system) });
    }
    // §2026-08-09 — the gap field, live in loom. "Loom is supposed to be the
    // system that expands the system" (James) — phasemap showed what NEXUS
    // is becoming; this shows where it's currently uncertain about itself,
    // system-domain and user-model-domain gaps through the same agnostic
    // pipeline (lib/gap-field.js), same has/get shape as phasemap above.
    if (method === 'GET' && p === '/api/gaps') {
      const domain = url.searchParams.get('domain') || null;
      const gaps = gapField.openGaps({ domain, limit: 200 });
      return json(res, 200, { ok: true, gaps, count: gaps.length, domain: domain || 'all' });
    }
    if (method === 'GET' && p.startsWith('/api/gaps/')) {
      const domain = decodeURIComponent(p.slice('/api/gaps/'.length));
      if (!domain) return json(res, 400, { ok: false, error: 'domain required' });
      const gaps = gapField.openGaps({ domain, limit: 200 });
      return json(res, 200, { ok: true, gaps, count: gaps.length, domain });
    }
    // §R4 2026-08-12 — James: "a ledger to log each system change to a
    // ledger in cortex... each system has its own timeline, nexus has its
    // own." lib/component-ledger.js was already real, already 15,472+ rows
    // deep (5,290 after cleaning ~10,300 rows of accumulated test
    // pollution found along the way, system ids like bl7-<timestamp> that
    // leaked from a test lacking real cleanup) — loom just never once
    // queried it. This reads the existing ledger, does not create a
    // second one (§10.3).
    if (method === 'GET' && p === '/api/history') {
      const rows = componentLedger.tail(200);
      return json(res, 200, { ok: true, history: rows, count: rows.length });
    }
    // §MCO05 2026-09-18 — real, durable per-version changelog. Distinct
    // from /api/history above (component MOVEMENT) — this is "what
    // shipped in version X.Y.Z," recorded once per version, never
    // edited (loom/lib/changelog.js's own real append-only guarantee).
    if (method === 'GET' && p === '/api/changelog') {
      const changelog = require('./lib/changelog.js');
      return json(res, 200, { ok: true, changelog: changelog.getChangelog() });
    }
    if (method === 'GET' && p.startsWith('/api/changelog/')) {
      const version = decodeURIComponent(p.slice('/api/changelog/'.length));
      const changelog = require('./lib/changelog.js');
      const entry = changelog.getVersion(version);
      if (!entry) return json(res, 404, { ok: false, error: `no changelog entry for version "${version}"` });
      return json(res, 200, { ok: true, entry });
    }
    if (method === 'POST' && p === '/api/changelog') {
      const changelog = require('./lib/changelog.js');
      const body = await readBody(req);
      const result = changelog.recordVersion(body);
      return json(res, result.ok ? 200 : 400, result);
    }
    if (method === 'GET' && p.startsWith('/api/history/system/')) {
      const system = decodeURIComponent(p.slice('/api/history/system/'.length));
      if (!system) return json(res, 400, { ok: false, error: 'system required' });
      const rows = componentLedger.bySystem(system, 200);
      return json(res, 200, { ok: true, history: rows, count: rows.length, system });
    }
    if (method === 'GET' && p.startsWith('/api/history/component/')) {
      const component = decodeURIComponent(p.slice('/api/history/component/'.length));
      if (!component) return json(res, 400, { ok: false, error: 'component required' });
      const rows = componentLedger.byComponent(component, 200);
      return json(res, 200, { ok: true, history: rows, count: rows.length, component });
    }
    if (method === 'GET' && p.startsWith('/api/history/session/')) {
      const session = decodeURIComponent(p.slice('/api/history/session/'.length));
      if (!session) return json(res, 400, { ok: false, error: 'session required' });
      const rows = componentLedger.bySession(session, 500);
      return json(res, 200, { ok: true, history: rows, count: rows.length, session });
    }
    // §2026-08-09 — friction + tension, proxied live from the real diagnostic
    // kernel (service/nexus-diagnostic.js, :7825), not recomputed here. Its
    // own /friction and /tension endpoints already exist and are real —
    // this is loom asking the kernel, honestly, not a second implementation.
    // If the kernel isn't up, that's the truth of the answer, not papered
    // over with a fake 200.
    if (method === 'GET' && p === '/api/friction') {
      const r = await connections.call({ scope: 'diagnostic-kernel', url: `${DIAG_URL}/friction`, timeoutMs: 4000 });
      if (!r.ok) return json(res, 502, { ok: false, error: 'diagnostic kernel unreachable', reason: r.reason });
      return json(res, 200, r.body);
    }
    if (method === 'GET' && p === '/api/tension') {
      const r = await connections.call({ scope: 'diagnostic-kernel', url: `${DIAG_URL}/tension`, timeoutMs: 4000 });
      if (!r.ok) return json(res, 502, { ok: false, error: 'diagnostic kernel unreachable', reason: r.reason });
      return json(res, 200, r.body);
    }
    // §part_2 2026-07-10 — the semantic query layer. context-graph resolves
    // wires to component-level relations with intent; impact answers "if this
    // breaks, who fails downstream and what intents break". This is what makes
    // the registry a queryable nervous system, not just a filing cabinet.
    if (method === 'GET' && p === '/api/context-graph') {
      return json(res, 200, { ok: true, contextGraph: driver.registry.contextGraph() });
    }
    if (method === 'GET' && p.startsWith('/api/impact/')) {
      const componentId = decodeURIComponent(p.slice('/api/impact/'.length));
      if (!componentId) return json(res, 400, { ok: false, error: 'component id required' });
      return json(res, 200, { ok: true, impact: driver.registry.impactOf(componentId) });
    }

    // ── Ingest (LoomIngest) — old iteration zips ─────────────────────────
    // POST /api/ingest {zipPath, label} — matches LoomIngest's own contract:
    // "the function a drop handler will call once UI exists." zipPath must
    // be a path already on this machine (an uploaded file's saved path,
    // or a CLI-supplied path) — this endpoint does not accept raw upload
    // bytes; that's a separate, later concern (multipart handling), not
    // implied by wiring the existing ingest call in.
    if (method === 'POST' && p === '/api/ingest') {
      const body = await readBody(req);
      if (!body?.zipPath) return json(res, 400, { ok: false, error: 'zipPath is required' });
      try {
        const record = ingest.ingestZip(body.zipPath, { label: body.label });
        cortexSync.record('ingest', 'revision', record);
        _broadcast('loom.revision.ingested', { id: record.id, label: record.label, alreadyIngested: !!record.alreadyIngested });
        return json(res, 200, { ok: true, record: { ...record, _rawEntries: undefined } });
      } catch (e) { return json(res, 400, { ok: false, error: e.message }); }
    }

    if (method === 'GET' && p === '/api/revisions') {
      // §fix: RevisionRegistry.all() returns {id: record, ...}, not an
      // array — Object.values(), not .map() directly on the result.
      const revisions = Object.values(ingest.revisions.all()).map(r => ({ ...r, _rawEntries: undefined }));
      return json(res, 200, { ok: true, revisions });
    }

    if (method === 'GET' && /^\/api\/revisions\/[^/]+$/.test(p)) {
      const id = decodeURIComponent(p.split('/')[3]);
      const record = ingest.revisions.get(id);
      if (!record) return json(res, 404, { ok: false, error: 'not found' });
      return json(res, 200, { ok: true, record: { ...record, _rawEntries: undefined }, summary: ingest.summary(id) });
    }

    // ── Scaffold (system-scaffold.js) — templates + custom operations ────────
    // GET /api/templates — named, pre-built operation sets a checkbox UI
    // picks from. Each entry is real operations, in system-scaffold's own
    // {id, verb, method, apiPath, params, description} shape — checking a
    // template box and unchecking one operation from it is a normal edit,
    // not a special case, because both paths produce the same operations
    // array scaffoldSystem() already accepts.
    if (method === 'GET' && p === '/api/templates') {
      return json(res, 200, { ok: true, templates: SCAFFOLD_TEMPLATES });
    }

    // POST /api/ingest-upload — real file upload, the actual drag-and-drop
    // path. Filename comes via X-Filename header (URL-encoded) since this
    // is a raw binary body, not multipart/form-data — no new dependency
    // added for it, same zero-dependency stance loom/ingest/index.js's own
    // header states. Saves to disk, then runs the exact same ingestZip()
    // the path-based /api/ingest above uses — one ingest engine, two ways
    // to hand it a file.
    if (method === 'POST' && p === '/api/ingest-upload') {
      const rawName = req.headers['x-filename'];
      if (!rawName) return json(res, 400, { ok: false, error: 'X-Filename header is required' });
      const filename = decodeURIComponent(rawName).replace(/[^a-zA-Z0-9._-]/g, '_');
      let buf;
      try { buf = await readRawBody(req); }
      catch (e) { return json(res, 413, { ok: false, error: e.message }); }
      if (!buf.length) return json(res, 400, { ok: false, error: 'empty upload' });

      const uploadDir = path.join(__dirname, '..', 'data', 'loom', 'uploads');
      fs.mkdirSync(uploadDir, { recursive: true });
      const savedPath = path.join(uploadDir, `${Date.now()}__${filename}`);
      fs.writeFileSync(savedPath, buf);

      try {
        const record = ingest.ingestZip(savedPath, { label: filename });
        cortexSync.record('ingest', 'revision', record);
        _broadcast('loom.revision.ingested', { id: record.id, label: record.label, alreadyIngested: !!record.alreadyIngested });
        return json(res, 200, { ok: true, record: { ...record, _rawEntries: undefined } });
      } catch (e) { return json(res, 400, { ok: false, error: e.message }); }
    }

    if (method === 'POST' && p === '/api/scaffold') {
      const body = await readBody(req);
      const { name, port, purpose, operations } = body || {};
      if (!name || !port || !operations) {
        return json(res, 400, { ok: false, error: 'name, port, and operations are required' });
      }
      try {
        const result = scaffoldSystem(name, {
          port, purpose, operations,
          outDir: path.join(__dirname, '..', 'data', 'loom', 'scaffolded'),
          // no dataDir override — same loom/data/registry.json the live
          // `driver` above already reads, so a scaffolded component shows
          // up in /api/registry and /api/graph immediately, not in a
          // second, disconnected registry file.
        });
        cortexSync.record('scaffold', 'component', { name, port, operations: operations.map(o => o.id) });
        _broadcast('loom.system.scaffolded', { name, port, fileCount: result.written.length });
        return json(res, 200, { ok: true, ...result });
      } catch (e) { return json(res, 400, { ok: false, error: e.message }); }
    }

    // ── Contracts (LoomContracts) ────────────────────────────────────────
    if (method === 'POST' && p === '/api/contracts') {
      const body = await readBody(req);
      try {
        const contract = contracts.openContract(body);
        cortexSync.record('contract-open', 'contract', contract);
        _broadcast('loom.contract.opened', { id: contract?.id, componentId: body?.componentId });
        return json(res, 200, { ok: true, contract });
      } catch (e) { return json(res, 400, { ok: false, error: e.message }); }
    }

    if (method === 'POST' && /^\/api\/contracts\/[^/]+\/handoff$/.test(p)) {
      const id = p.split('/')[3];
      const body = await readBody(req);
      try {
        const contract = contracts.recordHandoff(id, body);
        _broadcast('loom.contract.handoff', { id });
        return json(res, 200, { ok: true, contract });
      } catch (e) { return json(res, 400, { ok: false, error: e.message }); }
    }

    if (method === 'POST' && /^\/api\/contracts\/[^/]+\/close$/.test(p)) {
      const id = p.split('/')[3];
      const body = await readBody(req);
      try {
        const contract = contracts.closeContract(id, body);
        cortexSync.record('contract-close', 'contract', contract);
        _broadcast('loom.contract.closed', { id, status: contract?.status });
        return json(res, 200, { ok: true, contract });
      } catch (e) { return json(res, 400, { ok: false, error: e.message }); }
    }

    json(res, 404, { ok: false, error: 'not found' });
  } catch (e) {
    json(res, 500, { ok: false, error: e.message });
  }
});

// ── Register with orchestrator — same pattern every sovereign system uses ──
function register() {
  const body = JSON.stringify({
    systemId: SYSTEM_ID, port: PORT, version: VERSION, status: 'online',
    meta: { label: 'LOOM', color: '#33bb88' }, components: require('../lib/component-registry').normalizeDeclarations(require('./registry-components')),
  });
  const u = new URL(`${OR_URL}/api/register`);
  const r = http.request({ hostname: u.hostname, port: u.port || 9000, path: u.pathname,
    method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
    timeout: 4000 }, () => {
    console.log('[loom] registered');
    try {
      const { startHeartbeat } = require('../nexus/nexus-connect');
      startHeartbeat(SYSTEM_ID, PORT);
    } catch (_) { /* nexus-connect optional — never crash the server over a heartbeat */ }
  });
  r.on('error', () => setTimeout(register, 5000));
  r.write(body); r.end();
}

server.listen(PORT, () => {
  console.log(`[loom] :${PORT} — v${VERSION} — component/hook/wire/seam registry + contracts`);
  setTimeout(register, 1000);
});

module.exports = { server, driver, contracts };
