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
// §0.39.271 T2 — test.all ran the first 40 of a repo's tests ("40 of 518") one after
// another. Now every runnable test runs, COS_RUN_CONCURRENCY at a time (default 4),
// inside a time budget (COS_RUN_BUDGET_MS, default 280 s — the Run menu's request
// allows 330 s); tests the budget did not reach are reported and the next run
// continues from them ({ from }). MAX_TESTS stays the VM's per-file cap.
const MAX_TESTS = 40;
const TEST_CONCURRENCY = Math.max(1, parseInt(process.env.COS_RUN_CONCURRENCY || '4', 10) || 4);
const TEST_BUDGET_MS = Math.max(10000, parseInt(process.env.COS_RUN_BUDGET_MS || '280000', 10) || 280000);
const MAX_TESTS_PROCESS = Math.max(0, parseInt(process.env.COS_RUN_MAX_TESTS || '0', 10) || 0);   // 0 = all

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
    // §0.39.264 — every common convention (cos/testenv/detect.js): *.test.js, *.spec.ts,
    // test/ tests/ __tests__/ files, test-*.js, test_*.py, *_test.py, tests/*.sh.
    // Basename-only matching said "no test files found" for a repo with tests/foo.js.
    // (TEST_RE is kept: it is still what the pre-0.39.264 basename rule was.)
    return require('../cos/testenv/detect.js').testFiles(repoFiles(repo, repoDir)).filter(t => t.perFile).map(t => t.file);
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

