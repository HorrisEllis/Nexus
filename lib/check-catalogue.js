'use strict';
/**
 * lib/check-catalogue.js — QA1: the catalogue runs. Serves cos/spec/check-catalogue.spec (119 checks) and runs the ones
 * that have a runner. component_id: nexus.lib.check-catalogue
 * Map: docs/2026-10-13-gates-that-learn-and-priorities-phasemap.spec (QA1_the_catalogue_runs; addendum 2026-10-14)
 *
 * James (2026-10-13): "gates for everything to reduce workload from agents, checkpoints, and fault and fialure mode
 * mapping" · "im scared of regression." · 2026-10-14: "yes start QA1".
 *
 * Before this the catalogue was a list nothing loaded; a contract gate could name only CK-001, CK-002 and CK-060 (through
 * lib/import-checks.js). Now one table answers what each check is, and whether Nexus can run it:
 *   list({ family, how, stage, runnable }) → [entry + { runnable, runner }]
 *   get(id) → entry | null
 *   runnable(id) → 'runner' | 'import-checks' | null
 *   run(id, condition, ctx) → { ok, verifiable, evidence, reason, items }   (sync; import-checks ids are run by
 *                                                                          contract-gates' own async path)
 * A check without a runner is never a pass: run() returns unverifiable, naming it.
 * Runners live in lib/checks/ck-<nnn>-<name>.js, one per check, each exporting { ID, run(condition, ctx) }.
 */
const fs = require('fs');
const path = require('path');

const MODULE_ID = 'nexus.lib.check-catalogue';
const VERSION = '1.0.0';
const ROOT = path.resolve(__dirname, '..');
const SPEC = path.join(ROOT, 'cos/spec/check-catalogue.spec');
const IMPORT_CHECKS = new Set(['CK-001', 'CK-002', 'CK-006', 'CK-008', 'CK-060']);   // lib/import-checks.js run()

const RUNNERS = {
  'CK-230': () => require('./checks/ck-230-shadow.js'),
  'CK-233': () => require('./checks/ck-233-deny.js'),
  'CK-248': () => require('./checks/ck-248-toolchain.js'),
  'CK-253': () => require('./checks/ck-253-versions.js'),   // 0.60.34 VR1
};

let _cache = null, _mtime = 0;
function _load() {
  const st = fs.statSync(SPEC);
  if (_cache && st.mtimeMs === _mtime) return _cache;
  const doc = require('js-yaml').load(fs.readFileSync(SPEC, 'utf8'));
  _cache = { meta: doc.spec.meta, primitives: doc.spec.primitives, checks: doc.spec.checks || [] };
  _mtime = st.mtimeMs;
  return _cache;
}
const _id = (id) => String(id || '').trim().toUpperCase();

function runnable(id) {
  const k = _id(id);
  if (RUNNERS[k]) return 'runner';
  if (IMPORT_CHECKS.has(k)) return 'import-checks';
  return null;
}
function get(id) {
  const k = _id(id);
  const e = _load().checks.find(c => c.id === k);
  return e ? { ...e, runnable: runnable(k) } : null;
}
function list({ family = null, how = null, stage = null, runnable: only = null } = {}) {
  return _load().checks
    .filter(c => (!family || c.family === family) && (!how || c.how === how) && (!stage || (c.stages || []).includes(stage)))
    .map(c => ({ ...c, runnable: runnable(c.id) }))
    .filter(c => only == null || (only ? !!c.runnable : !c.runnable));
}
function summary() {
  const all = list();
  const by = (k) => all.reduce((m, c) => { m[c[k]] = (m[c[k]] || 0) + 1; return m; }, {});
  return { total: all.length, runnable: all.filter(c => c.runnable).length, byHow: by('how'), byFamily: by('family'),
    runners: Object.keys(RUNNERS), importChecks: [...IMPORT_CHECKS] };
}

/** run(id, condition, ctx) — one check now. ctx: { root, shadow } (injectable for tests) */
function run(id, condition = {}, ctx = {}) {
  const k = _id(id);
  const at = Date.now();
  if (!RUNNERS[k]) {
    const why = IMPORT_CHECKS.has(k) ? `${k} runs through lib/import-checks.js (a contract condition { check: ${k} } runs it; or \`repo integrity\`)`
      : get(k) ? `${k} has no runner yet (lib/checks/) — catalogued, not built` : `${k} is not in the catalogue`;
    return { ok: false, verifiable: false, reason: `unverifiable: ${why}`, id: k };
  }
  let r;
  try { r = RUNNERS[k]().run(condition || {}, { root: ctx.root || ROOT, ...ctx }); }
  catch (e) { r = { ok: false, verifiable: true, reason: `${k}: the check could not run — ${e.message}` }; }
  return { ...r, id: k, ms: Date.now() - at };
}

module.exports = { MODULE_ID, VERSION, SPEC, list, get, runnable, run, summary };
