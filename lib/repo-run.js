'use strict';
/**
 * lib/repo-run.js — run or test a repo in a COS test environment.
 * UUID: nexus-repo-run-v1-0000-2026-0921-jamesbrooks-001
 * Version: 0.1.0
 *
 * §RUN 2026-09-21 — James: "use cos for the test environment. should have it
 * all already." It does. Nothing here spawns a process itself:
 *
 *   1. cos/playground/branch.js  BranchEngine.fork — copies the repo's files
 *      into a branch owned by the repo's REAL COS compartment. The repo's own
 *      tree is never touched; the run happens on a disposable copy.
 *   2. cos/playground/sandbox.js SandboxRunner.run — isolated child process,
 *      cwd = the branch root, watchdog on runtime and output size, with the
 *      new opt-in cleanEnv so code an agent wrote never inherits Nexus's own
 *      environment (keys, tokens).
 *   3. BranchEngine.recordRun — the result is kept on the branch manifest.
 *
 * WHAT RUNS. An explicit entry wins. Otherwise, mode 'run' uses the repo's
 * own declaration (package.json "main"), then a conventional entry file;
 * mode 'test' runs every test file found (*.test.js, *.spec.js, test_*.py,
 * *_test.py), each as its own sandbox run, bounded. The runtime follows the
 * file's extension through COS's own RUNTIME_BINS names. Nothing is guessed
 * beyond that: a repo with no entry and no tests is refused with the reason.
 *
 * WHAT THIS IS NOT, stated: process isolation, not a VM. The branch is a
 * separate directory and the child has a clean env, a timeout and an output
 * cap — but it runs as the same OS user. Dependencies are not installed: a
 * repo that needs node_modules must carry them or it fails, and the failure
 * is shown. COS's qemu runtime (cos/compartment/qemu-runtime.js) is the
 * stronger boundary if that is ever needed.
 */

const fs = require('fs');
const path = require('path');

const MODULE_ID = 'repo-run';
const VERSION = '0.1.0';
const ROOT = path.resolve(__dirname, '..');
const MAX_TEST_FILES = 20;
const DEFAULT_TIMEOUT_MS = 30000;

const RUNTIME_BY_EXT = { '.js': 'node', '.cjs': 'node', '.mjs': 'node', '.py': 'python3', '.rb': 'ruby', '.php': 'php', '.sh': 'shell' };
const ENTRY_CANDIDATES = ['index.js', 'main.js', 'server.js', 'app.js', 'cli.js', 'main.py', 'app.py', '__main__.py'];
const TEST_RE = /(\.test\.[cm]?js|\.spec\.[cm]?js|^test_.+\.py|_test\.py)$/;

function _branch() { return require(path.join(ROOT, 'cos', 'playground', 'branch.js')).BranchEngine; }
function _sandbox() { return require(path.join(ROOT, 'cos', 'playground', 'sandbox.js')).SandboxRunner; }
function _bridge() { return require(path.join(ROOT, 'lib', 'cos-bridge.js')); }

function _walk(root, rel = '', out = [], depth = 0) {
  if (depth > 8 || out.length > 5000) return out;
  let ents = [];
  try { ents = fs.readdirSync(path.join(root, rel), { withFileTypes: true }); } catch (_) { return out; }
  for (const e of ents) {
    if (e.name === 'node_modules' || e.name === '.git' || e.name === '.nex') continue;
    const r = rel ? `${rel}/${e.name}` : e.name;
    if (e.isDirectory()) _walk(root, r, out, depth + 1); else out.push(r);
  }
  return out;
}

