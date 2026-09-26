'use strict';
/**
 * tests/modules/test-system-check-emerge-stale-entry.js
 * James, from a live, recurring log: "[diagnostic] Sending to ollama:
 * emerge's real core layer not found under its own conventions" —
 * repeating every ~5 minutes, never resolved. Real root cause:
 * lib/system-check.js's REAL_ENTRY_FILE.emerge still pointed at
 * emerge/consumer.js, legitimately retired this session (copilot now
 * calls emerge/compiler/pipeline.js's compile() directly) — the check
 * was never updated after that retirement.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');

let passed = 0, failed = 0;
function test(id, desc, fn) {
  try { fn(); console.log(`  ✓ ${id} ${desc}`); passed++; }
  catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${e.message}`); failed++; }
}

const ROOT = path.join(__dirname, '../..');

function run() {
  test('SCE-001', 'lib/system-check.js no longer points emerge at the retired consumer.js', () => {
    const src = fs.readFileSync(path.join(ROOT, 'lib/system-check.js'), 'utf8');
    assert.ok(!/emerge:\s*'emerge\/consumer\.js'/.test(src), 'the stale reference to the retired file should be gone');
  });

  test('SCE-002', 'it now points at the real, current, kept core — emerge/compiler/pipeline.js', () => {
    const src = fs.readFileSync(path.join(ROOT, 'lib/system-check.js'), 'utf8');
    assert.ok(/emerge:\s*'emerge\/compiler\/pipeline\.js'/.test(src));
  });

  test('SCE-003', 'the real, current entry file genuinely exists on disk — the fix points at something real, not another guess', () => {
    assert.ok(fs.existsSync(path.join(ROOT, 'emerge/compiler/pipeline.js')));
  });

  test('SCE-004', 'the archived consumer.js is confirmed gone from its old live location — confirms the retirement this fix accounts for actually happened', () => {
    assert.ok(!fs.existsSync(path.join(ROOT, 'emerge/consumer.js')));
    assert.ok(fs.existsSync(path.join(ROOT, '_archive/2026-09-06-emerge-consumer-retired/consumer.js')), 'archived per §0.3, not deleted without a trace');
  });

  test('SCE-005', 'running the real check function reports core:true for emerge — the actual, functional proof, not just a string match', () => {
    delete require.cache[require.resolve(path.join(ROOT, 'lib/system-check.js'))];
    const sc = require(path.join(ROOT, 'lib/system-check.js'));
    const result = sc.run({ dryRun: true });
    const emergeResult = result.results.find((r) => r.system === 'emerge');
    assert.ok(emergeResult, 'expected a real result entry for emerge');
    assert.strictEqual(emergeResult.layers.core, true, 'core layer should now be found');
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exitCode = failed ? 1 : 0;
}

run();
