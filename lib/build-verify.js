'use strict';
/**
 * lib/build-verify.js — does the code a spec produced actually work? One verification, graded, every failure
 * attributed to one file with the exact error.
 * comp_id: nexus.lib.build-verify
 * Version: 1.0.0 (0.39.291) — master phasemap PV1
 *
 * James, 2026-10-01, after an outside audit said Idearium's generated code was unproven: "Conrinue it first. Make
 * sure it's enterprise grade. Let's finish what idearium needs, then I'll record it". His rule for every step: "gate,
 * verify, check, if failed, send back and fix it, then back through."
 *
 * verify({ repo, repoDir, compartment, cosRun }) -> {
 *   verdict: 'failed' | 'parses' | 'proven',   — never inflated: no tests ran → 'parses', with why
 *   why, failures: [{ file, kind, error, line, excerpt, test }], byFile: { file: [failure] },
 *   checks: { syntax, data, python, deps, tests }, ms }
 *
 * Every step runs through what already exists (§8.6): COS's syntax check and dependency resolution and its test runs
 * in an isolated COS branch (lib/cos-run.js, cos/runtime/run.js), the COS debug report for where a failure is
 * (lib/cos-debug-report.js). Nothing here runs the code outside COS.
 *
 * kinds: syntax (does not parse) · data (JSON/YAML does not parse) · import (a relative import of a file that does not
 * exist) · dependency (a package that is neither built in nor declared) · test (a test failed; attributed to the
 * first frame in the project's own code, else the test file).
 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const MODULE_ID = 'nexus.lib.build-verify';
const VERSION = '1.0.0';
const MAX_PER_FILE = 6;
const TEST_FILE_RE = /(\.test\.[cm]?[jt]s|\.spec\.[cm]?[jt]s|^test_.+\.py|_test\.py)$|(^|\/)(tests?|__tests__)\//;

function _cosRun() { return require('./cos-run.js'); }

function _readJson(p) { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch (_) { return null; } }

/** declared(repoDir) — every package the project's package.json names (dependencies of any kind) */
function declared(repoDir) {
  const pkg = _readJson(path.join(repoDir, 'package.json')) || {};
  return new Set(Object.keys({ ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}), ...(pkg.peerDependencies || {}), ...(pkg.optionalDependencies || {}) }));
}

/** the data files (JSON, YAML) parsed here — they have no runtime to fail in, so a broken one would pass silently */
function checkData(repoDir, files) {
  const out = [];
  for (const f of files) {
    const ext = path.extname(f).toLowerCase();
    if (!['.json', '.yaml', '.yml'].includes(ext)) continue;
    let text; try { text = fs.readFileSync(path.join(repoDir, f), 'utf8'); } catch (e) { continue; }
    try {
      if (ext === '.json') JSON.parse(text);
      else require('js-yaml').load(text);
    } catch (e) {
      const m = String(e.message).match(/line (\d+)/i);
      out.push({ file: f, kind: 'data', error: `${ext.slice(1).toUpperCase()} does not parse: ${String(e.message).split('\n')[0].slice(0, 200)}`, line: m ? +m[1] : (e.mark && e.mark.line != null ? e.mark.line + 1 : null) });
    }
  }
  return out;
}

/** Python files compiled (ast.parse) when python3 is on this machine; said, not skipped silently, when it is not */
function checkPython(repoDir, files) {
  const py = files.filter(f => path.extname(f).toLowerCase() === '.py');
  if (!py.length) return { ran: false, why: 'no Python files', failures: [] };
  let bin = null, args = [];
  try { const f = require('../cos/testenv/installer.js').find('python3'); if (f.found) { bin = f.bin; args = f.args || []; } } catch (_) {}
  if (!bin) return { ran: false, why: 'python3 is not installed on this machine — Python files were not compiled', failures: [] };
  const script = 'import ast,sys,json\nout=[]\nfor f in sys.argv[1:]:\n  try:\n    ast.parse(open(f,encoding="utf-8").read(),f)\n  except SyntaxError as e:\n    out.append({"file":f,"line":e.lineno,"error":"%s: %s"%(type(e).__name__,e.msg)})\nprint(json.dumps(out))';
  const r = spawnSync(bin, [...args, '-c', script, ...py.map(f => path.join(repoDir, f))], { encoding: 'utf8', timeout: 60000, windowsHide: true });
  if (r.error || r.status !== 0) return { ran: false, why: `python3 could not check the files: ${r.error ? r.error.message : String(r.stderr).slice(0, 200)}`, failures: [] };
  let list = []; try { list = JSON.parse(r.stdout); } catch (_) {}
  return { ran: true, checked: py.length, failures: list.map(x => ({ file: path.relative(repoDir, x.file).replace(/\\/g, '/'), kind: 'syntax', error: x.error, line: x.line })) };
}

