'use strict';
const assert = require('assert');
const {
  compare, compareCortexFaculties, normalizeIntuitionResult, normalizeMastermindResult,
} = require('../../intelligence/adversarial');

let passed = 0, failed = 0;
function test(id, desc, fn) {
  try { fn(); console.log(`  ✓ ${id} ${desc}`); passed++; }
  catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${e.message}`); failed++; }
}

test('T-001', 'generic compare() works on arbitrary sources, not just Cortex faculties', () => {
  const left  = { source: 'guardian', domain: 'guardian', intent: 'status', confidence: 0.9,
                  claims: [{ type: 'issue_detected', detail: 'dispatch queue backed up', traced: true }], comparable: true };
  const right = { source: 'raid', domain: 'raid', intent: 'status', confidence: 0.8,
                  claims: [{ type: 'no_issue', detail: 'all agents healthy', traced: false }], comparable: true };
  const r = compare({ left, right });
  assert.strictEqual(r.comparable, true);
  assert.strictEqual(r.verdict, 'contradiction');
  assert.strictEqual(r.left, 'guardian');
  assert.strictEqual(r.right, 'raid');
});

test('T-002', 'missing left or right: not comparable, no fabricated score', () => {
  const r = compare({ left: null, right: { comparable: true } });
  assert.strictEqual(r.comparable, false);
});

test('T-003', 'either side marked non-comparable: honest reason, not a score', () => {
  const left  = { source: 'a', intent: 'weather', comparable: false };
  const right = { source: 'b', intent: 'status', comparable: true, claims: [{ type: 'no_issue' }] };
  const r = compare({ left, right });
  assert.strictEqual(r.comparable, false);
  assert.ok(r.reason.includes('weather'));
});

test('T-004', 'agreement between two arbitrary sources', () => {
  const left  = { source: 'sim', intent: 'x', confidence: 0.7, claims: [{ type: 'no_issue' }], comparable: true };
  const right = { source: 'telemetry', intent: 'x', confidence: 0.8, claims: [{ type: 'no_issue' }], comparable: true };
  const r = compare({ left, right });
  assert.strictEqual(r.verdict, 'agreement');
});

test('T-005', 'reconciliation works for any two sources sharing a traced claim', () => {
  const left  = { source: 'human_proposal', intent: 'x', confidence: 0.6,
                  claims: [{ type: 'issue_detected', detail: 'auth flow looks broken', traced: false }], comparable: true };
  const right = { source: 'generated_plan', intent: 'x', confidence: 0.9,
                  claims: [{ type: 'issue_detected', detail: 'token refresh race condition confirmed', traced: true }], comparable: true };
  const r = compare({ left, right });
  assert.strictEqual(r.verdict, 'reconciled');
  assert.ok(r.reconciled_hypothesis.includes('token refresh race condition'));
});

test('T-006', 'normalizeIntuitionResult marks non-gap/status intents as not comparable', () => {
  const n = normalizeIntuitionResult({ intent: 'relationship', text: 'x connects to y' });
  assert.strictEqual(n.comparable, false);
});

test('T-007', 'normalizeIntuitionResult produces a real issue_detected claim from a breakdown', () => {
  const n = normalizeIntuitionResult({ intent: 'gaps', breakdown: { CAPABILITY: 2 }, confidence: 0.9 });
  assert.strictEqual(n.comparable, true);
  assert.strictEqual(n.claims[0].type, 'issue_detected');
});

test('T-008', 'normalizeMastermindResult carries traced status onto the claim', () => {
  const n = normalizeMastermindResult({ gapCount: 1, tracedCount: 1, untracedCount: 0, analysis: 'trace here' });
  assert.strictEqual(n.claims[0].traced, true);
});

test('T-009', 'compareCortexFaculties: real contradiction case still works end to end', () => {
  const intuition  = { intent: 'gaps', breakdown: { CAPABILITY: 2 }, confidence: 0.9 };
  const mastermind = { gapCount: 0, tracedCount: 0, untracedCount: 0, analysis: 'No open issues.' };
  const r = compareCortexFaculties(intuition, mastermind);
  assert.strictEqual(r.verdict, 'contradiction');
  assert.strictEqual(r.open_gap, true);
});

test('T-010', 'compareCortexFaculties: reconciliation case still works end to end', () => {
  const intuition  = { intent: 'gaps', breakdown: { CAPABILITY: 1 }, confidence: 0.9 };
  const mastermind = { gapCount: 1, tracedCount: 1, untracedCount: 0, analysis: "Root-cause trace for 'CAPABILITY': ollama.offline → gap." };
  const r = compareCortexFaculties(intuition, mastermind);
  assert.strictEqual(r.verdict, 'reconciled');
  assert.ok(r.reconciled_hypothesis.includes('ollama.offline'));
});

test('T-011', 'compareCortexFaculties: unrelated intuition intent stays honestly not comparable', () => {
  const intuition  = { intent: 'patterns', text: 'top patterns...' };
  const mastermind = { gapCount: 1, tracedCount: 0, untracedCount: 1, analysis: 'x' };
  const r = compareCortexFaculties(intuition, mastermind);
  assert.strictEqual(r.comparable, false);
});

console.log(`\n  adversarial: ${passed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);
