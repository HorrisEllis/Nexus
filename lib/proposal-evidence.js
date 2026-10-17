'use strict';
/**
 * lib/proposal-evidence.js — what a proposed change does, found out BEFORE a person is asked to Apply it. 0.60.75.
 *
 * James, 2026-10-16: "it needs to be tested before it gets there, and any tests needs to be informative for the agents."
 * and, of a rejected hat-seed.js proposal: "probably should gather context on why it was rejected."
 *
 * What it gathers for one proposal (the file, what it was, what it would become):
 *   compare   lines before/after, declarations lost and added (lib/repo-inject definedSymbols), does it parse
 *   tests     the tests that exercise this file (lib/test-map.js, direct links only), each RUN twice in a shadow copy of
 *             the tree — once with the file as it is, once with the proposal in its place
 *   verdicts  REGRESSION  passed before, fails after   (the proposal broke something that worked)
 *             fixed       failed before, passes after
 *             unchanged   same result both times (including "already failing": not this proposal's doing)
 *   summary   plain text an agent can read: what was wrong, which test said so, the last lines of its output
 *
 * §THE SHADOW COPY: a temp folder whose entries are symlinks to the real tree, except the folders on the way to the
 * proposed file and to every data folder, which are real folders holding symlinks to their siblings and the one overlaid file. Run with
 * --preserve-symlinks so a test's require() resolves through the shadow and finds the proposal, not the real file.
 * Every `data` folder at any depth is a COPY, so a test finds its fixtures and cannot write to real state (0.60.76).
 * The real tree is never touched.
 *
 * §LIMITS, said plainly:
 *   - only tests linked to the file directly are run (lib/test-map.js says how each is linked); a break that only shows
 *     in a consumer's consumer is not found here.
 *   - a test that needs data/ or a running service fails both times and is reported 'unchanged' (already failing) —
 *     it neither clears nor blames the proposal. 'ran 0 of N' is said, never a silent pass.
 *   - at most MAX_TESTS tests, TEST_MS each. A test that times out both times is 'unchanged'.
 *   - passing tests do not prove the change is right; they show it did not break what those tests check.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const MODULE_ID = 'nexus.lib.proposal-evidence';
const VERSION = '1.1.0';   // 1.1.0 (0.60.114 FR2): several overlays, gatherBatch, where it ran
const ROOT = path.resolve(__dirname, '..');
const MAX_TESTS = 6;
const TEST_MS = 60000;
const CONCURRENCY = 3;

function _symbols(code) { try { return require('./repo-inject.js').definedSymbols(String(code || '')); } catch (_) { return []; } }
function _lines(s) { return s == null ? 0 : String(s).split('\n').length; }
function _parse(rel, content) {
  try { const SG = require('./step-gate.js'); return SG.CHECKS.parses({ languages: ['json', 'yaml', 'yml', 'js', 'mjs', 'cjs'] }, { path: rel, content }) || null; } catch (_) { return null; }
}

/** names a CommonJS file exports: module.exports = { a, b: x }, module.exports.c =, exports.d = */
function _exports(code) {
  const out = new Set(); const t = String(code || '');
  let m; const rx1 = /module\.exports\s*=\s*\{([\s\S]*?)\}\s*;?/g;
  while ((m = rx1.exec(t))) for (const part of m[1].split(',')) { const k = part.replace(/\/\/.*$/gm, '').trim().split(/[:\s(]/)[0]; if (/^[A-Za-z_$][\w$]*$/.test(k)) out.add(k); }
  const rx2 = /(?:module\.)?exports\.([A-Za-z_$][\w$]*)\s*=/g;
  while ((m = rx2.exec(t))) out.add(m[1]);
  return [...out];
}

/** what was able to check this file's syntax: { lang, tool, checked: true|false, why } — "not checked" is said, never a pass */
function _syntaxStatus(rel, content) {
  const ext = path.extname(String(rel || '')).slice(1).toLowerCase();
  if (!ext) return { lang: null, checked: false, why: 'no file extension' };
  if (ext === 'js' || ext === 'mjs' || ext === 'cjs') return { lang: 'js', tool: 'node', checked: true };
  try {
    const r = require('./checks/ck-248-toolchain.js').checkText(ext, content);
    if (!r.lang) return { lang: ext, checked: false, why: `no syntax checker is known for .${ext} files` };
    if (r.ok === null) return { lang: r.lang, tool: r.tool, checked: false, why: `${r.tool} is not installed on this machine` };
    return { lang: r.lang, tool: r.tool, checked: true, heuristic: r.heuristic || undefined };
  } catch (e) { return { lang: ext, checked: false, why: e.message }; }
}

/** compare(rel, base, content) -> the facts that need no test run */
function compare(rel, base, content) {
  const a = _symbols(base), b = _symbols(content);
  const A = new Set(a), B = new Set(b);
  return {
    lines: { before: base == null ? null : _lines(base), after: _lines(content) },
    symbols: { before: a.length, after: b.length, lost: a.filter(x => !B.has(x)), added: b.filter(x => !A.has(x)) },
    exports: (() => { const x = _exports(base), y = new Set(_exports(content)), z = new Set(x); return { lost: x.filter(n => !y.has(n)), added: [...y].filter(n => !z.has(n)) }; })(),
    parseError: _parse(rel, content),
    syntax: _syntaxStatus(rel, content),
    creates: base == null,
  };
}

function _linkDir(real, shadow) { try { fs.symlinkSync(real, shadow, 'junction'); } catch (_) { fs.cpSync(real, shadow, { recursive: true }); } }

/** every folder named `data` (state: ledgers, memory, nodes) at any depth, repo-relative — a test must never write into the real ones */
function _dataDirs(root, rel = '', out = [], depth = 0) {
  if (depth > 5) return out;
  let ents; try { ents = fs.readdirSync(path.join(root, rel), { withFileTypes: true }); } catch (_) { return out; }
  for (const e of ents) {
    if (!e.isDirectory() || e.name === 'node_modules' || e.name === '.git') continue;
    const r = rel ? `${rel}/${e.name}` : e.name;
    if (e.name === 'data') out.push(r); else _dataDirs(root, r, out, depth + 1);
  }
  return out;
}

/**
 * shadow(root, rel, content) -> { dir, remove() } — see the header.
 * §0.60.76 — every `data` folder at any depth is COPIED into the shadow, not linked. 0.60.75 emptied only the top-level data/,
 * and tests run in the shadow wrote into the real guardian/data through the symlinked guardian/ (eight response nodes and
 * a modified downloads-pending.jsonl landed in a commit). The folders on the way to a data folder are real folders of
 * links; the data folder itself is a copy, so a test finds the fixtures it reads and cannot change the real ones.
 */
function shadow(root, rel, content) {
  // §FR2 0.60.114 — several files at once: shadow(root, { 'a.js': text, 'b.js': null }) overlays each (null = the file is gone);
  // shadow(root, {}) is the tree as it is. shadow(root, rel, content) is the one-file form every caller already uses.
  const overlays = rel && typeof rel === 'object' ? rel : { [rel]: content };
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'proposal-shadow-'));
  const datas = _dataDirs(root);
  const dataSet = new Set(datas);
  const ancestors = new Set();
  for (const d of datas) { const ps = d.split('/'); for (let i = 1; i < ps.length; i++) ancestors.add(ps.slice(0, i).join('/')); }
  for (const r of Object.keys(overlays)) { const parts = String(r).split('/').filter(Boolean); for (let i = 1; i < parts.length; i++) ancestors.add(parts.slice(0, i).join('/')); }
  const fill = (realDir, shDir, relPath) => {
    fs.mkdirSync(shDir, { recursive: true });
    for (const e of fs.readdirSync(realDir, { withFileTypes: true })) {
      const r = relPath ? `${relPath}/${e.name}` : e.name;
      const rp = path.join(realDir, e.name), sp = path.join(shDir, e.name);
      if (r === '.git') continue;
      if (Object.prototype.hasOwnProperty.call(overlays, r)) continue;   // an overlaid file, written below (or gone)
      if (e.isDirectory() && dataSet.has(r)) { fs.cpSync(rp, sp, { recursive: true }); continue; }
      if (e.isDirectory() && ancestors.has(r)) { fill(rp, sp, r); continue; }
      if (e.isDirectory()) _linkDir(rp, sp); else { try { fs.symlinkSync(rp, sp, 'file'); } catch (_) { fs.copyFileSync(rp, sp); } }
    }
  };
  fill(root, dir, '');
  if (!fs.existsSync(path.join(dir, 'data'))) fs.mkdirSync(path.join(dir, 'data'), { recursive: true });
  for (const [r, text] of Object.entries(overlays)) if (text != null) { fs.mkdirSync(path.dirname(path.join(dir, r)), { recursive: true }); fs.writeFileSync(path.join(dir, r), text); }
  return { dir, remove() { try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_) {} } };
}

