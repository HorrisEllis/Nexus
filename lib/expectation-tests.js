'use strict';
/**
 * lib/expectation-tests.js — TF1: a file's expectation, written first, from the plan, with no model (0.60.119)
 * comp_id: nexus.lib.expectation-tests
 * UUID: nexus-lib-expectation-tests-v1-0000-2026-1017-jamesbrooks-001
 * Map: docs/2026-10-17-pieces-not-order-phasemap.spec (addendum a, TF1_the_expectation_first)
 *
 * James, 2026-10-17: "the code it's outputting is terrible, and it needs to learn. Nothing is wasted from failure or fault.
 * Tests need to be first. Maybe prioritize nodes or chunks that improve the expectations each file."
 *
 * Before: a brick passed when lib/phase-plan.js checkChunk found its planned export NAMES in the text (a regex). A file that
 * does not load, requires a file that does not exist, or exports a string under a function's name, passed.
 *
 * Now, before any code is written, Nexus writes each planned JS file's expectation test from the held plan:
 *   - the module loads (require, or import() for an ES module) — no syntax error, no missing require, no throw at load
 *   - every planned export exists
 *   - a planned function (its signature has parentheses) is a function, and takes no more required arguments than the
 *     signature names
 * The test is run in a shadow copy of the repo (lib/proposal-evidence.js shadow: symlinks, data/ copied, the real tree never
 * touched) with the phase's files so far and this file's proposal overlaid. Its failing lines are the brick's error, so the
 * retry says exactly what was wrong. Nothing is written into the repo: the text is carried on the contract's evidence.
 *
 *   forFile(plan, path)                  → { path, test, checks } or null (not a JS file, or no planned exports)
 *   run({ root, plan, path, overlays })  → { ok, ran, checks, failed: [lines], tail, ms, why? }
 *   baseline({ root, plan, path })       → the expectation against the tree as it is (seen failing first, or passing already)
 *
 * Limits, said: behaviour is not tested here (TF2: a different hat writes those); arity is only an upper bound (a default or
 * a rest parameter is counted by the signature, not by Function.length); a file that can only load with a running service
 * fails to load here and says so.
 */
const path = require('path');
const crypto = require('crypto');

const MODULE_ID = 'nexus.lib.expectation-tests';
const VERSION = '1.0.0';
const RUN_MS = 30000;
const JS = /\.(c|m)?js$/i;

function _arity(sig) {
  const m = String(sig || '').match(/\(([^)]*)\)/);
  if (!m) return null;
  const inner = m[1].trim();
  if (!inner) return { total: 0, required: 0 };
  // split on top-level commas only: '{ a, b }' and '[x, y]' are one parameter
  const parts = []; let depth = 0, cur = '';
  for (const ch of inner) { if ('{[('.includes(ch)) depth++; if ('}])'.includes(ch)) depth--; if (ch === ',' && depth === 0) { parts.push(cur); cur = ''; } else cur += ch; }
  if (cur.trim()) parts.push(cur);
  const ps = parts.map(p => p.trim()).filter(Boolean);
  const rest = ps.some(p => p.startsWith('...'));
  const required = ps.filter(p => !p.startsWith('...') && !/\?\s*(:|$)/.test(p) && !/=/.test(p) && !/\?$/.test(p.split(':')[0].trim())).length;
  return { total: rest ? Infinity : ps.length, required };
}

/** the test's relative path in the shadow: at the repo root, so it can require the file by its own path */
function testPathFor(file) { return `.nexus-expect/${String(file).replace(/[^A-Za-z0-9._-]+/g, '__')}.expect.test.cjs`; }

