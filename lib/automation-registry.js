'use strict';
/**
 * lib/automation-registry.js — one neutral door over every NEXUS automation
 * source: list what each present source holds, run one and record it under
 * that source, and NAME an absent source rather than throw.
 *
 * James, 2026-10-24: "copilot system, ollama, lib folder, clearglass, idearium,
 * and brainos have automation" · 2026-10-25: "Copilot programmable and
 * automation and the Lib folder automation. Clearglass automation, and macros,
 * continue." The six are unified here through an adapter per source (AU_D1, his
 * reading confirmed 2026-10-25), not collapsed into one.
 *
 * §REUSE BEFORE BUILD (§8.6) · TRUTH OVER COHERENCE (§0.0, §0.1). Read before
 * built: there is exactly ONE real workflow+macro engine in this tree —
 * clear-glass/src/mesh/automation-engine.js, reached over Clear Glass's wire
 * server (:7704 /automation/*; the same door lib/agent-tools/tools/clear-glass/
 * automation.js and ui/brainos/brainos-automation.js already use). Everything
 * else is a VIEW of it, and the registry says so instead of inventing six
 * engines:
 *   - clear-glass  the engine itself — workflows (GET /automation/workflows)
 *                  and macros (the .macro node files, GET /automation/nodes);
 *                  run = POST /automation/workflows/<id>/run.
 *   - brainos      the SAME engine's own store (data/brainos/workflows). Not a
 *                  second engine; present exactly when the engine is up, surfaced
 *                  under brainos so his canvas can name its own.
 *   - copilot      a DRIVER (its own process, :3750). It runs automations on the
 *                  shared engine through its agent-tools; it keeps no separate
 *                  store. Present when :3750 answers; a run delegates to the engine.
 *   - idearium     a DRIVER too: its automation is the BrainOS fold (BX7) over the
 *                  same engine. Present when the engine is up; runs delegate to it.
 *   - lib          IN-PROCESS: lib does not run workflows, it DEFINES the node
 *                  TYPES every source builds from — schema.macro, schema.workflow,
 *                  schema.debug_macro in lib/node-schemas. Listed as the primitives;
 *                  a run is refused here, with where it runs instead.
 *   - ollama       ABSENT: no workflow/macro store or route exists for it
 *                  (checked 2026-10-25). Named, never faked (§1.2).
 *
 * The transport is dependency-injected (the repo-agent / flow-sources pattern):
 * deps.http(system, {method, path, body}) defaults to a real localhost call on
 * the established system-port convention, so the registry is a pure, testable
 * neutral core with no static cross-system require — the edge to Clear Glass is a
 * runtime port (the declared convention), not a new boundary crossing.
 *
 * Map:  docs/2026-10-24-agent-orchestration-phasemap.spec (AU1 / AU_D1).
 * Spec: docs/brainos-in-idearium.spec.
 */

const VERSION = '1.0.0';
const MODULE_ID = 'lib/automation-registry';

// the already-established ports (clear-glass/src/mesh/automation-engine.js's own
// SYSTEM_PORTS, reused verbatim — not re-derived).
// 0.60.333 AE4 — James, 2026-10-31: "merge and finish automation and cos backend". The engine lives in the orchestrator (AE1, door AE3):
// every engine call goes to :9000; Clear Glass is the browser driver behind it (AE2), no longer "the engine".
const SYSTEM_PORTS = { guardian: 7820, ollama: 3749, copilot: 3750, clearglass: 7704, 'clear-glass': 7704, orchestrator: 9000 };
const ENGINE = 'orchestrator';

// ── default transport: a real localhost call, best-effort ─────────────────────
// Never throws: a source that is down comes back { ok:false, error } and the
// caller NAMES it (§1.2). Mirrors lib/agent-tools/tools/clear-glass/automation.js.
function _defaultHttp(system, { method = 'GET', path = '/', body, timeoutMs = 15000 } = {}) {
  const port = SYSTEM_PORTS[system];
  if (!port) return Promise.resolve({ ok: false, error: `no known port for "${system}"` });
  const http = require('http');
  return new Promise((resolve) => {
    let data = null;
    try { data = body === undefined ? null : Buffer.from(JSON.stringify(body)); } catch (_) { data = null; }
    const req = http.request({ hostname: '127.0.0.1', port, path, method, timeout: timeoutMs,
      headers: data ? { 'Content-Type': 'application/json', 'Content-Length': data.length } : {} }, (res) => {
      let out = ''; res.setEncoding('utf8'); res.on('data', c => out += c);
      res.on('end', () => { try { resolve(JSON.parse(out)); } catch (_) { resolve({ ok: false, error: `${system} answered HTTP ${res.statusCode} with non-JSON` }); } });
    });
    req.on('error', (e) => resolve({ ok: false, error: `${system} is not reachable on :${port} (${e.code || e.message})` }));
    req.on('timeout', () => { req.destroy(); resolve({ ok: false, error: `${system} did not answer within ${Math.round(timeoutMs / 1000)} s` }); });
    if (data) req.write(data);
    req.end();
  });
}