/** the lines of a test's output that say what failed — assertion/failure lines and the error, then the summary line — not stack frames */
function _informative(out) {
  const all = String(out).split('\n').map(l => l.trimEnd()).filter(Boolean).filter(l => !/^\s+at\s/.test(l) && !/^\s*\[jaa\]/.test(l) && !/^Node\.js v/.test(l));
  const fail = all.filter(l => /✗|✖|FAIL|not ok|Error[:\s]|Cannot find|is not a function|is not defined|expected|actual|AssertionError/i.test(l)).slice(0, 8);
  const summary = all.filter(l => /\d+\s+passed|\d+\s+failed|passed,|failed/i.test(l)).slice(-1);
  const lines = [...new Set([...fail, ...summary])];
  return (lines.length ? lines : all.slice(-8)).join('\n').slice(0, 1500);
}

function _runOne(dir, testRel, ms = TEST_MS) {
  return new Promise(resolve => {
    const t0 = Date.now(); let out = '', done = false, timer = null;
    const env = { ...process.env, NEXUS_EVIDENCE: 'off', NEXUS_INJECT_DIR: path.join(dir, 'data', 'inject-evidence'), FORCE_COLOR: '0' };
    const c = spawn(process.execPath, ['--preserve-symlinks', '--preserve-symlinks-main', testRel], { cwd: dir, env, windowsHide: true });
    const fin = (code, why) => { if (done) return; done = true; clearTimeout(timer); const tail = _informative(out); resolve({ exit: code, ms: Date.now() - t0, timedOut: why === 'timeout', tail }); };
    c.stdout.on('data', d => { out += d; if (out.length > 200000) out = out.slice(-100000); });
    c.stderr.on('data', d => { out += d; if (out.length > 200000) out = out.slice(-100000); });
    c.on('error', e => { out += String(e.message); fin(-1, 'error'); });
    c.on('close', code => fin(code, 'close'));
    timer = setTimeout(() => { try { c.kill('SIGKILL'); } catch (_) {} fin(-1, 'timeout'); }, ms);
  });
}