/** forFile(plan, path) → { path, test, checks } — the expectation, as a runnable CommonJS test, or null */
function forFile(plan, file) {
  if (!plan || !JS.test(String(file || ''))) return null;
  const f = (plan.files || []).find(x => x.path === file);
  if (!f || f.layer === 'test' || /(^|\/)(tests?|__tests__)\//.test(file) || /\.test\.(c|m)?js$/.test(file)) return null;
  const exps = (f.exports || []).filter(e => e && /^[A-Za-z_$][\w$]*$/.test(String(e.name || '')));
  if (!exps.length) return null;
  const checks = exps.map(e => { const a = _arity(e.signature); return { name: e.name, fn: !!a, maxArgs: a ? a.total : null, signature: e.signature || null }; });
  const rel = path.posix.join('..', file);
  const test = `'use strict';
// Expectation for ${file}, written by Nexus from the held plan before the code (lib/expectation-tests.js, TF1). No model wrote it.
const path = require('path');
const { pathToFileURL } = require('url');
const CHECKS = ${JSON.stringify(checks)};
let failed = 0, passed = 0;
const ok = (m) => { passed++; console.log('  ✓ ' + m); };
const bad = (m) => { failed++; console.log('  ✗ ' + m); };
(async () => {
  const file = path.join(__dirname, ${JSON.stringify(rel)});
  let mod;
  try { mod = require(file); }
  catch (e) {
    if (e && e.code === 'ERR_REQUIRE_ESM') { try { mod = await import(pathToFileURL(file).href); } catch (e2) { bad(${JSON.stringify(file)} + ' does not load: ' + String(e2 && e2.message || e2).split('\\n')[0]); } }
    else bad(${JSON.stringify(file)} + ' does not load: ' + String(e && e.message || e).split('\\n')[0]);
  }
  if (mod !== undefined) {
    ok(${JSON.stringify(file)} + ' loads');
    for (const c of CHECKS) {
      // a CommonJS module, or an ES module's namespace (an ES import of CommonJS keeps it on .default)
      const v = mod == null ? undefined : (mod[c.name] !== undefined ? mod[c.name] : (mod.default != null ? mod.default[c.name] : undefined));
      if (v === undefined) { bad('exports ' + c.name + ' — it is missing (the plan says it exports ' + (c.signature || c.name) + ')'); continue; }
      if (c.fn && typeof v !== 'function') { bad(c.name + ' is a ' + typeof v + ', not a function (the plan says ' + c.signature + ')'); continue; }
      if (c.fn && c.maxArgs !== null && v.length > c.maxArgs) { bad(c.name + ' requires ' + v.length + ' arguments; the plan\\'s signature ' + c.signature + ' takes at most ' + c.maxArgs); continue; }
      ok('exports ' + c.name + (c.fn ? ' as a function' : ''));
    }
  }
  console.log('\\n  ' + passed + ' passed, ' + failed + ' failed');
  process.exit(failed ? 1 : 0);
})();
`;
  return { path: testPathFor(file), test, checks, hash: crypto.createHash('sha256').update(test).digest('hex').slice(0, 12) };
}

function _PE() { return require('./proposal-evidence.js'); }

function _failedLines(tail) { return String(tail || '').split('\n').map(l => l.trim()).filter(l => /^✗/.test(l)).slice(0, 10); }

/** run({ root, plan, path, overlays }) — the expectation in a shadow of root with overlays (path → text) laid over it */
async function run({ root, plan, path: file, overlays = {}, ms = RUN_MS } = {}) {
  const ex = forFile(plan, file);
  if (!ex) return { ok: true, ran: false, why: 'no expectation for this file (not a planned JS file with exports)' };
  if (!root) return { ok: true, ran: false, why: 'the repo has no folder on disk to test in — the expectation was not run' };
  const PE = _PE();
  const sh = PE.shadow(root, { ...overlays, [ex.path]: ex.test });
  try {
    const r = await PE.runOne(sh.dir, ex.path, ms);
    const failed = _failedLines(r.tail);
    const okk = r.exit === 0 && !r.timedOut;
    return { ok: okk, ran: true, checks: ex.checks.length, failed, tail: r.tail, ms: r.ms, hash: ex.hash, ...(r.timedOut ? { why: `timed out after ${ms} ms` } : {}) };
  } finally { sh.remove(); }
}

/** baseline — the expectation against the tree as it is (an existing file: does it already meet what the plan expects?) */
async function baseline({ root, plan, path: file, ms = RUN_MS } = {}) {
  const r = await run({ root, plan, path: file, overlays: {}, ms });
  if (!r.ran) return r;
  return { ...r, seen: r.ok ? 'passes already: this file meets its expectation before the build (the build must keep it so)' : 'fails before the build, as it should when the plan asks for something new' };
}

/** text the retry carries: what the expectation said, in its own words */
function feedback(r, file) {
  if (!r || r.ok || !r.ran) return null;
  return `${file} failed its expectation test (written from the plan before the code):\n${(r.failed.length ? r.failed : String(r.tail || '').split('\n').slice(-6)).map(l => `  ${l}`).join('\n')}${r.why ? `\n  (${r.why})` : ''}`;
}

module.exports = { MODULE_ID, VERSION, forFile, run, baseline, feedback, testPathFor, _arity };
