'use strict';
// Integrity sigma → guarded revert. James: integrity hashes + sigma detect changes,
// replay timeline reverts files ONLY when a sigma indicates BROKEN functionality.
const assert = require('assert');
const path = require('path');
let passed = 0, failed = 0;
async function test(id, desc, fn) { try { await fn(); console.log(`  ✓ ${id} ${desc}`); passed++; } catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${e.message}`); failed++; } }
const ir = require(path.join(__dirname, '../..', 'lib/integrity-revert'));
const hiFi = { check: () => ({ sigma: 0.90, changes: [{ category: 'file', key: 'lib/x.js' }, { category: 'wires' }] }) };

(async () => {
  await test('T-001', 'high sigma + INTACT functionality → does NOT revert (legitimate change)', async () => {
    const r = await ir.evaluate({ fileIntegrity: hiFi, probe: async () => true, autoRevert: true });
    assert.strictEqual(r.reverted, false, 'must not revert a working change');
  });
  await test('T-002', 'high sigma + BROKEN → recommends revert', async () => {
    const r = await ir.evaluate({ fileIntegrity: hiFi, probe: async () => false });
    assert.strictEqual(r.broken, true);
    assert.ok(/revert/.test(r.recommendation));
  });
  await test('T-003', 'high sigma + NO probe → never reverts on absence of evidence (§1.1)', async () => {
    const r = await ir.evaluate({ fileIntegrity: hiFi, autoRevert: true });
    assert.strictEqual(r.reverted, false);
  });
  await test('T-004', 'low sigma → no action', async () => {
    const r = await ir.evaluate({ fileIntegrity: { check: () => ({ sigma: 0.2, changes: [] }) } });
    assert.ok(/no action/.test(r.recommendation));
  });
  await test('T-005', 'autoRevert + broken + a snapshot → reverts to last-good', async () => {
    const replay = { listSnapshots: () => [{ snapshotId: 'good-1', trigger: 'manual' }], replay: () => ({ ok: true }) };
    const r = await ir.evaluate({ fileIntegrity: hiFi, probe: async () => false, autoRevert: true, replay });
    assert.strictEqual(r.reverted, true); assert.strictEqual(r.revertedTo, 'good-1');
  });
  await test('T-006', 'brokenSignal can be passed directly (no probe fn needed)', async () => {
    const r = await ir.evaluate({ fileIntegrity: hiFi, brokenSignal: true });
    assert.strictEqual(r.broken, true);
  });
  console.log(`\n${passed} passed, ${failed} failed`); process.exit(failed ? 1 : 0);
})();
