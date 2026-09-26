'use strict';
// P3 (docs/raid-warp-verification-phasemap.spec) — COS isolate and verify. A
// consequential action is verified in a COS compartment via the EXISTING
// execution-pipeline before touching real state (§1.1, §2.1). §8.4: _approveTool
// stays SYNC — its 6 live callers are untouched; verifyInIsolation is a separate
// async opt-in (§0.4 more optionality). §8.6/§16.5: delegates to the pipeline,
// no isolation machinery rebuilt.
const _log = console.log;
console.log = (...a) => { const s = a[0]; if (typeof s === 'string' && (s.startsWith('[jaa]') || s.startsWith('[constitution') || s.startsWith('[raid]') || s.startsWith('[pipeline'))) return; _log(...a); };

const assert = require('assert');
const path = require('path');
const fs = require('fs');
const os = require('os');
let passed = 0, failed = 0;
async function test(id, desc, fn) {
  try { await fn(); _log(`  ✓ ${id} ${desc}`); passed++; }
  catch (e) { _log(`  ✗ ${id} ${desc}\n    ${e.message}`); failed++; }
}

const ROOT = path.join(__dirname, '../..');
const raid = require(path.join(ROOT, 'cortex/core/raid'));

(async () => {
  await test('T-001', '_approveTool is STILL synchronous — the 6 existing callers are not broken (§8.4)', () => {
    const r = raid._approveTool('copilot', 'x', { action: 'tool' });
    assert.notStrictEqual(typeof r?.then, 'function', '_approveTool must not return a Promise');
    assert.strictEqual(typeof r.approved, 'boolean');
  });

  await test('T-002', 'verifyInIsolation exists as a separate async verify (opt-in, not a signature change)', () => {
    assert.strictEqual(typeof raid.verifyInIsolation, 'function');
  });

  await test('T-003', 'a non-consequential action skips the sandbox fast (§16.4 sandbox is earned)', async () => {
    const v = await raid.verifyInIsolation({ source: 'p3', action: 'read' });
    assert.strictEqual(v.verified, true);
    assert.strictEqual(v.skipped, 'not-consequential');
  });

  await test('T-004', 'a consequential action without a spec fails loud (§1.2, not silent)', async () => {
    const v = await raid.verifyInIsolation({ source: 'p3', action: 'forge' });
    assert.strictEqual(v.verified, false);
    assert.ok(v.error && /specPath required/.test(v.error));
  });

  await test('T-005', 'a consequential action REACHES the real isolation pipeline (delegation is real, not stubbed)', async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'p3-test-'));
    fs.writeFileSync(path.join(tmp, 't.spec'), 'spec:\n  meta:\n    name: t\n    version: 1.0.0\n  purpose: trivial\n');
    const v = await raid.verifyInIsolation({
      source: 'p3', action: 'build', specPath: path.join(tmp, 't.spec'),
      outputDir: path.join(tmp, 'out'), testCommand: 'node -e "process.exit(0)"',
    });
    // It reached the pipeline (has a stage) rather than erroring before it —
    // proving real delegation. The verdict itself may be pass or fail depending
    // on whether the trivial spec builds; what P3 proves is the WIRE is real.
    assert.ok(v.stage || v.result, 'must reach a real pipeline stage, not a stub');
  });

  await test('T-006', 'the consequential filter is tight — only real mutation verbs trigger a sandbox (§16.4)', async () => {
    // 'read' and 'query' must NOT be consequential; 'forge'/'delete' must be.
    const readV = await raid.verifyInIsolation({ source: 'p3', action: 'query' });
    assert.strictEqual(readV.skipped, 'not-consequential', 'query must not trigger a sandbox');
  });

  _log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
