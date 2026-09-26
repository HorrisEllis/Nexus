'use strict';
/**
 * lib/cos-run.js — the COS Run menu: every way a repo can be run, with what
 * each needs and why one is unavailable.
 * UUID: nexus-cos-run-v1-0000-2026-0926-jamesbrooks-001
 * Version: 1.0.0
 *
 * §0.39.261 — James: "i want the run button in cos to work fully … ask what id
 * like to do. like a bunch of options for cos."
 *
 * options(repo) lists the menu; run(repo, optionId, …) executes one. Every
 * option runs through COS:
 *
 *   ordinary repo   the repo's files are forked into a branch of ITS OWN
 *                   compartment (cos/playground/branch.js) and run there.
 *   Nexus system    (repo.nexusSelf) a system never runs alone — its files
 *                   require other systems — so the run happens in a full-tree
 *                   workspace: the immutable base, hard-linked read-only, with
 *                   the chosen edit branch laid over it (lib/nexus-self/branch.js).
 *                   The result is recorded on that branch; the apply gate reads it.
 *
 * Process runs use cos/runtime/run.js (packages resolve from Nexus's root —
 * nothing is installed; ports are shifted; network is isolated). The VM option
 * uses cos/testenv's qemu backend and is offered only when that is really
 * available.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

const MODULE_ID = 'cos-run';
const VERSION = '1.0.0';
const ROOT = path.resolve(__dirname, '..');
const RT = () => require('../cos/runtime/run.js');
const RUNTIME_BY_EXT = { '.js': 'node', '.cjs': 'node', '.mjs': 'node', '.ts': 'node', '.mts': 'node', '.cts': 'node', '.py': 'python3', '.rb': 'ruby', '.php': 'php', '.sh': 'shell' };
const TEST_RE = /(\.test\.[cm]?[jt]s|\.spec\.[cm]?[jt]s|^test_.+\.py|_test\.py)$/;
const ENTRY_CANDIDATES = ['index.js', 'main.js', 'server.js', 'app.js', 'cli.js', 'index.mjs', 'index.ts', 'main.ts', 'main.py', 'app.py', '__main__.py'];
const MAX_TESTS = 40;

function _walk(root, rel = '', out = [], depth = 0) {
  if (depth > 10 || out.length > 20000) return out;
  let ents; try { ents = fs.readdirSync(path.join(root, rel), { withFileTypes: true }); } catch (_) { return out; }
  for (const e of ents) {
    if (['node_modules', '.git', '.nex', 'data', 'chunks', 'indexes'].includes(e.name) || e.name.startsWith('.cos-')) continue;
    const r = rel ? `${rel}/${e.name}` : e.name;
    if (e.isDirectory()) _walk(root, r, out, depth + 1); else if (e.isFile()) out.push(r);
  }
  return out;
}

/** the files a repo holds, Nexus-root-relative for a system repo */
function repoFiles(repo, repoDir) {
  if (repo && repo.nexusSelf && repo.nexusSelf.role === 'system') {
    const store = require('./nexus-self/store.js');
    const snap = store.loadSnapshot(repo.nexusSelf.snapshot) || store.loadSnapshot(store.head().hash);
    return store.filesOf(snap, repo.nexusSelf.system).map(([p]) => p);
  }
  return _walk(repoDir);
}

// Nexus's own test naming: *.test.js, *.spec.js, and test-*.js / run-*.js under a tests dir.
const NEXUS_TEST_RE = /(^|\/)tests?\/(.+\/)?(test-[^/]+|[^/]+\.test|[^/]+\.spec)\.[cm]?js$|\.test\.[cm]?js$/;

/**
 * testsFor(repo, repoDir) — the test files that exercise this repo.
 * Ordinary repo: its own test files. Nexus system: every test file in Nexus
 * that references the system's code (a require/import path into one of its
 * directories) — Nexus keeps most tests in tests/, which core owns, so "the
 * system's own files" would find almost none. Read from the immutable base.
 */
function testsFor(repo, repoDir) {
  if (!(repo && repo.nexusSelf && repo.nexusSelf.role === 'system')) {
    return repoFiles(repo, repoDir).filter(f => TEST_RE.test(path.basename(f)));
  }
  const store = require('./nexus-self/store.js');
  const systems = require('./nexus-self/systems.js');
  const snap = store.loadSnapshot(repo.nexusSelf.snapshot) || store.loadSnapshot(store.head().hash);
  const sys = repo.nexusSelf.system;
  const all = store.filesOf(snap);
  const dirs = systems.get(sys).dirs || [...new Set(store.filesOf(snap, sys).map(([p]) => p.split('/')[0]).filter(d => !d.includes('.')))];
  const refRx = new RegExp(`['"\`](?:[^'"\`\\n]*/)?(?:${dirs.map(d => d.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})/[^'"\`]*['"\`]`);
  const out = [];
  for (const [p, sha] of all) {
    if (!NEXUS_TEST_RE.test(p) || !/\.[cm]?js$/.test(p)) continue;
    if (systems.ownerOf(p) === sys) { out.push(p); continue; }
    let src; try { src = store.getBlob(sha).toString('utf8'); } catch (_) { continue; }
    if (refRx.test(src)) out.push(p);
  }
  return out.sort();
}

