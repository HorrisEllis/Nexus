'use strict';
// §CA1 — the scheduler: tasks/jobs/alarms/timed payloads, RAID-gated, persisted.
const assert = require('assert');
const path = require('path');
let passed = 0, failed = 0;
async function test(id, desc, fn) { try { await fn(); console.log(`  ✓ ${id} ${desc}`); passed++; } catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${e.message}`); failed++; } }
const sch = require(path.join(__dirname, '../..', 'lib/scheduler'));

(async () => {
  await test('T-001', 'a timed task fires once at its time', async () => {
    sch._resetForTest(); sch.start({ skipRestore: true });
    let n = 0; sch.schedule({ name: 'a', inMs: 15, fn: async () => n++ });
    await new Promise(r => setTimeout(r, 50));
    assert.strictEqual(n, 1);
  });
  await test('T-002', 'an interval task respects maxRuns', async () => {
    sch._resetForTest(); sch.start({ skipRestore: true });
    let n = 0; sch.schedule({ name: 'p', everyMs: 10, maxRuns: 3, fn: async () => n++ });
    await new Promise(r => setTimeout(r, 80));
    assert.strictEqual(n, 3, `expected 3, got ${n}`);
  });
  await test('T-003', 'a task needs at/inMs/everyMs', () => {
    sch._resetForTest();
    const r = sch.schedule({ name: 'x', fn: async () => {} });
    assert.strictEqual(r.ok, false);
  });
  await test('T-004', 'cancel removes a scheduled task', async () => {
    sch._resetForTest(); sch.start({ skipRestore: true });
    let n = 0; const r = sch.schedule({ name: 'c', inMs: 30, fn: async () => n++ });
    sch.cancel(r.id);
    await new Promise(res => setTimeout(res, 50));
    assert.strictEqual(n, 0, 'cancelled task must not fire');
  });
  await test('T-005', 'a failing task never crashes the scheduler (§1.2)', async () => {
    sch._resetForTest(); sch.start({ skipRestore: true });
    sch.schedule({ name: 'boom', inMs: 10, fn: async () => { throw new Error('fail'); } });
    let ok = 0; sch.schedule({ name: 'ok', inMs: 20, fn: async () => ok++ });
    await new Promise(r => setTimeout(r, 50));
    assert.strictEqual(ok, 1, 'the good task still ran after the bad one threw');
    const boom = sch.list().find(t => t.name === 'boom');
    // boom is done/error, not crashing
  });
  await test('T-006', 'list + get track tasks', async () => {
    sch._resetForTest(); sch.start({ skipRestore: true });
    const r = sch.schedule({ name: 'tracked', everyMs: 1000, fn: async () => {} });
    assert.ok(sch.get(r.id)); assert.ok(sch.list().length >= 1);
    sch.stop();
  });
  await test('T-007', 'a denied action does not run (RAID gate)', async () => {
    sch._resetForTest(); sch.start({ skipRestore: true });
    // inject a governor that denies
    const sm = require(path.join(__dirname, '../..', 'copilot/lib/self-model'));
    const orig = sm.governAction;
    sm.governAction = () => ({ allowed: false, reason: 'test-deny' });
    let ran = 0; sch.schedule({ name: 'blocked', inMs: 10, fn: async () => ran++ });
    await new Promise(r => setTimeout(r, 40));
    sm.governAction = orig;
    assert.strictEqual(ran, 0, 'denied task must not run');
  });
  console.log(`\n${passed} passed, ${failed} failed`); process.exit(failed ? 1 : 0);
})();