// §0.39.271 T1 — the repo's OWN test suite on the process backend (before this, only
// the VM ran it). COS still starts no shell: a suite command runs only when it is one
// program with arguments — `node --test`, `jest --ci`, `vitest run`, `python3 -m
// pytest -q`, `go test ./...` — resolved to a real binary. A script with &&, |, ;,
// redirects, $vars or env assignments needs a shell and is left to the VM, which says so.
const SHELL_CHARS = /[&|;<>`$(){}*?!\n\\]|^\s*\w+=/;
function _argv(cmd) { return String(cmd).trim().split(/\s+/).filter(Boolean); }
function _nodeBin(name, repoDir) {
  for (const base of [repoDir, ROOT]) {
    if (!base) continue;
    const b = path.join(base, 'node_modules', '.bin', name);
    try { const real = fs.realpathSync(b); if (/\.[cm]?js$/.test(real) || /node/.test(fs.readFileSync(real, 'utf8').slice(0, 80))) return real; } catch (_) {}
  }
  return null;
}
/**
 * suiteFor(repo, repoDir) -> { available, reason, steps:[{ label, kind:'node'|'bin', file?, bin?, args }], why }
 */
function suiteFor(repo, repoDir) {
  if (repo && repo.nexusSelf) return { available: false, reason: "a Nexus system has no suite command of its own — its tests are files (Run all tests); Nexus's whole suite is tests/modules/run-all.js", steps: [] };
  let pl; try { pl = require('../cos/testenv/detect.js').plan(repoDir); } catch (e) { return { available: false, reason: `could not read the repo: ${e.message}`, steps: [] }; }
  if (!pl.suite.length) return { available: false, reason: pl.gaps[0] || 'no suite command found (no test script, no test framework, no pytest/go/cargo project)', steps: [] };
  const steps = []; const refusals = [];
  let pkg = null; try { pkg = JSON.parse(fs.readFileSync(path.join(repoDir, 'package.json'), 'utf8')); } catch (_) {}
  for (const su of pl.suite) {
    if (su.stack === 'node') {
      let cmd = su.command;
      if (/^(npm|pnpm|yarn|bun) test$/.test(cmd)) cmd = (pkg && pkg.scripts && pkg.scripts.test) || '';
      if (SHELL_CHARS.test(cmd)) { refusals.push(`"${cmd}" needs a shell — the VM runs it`); continue; }
      let argv = _argv(cmd).filter(a => a !== '--no-install');
      if (argv[0] === 'npx') argv = argv.slice(1);
      if (!argv.length) { refusals.push('empty test script'); continue; }
      const deps = pkg ? Object.keys({ ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) }) : [];
      const haveModules = fs.existsSync(path.join(repoDir, 'node_modules'));
      if (argv[0] === 'node') { steps.push({ label: cmd, kind: 'node-argv', args: argv.slice(1), needsModules: deps.length > 0 && !haveModules, deps: deps.length }); continue; }
      const bin = _nodeBin(argv[0], repoDir);
      if (!bin) { refusals.push(deps.length && !haveModules ? `${argv[0]} is one of ${deps.length} dependencies that are not installed here — the VM installs them (online, then cut)` : `${argv[0]} is not installed (not in the repo's or Nexus's node_modules/.bin)`); continue; }
      steps.push({ label: cmd, kind: 'node', file: bin, args: argv.slice(1), needsModules: deps.length > 0 && !haveModules, deps: deps.length });
    } else if (su.stack === 'python') {
      let f = { found: false }; try { f = require('../cos/testenv/installer.js').find('python3'); } catch (_) {}
      if (!f.found) { refusals.push('python3 is not installed on this machine'); continue; }
      steps.push({ label: 'python3 -m pytest -q', kind: 'bin', bin: f.bin, args: [...(f.args || []), '-m', 'pytest', '-q'] });
    } else if (su.stack === 'go') {
      let f = { found: false }; try { f = require('../cos/testenv/installer.js').find('go'); } catch (_) {}
      if (!f.found) { refusals.push('go is not installed on this machine'); continue; }
      steps.push({ label: 'go test ./...', kind: 'bin', bin: f.bin, args: ['test', './...'] });
    } else refusals.push(`${su.command} (${su.stack}) runs in the VM`);
  }
  const blocked = steps.filter(s => s.needsModules);
  if (steps.length && blocked.length === steps.length) return { available: false, reason: `the suite needs this repo's ${blocked[0].deps} dependencies, which are not installed here — "Run all tests in a VM" installs them (online, then cut)`, steps: [], refusals };
  return steps.length ? { available: true, reason: null, steps: steps.filter(s => !s.needsModules), refusals, why: pl.suite.map(x => x.why).join(' · ') }
    : { available: false, reason: refusals[0] || 'no suite command runs without a shell', steps: [], refusals };
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
  // §0.39.264 — what the VM would do for THIS repo: install, the repo's own test
  // commands, and/or its test files (cos/testenv/detect.js)
  const vmPlan = vmPlanFor(repo, repoDir, tests);
  const vmMissing = vm.ok ? require('../cos/testenv/index.js').missingRuntimes(vm.runtimes, vmPlan.runtimes) : [];
  const vmHasWork = vmPlan.suite.length > 0 || tests.length > 0;
  // §0.39.271 — nexus/core owns Nexus's root package.json: its scripts (npm test, test:int …) run
  // in the full-tree workspace like any other core file. The kernels have no package.json.
  const scripts = isSystem ? (repo.nexusSelf.system === 'core' ? _nodeScripts(ROOT) : []) : _nodeScripts(repoDir);
  const o = (id, label, group, description, available, reason, extra = {}) => ({ id, label, group, description, available: !!available, reason: available ? null : reason, ...extra });

  // §0.39.265 — James: "have the run button menu prompt to install when it's not detected in the path."
  // What this repo's options need and this host lacks — the menu offers to install each (never on its own).
  const qemuMissing = !vm.ok && /QEMU not found/.test(vm.reason || '');
  let installs = [];
  try { installs = require('../cos/testenv/installer.js').needsFor(files, { qemuMissing }); } catch (_) {}
  const suite = isSystem ? { available: false, reason: suiteFor(repo, repoDir).reason, steps: [] } : suiteFor(repo, repoDir);
  const nTests = MAX_TESTS_PROCESS ? Math.min(tests.length, MAX_TESTS_PROCESS) : tests.length;
  // §0.39.271 — a system with no process of its own says so, instead of "no entry to boot"
  const noEntryWhy = isSystem && def && !def.entry ? `${def.name} has no process of its own (${def.name === 'core' ? 'the shared libraries every kernel loads' : 'no kernel entry'}) — boot the system that runs it` : null;
  const menu = [
    o('run.entry', entry ? `Run ${entry.file}` : 'Run entry', 'run',
      isSystem ? 'Start the kernel in the full Nexus workspace (ports shifted, network isolated) and stop it after the time limit.' : 'Run the repo\'s entry file.',
      !!entry && runnable(entry.file), entry ? `no runtime for ${entry.file}` : (noEntryWhy || 'no entry: no package.json main and none of the conventional entry files'), { entry: entry && entry.file, entryReason: entry && entry.reason }),
    o('run.file', 'Run a file…', 'run', 'Pick any runnable file.', files.some(runnable), 'no runnable files',
      { needs: ['file'], choices: files.filter(runnable).slice(0, 1000) }),
    o('boot.probe', isSystem ? `Boot ${def.name} + health probe` : 'Boot + health probe', 'run',
      'Start the entry as a server on a shifted port, wait until it answers /health, then stop it. Proves it boots without touching the live system.',
      !!entry && rt.JS_EXT.has(path.extname(entry.file)), entry ? 'boot probe runs JavaScript entries only' : (noEntryWhy || 'no entry to boot'), { entry: entry && entry.file, port: def ? def.port : null }),
    o('test.suite', 'Run the test suite', 'test',
      `The repo's own test command${suite.steps.length ? ` — ${suite.steps.map(x => x.label).join(' · ')}` : ''}, run directly (no shell, no network, ports shifted). Failures come back with a debug report.`,
      suite.available, suite.reason, { steps: suite.steps.map(x => x.label), refusals: suite.refusals || [] }),
    o('test.all', `Run all tests${tests.length ? ` (${nTests}${nTests < tests.length ? ` of ${tests.length}` : ''})` : ''}`, 'test',
      `Each test file as its own run, ${TEST_CONCURRENCY} at a time, within ${Math.round(TEST_BUDGET_MS / 1000)} s — what the time did not reach is listed, and the next run continues from it. Every failure comes back with a debug report.`,
      tests.length > 0, 'no test files found (*.test.js, *.spec.js, test_*.py, *_test.py)', { count: tests.length }),
    o('test.file', 'Run one test…', 'test', 'Pick a single test file.', tests.length > 0, 'no test files found', { needs: ['file'], choices: tests.slice(0, 1000) }),
    o('check.syntax', `Syntax check${jsFiles.length ? ` (${jsFiles.length} JS files)` : ''}`, 'check', 'Parse every JavaScript file without running any of it — one process for the whole set.', jsFiles.length > 0, 'no JavaScript files'),
    o('check.deps', 'Resolve dependencies', 'check', 'Every package and relative import, and where it resolves: Node builtin, the repo, Nexus\'s packages — or nowhere.', true, null),
    o('script.run', 'Run a package script…', 'run', 'A package.json script that is a plain `node <file>` command, run directly (no shell).',
      scripts.some(s => s.runnable), scripts.length ? 'no script is a plain `node <file>` command' : (isSystem ? `${def.name} has no package.json — Nexus's scripts are nexus/core's` : 'no package.json scripts'), { needs: ['script'], choices: scripts }),
    o('test.vm', 'Run all tests in a VM', 'test',
      `An ephemeral Linux VM (separate kernel; nothing persists).${vmPlan.install.length ? ' Dependencies install online, then the network is cut and checked before any test runs.' : ' No network.'}${vmPlan.summary ? ` ${vmPlan.summary}` : ''}`,
      vm.ok && vmHasWork && !vmMissing.length,
      !vm.ok ? vm.reason : !vmHasWork ? (vmPlan.gaps[0] || 'no tests found') : `the base image has no ${vmMissing.join(', ')} — run the VM setup again with --with ${vmMissing.join(',')}`,
      { setup: !vm.ok ? { how: vm.setup, api: 'POST /api/cos/testenv/setup' } : null, plan: { install: vmPlan.install, suite: vmPlan.suite, files: tests.length }, install: qemuMissing ? 'qemu' : null }),
  ];
  Object.defineProperty(menu, 'installs', { value: installs, enumerable: false });
  return menu;
}