function _entryFor(repo, files, repoDir) {
  if (repo && repo.nexusSelf) {
    const def = require('./nexus-self/systems.js').get(repo.nexusSelf.system);
    return def && def.entry ? { file: def.entry, reason: `${def.name}'s kernel entry (autopilot)` } : null;
  }
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(repoDir, 'package.json'), 'utf8'));
    const main = pkg.main && pkg.main.replace(/^\.\//, '');
    if (main && files.includes(main)) return { file: main, reason: 'package.json main' };
  } catch (_) {}
  const hit = ENTRY_CANDIDATES.find(c => files.includes(c));
  return hit ? { file: hit, reason: `conventional entry ${hit}` } : null;
}

function _nodeScripts(repoDir) {
  let pkg; try { pkg = JSON.parse(fs.readFileSync(path.join(repoDir, 'package.json'), 'utf8')); } catch (_) { return []; }
  return Object.entries(pkg.scripts || {}).map(([name, cmd]) => {
    const m = String(cmd).trim().match(/^node\s+((?:--?[\w-]+(?:=\S+)?\s+)*)(\S+\.(?:[cm]?js|ts))((?:\s+[^&|;<>`$]+)?)$/);
    return m ? { name, cmd, file: m[2].replace(/^\.\//, ''), args: (m[3] || '').trim().split(/\s+/).filter(Boolean), runnable: true }
             : { name, cmd, runnable: false, reason: 'not a plain `node <file>` command — COS runs JS directly, it does not start a shell' };
  });
}

/**
 * options(repo, repoDir) -> [{ id, label, group, description, available, reason, needs, choices }]
 */
function options(repo, repoDir) {
  const rt = RT();
  const caps = rt.capabilities();
  const files = repoFiles(repo, repoDir);
  const runnable = (f) => {
    const r = RUNTIME_BY_EXT[path.extname(f).toLowerCase()];
    if (!r) return false;
    if (r === 'node') return true;
    return r === 'shell' ? process.platform !== 'win32' : !!caps.external[r];
  };
  const entry = _entryFor(repo, files, repoDir);
  const tests = testsFor(repo, repoDir).filter(runnable);
  const jsFiles = files.filter(f => rt.JS_EXT.has(path.extname(f)));
  const isSystem = !!(repo && repo.nexusSelf && repo.nexusSelf.role === 'system');
  const def = isSystem ? require('./nexus-self/systems.js').get(repo.nexusSelf.system) : null;
  let vm = { ok: false, reason: 'cos/testenv unavailable' };
  try { vm = require('../cos/testenv/index.js').capabilities().vm; } catch (_) {}
  const scripts = isSystem ? [] : _nodeScripts(repoDir);
  const o = (id, label, group, description, available, reason, extra = {}) => ({ id, label, group, description, available: !!available, reason: available ? null : reason, ...extra });

  return [
    o('run.entry', entry ? `Run ${entry.file}` : 'Run entry', 'run',
      isSystem ? 'Start the kernel in the full Nexus workspace (ports shifted, network isolated) and stop it after the time limit.' : 'Run the repo\'s entry file.',
      !!entry && runnable(entry.file), entry ? `no runtime for ${entry.file}` : 'no entry: no package.json main and none of the conventional entry files', { entry: entry && entry.file, entryReason: entry && entry.reason }),
    o('run.file', 'Run a file…', 'run', 'Pick any runnable file.', files.some(runnable), 'no runnable files',
      { needs: ['file'], choices: files.filter(runnable).slice(0, 1000) }),
    o('boot.probe', isSystem ? `Boot ${def.name} + health probe` : 'Boot + health probe', 'run',
      'Start the entry as a server on a shifted port, wait until it answers /health, then stop it. Proves it boots without touching the live system.',
      !!entry && rt.JS_EXT.has(path.extname(entry.file)), entry ? 'boot probe runs JavaScript entries only' : 'no entry to boot', { entry: entry && entry.file, port: def ? def.port : null }),
    o('test.all', `Run all tests${tests.length ? ` (${Math.min(tests.length, MAX_TESTS)}${tests.length > MAX_TESTS ? ` of ${tests.length}` : ''})` : ''}`, 'test',
      'Each test file as its own run, one after another.', tests.length > 0, 'no test files found (*.test.js, *.spec.js, test_*.py, *_test.py)', { count: tests.length }),
    o('test.file', 'Run one test…', 'test', 'Pick a single test file.', tests.length > 0, 'no test files found', { needs: ['file'], choices: tests.slice(0, 1000) }),
    o('check.syntax', `Syntax check${jsFiles.length ? ` (${jsFiles.length} JS files)` : ''}`, 'check', 'Parse every JavaScript file without running any of it — one process for the whole set.', jsFiles.length > 0, 'no JavaScript files'),
    o('check.deps', 'Resolve dependencies', 'check', 'Every package and relative import, and where it resolves: Node builtin, the repo, Nexus\'s packages — or nowhere.', true, null),
    o('script.run', 'Run a package script…', 'run', 'A package.json script that is a plain `node <file>` command, run directly (no shell).',
      scripts.some(s => s.runnable), scripts.length ? 'no script is a plain `node <file>` command' : 'no package.json scripts', { needs: ['script'], choices: scripts }),
    o('test.vm', 'Run all tests in a VM', 'test', 'COS\'s qemu backend: an ephemeral VM, network none, separate kernel.', vm.ok && tests.length > 0, vm.ok ? 'no test files' : vm.reason),
  ];
}

// ── where a run happens ────────────────────────────────────────────────────

async function _prepare({ repo, repoDir, compartment, nexusBranch }) {
  if (repo && repo.nexusSelf && repo.nexusSelf.role === 'system') {
    const NSB = require('./nexus-self/branch.js');
    const store = require('./nexus-self/store.js');
    if (nexusBranch) {
      const ws = NSB.workspace(nexusBranch);
      return { cwd: ws.dir, where: `workspace: base ${nexusBranch.base.slice(0, 12)} + branch ${nexusBranch.id} (${ws.changed} changed file(s))`, cleanup: () => fs.rmSync(ws.dir, { recursive: true, force: true }), record: (r) => NSB.recordRun(compartment, nexusBranch.id, r) };
    }
    const base = repo.nexusSelf.snapshot || store.head().hash;
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), `nexus-ws-${repo.nexusSelf.system}-`));
    store.checkout(base, dir, { link: true });
    return { cwd: dir, where: `workspace: base ${base.slice(0, 12)} (no branch)`, cleanup: () => fs.rmSync(dir, { recursive: true, force: true }), record: () => {} };
  }
  if (!compartment || !compartment.id) throw new Error(repo && repo.compartmentId ? `COS compartment not found: ${repo.compartmentId}` : 'this repo has no COS compartment to run in');
  const BE = require('../cos/playground/branch.js').BranchEngine;
  const br = BE.fork({ id: compartment.id, fs: { root: repoDir } }, { label: `run ${new Date().toISOString()}` });
  return { cwd: br.root, branchId: br.id, where: `COS branch ${br.id} of compartment ${compartment.name || compartment.id}`,
           cleanup: (keep) => { if (!keep) { try { BE.destroy({ id: compartment.id }, br.id); } catch (_) {} } },
           record: (r) => BE.recordRun({ id: compartment.id }, br.id, r) };
}

async function _runFile(cwd, file, { timeoutMs, args = [], expectPort = null, bootOnly = false }) {
  const rt = RT();
  const ext = path.extname(file).toLowerCase();
  const runtime = RUNTIME_BY_EXT[ext];
  if (runtime === 'node') {
    if (bootOnly) return rt.bootProbe({ cwd, file, expectPort, bootTimeoutMs: timeoutMs });
    return rt.runNode({ cwd, file, args, timeoutMs, shiftPorts: true });
  }
  // external runtimes (python3, ruby, php, sh) — the same clean env; only what
  // cannot be done in JS goes outside it, and it says so in the result
  const { spawn } = require('child_process');
  const bin = runtime === 'shell' ? '/bin/sh' : runtime;
  return new Promise((resolve) => {
    const started = Date.now();
    let out = '', err = '', done = false;
    const env = rt.runEnv({ runDir: cwd });
    const c = spawn(bin, [file, ...args], { cwd, env, stdio: ['ignore', 'pipe', 'pipe'] });
    const t = setTimeout(() => { c.kill('SIGKILL'); }, timeoutMs);
    c.stdout.on('data', d => { if (out.length < 200000) out += d; });
    c.stderr.on('data', d => { if (err.length < 200000) err += d; });
    const fin = (code, signal, e) => { if (done) return; done = true; clearTimeout(t); resolve({ file, runtime, external: true, exitCode: code, signal, error: e, durationMs: Date.now() - started, stdout: out.slice(-20000), stderr: err.slice(-20000), passed: code === 0 }); };
    c.on('error', e => fin(null, null, `${bin} not available: ${e.message}`));
    c.on('exit', (code, signal) => fin(code, signal));
  });
}

/**
 * run({ repo, repoDir, compartment, option, file, script, timeoutMs, keepBranch, nexusBranch })
 * -> { ok, option, where, runs:[…], passed, failed, allPassed, report? }
 */
async function run({ repo, repoDir, compartment = null, option = 'run.entry', file = null, script = null, timeoutMs = 30000, keepBranch = false, nexusBranch = null } = {}) {
  const menu = options(repo, repoDir);
  const opt = menu.find(o => o.id === option);
  if (!opt) return { ok: false, errors: [`unknown run option: ${option}`] };
  if (!opt.available) return { ok: false, errors: [`${opt.label}: ${opt.reason}`] };
  if (opt.needs && opt.needs.includes('file') && !(file && opt.choices.includes(file))) return { ok: false, errors: [`${opt.label}: choose one of the listed files`] };

  let where;
  try { where = await _prepare({ repo, repoDir, compartment, nexusBranch }); }
  catch (e) { return { ok: false, errors: [e.message] }; }
  const started = Date.now();
  const rt = RT();
  let runs = [], report = null, backend = 'process';
  try {
    if (option === 'run.entry') runs = [await _runFile(where.cwd, opt.entry, { timeoutMs })];
    else if (option === 'run.file' || option === 'test.file') runs = [await _runFile(where.cwd, file, { timeoutMs })];
    else if (option === 'boot.probe') runs = [await _runFile(where.cwd, opt.entry, { timeoutMs: Math.max(timeoutMs, 30000), expectPort: opt.port, bootOnly: true })];
    else if (option === 'test.all') {
      const tests = testsFor(repo, repoDir).slice(0, MAX_TESTS);
      for (const t of tests) runs.push(await _runFile(where.cwd, t, { timeoutMs }));
    } else if (option === 'check.syntax') {
      const js = repoFiles(repo, repoDir).filter(f => rt.JS_EXT.has(path.extname(f)));
      report = await rt.syntaxCheck(where.cwd, { files: js });
      runs = report.results.filter(r => !r.ok).map(r => ({ file: r.file, passed: false, exitCode: 1, stderr: `${r.error}${r.line ? ` (line ${r.line})` : ''}` }));
      runs.unshift({ file: `${report.checked} file(s)`, passed: report.failed === 0, exitCode: report.failed ? 1 : 0, stdout: `${report.checked - report.failed} parse cleanly, ${report.failed} do not` });
    } else if (option === 'check.deps') {
      report = rt.resolveDeps(where.cwd, { files: repoFiles(repo, repoDir) });
      runs = [{ file: `${report.files} file(s)`, passed: report.runnable, exitCode: report.runnable ? 0 : 1,
                stdout: `builtin ${report.summary.builtin} · repo ${report.summary.repo} · nexus ${report.summary.nexus} · missing ${report.summary.missing} · broken relative imports ${report.summary.brokenRelative}` }];
    } else if (option === 'script.run') {
      const sc = (opt.choices || []).find(s => s.name === script && s.runnable);
      if (!sc) return { ok: false, errors: [`script not runnable: ${script}`] };
      runs = [await _runFile(where.cwd, sc.file, { timeoutMs, args: sc.args })];
    } else if (option === 'test.vm') {
      backend = 'vm';
      const TE = require('../cos/testenv/index.js');
      const tests = testsFor(repo, repoDir).slice(0, MAX_TESTS)
        .map(f => ({ file: f, runtimeId: RUNTIME_BY_EXT[path.extname(f).toLowerCase()] || 'node' }));
      const out = await TE.runVm({ compartmentId: compartment ? compartment.id : 'nexus', root: where.cwd, targets: tests, timeoutMs });
      runs = out.map(r => ({ ...r, passed: r.exitCode === 0 && !r.killedByTimeout }));
    }
  } catch (e) {
    where.cleanup(keepBranch);
    return { ok: false, option, where: where.where, errors: [e.message] };
  }
  const passed = runs.filter(r => r.passed).length;
  const result = {
    ok: true, option, label: opt.label, where: where.where, backend, branchId: where.branchId || (nexusBranch && nexusBranch.id) || null,
    runs, passed, failed: runs.length - passed, allPassed: runs.length > 0 && passed === runs.length, durationMs: Date.now() - started, report,
  };
  where.record({ option, mode: option, passed: result.allPassed, runs: runs.length, failed: result.failed, durationMs: result.durationMs });
  where.cleanup(keepBranch);
  return result;
}

module.exports = { MODULE_ID, VERSION, options, run, repoFiles, testsFor, RUNTIME_BY_EXT, TEST_RE, NEXUS_TEST_RE };