async function _pool(items, n, fn) {
  const res = new Array(items.length); let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => { while (i < items.length) { const k = i++; res[k] = await fn(items[k], k); } }));
  return res;
}

const _pass = r => r.exit === 0 && !r.timedOut;

/**
 * gather({ path, base, content, root, run }) -> evidence
 *   run: false → the facts only (no test run). Default true.
 */
async function gather({ path: rel, base = null, content, root = ROOT, run = true, maxTests = MAX_TESTS } = {}) {
  const t0 = Date.now();
  const cmp = compare(rel, base, content);
  const ev = { schema: 'nexus.proposal-evidence/1', path: rel, at: t0, root: _rootLabel(root), ...cmp, tests: { linked: 0, ran: 0, results: [] }, regressions: 0, fixed: 0 };
  let linked = [];
  try { linked = require('./test-map.js').testsFor(rel, { root, fresh: true }); } catch (_) {}
  ev.tests.linked = linked.length;
  const pick = linked.slice(0, maxTests);
  if (run && pick.length && !cmp.parseError) {
    const before = shadow(root, rel, base), after = shadow(root, rel, content);
    try {
      const rs = await _pool(pick, CONCURRENCY, async t => {
        const [b, a] = [await _runOne(before.dir, t.file), await _runOne(after.dir, t.file)];
        const verdict = _pass(b) && !_pass(a) ? 'REGRESSION' : (!_pass(b) && _pass(a) ? 'fixed' : (_pass(a) ? 'passes' : 'already-failing'));
        return { file: t.file, how: t.how, verdict, before: { ok: _pass(b), exit: b.exit, ms: b.ms }, after: { ok: _pass(a), exit: a.exit, ms: a.ms, timedOut: a.timedOut, tail: _pass(a) ? undefined : a.tail } };
      });
      ev.tests.results = rs; ev.tests.ran = rs.length;
      ev.regressions = rs.filter(r => r.verdict === 'REGRESSION').length;
      ev.fixed = rs.filter(r => r.verdict === 'fixed').length;
    } finally { before.remove(); after.remove(); }
  } else if (cmp.parseError) ev.tests.skipped = 'the proposal does not parse, so no test was run';
  ev.ms = Date.now() - t0;
  ev.summary = summarize(ev);
  return ev;
}

