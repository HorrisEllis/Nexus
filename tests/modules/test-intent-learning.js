'use strict';
// §intent-learning — Bayesian-style confidence tracking, isolated from the router.
const assert = require('assert');
const path = require('path');
let passed = 0, failed = 0;
async function test(id, desc, fn) { try { await fn(); console.log(`  ✓ ${id} ${desc}`); passed++; } catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${e.message}`); failed++; } }
const il = require(path.join(__dirname, '../..', 'copilot/lib/intent-learning'));

const TAG = `unit-test-pattern-${Date.now()}`;

(async () => {
  await test('T-001', 'an unseen pattern defaults to 0.5', async () => {
    assert.strictEqual(il.getConfidence(`${TAG}-fresh`), 0.5);
  });

  await test('T-002', 'a confirmation raises confidence by exactly 0.10', async () => {
    const before = il.getConfidence(`${TAG}-a`);
    il.recordOutcome(`${TAG}-a`, 'confirmed');
    const after = il.getConfidence(`${TAG}-a`);
    assert.ok(Math.abs((after - before) - 0.10) < 0.0001, `expected +0.10, got ${after - before}`);
  });

  await test('T-003', 'a rejection lowers confidence by exactly 0.15 (steeper than the boost)', async () => {
    const before = il.getConfidence(`${TAG}-b`);
    il.recordOutcome(`${TAG}-b`, 'rejected');
    const after = il.getConfidence(`${TAG}-b`);
    assert.ok(Math.abs((before - after) - 0.15) < 0.0001, `expected -0.15, got ${after - before}`);
  });

  await test('T-004', 'confidence is capped at 1.0 — repeated confirmations do not exceed it', async () => {
    for (let i = 0; i < 20; i++) il.recordOutcome(`${TAG}-c`, 'confirmed');
    assert.strictEqual(il.getConfidence(`${TAG}-c`), 1.0);
  });

  await test('T-005', 'confidence has a floor — repeated rejections do not go negative', async () => {
    for (let i = 0; i < 20; i++) il.recordOutcome(`${TAG}-d`, 'rejected');
    const c = il.getConfidence(`${TAG}-d`);
    assert.ok(c >= 0.05 && c > -0.0001, `expected a floor near 0.05, got ${c}`);
  });

  await test('T-006', 'confirmations and rejections are counted separately, not just netted into confidence', async () => {
    il.recordOutcome(`${TAG}-e`, 'confirmed');
    il.recordOutcome(`${TAG}-e`, 'confirmed');
    il.recordOutcome(`${TAG}-e`, 'rejected');
    const rows = il.allPatterns().filter(p => p.patternId === `${TAG}-e`);
    assert.strictEqual(rows.length, 1);
    assert.strictEqual(rows[0].confirmations, 2);
    assert.strictEqual(rows[0].rejections, 1);
  });

  await test('T-007', 'allPatterns() includes every recorded pattern, for the self-model to summarize', async () => {
    const all = il.allPatterns();
    assert.ok(all.some(p => p.patternId === `${TAG}-a`));
    assert.ok(all.some(p => p.patternId === `${TAG}-b`));
  });

  console.log(`\n${passed} passed, ${failed} failed`); process.exit(failed ? 1 : 0);
})();
