'use strict';
/**
 * lib/test-map.js — which tests exercise a file. 0.60.75.
 * Product: flight-recorder   (§PB1 0.60.116: part of products/flight-recorder; the branch tool carries every file tagged so)
 *
 * James, 2026-10-16: "like can you find all tests, qa, qc, debugging, strategy, relationships ... it needs to be tested
 * before it gets there, and any tests needs to be informative for the agents." The repo graph (idearium/repo/graph.js)
 * has `tested_by` / `tests` / `verified_by` edge slots marked "needs a test-mapping pass (MCO2 L6)"; this is that pass,
 * kept apart from the graph so an agent, the proposal screen and the graph can all ask it.
 *
 * HOW A TEST IS TIED TO A FILE (strongest first, and the strength is returned, never hidden):
 *   'requires'  the test requires/imports it: a relative specifier that resolves to the file (./x, ../../lib/x.js)
 *   'path'      the test names its path in a string: 'lib/hat-seed', "lib/hat-seed.js", path.join(ROOT, 'lib/hat-seed.js')
 *   'name'      the test file's own name carries the file's name: test-hat-seed.js, hat-seed.test.js
 *
 * LIMITS, said plainly: a test that reaches the file only through another module (A requires B, B requires the file) is
 * NOT listed — that is a transitive link and the map reports direct ones. A dynamic require (a computed path) is missed.
 * A test found here exercises the file; it does not prove the test checks the part that changed.
 */
const fs = require('fs');
const path = require('path');

const MODULE_ID = 'nexus.lib.test-map';
const VERSION = '1.0.0';
const ROOT = path.resolve(__dirname, '..');
const SKIP_DIR = new Set(['node_modules', '.git', 'data', 'dist', 'build', 'coverage', 'versions']);
const TEST_FILE = /(^|\/)([^/]+\.test\.[cm]?js|[^/]+\.spec\.[cm]?js)$/;   // test-*.js counts only inside a test directory (lib/test-map.js is not a test)
const IN_TEST_DIR = /(^|\/)(tests?|__tests__|probe)\//;

let _cache = null;   // { stamp, tests: [{ file, text-derived refs }] }

function _walk(root, rel = '', out = [], depth = 0) {
  if (depth > 6) return out;
  let ents; try { ents = fs.readdirSync(path.join(root, rel), { withFileTypes: true }); } catch (_) { return out; }
  for (const e of ents) {
    if (SKIP_DIR.has(e.name)) continue;
    const r = rel ? `${rel}/${e.name}` : e.name;
    if (e.isDirectory()) _walk(root, r, out, depth + 1);
    else if (/\.[cm]?js$/.test(e.name) && ((TEST_FILE.test(r) && !/^lib\//.test(r)) || (IN_TEST_DIR.test(r) && !/fixtures\//.test(r)))) out.push(r);
  }
  return out;
}

function _refsOf(root, file) {
  let text = ''; try { text = fs.readFileSync(path.join(root, file), 'utf8'); } catch (_) { return null; }
  const strings = new Set(); const rx = /(['"`])((?:(?!\1)[^\\\n]|\\.){2,200})\1/g; let m;
  while ((m = rx.exec(text))) strings.add(m[2]);
  const requires = new Set();
  const dir = path.posix.dirname(file);
  for (const s of strings) {
    if (!/^\.{1,2}\//.test(s)) continue;
    requires.add(path.posix.normalize(path.posix.join(dir, s)).replace(/\.[cm]?js$/, ''));
  }
  const paths = new Set();
  for (const s of strings) { if (/\//.test(s) && !/^\.{1,2}\//.test(s) && !/\s/.test(s)) paths.add(s.replace(/^\/+/, '').replace(/\.[cm]?js$/, '')); }
  return { requires, paths, base: path.posix.basename(file).toLowerCase() };
}

function index({ root = ROOT, fresh = false } = {}) {
  if (_cache && _cache.root === root && !fresh && Date.now() - _cache.at < 60000) return _cache;
  const tests = [];
  for (const file of _walk(root)) { const refs = _refsOf(root, file); if (refs) tests.push({ file, ...refs }); }
  _cache = { root, at: Date.now(), tests };
  return _cache;
}

/**
 * testsFor(file, { root, fresh }) -> [{ file, how: 'requires'|'path'|'name' }], strongest first, a test once.
 * `file` is repo-relative with forward slashes.
 */
function testsFor(file, opts = {}) {
  const f = String(file || '').replace(/\\/g, '/').replace(/^\.?\/+/, '');
  if (!f) return [];
  const noExt = f.replace(/\.[cm]?js$/, '');
  const stem = path.posix.basename(noExt).toLowerCase();
  const idx = index(opts);
  const out = [];
  for (const t of idx.tests) {
    if (t.file === f) continue;
    let how = null;
    if (t.requires.has(noExt) || t.requires.has(`${noExt}/index`)) how = 'requires';
    else if (t.paths.has(noExt) || [...t.paths].some(p => p.endsWith(`/${noExt}`) || p === noExt)) how = 'path';
    else if (stem.length >= 4 && t.base.includes(stem)) how = 'name';
    if (how) out.push({ file: t.file, how });
  }
  const order = { requires: 0, path: 1, name: 2 };
  return out.sort((a, b) => order[a.how] - order[b.how] || a.file.localeCompare(b.file));
}

module.exports = { MODULE_ID, VERSION, index, testsFor, TEST_FILE };
