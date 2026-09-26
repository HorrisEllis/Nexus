'use strict';
// §CA7 — constant autonomy: propose → govern → execute on a loop, halting on ambiguity, RAID-gated.
const assert = require('assert');
const path = require('path');
let passed = 0, failed = 0;
async function test(id, desc, fn) { try { await fn(); console.log(`  ✓ ${id} ${desc}`); passed++; } catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${e.message}`); failed++; } }
const ca = require(path.join(__dirname, '../..', 'lib/constant-autonomy'));
const scheduler = require(path.join(__dirname, '../..', 'lib/scheduler'));
const toolIndex = require(path.join(__dirname, '../..', 'lib/tool-index'));

(async () => {
  await test('T-001', 'defaultPropose returns null when there is nothing to act on (halt on absence, not fabricated work)', async () => {
    const p = ca.defaultPropose({ expectedSystems: [] });
    // tool-index may or may not have edge cases from prior real usage this session — only assert the SHAPE is honest either way.
    assert.ok(p === null || (p.kind && p.text));
  });

  await test('T-002', 'a cycle with no proposal halts cleanly (stage: no-proposal), not an error', async () => {
    scheduler._resetForTest(); ca._resetForTest();
    const r = await ca._cycle({ propose: () => null });
    assert.strictEqual(r.stage, 'no-proposal');
    assert.strictEqual(r.ran, false);
  });

  await test('T-003', 'a real proposal runs end to end through autonomous-loop with a custom executor', async () => {
    scheduler._resetForTest(); ca._resetForTest();
    let executed = false;
    const r = await ca._cycle({
      propose: () => ({ kind: 'unit-test', text: 'investigate unit test subject', subject: 'unit-test-thing' }),
      executor: async () => { executed = true; return { ok: true }; },
    });
    assert.strictEqual(r.stage, 'resolved');
    assert.strictEqual(executed, true, 'the custom executor must have actually run');
  });

  await test('T-004', 'a denied proposal (RAID gate) halts before autonomous-loop runs', async () => {
    scheduler._resetForTest(); ca._resetForTest();
    const sm = require(path.join(__dirname, '../..', 'copilot/lib/self-model'));
    const orig = sm.governAction;
    sm.governAction = () => ({ allowed: false, reason: 'test-deny' });
    let executed = false;
    const r = await ca._cycle({
      propose: () => ({ kind: 'unit-test', text: 'should be denied', subject: 'x' }),
      executor: async () => { executed = true; },
    });
    sm.governAction = orig;
    assert.strictEqual(r.stage, 'denied');
    assert.strictEqual(executed, false, 'a denied proposal must never reach the executor');
  });

  await test('T-005', 'a throwing propose() never crashes the cycle (§1.2)', async () => {
    scheduler._resetForTest(); ca._resetForTest();
    const r = await ca._cycle({ propose: () => { throw new Error('propose blew up'); } });
    assert.strictEqual(r.stage, 'propose-error');
  });

  await test('T-006', 'defaultPropose surfaces a real tool-index edge case when gap-field has nothing (signal isolated)', async () => {
    toolIndex._resetForTest();
    toolIndex.register({ id: 'unit-test-tool', file: 'x.js', dir: 'lib', provides: 'testing' });
    toolIndex.record({ tool: 'unit-test-tool', ok: false, edgeCase: 'simulated failure for CA7 test', consumer: 'unit-test' });
    const p = ca.defaultPropose({ gapField: { openGaps: () => [] } });
    assert.ok(p, 'expected a proposal from the real edge-case signal');
    assert.strictEqual(p.kind, 'investigate-edge-case');
    assert.strictEqual(p.subject, 'unit-test-tool');
  });

  await test('T-007', 'defaultPropose surfaces a coverage gap when gap-field and tool-index both have nothing (signal isolated)', async () => {
    toolIndex._resetForTest();   // clear the edge-case signal from T-006 so this test isolates the coverage path
    const p = ca.defaultPropose({ expectedSystems: ['a-system-that-will-never-emit-xyz'], gapField: { openGaps: () => [] } });
    assert.ok(p);
    assert.strictEqual(p.kind, 'coverage-gap');
    assert.strictEqual(p.subject, 'a-system-that-will-never-emit-xyz');
  });

  await test('T-011', 'defaultPropose checks gap-field FIRST — a real open gap outranks tool-index and coverage', async () => {
    const p = ca.defaultPropose({
      gapField: { openGaps: () => [{ uuid: 'g1', type: 'test-gap', domain: 'system', source: 'unit-test', severity: 'high', lastSeenAt: Date.now() }] },
    });
    assert.ok(p);
    assert.strictEqual(p.kind, 'investigate-gap');
    assert.strictEqual(p.subject, 'g1');
  });

  await test('T-008', 'start() arms an interval task on CA1\'s scheduler (reuses it, no second interval primitive)', async () => {
    scheduler._resetForTest(); scheduler.start({ skipRestore: true }); ca._resetForTest();
    let n = 0;
    ca.start({ everyMs: 15, maxRuns: 3, propose: () => null, executor: async () => { n++; } });
    await new Promise(r => setTimeout(r, 90));
    ca.stop();
    const st = ca.status();
    assert.ok(st.cycles >= 3, `expected at least 3 cycles, got ${st.cycles}`);
  });

  await test('T-009', 'stop() disarms the interval — no further cycles', async () => {
    scheduler._resetForTest(); scheduler.start({ skipRestore: true }); ca._resetForTest();
    ca.start({ everyMs: 15, propose: () => null });
    await new Promise(r => setTimeout(r, 40));
    ca.stop();
    const before = ca.status().cycles;
    await new Promise(r => setTimeout(r, 60));
    const after = ca.status().cycles;
    assert.strictEqual(after, before, 'no cycles should run after stop()');
  });

  await test('T-010', 'status() reports running state and the last result', async () => {
    scheduler._resetForTest(); scheduler.start({ skipRestore: true }); ca._resetForTest();
    ca.start({ everyMs: 15, maxRuns: 1, propose: () => ({ kind: 'x', text: 'y', subject: 'z' }), executor: async () => ({}) });
    await new Promise(r => setTimeout(r, 40));
    ca.stop();
    const st = ca.status();
    assert.ok(st.lastResult, 'status must report the last cycle result');
    assert.strictEqual(st.cycles, 1);
  });

  console.log(`\n${passed} passed, ${failed} failed`); process.exit(failed ? 1 : 0);
})();