// the project files a test loads — `require('../lib/sum')`, `import x from './a.js'` — resolved like Node would
const RX_REL = /(?:require\(\s*|from\s+|import\s*\(\s*|import\s+)['"](\.{1,2}\/[^'"]+)['"]/g;
function loadsOf(repoDir, testFile, known) {
  let src; try { src = fs.readFileSync(path.join(repoDir, testFile), 'utf8'); } catch (_) { return { src: null, files: [] }; }
  const out = [];
  let m; RX_REL.lastIndex = 0;
  while ((m = RX_REL.exec(src))) {
    const base = path.posix.normalize(path.posix.join(path.posix.dirname(testFile), m[1]));
    const hit = ['', '.js', '.cjs', '.mjs', '.ts', '/index.js', '.py'].map(x => base + x).find(c => known.has(c));
    if (hit && !out.includes(hit) && !TEST_FILE_RE.test(hit)) out.push(hit);
  }
  return { src, files: out };
}

/** cleanOutput — a run's output as the agent should read it: the runtime's own internal frames and the sandbox's
 * absolute paths dropped (they say nothing about the project and push the real lines out of the budget) */
function cleanOutput(text) {
  const out = String(text || '')
    .replace(/[^\s(]*\/\.nex\/branches\/[^/\s]+\/root\//g, '')
    .split('\n').filter(l => !/^\s*at .*(node:internal|node:diagnostics_channel|\(node:)/.test(l) && !/^\s*at (TracingChannel|wrapModuleLoad|cjsLoader|ModuleWrap|ModuleJob|Module\.|Function\._load|Object\.\.js)/.test(l))
    .join('\n').replace(/\n{3,}/g, '\n\n').trim();
  return out ? out.slice(-900) : null;
}

/**
 * where a failing test run's failure lives. A frame in the project's own non-test code names the file outright. When
 * the only frames are the test's (an assertion throws in the test), the code under test is what the test loads: the
 * failure goes to those files, with the test's own source attached — a test is usually right about the behaviour it
 * asks for, and the agent fixing the code needs to read what it asks.
 */
function attributeTest(run, repoFiles, repoDir = null) {
  const d = run.debug || {};
  const known = new Set(repoFiles);
  const frames = (d.frames || []).filter(f => f.inRepo && known.has(f.file));
  const src = frames.find(f => !TEST_FILE_RE.test(f.file));
  const testFile = String(run.file || '').replace(/\\/g, '/');
  const loads = repoDir && known.has(testFile) ? loadsOf(repoDir, testFile, known) : { src: null, files: [] };
  const at = src || (loads.files.length ? null : frames[0]) || null;
  const error = [d.error || (run.error ? String(run.error) : null) || String(run.stderr || '').trim().split('\n').slice(-1)[0] || `exit ${run.exitCode}`, d.hint ? `(${d.hint})` : null].filter(Boolean).join(' ').slice(0, 500);
  const testExcerpt = loads.src ? loads.src.split('\n').slice(0, 80).join('\n').slice(0, 3000) : null;
  return {
    file: at ? at.file : (loads.files[0] || (known.has(testFile) ? testFile : testFile || null)),
    related: at ? [] : loads.files.slice(1),
    // the run's own last words: an assertion's actual/expected sit below its first line, and that is what a fix needs
    output: cleanOutput(`${run.stderr || ''}${run.stdout ? `\n${run.stdout}` : ''}`),
    kind: 'test', error, line: at ? at.line : (frames[0] && frames[0].file === testFile ? frames[0].line : null), test: testFile || null, testSource: testExcerpt,
    excerpt: at && Array.isArray(at.excerpt) ? at.excerpt.map(x => `${x.n}${x.n === at.line ? '>' : ' '} ${x.text}`).join('\n').slice(0, 1200) : null,
    timedOut: !!d.timedOut,
  };
}

async function verify({ repo, repoDir, compartment = null, cosRun = null, timeoutMs = 60000 } = {}) {
  const t0 = Date.now();
  const CR = cosRun || _cosRun();
  if (!repoDir || !fs.existsSync(repoDir)) return { verdict: 'failed', why: `the project's files are not on disk${repoDir ? ` (${repoDir})` : ''}`, failures: [], byFile: {}, checks: {}, ms: 0 };
  const files = CR.repoFiles(repo, repoDir);
  const failures = [];
  const checks = {};
  const menu = CR.options(repo, repoDir);
  const avail = (id) => { const o = menu.find(x => x.id === id); return o && o.available ? o : null; };
  const runOpt = async (option) => CR.run({ repo, repoDir, compartment, option, timeoutMs });

  if (!files.length) return { verdict: 'failed', why: 'the project has no files', failures: [], byFile: {}, checks, ms: Date.now() - t0 };

  // 1 — every file parses
  if (avail('check.syntax')) {
    const r = await runOpt('check.syntax');
    if (!r.ok) checks.syntax = { ran: false, why: (r.errors || []).join('; ') };
    else {
      const bad = (r.runs || []).slice(1).filter(x => !x.passed);
      checks.syntax = { ran: true, checked: r.report ? r.report.checked : null, failed: bad.length };
      for (const b of bad) {
        const m = String(b.stderr || '').match(/\(line (\d+)\)/);
        failures.push({ file: String(b.file).replace(/\\/g, '/'), kind: 'syntax', error: String(b.stderr || 'does not parse').replace(/\s*\(line \d+\)\s*$/, '').slice(0, 400), line: m ? +m[1] : null });
      }
    }
  } else checks.syntax = { ran: false, why: 'no JavaScript files' };
  const dataFails = checkData(repoDir, files);
  checks.data = { ran: true, failed: dataFails.length };
  failures.push(...dataFails);
  const py = checkPython(repoDir, files);
  checks.python = { ran: py.ran, why: py.why || null, checked: py.checked || 0, failed: py.failures.length };
  failures.push(...py.failures);

  // 2 — every import resolves
  const dep = await runOpt('check.deps');
  const needsInstall = [];
  if (!dep.ok || !dep.report) checks.deps = { ran: false, why: (dep.errors || []).join('; ') || 'no report' };
  else {
    const rep = dep.report;
    for (const b of rep.brokenRelative || []) failures.push({ file: b.file, kind: 'import', error: `imports '${b.specifier}', which does not exist in this project — create that file or fix the path` });
    const decl = declared(repoDir);
    for (const p of (rep.packages || []).filter(x => x.via === 'missing')) {
      if (decl.has(p.name)) { needsInstall.push(p.name); continue; }
      for (const f of p.files) failures.push({ file: f, kind: 'dependency', error: `requires '${p.name}', which is not a Node built-in and is not declared in package.json — declare it, or use only built-ins` });
    }
    checks.deps = { ran: true, ...rep.summary, needsInstall };
  }

  // 3 — the project's own tests, in an isolated COS branch (only when nothing above failed: a file that does not
  // parse fails every test that loads it, and the noise would bury the real error)
  if (failures.length) checks.tests = { ran: false, why: 'not run — the files must parse and resolve first' };
  else if (needsInstall.length) checks.tests = { ran: false, why: `the tests need ${needsInstall.length} declared package(s) that are not installed here (${needsInstall.slice(0, 5).join(', ')}) — process runs install nothing; the VM run installs them` };
  else {
    const suite = avail('test.suite'), all = avail('test.all');
    if (!suite && !all) {
      const o = menu.find(x => x.id === 'test.suite');
      checks.tests = { ran: false, why: needsInstall.length ? `the tests need ${needsInstall.length} declared package(s) installed (${needsInstall.slice(0, 5).join(', ')}) — the VM run installs them` : `no tests — ${(o && o.reason) || 'none found'}` };
    } else {
      const r = await runOpt(suite ? 'test.suite' : 'test.all');
      if (!r.ok) checks.tests = { ran: false, why: (r.errors || []).join('; ') };
      else {
        const bad = (r.runs || []).filter(x => !x.passed);
        checks.tests = { ran: true, how: suite ? 'test.suite' : 'test.all', runs: (r.runs || []).length, passed: r.passed, failed: r.failed,
          notRun: r.report && r.report.tests ? r.report.tests.notRun : 0 };
        for (const b of bad) {
          const a = attributeTest(b, files, repoDir);
          failures.push(a);
          // every other project file the failing test loads is a suspect too — each gets the same failure to look at
          for (const rel of a.related || []) failures.push({ ...a, file: rel, related: [], suspect: true });
        }
        if (checks.tests.notRun) failures.push({ file: null, kind: 'test', error: `${checks.tests.notRun} test file(s) did not run within the time budget — not proven` });
      }
    }
  }

  const byFile = {};
  for (const f of failures) { const k = f.file || '(project)'; (byFile[k] = byFile[k] || []).length < MAX_PER_FILE && byFile[k].push(f); }
  const verdict = failures.length ? 'failed' : (checks.tests && checks.tests.ran && checks.tests.runs > 0 ? 'proven' : 'parses');
  const why = verdict === 'failed' ? `${failures.length} failure(s) in ${Object.keys(byFile).length} file(s)`
    : verdict === 'parses' ? `every file parses and resolves, but nothing proves it works: ${checks.tests ? checks.tests.why : 'no tests'}`
    : `${checks.tests.passed} test run(s) passed`;
  return { verdict, why, failures, byFile, checks, files: files.length, ms: Date.now() - t0 };
}

/** keyOf(failure) — one failure's identity across two verifications (file, kind, the error without line numbers) */
function keyOf(f) { return `${f.file || '(project)'}|${f.kind}|${String(f.error || '').replace(/\(line \d+\)|:\d+:\d+|line \d+/g, '').slice(0, 200)}`; }
/** baselineOf(v) — the failures a verification found, as keys: what was already broken before a run */
function baselineOf(v) { return new Set(((v && v.failures) || []).map(keyOf)); }
/**
 * against(v, baseline, { built }) — §0.39.355 PB3. James: "it needs to actually build it". A run is judged on what it
 * broke: a failure already in the baseline, in a file this run did not build, is known debt — counted and listed,
 * never failed on and never sent back to an agent. A failure in a file the run built, or one that is new, stays.
 * Returns a verification of the same shape (verdict recomputed) plus known: [failure].
 */
function against(v, baseline, { built = [] } = {}) {
  if (!v || !baseline || !baseline.size) return { ...v, known: [] };
  const mine = new Set(built);
  const known = [], kept = [];
  for (const f of v.failures || []) ((baseline.has(keyOf(f)) && !mine.has(f.file)) ? known : kept).push(f);
  if (!known.length) return { ...v, known: [] };
  const byFile = {};
  for (const f of kept) { const k = f.file || '(project)'; (byFile[k] = byFile[k] || []).length < MAX_PER_FILE && byFile[k].push(f); }
  const files = new Set(known.map(f => f.file || '(project)')).size;
  const debt = `${known.length} older failure(s) in ${files} file(s) this run did not touch — known debt, not this run's`;
  let verdict = v.verdict, why = v.why;
  if (!kept.length) {
    // the tests are skipped whenever anything failed, so "nothing new failed" is not "proven"
    verdict = v.checks && v.checks.tests && v.checks.tests.ran && v.checks.tests.runs > 0 && !v.checks.tests.failed ? 'proven' : 'parses';
    why = `nothing this run built fails; ${debt}`;
  } else why = `${kept.length} failure(s) in ${Object.keys(byFile).length} file(s); ${debt}`;
  return { ...v, verdict, why, failures: kept, byFile, known };
}

/** repairText(failures) — the failures of one file, as the agent will read them */
function repairText(list) {
  const seenTests = new Set();
  return (list || []).map(f => {
    let t = `- [${f.kind}]${f.line && !f.test ? ` line ${f.line}` : ''}${f.test ? ` — the test ${f.test}${f.line ? ` (line ${f.line})` : ''} failed` : ''}: ${f.error}`;
    if (f.excerpt) t += `\n${f.excerpt.split('\n').map(l => '    ' + l).join('\n')}`;
    if (f.output && !f.suspect) t += `\n  its output:\n${f.output.split('\n').map(l => '    ' + l).join('\n')}`;
    if (f.testSource && !seenTests.has(f.test)) { seenTests.add(f.test); t += `\n  what the test asks (${f.test}):\n${f.testSource.split('\n').map(l => '    ' + l).join('\n')}`; }
    return t;
  }).join('\n');
}

module.exports = { verify, against, baselineOf, keyOf, attributeTest, loadsOf, cleanOutput, checkData, checkPython, declared, repairText, TEST_FILE_RE, MODULE_ID, VERSION };
