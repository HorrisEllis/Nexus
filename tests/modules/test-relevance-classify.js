'use strict';
// P9 bridge — relevance classification. UI gated events already reach the stream;
// classifyRelevance (pure, §14.2) detects a pattern co-pilot should act on:
// repeated errors or a stuck flow. §8.6 in the shared stream module.
const assert = require('assert');
const path = require('path');
let passed = 0, failed = 0;
function test(id, desc, fn) {
  try { fn(); console.log(`  ✓ ${id} ${desc}`); passed++; }
  catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${e.message}`); failed++; }
}

const ROOT = path.join(__dirname, '../..');
const { classifyRelevance } = require(path.join(ROOT, 'lib/stream-digest'));

test('T-001', 'repeated errors (>= threshold) are flagged as relevant', () => {
  const now = Date.now();
  const errs = [1, 2, 3].map(i => ({ type: 'ui.copilot.error', ts: now - i * 1000 }));
  const r = classifyRelevance(errs);
  assert.strictEqual(r.relevant, true);
  assert.strictEqual(r.signals[0].kind, 'repeated_error');
  assert.ok(r.signals[0].count >= 3);
});

test('T-002', 'a single error is NOT relevant — a pattern is required (no false alarms)', () => {
  const r = classifyRelevance([{ type: 'ui.copilot.error', ts: Date.now() }]);
  assert.strictEqual(r.relevant, false);
});

test('T-003', 'a stuck flow (many interactions, no completion) is detected', () => {
  const now = Date.now();
  const stuck = Array.from({ length: 9 }, (_, i) => ({ type: 'ui.click', ts: now - i * 1000 }));
  const r = classifyRelevance(stuck);
  assert.strictEqual(r.relevant, true);
  assert.ok(r.signals.some(s => s.kind === 'stuck_flow'));
});

test('T-004', 'a completed flow is NOT stuck (completion clears it)', () => {
  const now = Date.now();
  const events = [
    ...Array.from({ length: 9 }, (_, i) => ({ type: 'ui.click', ts: now - i * 1000 })),
    { type: 'copilot.answered', ts: now },
  ];
  const r = classifyRelevance(events);
  assert.ok(!r.signals.some(s => s.kind === 'stuck_flow'), 'a completion means not stuck');
});

test('T-005', 'events outside the time window are ignored (§ recency)', () => {
  const now = Date.now();
  const old = [1, 2, 3].map(() => ({ type: 'ui.error', ts: now - 300000 }));
  assert.strictEqual(classifyRelevance(old).relevant, false);
});

test('T-006', 'classifyRelevance is pure + safe on empty/garbage input (§14.2)', () => {
  assert.doesNotThrow(() => classifyRelevance([]));
  assert.doesNotThrow(() => classifyRelevance(null));
  assert.strictEqual(classifyRelevance([]).relevant, false);
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
