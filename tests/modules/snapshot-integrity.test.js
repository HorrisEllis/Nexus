'use strict';
/**
 * tests/modules/snapshot-integrity.test.js — Phase 25 sub-step 1 Suite
 * UUID: test-snapshot-integrity-v1-0000-4000-0000-000000000001
 *
 * Covers: cortex_state_hash computation, prev_snapshot_hash chaining,
 * verifySnapshotIntegrity() tamper detection, checkChainIntegrity() across
 * a real sequence of snapshots written to a temp directory (real file I/O —
 * hash-chain correctness over actual .nex files is exactly what needs
 * verifying, not a mocked filesystem).
 */

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
let passed = 0, failed = 0;

async function test(id, desc, fn) {
  try { await fn(); console.log(`  ✓ ${id} ${desc}`); passed++; }
  catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${e.message}`); failed++; }
}

// ── Real temp snapshot directory — isolated per test run ────────────────────
const TMP_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-snap-test-'));
process.env.NEXUS_SNAP_DIR = TMP_DIR;

// ── Mock JAA — minimal in-memory backup_records, real file writes ────────────
let _store = {};
function resetStore() { _store = { backup_records: [], event_log: [] }; }
resetStore();

require.cache[require.resolve('../../cortex/memory/jaa-db')] = {
  id: '../memory/jaa-db', filename: '../memory/jaa-db', loaded: true,
  exports: {
    jaaDB: {
      _tables: { foo: [], bar: [] },
      tail:   (t, n) => (_store[t] || []).slice(Math.max(0, (_store[t] || []).length - n)),
      insert: (t, r) => { (_store[t] = _store[t] || []).push(r); return r; },
      query:  (t, fn, n) => (_store[t] || []).filter(fn).slice(0, n || 999),
    },
    uid: () => require('crypto').randomUUID(),
  },
};

const snap = require('../../cortex/snapshot/index');

function reset() { resetStore(); }

(async () => {

// ── §A: basic hashing ──────────────────────────────────────────────────────────
await test('T-001', 'every snapshot gets a cortex_state_hash', () => {
  reset();
  const s = snap.create({ type: 'manual' });
  assert.ok(s.cortex_state_hash);
  assert.strictEqual(s.cortex_state_hash.length, 64, 'sha256 hex digest length');
});

await test('T-002', 'first-ever snapshot has prev_snapshot_hash null', () => {
  reset();
  const s = snap.create({ type: 'manual' });
  const nex = snap.load(s.snapId);
  assert.strictEqual(nex.prev_snapshot_hash, null);
});

await test('T-003', 'second snapshot chains to the first snapshot\'s hash', () => {
  reset();
  const s1 = snap.create({ type: 'manual' });
  const s2 = snap.create({ type: 'manual' });
  const nex2 = snap.load(s2.snapId);
  assert.strictEqual(nex2.prev_snapshot_hash, s1.cortex_state_hash);
});

await test('T-004', 'format header reflects the current version', () => {
  reset();
  const s = snap.create({ type: 'manual' });
  const nex = snap.load(s.snapId);
  assert.ok(/^NEX-SNAP\/\d+\.\d+$/.test(nex.format));
});

// ── §B: verifySnapshotIntegrity ─────────────────────────────────────────────────
await test('T-005', 'untampered snapshot verifies as valid', () => {
  reset();
  const s = snap.create({ type: 'manual' });
  const nex = snap.load(s.snapId);
  const result = snap.verifySnapshotIntegrity(nex);
  assert.strictEqual(result.valid, true);
});

await test('T-006', 'tampered table content is detected via hash mismatch', () => {
  reset();
  const s = snap.create({ type: 'manual' });
  const nex = snap.load(s.snapId);
  const tampered = { ...nex, tables: { ...nex.tables, foo: ['INJECTED_ROW'] } };
  const result = snap.verifySnapshotIntegrity(tampered);
  assert.strictEqual(result.valid, false);
  assert.ok(/hash mismatch/.test(result.reason));
});

await test('T-007', 'a snapshot missing cortex_state_hash entirely is flagged, not silently accepted', () => {
  reset();
  const fakeOldFormat = { format: 'NEX-SNAP/1.0', tables: { foo: [] } };
  const result = snap.verifySnapshotIntegrity(fakeOldFormat);
  assert.strictEqual(result.valid, false);
});

// ── §C: checkChainIntegrity — across a real sequence ────────────────────────────
await test('T-008', 'a clean chain of 3 snapshots reports all valid, no breaks', () => {
  reset();
  snap.create({ type: 'manual' });
  snap.create({ type: 'manual' });
  snap.create({ type: 'manual' });
  const report = snap.checkChainIntegrity();
  assert.strictEqual(report.totalChecked, 3);
  assert.strictEqual(report.valid, 3);
  assert.strictEqual(report.corrupt.length, 0);
  assert.strictEqual(report.chainBreaks.length, 0);
});

await test('T-009', 'corrupting one snapshot file on disk is caught by the chain check, attributed to the right snapshot', () => {
  reset();
  const s1 = snap.create({ type: 'manual' });
  snap.create({ type: 'manual' });
  const nex1 = snap.load(s1.snapId);
  fs.writeFileSync(_findSnapPath(s1.snapId), JSON.stringify({ ...nex1, tables: { ...nex1.tables, foo: ['HACKED'] } }));

  const report = snap.checkChainIntegrity();
  assert.strictEqual(report.corrupt.length, 1);
  assert.strictEqual(report.corrupt[0].snapId, s1.snapId);
});

await test('T-010', 'a missing snapshot file is reported, not thrown as an uncaught error', () => {
  reset();
  const s1 = snap.create({ type: 'manual' });
  fs.unlinkSync(_findSnapPath(s1.snapId));
  const report = snap.checkChainIntegrity();
  assert.strictEqual(report.missingFiles.length, 1);
  assert.strictEqual(report.missingFiles[0].snapId, s1.snapId);
});

await test('T-011', 'empty chain (no snapshots yet) reports cleanly, never throws', () => {
  reset();
  const report = snap.checkChainIntegrity();
  assert.strictEqual(report.totalChecked, 0);
});

function _findSnapPath(snapId) {
  const record = _store.backup_records.find(r => r.snapId === snapId);
  return record.snapPath;
}

})().then(() => {
  console.log(`\n${passed} passed  ${failed} failed`);
  fs.rmSync(TMP_DIR, { recursive: true, force: true });
  if (failed > 0) process.exitCode = 1;
});

module.exports = { passed, failed };
