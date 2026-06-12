'use strict';
/**
 * architect/service.js — The Architect HTTP Service
 * Port: 3747
 * UUID: architect-service-v1-0000-4000
 *
 * Full service. Registers with orchestrator. Wired to cortex JAA.
 * Serves all Architect API routes. Emits on SISO bus.
 * Boot order: JAA → HookRegistry → Blueprint/SNR/Translate → HTTP → Register
 *
 * §A-1  Architecture before implementation. This service IS the implementation.
 * §3.1  Load order is law. JAA before registry. Registry before HTTP.
 * §2.1  JAA write before behavior. Always.
 * §1.2  Nothing silently fails.
 */

'use strict';

const http   = require('http');
const path   = require('path');
const fs     = require('fs');
const { randomUUID } = require('crypto');

const { HookRegistry }          = require('./src/hooks/Registry');
const { Blueprint, SNRGate, Translate, scanTopology } = require('./src/spec/Blueprint');
// Living hook registry — the canonical wire map for all NEXUS systems
const systemHooks = (() => { try { return require('../hooks'); } catch(_) { return null; } })();
const { createCompileRoutes }   = (() => { try { return require('./compile-route'); } catch(_) { return { createCompileRoutes: null }; } })();

const PORT = process.env.ARCHITECT_PORT || 3747;
const CORTEX_PORT = process.env.CORTEX_PORT || 3748;
const ORCH_PORT   = process.env.ORCH_PORT   || 9000;
const DATA_DIR    = path.join(__dirname, 'data');

// ── JAA adapter ─────────────────────────────────────────────────────────────
// Architect uses a flat-file JSONL store (same pattern as cortex)
// If cortex JAA is available, delegate to it. Otherwise use local file store.
function createJAA(dataDir) {
  const tables = new Map(); // table name → row[]
  const TABLES = [
    'hooks','hook_bindings','blueprints','topology_maps',
    'schema_sets','clips','behaviors','snr_results',
    'gaps','tensions','constraints','sessions','grammar',
    'personal_vectors','event_log',
  ];
  // Load from disk
  for (const t of TABLES) {
    const fp = path.join(dataDir, t + '.jsonl');
    const rows = [];
    try {
      const lines = fs.readFileSync(fp, 'utf8').split('\n').filter(Boolean);
      for (const l of lines) { try { rows.push(JSON.parse(l)); } catch(_) {} }
    } catch(_) {}
    tables.set(t, rows);
  }

  const flush = (t) => {
    const fp = path.join(dataDir, t + '.jsonl');
    try {
      fs.mkdirSync(dataDir, { recursive: true });
      const rows = tables.get(t) || [];
      // Append-only: write the last entry only (already in memory)
      const last = rows[rows.length - 1];
      if (last) fs.appendFileSync(fp, JSON.stringify(last) + '\n');
    } catch(e) { console.error(`[architect/jaa] §1.2 flush ${t}: ${e.message}`); }
  };

  return {
    insert(t, row) {
      if (!tables.has(t)) tables.set(t, []);
      const r = { uuid: randomUUID(), ts: Date.now(), ...row };
      tables.get(t).push(r);
      flush(t);
      return r;
    },
    query(t, fn = () => true, limit = 500) {
      return (tables.get(t) || []).filter(fn).slice(-limit);
    },
    get(t, id) {
      return (tables.get(t) || []).find(r => r.uuid === id || r.id === id) || null;
    },
    stats() {
      const o = {};
      for (const [t, rows] of tables) if (rows.length) o[t] = rows.length;
      return o;
    },
    tables: () => TABLES,
  };
}

// ── SISO bus emitter (fires to cortex and orchestrator) ───────────────────
function createBusEmit(nc) {
  return function busEmit(type, payload = {}) {
    try {
      const req = http.request({
        hostname: '127.0.0.1', port: CORTEX_PORT, path: '/api/event',
        method: 'POST', headers: { 'Content-Type': 'application/json' },
      }, () => {});
      req.on('error', () => {}); // §1.2 — never crash on cortex unavailable
      req.end(JSON.stringify({
        type, payload: { ...payload, _source: 'architect', _ts: Date.now() },
        source: 'architect', causedBy: null, ts: Date.now(),
      }));
    } catch(_) {}
  };
}

// ── Register with orchestrator ────────────────────────────────────────────
function registerWithOrchestrator() {
  const body = JSON.stringify({
    systemId: 'architect', port: PORT, version: '3.0.0',
    label: 'Architect', healthPath: '/health',
    uuid: 'architect-service-v1-0000-4000',
    hooks: [], timestamp: Date.now(),
  });
  const req = http.request({
    hostname: '127.0.0.1', port: ORCH_PORT, path: '/api/register',
    method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
  }, () => {});
  req.on('error', () => {});
  req.end(body);
}

