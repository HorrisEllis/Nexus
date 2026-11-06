'use strict';
/**
 * idearium/lib/primitive-tests.cjs — a project's own tests, run one by one, and what each says about the modules it requires (CS0 expanded,
 * 0.60.420). Map: docs/2026-10-12-browser-providers-and-work-phasemap.spec CS0_projects_decomposed_into_components (expanded_2026_11_06).
 *
 * James, 2026-11-06: "i want at some point to haveprimitives built and tested autonomously. using clearglass also for github repos. reusable
 * primitives saving to the component store." · "okay lets get this done. no more distractions"
 *
 * Step 1 of four (the coder's plan he said okay to): no model, no network. lib/project-decompose.js puts every file in the store and runs
 * nothing; this runs the tests:
 *   findTests(paths)                       the test files: tests?/ or __tests__/ folders, *.test.js, *.spec.js, test-*.js
 *   requiresOf(root, test)                 the project modules a test requires (relative requires, resolved like node: x, x.js, x/index.js)
 *   run({ root, tests, timeoutMs, node })  each test in its own node process, cwd the project root (as `npm test` runs them), in a COPY of the
 *                                          project (the original is never written), env: PATH, a temp HOME, NODE_ENV=test — no keys, no tokens.
 *                                          → [{ test, ok, why, ms, tail, covers: [paths] }]; why: 'passed' | 'timed out after Ns' |
 *                                          'needs the npm package X (not installed)' | 'exited N: <last line>'
 *   verdicts(results, paths)               per module: verified (a test that requires it passed and none failed) · failed · untested
 *   testProject({ root, components, … })   all of it, and each stored version marked (component-store markTested) → { results, verdicts, stats }
 *   materialize(files)                     a dropped zip's files written to a temp folder to run them (the top folder stripped as decompose does)
 * Passing means exit code 0: a test that prints a failure and still exits 0 is counted as passing — said here, not hidden.
 * Running a project's tests runs its code. Here: his own projects. A repo from the web runs in a COS compartment before it is trusted (step 4).
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const MODULE_ID = 'idearium.lib.primitive-tests';
const TEST_RX = /(^|\/)(tests?|__tests__)\/[^/]+\.[cm]?js$|\.(test|spec)\.[cm]?js$|(^|\/)test-[^/]+\.[cm]?js$/;
const SKIP = new Set(['node_modules', '.git', 'dist', 'build', 'out', 'coverage']);
const norm = (p) => String(p).split(path.sep).join('/');

function walk(root, rel = '', out = []) {
  let ents = []; try { ents = fs.readdirSync(path.join(root, rel), { withFileTypes: true }); } catch (_) { return out; }
  for (const e of ents) { if (SKIP.has(e.name)) continue; const r = rel ? `${rel}/${e.name}` : e.name; if (e.isDirectory()) walk(root, r, out); else out.push(r); }
  return out;
}
const findTests = (paths) => paths.map(norm).filter(p => TEST_RX.test(p)).sort();

function _resolve(root, fromRel, spec) {
  const base = norm(path.posix.normalize(path.posix.join(path.posix.dirname(fromRel), spec)));
  for (const c of [base, `${base}.js`, `${base}.cjs`, `${base}.mjs`, `${base}/index.js`]) { if (!c.startsWith('..') && fs.existsSync(path.join(root, c)) && fs.statSync(path.join(root, c)).isFile()) return c; }
  return null;
}
/** the project modules a test requires directly (its own subjects); a test helper it requires counts too */
function requiresOf(root, test) {
  let src = ''; try { src = fs.readFileSync(path.join(root, test), 'utf8'); } catch (_) { return []; }
  const out = new Set();
  for (const m of src.matchAll(/require\(\s*['"`](\.{1,2}\/[^'"`]+)['"`]\s*\)/g)) { const r = _resolve(root, test, m[1]); if (r && !TEST_RX.test(r)) out.add(r); }
  // require(path.join(__dirname, '..', 'x.js')) — the other common form
  for (const m of src.matchAll(/path\.(?:join|resolve)\(\s*__dirname\s*,\s*((?:['"`][^'"`]+['"`]\s*,?\s*)+)\)/g)) {
    const parts = [...m[1].matchAll(/['"`]([^'"`]+)['"`]/g)].map(x => x[1]); const r = _resolve(root, test, parts.join('/')); if (r && /\.[cm]?js$|\/index\.js$/.test(r) && !TEST_RX.test(r)) out.add(r);
  }
  return [...out].sort();
}

function _copy(root) {
  const dst = fs.mkdtempSync(path.join(os.tmpdir(), 'primitive-tests-'));
  for (const rel of walk(root)) { const to = path.join(dst, rel); fs.mkdirSync(path.dirname(to), { recursive: true }); fs.copyFileSync(path.join(root, rel), to); }
  const nm = path.join(root, 'node_modules'); if (fs.existsSync(nm)) { try { fs.symlinkSync(nm, path.join(dst, 'node_modules'), 'junction'); } catch (_) {} }
  return dst;
}

function _why(r, timeoutMs) {
  if (r.error && r.error.code === 'ETIMEDOUT' || r.signal === 'SIGTERM' && r.status === null) return `timed out after ${Math.round(timeoutMs / 1000)}s`;
  const out = `${r.stdout || ''}\n${r.stderr || ''}`;
  const miss = /Cannot find module '([^'.\/][^']*)'/.exec(out); if (r.status !== 0 && miss) return `needs the npm package ${miss[1].split('/')[0].startsWith('@') ? miss[1].split('/').slice(0, 2).join('/') : miss[1].split('/')[0]} (not installed)`;
  if (r.status === 0) return 'passed';
  const lines = out.split('\n').map(l => l.trim()).filter(Boolean).filter(l => !/^at |^Node\.js v\d|^\^+$|^node:internal|^\{$|^\}$|^[a-z]+: /.test(l));
  const last = lines.find(l => /^[\w.]*Error\b[^:]*:/.test(l)) || lines.find(l => /✗|FAIL|failed/.test(l) && !/^node:/.test(l)) || lines.filter(l => !/^node:/.test(l)).pop() || '';   // the error, not node's version footer
  return `exited ${r.status}: ${last.slice(0, 200)}`;
}

function run({ root, tests = null, timeoutMs = 30000, node = process.execPath, copy = true } = {}) {
  const ts = tests || findTests(walk(root));
  const covers = new Map(ts.map(t => [t, requiresOf(root, t)]));
  const cwd = copy ? _copy(root) : root;
  const env = { PATH: process.env.PATH || '', HOME: fs.mkdtempSync(path.join(os.tmpdir(), 'primitive-home-')), NODE_ENV: 'test', ...(process.platform === 'win32' ? { SystemRoot: process.env.SystemRoot, TEMP: os.tmpdir(), TMP: os.tmpdir() } : { TMPDIR: os.tmpdir() }) };
  const results = [];
  try {
    for (const t of ts) {
      const t0 = Date.now();
      const r = spawnSync(node, [t], { cwd, env, encoding: 'utf8', timeout: timeoutMs, killSignal: 'SIGTERM', maxBuffer: 8 * 1024 * 1024, windowsHide: true });
      const why = _why(r, timeoutMs);
      results.push({ test: t, ok: why === 'passed', why, ms: Date.now() - t0, tail: `${r.stdout || ''}${r.stderr || ''}`.trim().split('\n').slice(-6).join('\n').slice(0, 1200), covers: covers.get(t) });
    }
  } finally { if (copy) { try { fs.rmSync(cwd, { recursive: true, force: true }); } catch (_) {} } try { fs.rmSync(env.HOME, { recursive: true, force: true }); } catch (_) {} }
  return results;
}

/** per module: verified (a test requiring it passed and none failed) · failed · untested */
function verdicts(results, paths) {
  const out = {};
  for (const p of paths.map(norm)) {
    const mine = results.filter(r => (r.covers || []).includes(p));
    const state = !mine.length ? 'untested' : mine.some(r => !r.ok) ? 'failed' : 'verified';
    out[p] = { state, tests: mine.map(r => ({ test: r.test, ok: r.ok, why: r.why, ms: r.ms })) };
  }
  return out;
}

/** materialize(files) → a temp folder holding [{ path, content }] (a dropped zip's text files), its one shared top folder stripped as decompose does */
function materialize(files = []) {
  const list = files.filter(f => f && f.path && typeof f.content === 'string').map(f => ({ ...f, path: norm(f.path).replace(/^\/+/, '') }));
  const tops = new Set(list.map(f => f.path.split('/')[0])); const strip = tops.size === 1 && list.every(f => f.path.includes('/')) ? `${[...tops][0]}/` : '';
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'primitive-src-'));
  for (const f of list) { const rel = f.path.slice(strip.length); if (!rel || rel.split('/').some(x => x === '..')) continue; const to = path.join(dir, rel); fs.mkdirSync(path.dirname(to), { recursive: true }); fs.writeFileSync(to, f.content); }
  return dir;
}

/** testProject({ root, components: [{ id, version, path }], store }) → { results, verdicts, marked, stats } */
function testProject({ root, components = [], timeoutMs = 30000, store = null, by = 'primitive-tests' } = {}) {
  const CS = store || require(path.join(__dirname, '..', '..', 'lib', 'component-store.js'));
  const results = run({ root, timeoutMs });
  const v = verdicts(results, components.map(c => c.path));
  const at = new Date().toISOString(); let marked = 0;
  for (const c of components) { const x = v[norm(c.path)]; if (x && CS.markTested({ id: c.id, version: c.version, verdict: { ...x, at, by } }).marked) marked++; }
  const states = Object.values(v).map(x => x.state);
  const needs = [...new Set(results.map(r => (/^needs the npm package (\S+)/.exec(r.why) || [])[1]).filter(Boolean))];
  return { results, verdicts: v, marked, stats: { tests: results.length, passed: results.filter(r => r.ok).length, failed: results.filter(r => !r.ok).length,
    verified: states.filter(s => s === 'verified').length, failedModules: states.filter(s => s === 'failed').length, untested: states.filter(s => s === 'untested').length, needsNpm: needs } };
}

module.exports = { MODULE_ID, VERSION: '1.0.0', TEST_RX, findTests, requiresOf, run, verdicts, testProject, materialize, walk };
