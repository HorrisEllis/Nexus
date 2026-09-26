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

// ── Spec wizard constants ─────────────────────────────────────────────────────
const SPEC_DIMENSIONS = ['meta','intent','axioms','constraints','modules','edges','gaps','tiers'];
const SPEC_QUESTIONS  = {
  meta:        'What is the name and version of this system?',
  intent:      'In one sentence — what does this system do?',
  axioms:      'What must always be true? What are the invariants?',
  constraints: 'What must it do, and what must it never do?',
  modules:     'What are the main components, and what does each export?',
  edges:       'How do the modules connect? What events pass between them?',
  gaps:        'What is explicitly unknown or unresolved right now?',
  tiers:       'Which parts are T0 (schema), T1 (structure), T2 (logic), T3 (synthesis)?',
};
function buildSpecFromSession(session) {
  var f = session.filled || {};
  var NL = '\n';
  var name = (f.meta && f.meta.name) ? String(f.meta.name) : 'unnamed';
  var intent = String(f.intent || '').split('"').join("'");
  var axioms = (f.axioms || []).map(function(a){ return '    - ' + String(a); }).join(NL);
  if (!axioms) axioms = '    - []';
  var cons = (f.constraints || []).map(function(c){ return '    - ' + String(c.body||c); }).join(NL);
  if (!cons) cons = '    - []';
  var gaps = (f.gaps || []).map(function(g) {
    return '    - id: gap-' + Math.random().toString(36).slice(2,6) + NL + '      description: ' + String(g.body||g) + NL + '      severity: medium';
  }).join(NL);
  if (!gaps) gaps = '    - []';
  return 'spec:' + NL + '  meta:' + NL + '    name: ' + name + NL + '    version: 0.1.0' + NL + '  intent: ' + intent + NL + '  axioms:' + NL + axioms + NL + '  constraints:' + NL + cons + NL + '  gaps:' + NL + gaps;
}



const { HookRegistry }          = require('../lib/hook-registry'); // moved 2026-07-20, docs/hooks-migration.spec
const { Blueprint, SNRGate, Translate, scanTopology } = require('./src/spec/Blueprint');
const { createCFRLedger }       = require('../intelligence/cfr');
// Living hook registry — the canonical wire map for all NEXUS systems
const systemHooks = (() => { try { return require('../hooks'); } catch(_) { return null; } })();
const { createCompileRoutes }   = (() => { try { return require('./compile-route'); } catch(_) { return { createCompileRoutes: null }; } })();

