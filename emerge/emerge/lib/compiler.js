'use strict';
// lib/compiler.js — component emerge.compiler, capability emerge.compiler.spec: Emerge's spec compiler through the system's door.
// EAS4 L1 (Nexus docs/2026-10-31-emerge-as-a-system-phasemap.spec EAS4, EAS_D5). James, 2026-11-05: "One primitive per gate. Compounds,
// each layer." Its command is a node (data/nodes/command/emerge.compiler.compile.command, its expectation in the node), served at
// POST /compiler/compile; this file is only what it runs.
//
// A caller in another system cannot share a folder with Emerge, so the spec comes in as text and the emitted files go back as text.
// Each call writes the spec into a fresh work folder, runs compiler/index.js compile() there on the local host (compiler/host.js: no
// network, no Cortex, "Emerge depends on nothing above it", 2026-10-28), reads back every file it emitted, and removes the folder.
// A host's preflight or writeback above Emerge (Cortex's) is the caller's to do around this call, not Emerge's.
const fs = require('fs');
const os = require('os');
const path = require('path');

function _bad(field) { return Object.assign(new Error(`missing ${field}`), { status: 400 }); }

/** POST /compiler/compile { spec, name?, tier? } -> { ok, files, t0, t1, ms } | { ok:false, error, step } */
async function compile(args = {}) {
  if (typeof args.spec !== 'string' || !args.spec.trim()) throw _bad('spec (the spec\'s YAML text)');
  const tier = args.tier === 0 ? 0 : 1;
  const name = path.basename(String(args.name || 'spec.spec')).replace(/[^\w.-]/g, '_') || 'spec.spec';
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'emerge-compile-'));
  const t0 = Date.now();
  try {
    const src = path.join(work, name.endsWith('.spec') ? name : `${name}.spec`);
    const out = path.join(work, 'out');
    fs.writeFileSync(src, args.spec);
    const { compile: run } = require('../compiler/index.js');
    const log = console.log; console.log = () => {};   // the compiler narrates; the door answers in JSON only
    let r; try { r = await run(src, out, { tier, skipCortex: true }); } finally { console.log = log; }
    if (!r || !r.ok) return { ok: false, error: (r && r.error) || 'the compiler did not run', step: (r && r.step) || 'compile', ms: Date.now() - t0 };
    const emitted = (t) => (r[t] && r[t].emitted) || [];
    const files = {};
    for (const rel of [...new Set([...emitted('t0'), ...emitted('t1')])].sort()) files[rel] = fs.readFileSync(path.join(out, rel), 'utf8');
    return { ok: true, files, t0: { emitted: emitted('t0') }, t1: { emitted: emitted('t1') }, ms: Date.now() - t0 };
  } finally {
    try { fs.rmSync(work, { recursive: true, force: true }); } catch (_) { /* a temp folder left behind is not an error of the call */ }
  }
}

// ── EAS4 L2 build and L3 run (2026-11-05). James: "Emerge calls back by route" (EAS_D9): a request may name a host and a model as routes
// (compiler/host.js routeHost, compiler/model.js api "route"); without them Emerge uses its own (the local host; local Ollama).

function _settings(x, field) {
  if (x === undefined || x === null) return undefined;
  if (typeof x !== 'object' || Array.isArray(x)) throw _bad(`${field} as settings ({ … routes } — a path or a module is not taken through the door)`);
  return x;
}
function _jsonSafe(v) { try { return JSON.parse(JSON.stringify(v, (k, x) => (typeof x === 'function' ? undefined : x))); } catch (_) { return null; } }

/** _inWork(args, fn) — the spec into a fresh folder; fn(src, out) runs there; every file under out comes back as text */
async function _inWork(args, fn) {
  if (typeof args.spec !== 'string' || !args.spec.trim()) throw _bad('spec (the spec\'s YAML text)');
  const name = path.basename(String(args.name || 'spec.spec')).replace(/[^\w.-]/g, '_') || 'spec.spec';
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'emerge-build-'));
  const t0 = Date.now();
  try {
    const src = path.join(work, name.endsWith('.spec') ? name : `${name}.spec`);
    const out = path.join(work, 'out');
    fs.writeFileSync(src, args.spec);
    const log = console.log; console.log = () => {};
    let r; try { r = await fn(src, out); } finally { console.log = log; }
    const files = {};
    const walk = (d) => { let es = []; try { es = fs.readdirSync(d, { withFileTypes: true }); } catch (_) { return; }
      for (const e of es) { const q = path.join(d, e.name); if (e.isDirectory()) walk(q); else files[path.relative(out, q).split(path.sep).join('/')] = fs.readFileSync(q, 'utf8'); } };
    walk(out);
    return { ...r, files, ms: Date.now() - t0 };
  } finally {
    try { fs.rmSync(work, { recursive: true, force: true }); } catch (_) { /* a temp folder left behind is not an error of the call */ }
  }
}

/** POST /compiler/build { spec, name?, host?, skipHost? } — the whole pipeline (host preflight → T0/T1 → host writeback and sync) */
async function build(args = {}) {
  const host = _settings(args.host, 'host');
  return _inWork(args, async (src, out) => {
    const r = await require('../compiler/pipeline.js').compile(src, out, { host, skipHost: !!args.skipHost || !host, force: !!args.force });
    if (!r || !r.ok) return { ok: false, error: (r && r.error) || 'the pipeline did not run', step: (r && r.step) || 'build' };
    return { ok: true, skipped: !!r.skipped, moduleName: r.moduleName || null, cortex: _jsonSafe(r.cortex), writeback: _jsonSafe(r.writeback), sync: _jsonSafe(r.idearium || r.sync) };
  });
}

/** POST /compiler/run { spec, name?, host?, model?, dryRun? } — compile, then T2 through the model; progress comes back as a list */
async function run(args = {}) {
  const host = _settings(args.host, 'host'), model = _settings(args.model, 'model');
  const progress = [];
  return _inWork(args, async (src, out) => {
    const r = await require('../compiler/t2-gate.js').run(src, out, { host, skipCortex: !host, model, dryRun: !!args.dryRun,
      onProgress: (node, status, detail) => progress.push({ node: node ? (node.name || node.id || null) : null, status, detail: detail ?? null, ts: Date.now() }) });
    const t2 = r.t2Result ? { dispatched: r.t2Result.dispatched, completed: r.t2Result.completed, failed: r.t2Result.failed, skipped: r.t2Result.skipped, model: r.t2Result.model, results: _jsonSafe(r.t2Result.results) } : null;
    return { ok: !!r.ok, stage: r.stage || null, error: r.error || null, summary: r.summary || r.message || null, moduleName: (r.compileResult && r.compileResult.moduleName) || null, t2, progress };
  });
}

module.exports = { compile, build, run };