/**
 * vmPlanFor(repo, repoDir, tests) — the VM's plan for this repo (cos/testenv/detect.js).
 * A Nexus system: install Nexus's own packages, then the system's test files (Nexus
 * has no single suite command — its tests are files). Any other repo: whatever its
 * manifests say (npm test, pytest, go test, cargo test, rspec, phpunit, make test).
 */
function vmPlanFor(repo, repoDir, tests) {
  const D = require('../cos/testenv/detect.js');
  let pl;
  if (repo && repo.nexusSelf && repo.nexusSelf.role === 'system') {
    pl = { stacks: [{ stack: 'node', evidence: ['package.json'] }], install: [{ stack: 'node', command: 'npm ci --ignore-scripts --no-audit --no-fund', why: "Nexus's package-lock.json" }], suite: [], files: [], runtimes: ['node'], gaps: [] };
  } else {
    try { pl = D.plan(repoDir); } catch (e) { pl = { stacks: [], install: [], suite: [], files: [], runtimes: [], gaps: [`could not read the repo: ${e.message}`] }; }
  }
  for (const f of tests) { const rt = RUNTIME_BY_EXT[path.extname(f).toLowerCase()]; if (rt) pl.runtimes = [...new Set([...pl.runtimes, rt === 'shell' ? 'sh' : rt])]; }
  pl.summary = D.describe({ ...pl, files: tests });
  return pl;
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
  // §0.39.265 — the binary as the installer finds it (python3 may be `python` or `py -3` on Windows)
  let bin = runtime === 'shell' ? '/bin/sh' : runtime, pre = [];
  if (runtime !== 'shell') { try { const f = require('../cos/testenv/installer.js').find(runtime); if (f.found) { bin = f.bin; pre = f.args || []; } } catch (_) {} }
  return new Promise((resolve) => {
    const started = Date.now();
    let out = '', err = '', done = false;
    const env = rt.runEnv({ runDir: cwd });
    const c = spawn(bin, [...pre, file, ...args], { cwd, env, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
    const t = setTimeout(() => { c.kill('SIGKILL'); }, timeoutMs);
    c.stdout.on('data', d => { if (out.length < 200000) out += d; });
    c.stderr.on('data', d => { if (err.length < 200000) err += d; });
    const fin = (code, signal, e) => { if (done) return; done = true; clearTimeout(t); resolve({ file, runtime, external: true, exitCode: code, signal, error: e, durationMs: Date.now() - started, stdout: out.slice(-20000), stderr: err.slice(-20000), passed: code === 0 }); };
    c.on('error', e => fin(null, null, `${bin} not available: ${e.message}`));
    c.on('exit', (code, signal) => fin(code, signal));
  });
}

// one program with its arguments, no shell — the same clean environment as every COS run
function _spawnArgv(cwd, bin, args, { timeoutMs }) {
  const { spawn } = require('child_process');
  const rt = RT();
  return new Promise((resolve) => {
    const started = Date.now();
    let out = '', err = '', done = false, killedByTimeout = false;
    const env = rt.runEnv({ runDir: cwd, shiftPorts: true });
    let c;
    try { c = spawn(bin, args, { cwd, env, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true, shell: false }); }
    catch (e) { return resolve({ exitCode: null, error: e.message, stdout: '', stderr: '', durationMs: 0, passed: false }); }
    const t = setTimeout(() => { killedByTimeout = true; try { c.kill('SIGKILL'); } catch (_) {} }, timeoutMs);
    c.stdout.on('data', d => { if (out.length < 400000) out += d; });
    c.stderr.on('data', d => { if (err.length < 400000) err += d; });
    const fin = (code, signal, e) => { if (done) return; done = true; clearTimeout(t); resolve({ runtime: path.basename(bin), exitCode: code, signal: signal || null, error: e, killedByTimeout, durationMs: Date.now() - started, stdout: out.slice(-40000), stderr: err.slice(-40000), passed: code === 0 && !killedByTimeout }); };
    c.on('error', e => fin(null, null, `${bin}: ${e.message}`));
    c.on('exit', (code, signal) => fin(code, signal));
  });
}

/**
 * run({ repo, repoDir, compartment, option, file, script, timeoutMs, keepBranch, nexusBranch })
 * -> { ok, option, where, runs:[…], passed, failed, allPassed, report? }
 */
async function run({ repo, repoDir, compartment = null, option = 'run.entry', file = null, script = null, timeoutMs = 30000, keepBranch = false, nexusBranch = null, from = 0 } = {}) {
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
      // the same runnable filter the menu counted with (0.39.271 — run() used to skip it)
      const caps = rt.capabilities();
      const runnable = (f) => { const r = RUNTIME_BY_EXT[path.extname(f).toLowerCase()]; return !!r && (r === 'node' || (r === 'shell' ? process.platform !== 'win32' : !!caps.external[r])); };
      let all = testsFor(repo, repoDir).filter(runnable);
      if (MAX_TESTS_PROCESS) all = all.slice(0, MAX_TESTS_PROCESS);
      const start = Math.max(0, Math.min(all.length, parseInt(from, 10) || 0));
      const queue = all.slice(start);
      const deadline = Date.now() + TEST_BUDGET_MS;
      const results = new Array(queue.length);
      let next = 0;
      const worker = async () => {
        while (next < queue.length && Date.now() < deadline) {
          const i = next++;
          results[i] = await _runFile(where.cwd, queue[i], { timeoutMs: Math.min(timeoutMs, Math.max(1000, deadline - Date.now())) });
        }
      };
      await Promise.all(Array.from({ length: Math.min(TEST_CONCURRENCY, queue.length) }, worker));
      runs = results.filter(Boolean);
      const notRun = queue.filter((_, i) => !results[i]);
      report = { tests: { total: all.length, from: start, ran: runs.length, notRun: notRun.length, next: notRun.length ? start + runs.length : null, concurrency: TEST_CONCURRENCY, budgetMs: TEST_BUDGET_MS, notRunFiles: notRun.slice(0, 200) } };
    } else if (option === 'test.suite') {
      const su = suiteFor(repo, repoDir);
      if (!su.available) throw new Error(su.reason);
      // the fork leaves node_modules out; the suite resolves the repo's own through a link
      try { const nm = path.join(repoDir, 'node_modules'), dst = path.join(where.cwd, 'node_modules'); if (fs.existsSync(nm) && !fs.existsSync(dst)) fs.symlinkSync(nm, dst, 'junction'); } catch (_) {}
      for (const st of su.steps) {
        const t = Math.max(timeoutMs, 120000);
        const r = st.kind === 'node' ? await rt.runNode({ cwd: where.cwd, file: st.file, args: st.args, timeoutMs: t, shiftPorts: true })
          : st.kind === 'node-argv' ? await _spawnArgv(where.cwd, process.execPath, [...(rt.nodeArgsFor ? (rt.nodeArgsFor('x.js').args || []) : []), ...st.args], { timeoutMs: t })
          : await _spawnArgv(where.cwd, st.bin, st.args, { timeoutMs: t });
        runs.push({ ...r, file: st.label });
      }
      report = { suite: { steps: su.steps.map(x => x.label), refusals: su.refusals || [], why: su.why || null } };
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
      const all = testsFor(repo, repoDir);
      const plan = vmPlanFor(repo, repoDir, all);
      // with a suite command the repo's own runner covers its test files; without one, each file runs
      const tests = (plan.suite.length ? [] : all).slice(0, MAX_TESTS)
        .map(f => ({ file: f, runtimeId: RUNTIME_BY_EXT[path.extname(f).toLowerCase()] || 'node' }));
      const caps = TE.capabilities();
      const out = await TE.runVm({ compartmentId: compartment ? compartment.id : 'nexus', root: where.cwd, targets: tests, plan, network: 'auto', timeoutMs, baseImage: caps.vm.baseImage, boot: caps.vm.boot || null });
      runs = out.map(r => ({ ...r, passed: r.passed !== undefined ? r.passed : (r.exitCode === 0 && !r.killedByTimeout) }));
      report = { vm: out.meta || null, plan: { install: plan.install, suite: plan.suite, files: tests.length } };
    }
  } catch (e) {
    where.cleanup(keepBranch);
    return { ok: false, option, where: where.where, errors: [e.message] };
  }
  // §0.39.271 T3 — every failure gets a debug report, read from the run's own directory
  // before it is cleaned up (the frames' source excerpts are the code that ran)
  try {
    const DR = require('./cos-debug-report.js');
    for (const r of runs) if (!r.passed) r.debug = DR.report(r, { cwd: where.cwd });
  } catch (_) { /* a report that cannot be built leaves the run's own output */ }
  const passed = runs.filter(r => r.passed).length;
  const result = {
    ok: true, option, label: opt.label, where: where.where, backend, branchId: where.branchId || (nexusBranch && nexusBranch.id) || null,
    runs, passed, failed: runs.length - passed, allPassed: runs.length > 0 && passed === runs.length, durationMs: Date.now() - started, report,
  };
  where.record({ option, mode: option, passed: result.allPassed, runs: runs.length, failed: result.failed, durationMs: result.durationMs });
  where.cleanup(keepBranch);
  return result;
}

module.exports = { vmPlanFor, suiteFor, MODULE_ID, VERSION, options, run, repoFiles, testsFor, RUNTIME_BY_EXT, TEST_RE, NEXUS_TEST_RE, TEST_CONCURRENCY, TEST_BUDGET_MS };