// §WIRED — real, distinct config, not inline constants. See
// architect/config.js's own header. Matches the established pattern.
const config = require('./config.js');
const PORT = config.PORT;
const CORTEX_PORT = config.CORTEX_PORT;
const ROOT        = path.join(__dirname, '..');
const DATA_DIR    = path.join(__dirname, 'data');
const LEDGER_DIR  = path.join(ROOT, 'data', 'architect');

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
function createBusEmit(cfrLedger) {
  return function busEmit(type, payload = {}) {
    try { cfrLedger?.record(type, payload, { causedBy: payload?.jobId || null }); } catch(_) {}
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
// §FIX 2026-09-06 — PULSE_ALL_2026-09-06. This was a fully separate,
// hand-rolled raw http.request() call, not even using nexus-connect.js —
// confirmed by grep, zero `nc2`/`nexus-connect` references anywhere in
// this file before this fix. That's a bigger version of the exact same
// gap guardian itself had until 0.39.38 fixed it (guardian at least used
// nc2.registerWithOrchestrator but forgot startHeartbeat) — architect
// registered once at boot via its own duplicate logic and then went
// completely silent forever, with no ongoing heartbeat of any kind.
// Replaced with the real, shared nc2 client — same proven pattern
// guardian/server.js already uses (registerWithOrchestrator + real
// startHeartbeat, which uses createPulse() internally, not a second
// hand-rolled implementation).
const nc2 = require('../nexus/nexus-connect');
function registerWithOrchestrator() {
  let _rc = []; try { _rc = require('./registry-components'); } catch(_) {}
  nc2.registerWithOrchestrator('architect', PORT, {
    version: '3.0.0', label: 'Architect', healthPath: '/health',
    uuid: 'architect-service-v1-0000-4000', hooks: [],
  }, _rc).catch(() => {});
  nc2.startHeartbeat('architect', PORT);
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

  // ── §LEDGER-FIX: CFR ledger — architect had no ledger at all before this.
  // Writes to the shared data/architect/ dir (not architect/data/, which is
  // this service's own internal JAA store) — that's the dir nexus-diagnostic.js
  // and cortex's intelligence layer already expect to read from for every
  // other system. Same pattern as bridge/index.js and orchestrator.js.
  fs.mkdirSync(LEDGER_DIR, { recursive: true });
  const cfrLedger = createCFRLedger({
    ledgerDir: LEDGER_DIR,
    systemId:  'architect',
    onGap: (gap) => { try { console.warn(`[architect][cfr] ${gap.type}: ${gap.message}`); } catch(_) {} },
  });
  cfrLedger.open();

  // Phase 2 HARD: Bus
  const busEmit = createBusEmit(cfrLedger);

  // Phase 3 HARD: Hook Registry — READ VIEW ONLY since 2026-07-20.
  // Loom owns all writes (docs/hooks-migration.spec). Architect never
  // dirties 'hooks'/'hook_bindings', so its JaaStore flush can never
  // resurrect loom's deletes. Blueprint's `hooks: registry` dependency was
  // verified decorative (zero registry calls in Blueprint.js) but is kept
  // wired for the read surface it was presumably meant to have.
  //
  // §FIX 2026-07-24 (§10.3 competing truth, found in a live boot log):
  // architect reported "replayed 269 hooks" while loom's canonical registry
  // reported 230 — because this registry was reading architect's PRIVATE
  // store (createJAA(DATA_DIR) → architect/data/), a second hooks database
  // nothing else could see, holding stale rows from before the migration.
  // The read view must read the SAME data loom writes: the canonical Cortex
  // store. Architect's own tables (snr_results, spec_wizard_sessions,
  // topology_maps, its event_log) stay on its local store — only the hook
  // registry is repointed, so this is a read-surface correction, not a
  // storage migration.
  console.log('[architect] §3.1 Phase 2: Hook Registry (read view — loom owns writes)');
  let hookJaa = jaa;
  try {
    hookJaa = require('../cortex/memory/jaa-db').jaaDB;
  } catch (e) {
    console.warn(`[architect] canonical hook store unavailable (${e.message}) — falling back to local store; hook counts may diverge from loom (§10.3)`);
  }
  const registry = new HookRegistry({ jaa: hookJaa, busEmit });
  registry.init();

  // Phase 4 HARD: Spec Engine
  console.log('[architect] §3.1 Phase 3: Spec Engine');
  const blueprint = new Blueprint({ jaa, hooks: registry, busEmit });
  const snrGate   = new SNRGate({ jaa, busEmit });
  const translate  = new Translate();
  const handleCompileRoute = createCompileRoutes ? createCompileRoutes({ jaa, busEmit, architectRoot: __dirname }) : null;

  // ── §FIX-ROADMAP-62: sync from canonical registry, not hooks/*.hooks.js ──
  // lib/component-registry.js is canonical (decision: runtime+CLI already
  // depend on it). hooks/*.hooks.js is no longer read here — it drifted
  // immediately when hand-maintained separately (Addendum #2 audit). The
  // sync is idempotent and safe to re-run; it only manages hooks it tagged
  // itself, never built-ins or hand-authored hooks.
  // §MOVED 2026-07-20: seeding + syncFromComponentRegistry now run in loom,
  // the write authority (docs/hooks-migration.spec).

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
      // ── CFR ledger debugger routes ──────────────────────────────────────
      if (path_.startsWith('/cfr')) {
        if (cfrLedger.handleCFRRoute(req, res, url)) return;
      }

      // ── Health ──────────────────────────────────────────────────────────
      if (method === 'GET' && path_ === '/api/contract') {
        return json(res, 200, { ok: true, contract: {
          id: 'architect-v1', version: '3.0.0', system: 'architect', port: PORT,
          role: 'Constraint-first authoring — hook registry, SNR gate, blueprint engine',
          health: { method:'GET', path:'/health' },
          routes: [
            { method:'GET',  path:'/health' },
            { method:'GET',  path:'/api/hooks' },
            { method:'GET',  path:'/api/blueprints' },
            { method:'GET',  path:'/api/snr' },
            { method:'POST', path:'/api/hooks' },
          ],
        }});
      }
  
    // ── Contract endpoint — orchestrator polls this for spec compliance ──────
    if (method === 'GET' && path_ === '/contract') {
      const fs = require('fs'), path = require('path');
      try {
        const c = fs.readFileSync(path.join(__dirname, 'interaction-contract.json'), 'utf8');
        // §BUGFIX 2026-08-23 — same real gap as cortex/boot.js's /contract
        // (found the same session, live, from a real screenshot): raw
        // res.writeHead bypassing this file's own CORS-enabled pattern
        // used on every other route here.
        res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }); res.end(c);
      } catch(e) { res.writeHead(500, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }); res.end(JSON.stringify({ ok:false, error:'contract missing' })); }
      return;
    }

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
        // §MOVED 2026-07-20 — all hook mutations (register/update/deprecate/
        // remove/wire/unwire) live on LOOM :3752 now, the write authority
        // (docs/hooks-migration.spec). 410 with a pointer, loud not silent (§1.2).
        return json(res, 410, { ok: false,
          error: 'hook mutations moved to loom',
          use: `http://127.0.0.1:3752/api/hooks${id ? '/' + id : ''}`,
          spec: 'docs/hooks-migration.spec' });
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
          // §MCO8 2026-09-13 — track_d (axiom §5.2 compliance). This
          // route had zero RAID observability before now — real write
          // work with no trail. Submitted for observability only, same
          // additive pattern idearium's chunk-dispatch already proved
          // (2026-08-29): architect's own fromScan() below remains the
          // REAL, unmodified execution path; a submission failure here
          // must never block the real scan (§HONEST LIMIT, same as
          // idearium's).
          let raidQueueId = null;
          try {
            const intake = require('../cortex/core/raid/contract-intake.js');
            raidQueueId = intake.submitContract(
              { content: `blueprint.scan:${rootPath}`, file: rootPath, title: 'blueprint scan' },
              { source: 'architect', intention: 'blueprint.scan' }
            ).queueId;
          } catch (e) {
            console.warn('[architect/service] could not submit real RAID observability contract (scan proceeds regardless):', e.message);
          }
          try {
            const bp = blueprint.fromScan(rootPath, opts || {});
            if (raidQueueId) {
              try {
                const i2 = require('../cortex/core/raid/contract-intake.js');
                i2.reportExternalOutcome(raidQueueId, { status: i2.STATUS.PASS });
              } catch (_) { /* best-effort, see above */ }
            }
            return json(res, 201, { ok: true, blueprint: bp });
          } catch(e) {
            if (raidQueueId) {
              try {
                const i2 = require('../cortex/core/raid/contract-intake.js');
                i2.reportExternalOutcome(raidQueueId, { status: i2.STATUS.FAIL, verdict: e.message });
              } catch (_) { /* best-effort, see above */ }
            }
            return json(res, 500, { ok: false, error: e.message });
          }
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
          // §MCO12 2026-09-13 (Track D continuation) — same additive,
          // observability-only pattern as blueprint.scan (MCO8): real
          // write work below (event_log insert) with no RAID trail
          // before now. A submission/report failure never blocks the
          // real translate.utl() call.
          let raidQueueId = null;
          try {
            const intake = require('../cortex/core/raid/contract-intake.js');
            raidQueueId = intake.submitContract(
              { content: `translate.utl:${text.slice(0, 80)}`, title: 'translate.utl' },
              { source: 'architect', intention: 'translate.utl' }
            ).queueId;
          } catch (e) {
            console.warn('[architect/service] could not submit real RAID observability contract (translate proceeds regardless):', e.message);
          }
          const result = translate.utl(text);
          jaa.insert('event_log', { type: 'architect.utl.processed', payload: { type_signature: result.type_signature, confidence: result.confidence, constraints: result.constraints.length }, source: 'translate', ts: Date.now() });
          if (raidQueueId) {
            try {
              const i2 = require('../cortex/core/raid/contract-intake.js');
              i2.reportExternalOutcome(raidQueueId, { status: i2.STATUS.PASS });
            } catch (_) { /* best-effort */ }
          }
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
      // ── ALK — record user interaction ───────────────────────────────────────
      // §ALK-09: architect surfaces ALK recording for UI events
      if (path_ === '/api/alk/record' && method === 'POST') {
        try {
          const body = await readBody(req);
          const alk  = require('../intelligence/alk');
          const node = alk.record({ actor: body.actor || 'user', intent: body.intent || 'interact', payload: body.payload || {}, causedBy: body.causedBy || null });
          busEmit('alk.decision.recorded', { uuid: node.uuid, intent: node.intent });
          return json(res, 201, { ok: true, uuid: node.uuid });
        } catch(e) { return json(res, 500, { ok: false, error: e.message }); }
      }

      // ── Spec Wizard — conversational session ─────────────────────────────
      // §WIZARD-16: Mode 2 — intent in, questions back, spec out
      if (path_ === '/api/spec/wizard' && method === 'POST') {
        try {
          const { sessionId, message } = await readBody(req);
          // Load or create session state from JAA
          const sessions = jaa.query('spec_wizard_sessions', r => r.sessionId === sessionId, 1);
          const session  = sessions[0] || { sessionId: sessionId || require('crypto').randomUUID(), filled: {}, missing: Object.keys(SPEC_DIMENSIONS), turns: [] };

          // Run message through UTL to extract filled dimensions
          const { Translate } = require('./src/spec/Blueprint');
          const utlResult = new Translate({}).utl(message || '');
          const newlyFilled = {};

          // Map UTL output to spec dimensions
          if (utlResult.constraints?.length) newlyFilled.constraints = utlResult.constraints;
          if (utlResult.gaps?.length)        newlyFilled.gaps        = utlResult.gaps;
          if (utlResult.hooks?.length)       newlyFilled.hooks       = utlResult.hooks;
          if (utlResult.tensions?.length)    newlyFilled.tensions    = utlResult.tensions;
          if (message?.length > 10 && !session.filled.intent) newlyFilled.intent = message.slice(0, 200);

          Object.assign(session.filled, newlyFilled);
          session.missing = SPEC_DIMENSIONS.filter(d => !session.filled[d]);
          session.turns.push({ role: 'user', content: message, extracted: newlyFilled });

          // Generate next question
          let nextQuestion = null;
          let complete     = session.missing.length === 0;
          if (!complete && session.missing.length > 0) {
            const dim = session.missing[0];
            nextQuestion = SPEC_QUESTIONS[dim] || `Can you describe the ${dim}?`;
          }

          // Persist session
          if (sessions.length) jaa.update('spec_wizard_sessions', sessions[0].uuid, session);
          else jaa.insert('spec_wizard_sessions', { ...session, uuid: require('crypto').randomUUID(), ts: Date.now() });

          return json(res, 200, { ok: true, sessionId: session.sessionId, filled: session.filled, missing: session.missing, nextQuestion, complete, spec: complete ? buildSpecFromSession(session) : null });
        } catch(e) { return json(res, 500, { ok: false, error: e.message }); }
      }

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
          // §MCO12 2026-09-13 (Track D continuation) — same pattern as
          // blueprint.scan/translate.utl above.
          let raidQueueId = null;
          try {
            const intake = require('../cortex/core/raid/contract-intake.js');
            raidQueueId = intake.submitContract(
              { content: `map.scan:${rootPath}`, file: rootPath, title: 'topology map scan' },
              { source: 'architect', intention: 'map.scan' }
            ).queueId;
          } catch (e) {
            console.warn('[architect/service] could not submit real RAID observability contract (map scan proceeds regardless):', e.message);
          }
          try {
            const map = scanTopology(rootPath, opts || {});
            const record = jaa.insert('topology_maps', { data: map, causedBy: 'api.map.scan' });
            busEmit('architect.map.scanned', { id: record.uuid, rootPath, fileCount: map.files.length, gapCount: map.gaps.length });
            if (raidQueueId) {
              try {
                const i2 = require('../cortex/core/raid/contract-intake.js');
                i2.reportExternalOutcome(raidQueueId, { status: i2.STATUS.PASS });
              } catch (_) { /* best-effort */ }
            }
            return json(res, 201, { ok: true, map, id: record.uuid });
          } catch(e) {
            if (raidQueueId) {
              try {
                const i2 = require('../cortex/core/raid/contract-intake.js');
                i2.reportExternalOutcome(raidQueueId, { status: i2.STATUS.FAIL, verdict: e.message });
              } catch (_) { /* best-effort */ }
            }
            return json(res, 500, { ok: false, error: e.message });
          }
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
          // §MCO12 2026-09-13 (Track D continuation) — same pattern.
          let raidQueueId = null;
          try {
            const intake = require('../cortex/core/raid/contract-intake.js');
            raidQueueId = intake.submitContract(
              { content: `gaps.open:${gap.id}`, title: 'gap opened' },
              { source: 'architect', intention: 'gaps.open' }
            ).queueId;
          } catch (e) {
            console.warn('[architect/service] could not submit real RAID observability contract (gap creation proceeds regardless):', e.message);
          }
          const record = jaa.insert('gaps', { op: 'open', data: gap, causedBy: body.causedBy || 'api', ts: Date.now() });
          busEmit('architect.gap.opened', { id: gap.id, severity: gap.severity });
          if (raidQueueId) {
            try {
              const i2 = require('../cortex/core/raid/contract-intake.js');
              i2.reportExternalOutcome(raidQueueId, { status: i2.STATUS.PASS });
            } catch (_) { /* best-effort */ }
          }
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
// §MOVED 2026-07-20 — _seedBuiltinHooks lives in loom now (write authority, docs/hooks-migration.spec)

// ── Entry point ────────────────────────────────────────────────────────────
if (require.main === module) {
  boot().catch(e => {
    console.error('[architect] §1.2 boot failed:', e.message);
    process.exit(1);
  });
}

module.exports = { boot };