// the node TYPES lib defines — the automation primitives, read from lib/node-schemas.
function _defaultLibNodeTypes() {
  try {
    const fs = require('fs'), path = require('path');
    const dir = path.join(__dirname, 'node-schemas');
    return fs.readdirSync(dir)
      .filter(f => /^schema\.(macro|workflow|debug_macro)$/.test(f))
      .map(f => f.replace(/^schema\./, ''));
  } catch (_) { return []; }
}

function _deps(d = {}) {
  return {
    http: typeof d.http === 'function' ? d.http : _defaultHttp,
    libNodeTypes: typeof d.libNodeTypes === 'function' ? d.libNodeTypes : _defaultLibNodeTypes,
  };
}

// ── the clear-glass engine: list workflows + macros, run one ──────────────────
async function _engineWorkflows(D) {
  const r = await D.http(ENGINE, { path: '/automation/workflows' });
  if (!r || r.ok === false) return { ok: false, error: (r && r.error) || 'the automation engine did not answer' };
  return { ok: true, workflows: (r.workflows || []).map(w => ({ id: w.id, name: w.name, status: w.status, kind: 'workflow', runCount: w.runCount || 0 })) };
}
async function _engineMacros(D) {
  const r = await D.http(ENGINE, { path: '/automation/nodes' });
  if (!r || r.ok === false) return { ok: true, macros: [] }; // nodes are optional; absence is not a failure of the engine
  return { ok: true, macros: (r.nodes || []).filter(n => /\.macro$/.test(n.file || n.name || '')).map(n => ({ id: n.file || n.name, name: n.name || n.file, kind: 'macro' })) };
}

// ── the six source adapters ───────────────────────────────────────────────────
// Each: id, label, kind, note (the honest finding), present(D), list(D), run(id, opts, D).
const ADAPTERS = {
  'clear-glass': {
    id: 'clear-glass', label: 'Clear Glass', kind: 'driver',
    note: 'the browser driver behind the one engine (AE2, :7704 /automation/driver); the engine is the orchestrator\'s (:9000 /automation/*) — this source lists and runs through it',
    async present(D) { const r = await D.http(ENGINE, { path: '/automation/active' }); return { present: !!(r && r.ok !== false), why: r && r.ok !== false ? null : (r && r.error) || 'engine not reachable' }; },
    async list(D) {
      const [w, m] = await Promise.all([_engineWorkflows(D), _engineMacros(D)]);
      if (!w.ok) return { ok: false, error: w.error, items: [] };
      return { ok: true, items: [...w.workflows, ...(m.macros || [])].map(x => ({ ...x, source: 'clear-glass' })) };
    },
    async run(id, opts, D) {
      const r = await D.http(ENGINE, { method: 'POST', path: `/automation/workflows/${encodeURIComponent(id)}/run`, body: { vars: (opts && opts.vars) || {} } });
      if (!r || r.ok === false) return { ok: false, source: 'clear-glass', error: (r && r.error) || 'run failed' };
      return { ok: true, source: 'clear-glass', runId: r.runId || null, status: r.status || 'ok', output: r.output };
    },
  },

  brainos: {
    id: 'brainos', label: 'BrainOS', kind: 'engine-store',
    note: "BrainOS's workflows ARE the clear-glass engine's own store (data/brainos/workflows) — the same engine, surfaced under brainos; not a second engine",
    async present(D) { return ADAPTERS['clear-glass'].present(D); },
    async list(D) { const r = await ADAPTERS['clear-glass'].list(D); if (!r.ok) return r; return { ok: true, items: r.items.filter(x => x.kind === 'workflow').map(x => ({ ...x, source: 'brainos', via: 'clear-glass' })) }; },
    async run(id, opts, D) { const r = await ADAPTERS['clear-glass'].run(id, opts, D); return { ...r, source: 'brainos', via: 'clear-glass' }; },
  },

  copilot: {
    id: 'copilot', label: 'Co-pilot', kind: 'driver',
    note: 'drives the shared engine through its agent-tools (:3750); keeps no separate workflow store — a run delegates to clear-glass',
    async present(D) { const r = await D.http('copilot', { path: '/health' }); return { present: !!(r && r.ok !== false), why: r && r.ok !== false ? null : (r && r.error) || 'co-pilot not reachable' }; },
    async list() { return { ok: true, items: [] }; }, // no separate store (truth, not an empty engine proxy)
    async run(id, opts, D) { const r = await ADAPTERS['clear-glass'].run(id, opts, D); return { ...r, source: 'copilot', via: 'clear-glass' }; },
  },

  idearium: {
    id: 'idearium', label: 'Idearium', kind: 'driver',
    note: "its automation is the BrainOS fold (BX7) over the same engine; no separate store — a run delegates to clear-glass",
    async present(D) { return ADAPTERS['clear-glass'].present(D); },
    async list() { return { ok: true, items: [] }; },
    async run(id, opts, D) { const r = await ADAPTERS['clear-glass'].run(id, opts, D); return { ...r, source: 'idearium', via: 'clear-glass' }; },
  },

  lib: {
    id: 'lib', label: 'lib (core)', kind: 'in-process',
    note: 'lib does not run workflows; it DEFINES the node types every source builds from (lib/node-schemas: schema.macro, schema.workflow, schema.debug_macro)',
    async present(D) { const types = D.libNodeTypes(); return { present: types.length > 0, why: types.length ? null : 'no automation node-type schemas found in lib/node-schemas' }; },
    async list(D) { return { ok: true, items: D.libNodeTypes().map(t => ({ id: t, name: t, kind: 'node-type', source: 'lib' })) }; },
    async run(id) { return { ok: false, source: 'lib', error: `lib defines node types, it does not run them; build "${id}" into a workflow and run it through clear-glass` }; },
  },

  ollama: {
    id: 'ollama', label: 'Ollama', kind: 'absent',
    note: 'no automation surface exists for ollama (no workflow/macro store or route; checked 2026-10-25) — named, not faked',
    async present() { return { present: false, why: 'ollama has no automation surface (no workflow/macro store or route; 2026-10-25)' }; },
    async list() { return { ok: true, items: [] }; },
    async run(id) { return { ok: false, source: 'ollama', error: 'ollama has no automation surface to run' }; },
  },
};

