'use strict';
/**
 * cos/testenv/run-target.js — CT1 (0.60.166): run one test target inside COS's test environment, build-callable.
 * comp_id: nexus.cos.testenv.run-target
 *
 * James, 2026-10-19: "then we need cos to work for test env." · "do not add apis. i dont have money for that."
 *
 * The gate's quality check (GQ) must run a phase's test in isolation, not in the build's own process. COS already has the
 * machinery (cos/testenv/index.js run → cos/playground/sandbox.js SandboxRunner): a child process with a CLEAN env (no parent
 * secrets), a timeout, and an output cap. This is the one door the gate calls — it reuses testenv.run with the PROCESS backend,
 * which is the portable one (this container, and most machines without KVM, cannot boot the VM; the VM stays a local upgrade,
 * selected by passing backend:'vm' where caps allow it). No external services, no paid APIs.
 *
 *   runTarget({ root, testFile, timeoutMs, runtimeId, backend }) -> { passed, exitCode, signal, durationMs,
 *                                                                     killedByTimeout, killedByOutputLimit, stdout, stderr, backend }
 *     root:      the directory the test runs in (the built project / repo checkout)
 *     testFile:  the test's path, relative to root (e.g. 'tests/sp4.test.js')
 *     backend:   'process' (default, portable) | 'vm' (where KVM is available) | 'auto'
 *
 * Isolation here is PROCESS-level (clean env, timeout, output cap), not a VM — stated plainly so a caller does not assume more.
 */
const fs = require('fs');
const path = require('path');
const TE = require('./index.js');

const MODULE_ID = 'nexus.cos.testenv.run-target';
const VERSION = '1.0.0';

async function runTarget({ root = null, testFile = null, timeoutMs = 30000, runtimeId = 'node', backend = 'process' } = {}) {
  if (!root || !testFile) throw new Error('run-target: root and testFile are required');
  if (!fs.existsSync(root)) throw new Error(`run-target: root does not exist: ${root}`);
  const rel = path.isAbsolute(testFile) ? path.relative(root, testFile) : testFile;
  if (rel.startsWith('..')) throw new Error(`run-target: testFile is outside root: ${testFile}`);
  if (!fs.existsSync(path.join(root, rel))) throw new Error(`run-target: test file not found: ${rel}`);
  // a synthetic compartment pointing at the real root; 'working-tree' runs that root (sandbox.js:73)
  const compartment = { id: `ct1-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`, fs: { root }, runtimeId };
  const res = await TE.run({ backend, compartment, branchId: 'working-tree', targets: [{ file: rel, runtimeId }], timeoutMs });
  const r = (res.runs && res.runs[0]) || {};
  return {
    passed: !!r.passed, exitCode: r.exitCode ?? null, signal: r.signal || null, durationMs: r.durationMs ?? null,
    killedByTimeout: !!r.killedByTimeout, killedByOutputLimit: !!r.killedByOutputLimit,
    stdout: String(r.stdout || ''), stderr: String(r.stderr || ''), backend: res.backend, backendReason: res.backendReason,
  };
}

/** vmAvailable() -> { ok, reason } — whether the richer VM backend can run here (KVM etc.); process is the fallback. */
function vmAvailable(opts = {}) {
  try { const caps = TE.capabilities(opts); return { ok: !!(caps.vm && caps.vm.ok), reason: (caps.vm && caps.vm.reason) || null }; }
  catch (e) { return { ok: false, reason: e.message }; }
}

module.exports = { MODULE_ID, VERSION, runTarget, vmAvailable };
