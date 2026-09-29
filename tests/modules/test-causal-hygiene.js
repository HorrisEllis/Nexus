'use strict';
// Pins the causal-hygiene guard in orchestrator.js ledgerWrite (2026-07-25):
// a causedBy equal to the emitting system's own name is a self-loop (status/
// heartbeat pings), not a causal edge — it must be nulled so it does not
// pollute the causal graph. Real cross-event causedBy must pass through
// untouched. This was the last "coarse causal tag" from the live system map.
const assert = require('assert');
const fs = require('fs');
const path = require('path');
let passed = 0, failed = 0;
function test(id, desc, fn) {
  try { fn(); console.log(`  ✓ ${id} ${desc}`); passed++; }
  catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${e.message}`); failed++; }
}

// The guard, extracted exactly as written in orchestrator.js ledgerWrite:
function causalGuard(system, payload) {
  const rawCause = payload.causedBy || null;
  return (rawCause === system) ? null : rawCause;
}

test('T-001', "a causedBy equal to the emitting system is nulled (guardian self-loop)", () => {
  assert.strictEqual(causalGuard('guardian', { causedBy: 'guardian' }), null);
});

test('T-002', 'the same for any system — not a guardian special-case', () => {
  assert.strictEqual(causalGuard('cortex', { causedBy: 'cortex' }), null);
  assert.strictEqual(causalGuard('forge', { causedBy: 'forge' }), null);
});

test('T-003', 'a REAL cross-event causedBy (a uuid) passes through untouched', () => {
  assert.strictEqual(causalGuard('cortex', { causedBy: 'evt-abc-123' }), 'evt-abc-123');
});

test('T-004', 'a causedBy naming a DIFFERENT system is preserved (real cross-system edge)', () => {
  assert.strictEqual(causalGuard('cortex', { causedBy: 'liminal' }), 'liminal');
});

test('T-005', 'null stays null — no fabricated edge', () => {
  assert.strictEqual(causalGuard('guardian', { causedBy: null }), null);
  assert.strictEqual(causalGuard('guardian', {}), null);
});

test('T-006', 'the guard is actually present in orchestrator.js (not just here)', () => {
  const src = fs.readFileSync(path.join(__dirname, '../../orchestrator/orchestrator.js'), 'utf8');
  assert.ok(/rawCause === system\)\s*\?\s*null\s*:\s*rawCause/.test(src),
    'orchestrator.js ledgerWrite must null self-causedBy');
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
