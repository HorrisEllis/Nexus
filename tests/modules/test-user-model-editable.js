'use strict';
// UM4 (docs/cortex-schema-registry-phasemap.spec) — the editable, self-optimizing
// surface. The user OR co-pilot edits the model and it tunes from the edits
// ("editable surface to optimize itself"). Built outward from the existing
// jaa.update archive pattern (§8.6). Edits preserve history (§0.3 — archive, not
// delete) and are schema-observed (UM1).
const _log = console.log;
console.log = (...a) => { const s = a[0]; if (typeof s === 'string' && (s.startsWith('[jaa]') || s.startsWith('[user-model]'))) return; _log(...a); };

const assert = require('assert');
const path = require('path');
let passed = 0, failed = 0;
function test(id, desc, fn) {
  try { fn(); _log(`  ✓ ${id} ${desc}`); passed++; }
  catch (e) { _log(`  ✗ ${id} ${desc}\n    ${e.message}`); failed++; }
}

const ROOT = path.join(__dirname, '../..');
const { jaaDB } = require(path.join(ROOT, 'cortex/memory/jaa-db'));
const um = require(path.join(ROOT, 'copilot/lib/user-model'));
um.init(jaaDB);

test('T-001', 'the model exposes the editable surface (pin/reject/correct/list)', () => {
  for (const fn of ['pinHypothesis', 'rejectHypothesis', 'correctHypothesis', 'editableSurface']) {
    assert.strictEqual(typeof um[fn], 'function', `must export ${fn}`);
  }
});

test('T-002', 'PIN locks a hypothesis at high confidence, immune to decay', () => {
  const h = um.observe(`pin-test-${Date.now()}`, 'preference', {}, 0.5);
  um.pinHypothesis(h.uuid);
  const row = (jaaDB.query('user_model_hypotheses', r => r.uuid === h.uuid, 1) || [])[0];
  assert.ok(row.confidence >= 0.9, 'pinned confidence must be high');
  assert.strictEqual(row.pinned, true);
  assert.strictEqual(row.decayRate, 0, 'pinned must be decay-immune');
});

test('T-003', 'REJECT archives (not deletes) with a reason (§0.3 nothing lost)', () => {
  const h = um.observe(`reject-test-${Date.now()}`, 'preference', {}, 0.5);
  um.rejectHypothesis(h.uuid, 'user_rejected');
  const row = (jaaDB.query('user_model_hypotheses', r => r.uuid === h.uuid, 1) || [])[0];
  assert.strictEqual(row.status, 'archived', 'rejected = archived, not deleted');
  assert.strictEqual(row.archiveReason, 'user_rejected');
});

test('T-004', 'CORRECT rejects the wrong claim AND observes the right one at high confidence', () => {
  const wrong = um.observe(`lives in CityA-${Date.now()}`, 'preference', {}, 0.5);
  const rightClaim = `lives in CityB-${Date.now()}`;
  const r = um.correctHypothesis(wrong.uuid, rightClaim, 'preference');
  assert.ok(r.ok, 'correction must succeed');
  const wrongRow = (jaaDB.query('user_model_hypotheses', r2 => r2.uuid === wrong.uuid, 1) || [])[0];
  assert.strictEqual(wrongRow.status, 'archived', 'the wrong claim must be archived');
  const rightRow = (jaaDB.query('user_model_hypotheses', r2 => r2.claim === rightClaim, 1) || [])[0];
  assert.ok(rightRow && rightRow.confidence >= 0.7, 'the corrected claim must be seeded at high confidence');
});

test('T-005', 'editableSurface lists active hypotheses with uuid + pinned flag (what a UI edits)', () => {
  const h = um.observe(`surface-test-${Date.now()}`, 'preference', {}, 0.5);
  const surface = um.editableSurface();
  assert.ok(Array.isArray(surface) && surface.length > 0);
  const entry = surface.find(s => s.uuid === h.uuid);
  assert.ok(entry, 'a freshly observed active hypothesis appears on the surface');
  assert.ok('pinned' in entry && 'confidence' in entry, 'each entry carries the fields a UI needs');
});

test('T-006', 'a rejected hypothesis drops OFF the editable surface (self-optimizing — it stops surfacing)', () => {
  const h = um.observe(`dropoff-test-${Date.now()}`, 'preference', {}, 0.5);
  assert.ok(um.editableSurface().some(s => s.uuid === h.uuid), 'present before reject');
  um.rejectHypothesis(h.uuid);
  assert.ok(!um.editableSurface().some(s => s.uuid === h.uuid), 'gone after reject');
});

test('T-007', 'edit ops are safe on a missing uuid (§1.2 loud, not a throw)', () => {
  assert.doesNotThrow(() => {
    const r = um.pinHypothesis('does-not-exist');
    assert.ok(r.error, 'returns an error object, not a throw');
  });
});

_log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