// §FR2 0.60.114 — where a change was tested: Nexus's own tree, or the repo it belongs to (a folder on disk)
function _rootLabel(root) { return path.resolve(root) === path.resolve(ROOT) ? 'nexus' : 'repo'; }

/**
 * gatherBatch({ root, changes: [{ path, base, content }], run }) -> evidence for a staged batch, tested TOGETHER (§FR2 0.60.114).
 * Each file alone can pass while the batch breaks (one file renames what another calls): the union of every file's linked
 * tests runs once on the tree as it is and once with every file of the batch in place. Same verdicts as gather().
 */
async function gatherBatch({ root = ROOT, changes = [], run = true, maxTests = MAX_TESTS } = {}) {
  const t0 = Date.now();
  const files = changes.map(c => ({ path: c.path, ...compare(c.path, c.base == null ? null : c.base, c.content) }));
  const ev = { schema: 'nexus.proposal-evidence.batch/1', at: t0, root: _rootLabel(root), files: files.map(f => ({ path: f.path, lines: f.lines, parseError: f.parseError || null, exportsLost: (f.exports && f.exports.lost) || [] })),
    tests: { linked: 0, ran: 0, results: [] }, regressions: 0, fixed: 0 };
  const seen = new Map();
  for (const c of changes) { let linked = []; try { linked = require('./test-map.js').testsFor(c.path, { root, fresh: true }); } catch (_) {} for (const t of linked) if (!seen.has(t.file)) seen.set(t.file, { ...t, for: [c.path] }); else seen.get(t.file).for.push(c.path); }
  const linked = [...seen.values()];
  ev.tests.linked = linked.length;
  const broken = files.filter(f => f.parseError);
  if (broken.length) ev.tests.skipped = `${broken.map(f => f.path).join(', ')} does not parse, so no test was run`;
  else if (run && linked.length) {
    const overlays = Object.fromEntries(changes.map(c => [c.path, c.delete ? null : c.content]));
    const before = shadow(root, {}), after = shadow(root, overlays);
    try {
      const rs = await _pool(linked.slice(0, maxTests), CONCURRENCY, async t => {
        const [b, a] = [await _runOne(before.dir, t.file), await _runOne(after.dir, t.file)];
        const verdict = _pass(b) && !_pass(a) ? 'REGRESSION' : (!_pass(b) && _pass(a) ? 'fixed' : (_pass(a) ? 'passes' : 'already-failing'));
        return { file: t.file, how: t.how, for: t.for, verdict, before: { ok: _pass(b), exit: b.exit, ms: b.ms }, after: { ok: _pass(a), exit: a.exit, ms: a.ms, timedOut: a.timedOut, tail: _pass(a) ? undefined : a.tail } };
      });
      ev.tests.results = rs; ev.tests.ran = rs.length;
      ev.regressions = rs.filter(r => r.verdict === 'REGRESSION').length;
      ev.fixed = rs.filter(r => r.verdict === 'fixed').length;
    } finally { before.remove(); after.remove(); }
  }
  ev.ms = Date.now() - t0;
  const t = ev.tests;
  ev.summary = [`batch of ${files.length} file(s), tested together in ${ev.root === 'nexus' ? "Nexus's tree" : "the repo's own tree"}`,
    t.skipped || (!t.linked ? 'no test is linked to any file of the batch — nothing could check it'
      : `${t.linked} linked test(s), ran ${t.ran}: ${t.results.filter(r => r.verdict === 'passes').length} pass, ${ev.regressions} REGRESSED, ${ev.fixed} fixed, ${t.results.filter(r => r.verdict === 'already-failing').length} already failing`),
    ...t.results.filter(r => r.verdict === 'REGRESSION').map(r => `  REGRESSION ${r.file} (linked to ${r.for.join(', ')})\n${String(r.after.tail || '').split('\n').slice(0, 6).map(x => `    ${x}`).join('\n')}`)].join('\n');
  return ev;
}