// ── HTTP helpers ──────────────────────────────────────────────────────────
function json(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, { 'Content-Type':'application/json', 'Access-Control-Allow-Origin':'*', 'Access-Control-Allow-Headers':'*' });
  res.end(body);
}

function readBody(req) {
  return new Promise(resolve => {
    const chunks = [];
    req.on('data', d => chunks.push(d));
    req.on('end',  () => { try { resolve(JSON.parse(Buffer.concat(chunks).toString())); } catch(_) { resolve({}); } });
  });
}

// ── Boot ───────────────────────────────────────────────────────────────────
async function boot() {
  console.log('[architect] §3.1 boot — L0: data dir');
  fs.mkdirSync(DATA_DIR, { recursive: true });

  // Phase 1 HARD: JAA
  console.log('[architect] §3.1 Phase 1: JAA init');
  const jaa = createJAA(DATA_DIR);

  // Phase 2 HARD: Bus
  const busEmit = createBusEmit();

  // Phase 3 HARD: Hook Registry
  console.log('[architect] §3.1 Phase 2: Hook Registry');
  const registry = new HookRegistry({ jaa, busEmit });
  registry.init();

  // Phase 4 HARD: Spec Engine
  console.log('[architect] §3.1 Phase 3: Spec Engine');
  const blueprint = new Blueprint({ jaa, hooks: registry, busEmit });
  const snrGate   = new SNRGate({ jaa, busEmit });
  const translate  = new Translate();
  const handleCompileRoute = createCompileRoutes ? createCompileRoutes({ jaa, busEmit, architectRoot: __dirname }) : null;

  // ── Seed built-in hooks (first boot) ────────────────────────────────────
  if (registry.list().length === 0) {
    _seedBuiltinHooks(registry);
    // Also seed from living hooks registry (hooks/*.hooks.js)
    if (systemHooks) {
      const allHooks = systemHooks.allHooks ? systemHooks.allHooks() : [];
      let seeded = 0;
      for (const hook of allHooks) {
        try { registry.register(hook); seeded++; }
        catch(_) {} // skip duplicates
      }
      if (seeded > 0) console.log(`[architect] seeded ${seeded} hooks from living registry`);
    }
  }

  // Phase 5 HARD: HTTP server
  console.log(`[architect] §3.1 Phase 4: HTTP :${PORT}`);
  const server = http.createServer(async (req, res) => {
    const method = req.method;
    const url    = new URL(req.url, `http://127.0.0.1:${PORT}`);
    const path_  = url.pathname;

    if (method === 'OPTIONS') {
      res.writeHead(204, { 'Access-Control-Allow-Origin':'*','Access-Control-Allow-Methods':'GET,POST,PUT,DELETE,PATCH,OPTIONS','Access-Control-Allow-Headers':'*' });
      return res.end();
    }

    try {
      // ── Health ──────────────────────────────────────────────────────────
      if (method === 'GET' && path_ === '/health') {
        return json(res, 200, { ok: true, system: 'architect', port: PORT, version: '3.0.0',
          uptime: process.uptime(), jaa: jaa.stats(),
          hooks: registry.summary(), ts: Date.now() });
      }

      // ── Hook Registry ────────────────────────────────────────────────────
      if (path_.startsWith('/api/hooks')) {
        const seg = path_.split('/').filter(Boolean);
        const id  = seg[2];

        // GET /api/hooks — list
        if (method === 'GET' && !id) {
          const type    = url.searchParams.get('type');
          const layer   = url.searchParams.get('layer');
          const status_ = url.searchParams.get('status');
          const filter  = {};
          if (type)    filter.type   = type;
          if (status_) filter.status = status_;
          if (layer)   filter.layer  = parseInt(layer);
          return json(res, 200, { ok: true, hooks: registry.list(filter), summary: registry.summary() });
        }
        // GET /api/hooks/:id
        if (method === 'GET' && id) {
          const hook = registry.get(id);
          if (!hook) return json(res, 404, { ok: false, error: 'hook not found' });
          return json(res, 200, { ok: true, hook });
        }
        // POST /api/hooks — register
        if (method === 'POST' && !id) {
          const body = await readBody(req);
          try {
            const hook = registry.register(body);
            busEmit('architect.hook.registered', { uuid: hook.uuid, name: hook.name });
            return json(res, 201, { ok: true, hook });
          } catch(e) { return json(res, 400, { ok: false, error: e.message }); }
        }
        // PATCH /api/hooks/:id — update
        if (method === 'PATCH' && id) {
          const body = await readBody(req);
          try {
            const hook = registry.update(id, body);
            return json(res, 200, { ok: true, hook });
          } catch(e) { return json(res, 400, { ok: false, error: e.message }); }
        }
        // DELETE /api/hooks/:id — deprecate (soft) or remove (hard)
        if (method === 'DELETE' && id) {
          const { hard, reason, causedBy } = await readBody(req).catch(() => ({}));
          try {
            if (hard) { registry.remove(id); return json(res, 200, { ok: true, removed: id }); }
            registry.deprecate(id, reason || 'deprecated', causedBy || 'api');
            return json(res, 200, { ok: true, deprecated: id });
          } catch(e) { return json(res, 400, { ok: false, error: e.message }); }
        }
        // POST /api/hooks/wire
        if (method === 'POST' && id === 'wire') {
          const { fromId, toId, notes, causedBy } = await readBody(req);
          try {
            const binding = registry.wire(fromId, toId, { notes, causedBy });
            return json(res, 201, { ok: true, binding });
          } catch(e) { return json(res, 400, { ok: false, error: e.message }); }
        }
        // DELETE /api/hooks/unwire/:bindingId
        if (method === 'DELETE' && id === 'unwire') {
          const bindingId = seg[3];
          try { registry.unwire(bindingId); return json(res, 200, { ok: true }); }
          catch(e) { return json(res, 400, { ok: false, error: e.message }); }
        }
        // GET /api/hooks/validate
        if (method === 'GET' && id === 'validate') {
          return json(res, 200, { ok: true, report: registry.validate() });
        }
        // GET /api/hooks/graph
        if (method === 'GET' && id === 'graph') {
          const format = url.searchParams.get('format') || 'json';
          return json(res, 200, { ok: true, graph: registry.graph(format) });
        }
      }

      // ── Blueprint ─────────────────────────────────────────────────────────
      if (path_.startsWith('/api/blueprint')) {
        const seg = path_.split('/').filter(Boolean);
        const action = seg[2];

        // GET /api/blueprint — list
        if (method === 'GET' && !action) {
          return json(res, 200, { ok: true, blueprints: blueprint.list() });
        }
        // GET /api/blueprint/:id
        if (method === 'GET' && action && action !== 'scan' && action !== 'diff') {
          const bp = blueprint.read(action);
          if (!bp) return json(res, 404, { ok: false, error: 'blueprint not found' });
          return json(res, 200, { ok: true, blueprint: bp });
        }
        // POST /api/blueprint/scan — scan a path
        if (method === 'POST' && action === 'scan') {
          const { rootPath, opts } = await readBody(req);
          if (!rootPath) return json(res, 400, { ok: false, error: 'rootPath required' });
          try {
            const bp = blueprint.fromScan(rootPath, opts || {});
            return json(res, 201, { ok: true, blueprint: bp });
          } catch(e) { return json(res, 500, { ok: false, error: e.message }); }
        }
        // POST /api/blueprint/diff
        if (method === 'POST' && action === 'diff') {
          const { a, b } = await readBody(req);
          const bpA = blueprint.read(a), bpB = blueprint.read(b);
          if (!bpA || !bpB) return json(res, 400, { ok: false, error: 'one or both blueprints not found' });
          return json(res, 200, { ok: true, diff: blueprint.diff(bpA, bpB) });
        }
      }

      // ── SNR Gate ───────────────────────────────────────────────────────────
      if (path_.startsWith('/api/snr')) {
        const seg = path_.split('/').filter(Boolean);
        const action = seg[2];
        // POST /api/snr/check
        if (method === 'POST' && action === 'check') {
          const { source, context } = await readBody(req);
          const result = snrGate.check(source, context || {});
          return json(res, 200, { ok: true, result });
        }
        // GET /api/snr/history/:sourceId
        if (method === 'GET' && action === 'history') {
          const sourceId = seg[3];
          return json(res, 200, { ok: true, history: snrGate.history(sourceId) });
        }
        // POST /api/snr/route — run SNR then route output to correct downstream
        if (method === 'POST' && action === 'route') {
          const body = await readBody(req);
          const { source, context, opts } = body;
          if (!source) return json(res, 400, { ok: false, error: 'source required' });
          try {
            const routeResult = await snrGate.route(source, context || {}, opts || {});
            busEmit('architect.snr.routed', { sourceId: source.id, score: routeResult.snr.score, target: routeResult.target });
            return json(res, 200, { ok: true, ...routeResult });
          } catch(e) { return json(res, 500, { ok: false, error: e.message }); }
        }

        // GET /api/snr — recent results
        if (method === 'GET' && !action) {
          const results = jaa.query('snr_results', () => true, 20).map(r => r.data || r);
          return json(res, 200, { ok: true, results });
        }
      }

      // ── Translate (UTL) ───────────────────────────────────────────────────
      if (path_.startsWith('/api/translate')) {
        const seg = path_.split('/').filter(Boolean);
        const action = seg[2];

        // POST /api/translate/utl — raw text → constraint objects
        if (method === 'POST' && action === 'utl') {
          const { text } = await readBody(req);
          if (!text) return json(res, 400, { ok: false, error: 'text required' });
          const result = translate.utl(text);
          jaa.insert('event_log', { type: 'architect.utl.processed', payload: { type_signature: result.type_signature, confidence: result.confidence, constraints: result.constraints.length }, source: 'translate', ts: Date.now() });
          return json(res, 200, { ok: true, result });
        }

        // POST /api/translate/clip-to-timeline — Clip → timeline
        if (method === 'POST' && action === 'clip-to-timeline') {
          const { clip, format } = await readBody(req);
          return json(res, 200, { ok: true, timeline: translate.clipToTimeline(clip, format || 'markdown') });
        }

        // POST /api/translate/schema-to-types — JSON Schema → TypeScript
        if (method === 'POST' && action === 'schema-to-types') {
          const { schema, name } = await readBody(req);
          if (!schema) return json(res, 400, { ok: false, error: 'schema required' });
          return json(res, 200, { ok: true, types: translate.schemaToTypes(schema, name || 'Schema') });
        }

        // POST /api/translate/field-to-schema — ConstraintField → JSON Schema
        if (method === 'POST' && action === 'field-to-schema') {
          const { field } = await readBody(req);
          return json(res, 200, { ok: true, schema: translate.fieldToSchema(field) });
        }

        // POST /api/translate/seam-to-js — Seam phrase → JS handler
        if (method === 'POST' && action === 'seam-to-js') {
          const { phrase } = await readBody(req);
          if (!phrase) return json(res, 400, { ok: false, error: 'phrase required' });
          return json(res, 200, { ok: true, js: translate.seamToJs(phrase) });
        }

        // POST /api/translate/blueprint-to-spec — Blueprint → .spec structure
        if (method === 'POST' && action === 'blueprint-to-spec') {
          const { blueprintId } = await readBody(req);
          const bp = blueprintId ? blueprint.read(blueprintId) : null;
          if (!bp) return json(res, 404, { ok: false, error: 'blueprint not found' });
          return json(res, 200, { ok: true, spec: translate.blueprintToSpec(bp) });
        }
      }

      // ── Spec Compiler integration ────────────────────────────────────────
      if (path_.startsWith('/api/compile') && handleCompileRoute) {
        const result = await handleCompileRoute(method, path_, req, res, url, readBody, json);
        if (result !== null) return result;
      }

      // ── Spec Builder UI ──────────────────────────────────────────────────
      if (path_ === '/ui/spec-builder' && method === 'GET') {
        const htmlPath = path.join(__dirname, 'src', 'ui', 'spec-builder.html');
        try {
          const content = fs.readFileSync(htmlPath, 'utf8');
          res.writeHead(200, { 'Content-Type':'text/html; charset=utf-8', 'Access-Control-Allow-Origin':'*' });
          return res.end(content);
        } catch(_) { return json(res, 404, { ok: false, error: 'spec-builder not found' }); }
      }

      // ── Topology Map ─────────────────────────────────────────────────────
      if (path_.startsWith('/api/map')) {
        const seg = path_.split('/').filter(Boolean);
        const action = seg[2];
        if (method === 'POST' && action === 'scan') {
          const { rootPath, opts } = await readBody(req);
          if (!rootPath) return json(res, 400, { ok: false, error: 'rootPath required' });
          try {
            const map = scanTopology(rootPath, opts || {});
            const record = jaa.insert('topology_maps', { data: map, causedBy: 'api.map.scan' });
            busEmit('architect.map.scanned', { id: record.uuid, rootPath, fileCount: map.files.length, gapCount: map.gaps.length });
            return json(res, 201, { ok: true, map, id: record.uuid });
          } catch(e) { return json(res, 500, { ok: false, error: e.message }); }
        }
        if (method === 'GET' && !action) {
          const maps = jaa.query('topology_maps', () => true, 20).map(r => ({ id: r.uuid, ...r.data, ts: r.ts }));
          return json(res, 200, { ok: true, maps });
        }
      }

      // ── Gaps ──────────────────────────────────────────────────────────────
      if (path_.startsWith('/api/gaps')) {
        if (method === 'GET') {
          const status_ = url.searchParams.get('status') || 'open';
          const gaps = jaa.query('gaps', r => (r.data?.status || r.status) === status_ || status_ === 'all', 100)
            .map(r => r.data || r);
          return json(res, 200, { ok: true, gaps, total: gaps.length });
        }
        if (method === 'POST') {
          const body = await readBody(req);
          const gap = { id: randomUUID(), status: 'open', ...body, createdAt: Date.now() };
          const record = jaa.insert('gaps', { op: 'open', data: gap, causedBy: body.causedBy || 'api', ts: Date.now() });
          busEmit('architect.gap.opened', { id: gap.id, severity: gap.severity });
          return json(res, 201, { ok: true, gap, uuid: record.uuid });
        }
      }

      // ── Event log (write) ────────────────────────────────────────────────
      if (path_ === '/api/event' && method === 'POST') {
        const body = await readBody(req);
        jaa.insert('event_log', { type: body.type, payload: body.payload || {}, source: body.source, ts: Date.now() });
        return json(res, 200, { ok: true });
      }

      // ── Spec file operations (read the spec doc itself) ──────────────────
      if (path_ === '/api/spec' && method === 'GET') {
        const specPath = path.join(__dirname, 'docs', 'ARCHITECT-SPEC-v1.1.0.md');
        try {
          const content = fs.readFileSync(specPath, 'utf8');
          res.writeHead(200, { 'Content-Type':'text/markdown; charset=utf-8', 'Access-Control-Allow-Origin':'*' });
          return res.end(content);
        } catch(e) { return json(res, 404, { ok: false, error: 'spec not found' }); }
      }

      // ── Architect universe SVG ───────────────────────────────────────────
      if (path_ === '/ui/architect-universe.svg' && method === 'GET') {
        const svgPath = path.join(__dirname, 'src', 'ui', 'architect_universe.svg');
        try {
          const content = fs.readFileSync(svgPath);
          res.writeHead(200, { 'Content-Type':'image/svg+xml', 'Access-Control-Allow-Origin':'*' });
          return res.end(content);
        } catch(_) { return json(res, 404, { ok: false, error: 'svg not found' }); }
      }

      // ── arch-builder canvas ──────────────────────────────────────────────
      if (path_ === '/ui/arch-builder' && method === 'GET') {
        const htmlPath = path.join(__dirname, 'src', 'ui', 'arch-builder.html');
        try {
          const content = fs.readFileSync(htmlPath, 'utf8');
          res.writeHead(200, { 'Content-Type':'text/html; charset=utf-8', 'Access-Control-Allow-Origin':'*' });
          return res.end(content);
        } catch(_) { return json(res, 404, { ok: false, error: 'arch-builder not found' }); }
      }

      // ── ALK lattice 3D ───────────────────────────────────────────────────
      if (path_ === '/ui/alk-lattice' && method === 'GET') {
        const htmlPath = path.join(__dirname, 'src', 'ui', 'alk-lattice.html');
        try {
          const content = fs.readFileSync(htmlPath, 'utf8');
          res.writeHead(200, { 'Content-Type':'text/html; charset=utf-8', 'Access-Control-Allow-Origin':'*' });
          return res.end(content);
        } catch(_) { return json(res, 404, { ok: false, error: 'alk-lattice not found' }); }
      }

      json(res, 404, { ok: false, error: `${method} ${path_} not found` });
    } catch(e) {
      console.error(`[architect] §1.2 request error: ${e.message}`);
      json(res, 500, { ok: false, error: e.message });
    }
  });

  server.listen(PORT, '127.0.0.1', () => {
    console.log(`[architect] ONLINE :${PORT}`);
    jaa.insert('event_log', { type: 'architect.booted', payload: { port: PORT, version: '3.0.0', hooks: registry.summary() }, source: 'service', ts: Date.now() });
    busEmit('architect.booted', { port: PORT, version: '3.0.0', hooks: registry.summary() });
    // Phase 6 SOFT: register with orchestrator
    setTimeout(() => {
      registerWithOrchestrator();
      console.log('[architect] registered with orchestrator');
    }, 2000);
  });

  return { server, jaa, registry, blueprint, snrGate, translate };
}

// ── Seed built-in hooks (the canonical NEXUS hook declarations) ─────────────
function _seedBuiltinHooks(registry) {
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
}

// ── Entry point ────────────────────────────────────────────────────────────
if (require.main === module) {
  boot().catch(e => {
    console.error('[architect] §1.2 boot failed:', e.message);
    process.exit(1);
  });
}

module.exports = { boot };
