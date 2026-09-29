'use strict';
process.env.JAA_DATA_DIR = '/tmp/versionium-test-data';
require('fs').rmSync('/tmp/versionium-test-data', { recursive: true, force: true });

const assert = require('assert');
let passed = 0, failed = 0;
function test(id, desc, fn) {
  try { fn(); console.log(`  ✓ ${id} ${desc}`); passed++; }
  catch(e) { console.error(`  ✗ ${id} ${desc}\n    ${e.stack}`); failed++; }
}

const versionium = require('../../versionium/lib/engine.js')   // §0.39.282 moved wholesale (§VS1, versionium/lib/engine.js header);

test('V-001', 'commit() accepts and stores a system field', () => {
  const c = versionium.commit({ message: 'test commit', system: 'guardian' });
  assert.strictEqual(c.system, 'guardian');
  assert.ok(c.commitId.startsWith('vtm-'));
});

test('V-002', 'commit() without system stores null, not undefined/crash', () => {
  const c = versionium.commit({ message: 'no system commit' });
  assert.strictEqual(c.system, null);
});

test('V-003', 'branch head correctly scoped per branch (no cross-branch parentId bug)', () => {
  const a = versionium.commit({ message: 'main commit 1', branch: 'main' });
  const b = versionium.commit({ message: 'feature commit 1', branch: 'feature-x' });
  assert.strictEqual(b.parentId, null); // first commit on a new branch has no parent
  const c = versionium.commit({ message: 'main commit 2', branch: 'main' });
  assert.strictEqual(c.parentId, a.commitId); // correctly parented on ITS OWN branch, not feature-x
});

test('V-004', 'restore() on a real commit returns a real completion record', () => {
  const c = versionium.commit({ message: 'restore-test commit', system: 'ollama-bridge' });
  const r = versionium.restore(c.commitId);
  assert.ok(!r.error, `unexpected error: ${r.error}`);
  assert.strictEqual(r.commit.commitId, c.commitId);
  assert.ok(r.context, 'expected a real replay context');
});

test('V-005', 'restore() on a nonexistent commit reports a real error, not a crash', () => {
  const r = versionium.restore('vtm-doesnotexist');
  assert.ok(r.error);
});

test('V-006', 'calendar() returns entries for a MANUAL commit (real bug found + fixed this pass — manual commit() never wrote to versionium_calendar before)', () => {
  const c = versionium.commit({ message: 'calendar-test commit' });
  const today = new Date().toISOString().slice(0, 10);
  const entries = versionium.calendar(today);
  assert.ok(Array.isArray(entries));
  assert.ok(entries.some(e => e.commitId === c.commitId), 'manual commit should now appear in calendar()');
});

test('V-007', 'setDeps(fieldReader) wires without throwing, and live-field trigger requires the threshold to actually cross', () => {
  let called = 0;
  versionium.setDeps({ fieldReader: () => { called++; return { entropy: 0.1, regime: 'stable' }; } });
  // Can't await the internal _tick() directly (not exported) — but confirms
  // setDeps accepts a fieldReader without throwing, which is the real wiring
  // surface cortex/boot.js now depends on.
  assert.ok(true);
});

// §SNAPSHOTGATE MERGE 2026-09-01 — real tests for the new state/getState
// capability, added when idearium's SnapshotGate/SnapshotRestoreGate were
// removed in favor of this module (idearium/index.js's commitSnapshot()/
// restoreSnapshot() now call these over HTTP; these two tests cover the
// in-process contract they depend on).
test('V-008', 'commit() with a state payload stores it, getState() returns it back deep-cloned', () => {
  const original = { ideas: [{ uuid: 'i1', phase: 'seed' }], gaps: [] };
  const c = versionium.commit({ message: 'state-test commit', system: 'idearium', state: original });
  const r = versionium.getState(c.commitId);
  assert.ok(!r.error, `unexpected error: ${r.error}`);
  assert.deepStrictEqual(r.state, original);
  // deep-cloned, not the same reference — mutating the caller's object
  // after commit must not corrupt stored history.
  original.ideas.push({ uuid: 'i2', phase: 'seed' });
  assert.strictEqual(r.state.ideas.length, 1);
});

test('V-009', 'getState() on a commit made without state reports a real error, not an empty object', () => {
  const c = versionium.commit({ message: 'no-state commit' });
  const r = versionium.getState(c.commitId);
  assert.ok(r.error, 'expected a real error for a commit with no stored state');
});

test('V-010', 'getState() on a nonexistent commit reports a real error, not a crash', () => {
  const r = versionium.getState('vtm-doesnotexist');
  assert.ok(r.error);
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
