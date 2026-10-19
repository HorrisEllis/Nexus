'use strict';
require('../../lib/test-sandbox.js').ensure();
/**
 * tests/modules/test-cos-run-target.test.js — CT1 (0.60.166).
 * James, 2026-10-19: "then we need cos to work for test env." The gate runs a phase's test inside COS's process sandbox
 * (clean env, timeout, output cap) — not in the build's own process. runTarget is the one door; this proves it really runs.
 *
 *   CT-01  a passing test file in a root runs and reports passed (exitCode 0), through the process backend
 *   CT-02  a failing test file reports not-passed (non-zero exit), stderr carried
 *   CT-03  a test that runs forever is killed by the timeout (killedByTimeout), not hung
 *   CT-04  clean env — a secret set in THIS process is NOT visible to the sandboxed test
 *   CT-05  a test file outside root, or a missing one, is refused (never run)
 */
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const CT = require('../../cos/testenv/run-target.js');

let passed = 0, failed = 0;
async function test(id, desc, fn) {
  try { await fn(); console.log(`  ✓ ${id} ${desc}`); passed++; }
  catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${e.stack ? e.stack.split('\n').slice(0, 4).join('\n    ') : e.message}`); failed++; }
}

function mkRoot(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ct1-root-'));
  for (const [p, c] of Object.entries(files)) { const fp = path.join(dir, p); fs.mkdirSync(path.dirname(fp), { recursive: true }); fs.writeFileSync(fp, c); }
  return dir;
}

(async () => {
  await test('CT-01', 'a passing test runs in the process sandbox and reports passed', async () => {
    const root = mkRoot({ 'tests/ok.test.js': "const a = require('../lib/a.js'); if (a() !== 2) { console.error('bad'); process.exit(1); } console.log('ok');\n",
                          'lib/a.js': 'module.exports = () => 1 + 1;\n' });
    try {
      const r = await CT.runTarget({ root, testFile: 'tests/ok.test.js', timeoutMs: 15000 });
      assert.strictEqual(r.passed, true, `not passed: exit ${r.exitCode}, stderr ${r.stderr}`);
      assert.strictEqual(r.exitCode, 0);
      assert.strictEqual(r.backend, 'process', `backend was ${r.backend}`);
      assert.ok(/ok/.test(r.stdout), 'stdout carried');
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
  });

  await test('CT-02', 'a failing test reports not-passed with stderr', async () => {
    const root = mkRoot({ 'tests/bad.test.js': "console.error('assertion x failed'); process.exit(1);\n" });
    try {
      const r = await CT.runTarget({ root, testFile: 'tests/bad.test.js', timeoutMs: 15000 });
      assert.strictEqual(r.passed, false);
      assert.notStrictEqual(r.exitCode, 0);
      assert.ok(/assertion x failed/.test(r.stderr), `stderr: ${r.stderr}`);
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
  });

  await test('CT-03', 'a runaway test is killed by the timeout', async () => {
    const root = mkRoot({ 'tests/hang.test.js': "setInterval(() => {}, 1000); // never exits\n" });
    try {
      const r = await CT.runTarget({ root, testFile: 'tests/hang.test.js', timeoutMs: 1500 });
      assert.strictEqual(r.killedByTimeout, true, 'should be killed by timeout');
      assert.strictEqual(r.passed, false);
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
  });

  await test('CT-04', 'clean env — a secret in this process is not visible to the test', async () => {
    process.env.CT1_SECRET = 'do-not-leak';
    const root = mkRoot({ 'tests/env.test.js': "process.stdout.write('SECRET=' + (process.env.CT1_SECRET || 'ABSENT'));\n" });
    try {
      const r = await CT.runTarget({ root, testFile: 'tests/env.test.js', timeoutMs: 15000 });
      assert.ok(/SECRET=ABSENT/.test(r.stdout), `the secret leaked into the sandbox: ${r.stdout}`);
    } finally { fs.rmSync(root, { recursive: true, force: true }); delete process.env.CT1_SECRET; }
  });

  await test('CT-05', 'a test outside root or missing is refused', async () => {
    const root = mkRoot({ 'tests/ok.test.js': 'console.log(1);\n' });
    try {
      await assert.rejects(() => CT.runTarget({ root, testFile: '../../etc/passwd' }), /outside root|not found/);
      await assert.rejects(() => CT.runTarget({ root, testFile: 'tests/nope.test.js' }), /not found/);
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
  });

  console.log(`\n  ${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