/** summarize(ev) -> text an agent (or a person) reads: what is wrong, where, and what said so */
function summarize(ev) {
  const L = [];
  const n = ev.lines;
  L.push(`${ev.path}: ${ev.creates ? `new file, ${n.after} lines` : `${n.before} → ${n.after} lines`}`);
  if (ev.parseError) L.push(`DOES NOT PARSE — ${ev.parseError}`);
  else if (ev.syntax && ev.syntax.checked === false && /\.(py|php|rb|rs|java|kt|kts|swift|go|ts|tsx|c|h|cpp|cc|hpp|lua|cs|dart|sh|toml|xml)$/i.test(ev.path)) L.push(`syntax NOT checked (${ev.syntax.why}) — this is not a pass`);
  if (ev.exports && ev.exports.lost.length) L.push(`EXPORTS REMOVED (anything that requires this file and uses them will break): ${ev.exports.lost.join(', ')}`);
  if (ev.symbols.lost.length) L.push(`declarations the file had that the proposal does not: ${ev.symbols.lost.slice(0, 12).join(', ')}${ev.symbols.lost.length > 12 ? ` (+${ev.symbols.lost.length - 12} more)` : ''}`);
  if (ev.symbols.added.length) L.push(`declarations it adds: ${ev.symbols.added.slice(0, 8).join(', ')}${ev.symbols.added.length > 8 ? ' …' : ''}`);
  const t = ev.tests;
  if (t.skipped) L.push(t.skipped);
  else if (!t.linked) L.push('no test is linked to this file (lib/test-map.js: none requires it or names its path) — nothing could check it');
  else {
    L.push(`${t.linked} test${t.linked === 1 ? '' : 's'} linked to this file; ran ${t.ran}${t.linked > t.ran ? ` (capped at ${t.ran})` : ''}: ${t.results.filter(r => r.verdict === 'passes').length} pass, ${ev.regressions} REGRESSED, ${ev.fixed} fixed, ${t.results.filter(r => r.verdict === 'already-failing').length} already failing`);
    for (const r of t.results.filter(r => r.verdict === 'REGRESSION')) L.push(`  REGRESSION ${r.file} (passed on the current file, fails on the proposal)${r.after.timedOut ? ' — timed out' : ''}\n${String(r.after.tail || '').split('\n').slice(0, 9).map(x => `    ${x}`).join('\n')}`);
  }
  return L.join('\n');
}

module.exports = { MODULE_ID, VERSION, ROOT, MAX_TESTS, compare, shadow, gather, gatherBatch, summarize };