const SOURCE_IDS = ['copilot', 'ollama', 'lib', 'clear-glass', 'idearium', 'brainos']; // his order, verbatim

/** sources(deps) — each source's presence, honestly (absent ones named, never thrown). */
async function sources(deps) {
  const D = _deps(deps);
  const out = [];
  for (const id of SOURCE_IDS) {
    const a = ADAPTERS[id];
    let present = false, why = null;
    try { const p = await a.present(D); present = !!(p && p.present); why = p && p.why; }
    catch (e) { present = false; why = e.message; }
    out.push({ id: a.id, label: a.label, kind: a.kind, note: a.note, present, why });
  }
  return out;
}

/**
 * list({ source }, deps) — the workflows/macros across every present source,
 * merged. A source that fails is NAMED in sources[] (§1.2); an absent source is
 * named, not thrown. With { source } set, only that one source.
 * Returns { ok, items, sources: [{ id, kind, present, count, why }] }.
 */
async function list(opts = {}, deps) {
  const D = _deps(deps);
  const want = opts && opts.source ? [opts.source] : SOURCE_IDS;
  const items = [];
  const report = [];
  for (const id of want) {
    const a = ADAPTERS[id];
    if (!a) { report.push({ id, present: false, why: 'unknown source' }); continue; }
    let pres;
    try { pres = await a.present(D); } catch (e) { pres = { present: false, why: e.message }; }
    if (!pres.present) { report.push({ id: a.id, kind: a.kind, present: false, count: 0, why: pres.why }); continue; }
    try {
      const r = await a.list(D);
      if (!r || r.ok === false) { report.push({ id: a.id, kind: a.kind, present: true, count: 0, why: (r && r.error) || 'listing failed' }); continue; }
      for (const it of r.items) items.push(it);
      report.push({ id: a.id, kind: a.kind, present: true, count: r.items.length, why: null });
    } catch (e) {
      report.push({ id: a.id, kind: a.kind, present: true, count: 0, why: e.message });
    }
  }
  return { ok: true, items, sources: report };
}

/**
 * run(source, id, opts, deps) — run one automation and record it UNDER that
 * source. A source that cannot run it returns { ok:false, source, error } — it
 * never throws and never silently runs it somewhere else without saying (the
 * result carries `via` when the shared engine actually executed it).
 */
async function run(source, id, opts = {}, deps) {
  const D = _deps(deps);
  const a = ADAPTERS[source];
  if (!a) return { ok: false, source, error: `unknown automation source "${source}"` };
  if (!id) return { ok: false, source, error: 'which automation? pass its id' };
  try {
    let pres;
    try { pres = await a.present(D); } catch (e) { pres = { present: false, why: e.message }; }
    if (!pres.present && a.kind !== 'in-process' && a.kind !== 'absent') return { ok: false, source, error: `${a.label} is not available: ${pres.why || 'not reachable'}` };
    return await a.run(id, opts, D);
  } catch (e) {
    return { ok: false, source, error: e.message };
  }
}

/** describe() — the honest self-model: which sources are engines, drivers, in-process or absent. */
function describe() {
  return { version: VERSION, engine: { system: ENGINE, port: SYSTEM_PORTS[ENGINE], door: '/automation/*' }, sources: SOURCE_IDS.map(id => { const a = ADAPTERS[id]; return { id: a.id, label: a.label, kind: a.kind, note: a.note }; }) };
}

module.exports = { sources, list, run, describe, SOURCE_IDS, ADAPTERS, SYSTEM_PORTS, VERSION, MODULE_ID, _defaultHttp, _defaultLibNodeTypes };