/** resolveTargets(repoDir, { mode, entry }) -> { targets:[{file,runtimeId}], reason } */
function resolveTargets(repoDir, { mode = 'run', entry = null } = {}) {
  const rt = f => RUNTIME_BY_EXT[path.extname(f).toLowerCase()] || null;
  if (entry) {
    const safe = require(path.join(ROOT, 'guardian', 'lib', 'code-artifact.js'))._safeRelative(entry);
    if (!safe || !fs.existsSync(path.join(repoDir, safe))) return { targets: [], reason: `entry not found in repo: ${entry}` };
    if (!rt(safe)) return { targets: [], reason: `no runtime for ${path.extname(safe) || 'files without an extension'}` };
    return { targets: [{ file: safe, runtimeId: rt(safe) }], reason: 'explicit entry' };
  }
  const files = _walk(repoDir);
  if (mode === 'test') {
    const tests = files.filter(f => TEST_RE.test(path.basename(f)) && rt(f)).sort().slice(0, MAX_TEST_FILES);
    return tests.length ? { targets: tests.map(f => ({ file: f, runtimeId: rt(f) })), reason: `${tests.length} test file(s)` }
                        : { targets: [], reason: 'no test files found (*.test.js, *.spec.js, test_*.py, *_test.py)' };
  }
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(repoDir, 'package.json'), 'utf8'));
    if (pkg.main && files.includes(pkg.main.replace(/^\.\//, '')) && rt(pkg.main)) return { targets: [{ file: pkg.main.replace(/^\.\//, ''), runtimeId: rt(pkg.main) }], reason: 'package.json main' };
  } catch (_) { /* no package.json — fall through */ }
  const hit = ENTRY_CANDIDATES.find(c => files.includes(c));
  return hit ? { targets: [{ file: hit, runtimeId: rt(hit) }], reason: `conventional entry ${hit}` }
             : { targets: [], reason: `no entry: no package.json main and none of ${ENTRY_CANDIDATES.join(', ')}` };
}

/**
 * run({ repo, repoDir, mode, entry, timeoutMs, keepBranch, compartment })
 * compartment may be passed directly (tests); otherwise resolved from
 * repo.compartmentId through lib/cos-bridge.js.
 */
async function run({ repo, repoDir, mode = 'run', entry = null, timeoutMs = DEFAULT_TIMEOUT_MS, keepBranch = false, compartment = null, testBackend = 'auto', baseImage = null, _caps = null, _qemu = null, _spawn = undefined } = {}) {
  if (!repo || !repo.uuid) return { ok: false, errors: ['repo with a uuid is required'] };
  if (!['run', 'test'].includes(mode)) return { ok: false, errors: [`mode must be run or test, got ${mode}`] };
  if (!repoDir || !fs.existsSync(repoDir)) return { ok: false, errors: [`repo has no files on disk yet: ${repoDir}`] };
  const comp = compartment || (repo.compartmentId ? _bridge().getCompartment(repo.compartmentId) : null);
  if (!comp || !comp.id) return { ok: false, errors: [repo.compartmentId ? `COS compartment not found: ${repo.compartmentId}` : 'this repo has no COS compartment to run in'] };

  const { targets, reason } = resolveTargets(repoDir, { mode, entry });
  if (!targets.length) return { ok: false, errors: [reason] };

  const BE = _branch();
  // Fork FROM the repo's files INTO the compartment's branch store; the run
  // itself goes through COS's test environment (cos/testenv): a qemu VM when
  // one is genuinely available, else the process sandbox — and it says which.
  const branch = BE.fork({ id: comp.id, fs: { root: repoDir } }, { label: `${mode} ${new Date().toISOString()}` });
  let runs = [], backend = null, backendReason = null;
  try {
    const TE = require(path.join(ROOT, 'cos', 'testenv', 'index.js'));
    const out = await TE.run({ backend: testBackend, compartment: comp, branchId: branch.id, root: branch.root, targets, timeoutMs, baseImage, _caps, _qemu, _spawn });
    runs = out.runs; backend = out.backend; backendReason = out.backendReason;
    for (const res of runs) BE.recordRun(comp, branch.id, { mode, backend, file: res.file, exitCode: res.exitCode, passed: res.passed, durationMs: res.durationMs });
  } catch (e) {
    return { ok: false, errors: [e.message], compartmentId: comp.id };
  } finally {
    if (!keepBranch) { try { BE.destroy(comp, branch.id); } catch (_) { /* reported below */ } }
  }
  const passed = runs.filter(x => x.passed).length;
  return { ok: true, mode, reason, backend, backendReason, compartmentId: comp.id, branchId: branch.id, branchKept: !!keepBranch,
           passed, failed: runs.length - passed, allPassed: passed === runs.length, runs };
}

module.exports = { MODULE_ID, VERSION, resolveTargets, run, RUNTIME_BY_EXT, ENTRY_CANDIDATES };
