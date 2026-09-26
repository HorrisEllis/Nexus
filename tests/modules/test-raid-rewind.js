'use strict';
// P6 (docs/raid-warp-verification-phasemap.spec) — rewind on fail. A failed
// verification (P2-P5) is snapshotted so the decision point is replayable — the
// failure becomes training data, not a lost event (§0.3 nothing lost, §7.4 dead
// branches are data). §8.6 built on the real replay-engine snapshot() API.
const _log = console.log;
console.log = (...a) => { const s = a[0]; if (typeof s === 'string' && /^\[(jaa|raid|pipeline|cfr|bda|constitution|replay)/.test(s)) return; _log(...a); };

const assert = require('assert');
const path = require('path');
const fs = require('fs');
const os = require('os');
let passed = 0, failed = 0;
async function test(id, desc, fn) {
  try { await fn(); _log(`  ✓ ${id} ${desc}`); passed++; }
  catch (e) { _log(`  ✗ ${id} ${desc}\n    ${e.message}`); failed++; }
}

const ROOT = path.join(__dirname, '../..');
const raid = require(path.join(ROOT, 'cortex/core/raid'));
const { jaaDB } = require(path.join(ROOT, 'cortex/memory/jaa-db'));

function trivialSpec() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'p6-test-'));
  fs.writeFileSync(path.join(tmp, 't.spec'), 'spec:\n  meta:\n    name: t\n    version: 1.0.0\n  purpose: trivial\n');
  return { specPath: path.join(tmp, 't.spec'), outputDir: path.join(tmp, 'out') };
}

(async () => {
  await test('T-001', 'a FAILED verify produces a snapshotId (the decision point is captured)', async () => {
    const { specPath, outputDir } = trivialSpec();
    const v = await raid.verifyInIsolation({ source: 'p6', action: 'build', specPath, outputDir, testCommand: 'node -e "process.exit(0)"' });
    assert.strictEqual(v.verified, false, 'the trivial spec fails verification');
    assert.ok(v.snapshotId, 'a failed verify must produce a snapshotId');
  });

  await test('T-002', 'the snapshot is persisted to cortex with the fail trigger (§0.3 nothing lost)', async () => {
    const { specPath, outputDir } = trivialSpec();
    const v = await raid.verifyInIsolation({ source: 'p6', action: 'build', specPath, outputDir, testCommand: 'node -e "process.exit(0)"' });
    const snap = (jaaDB.query('snapshots', r => r.uuid === v.snapshotId, 1) || [])[0];
    assert.ok(snap, 'the snapshot must be persisted to cortex');
    assert.strictEqual(snap.trigger, 'raid.verify.fail');
  });

  await test('T-003', 'the snapshot is replayable (listSnapshots sees it)', async () => {
    const { specPath, outputDir } = trivialSpec();
    const v = await raid.verifyInIsolation({ source: 'p6', action: 'build', specPath, outputDir, testCommand: 'node -e "process.exit(0)"' });
    const replay = require(path.join(ROOT, 'lib/replay-engine'));
    const list = replay.listSnapshots ? replay.listSnapshots() : [];
    assert.ok(list.some(s => s.uuid === v.snapshotId || s.snapshotId === v.snapshotId), 'the snapshot must be listable/replayable');
  });

  await test('T-004', 'the snapshotId is recorded in the decision meta (§17.6 the fail links to its rewind)', async () => {
    const { specPath, outputDir } = trivialSpec();
    await raid.verifyInIsolation({ source: 'p6-rec', action: 'build', specPath, outputDir, testCommand: 'node -e "process.exit(0)"' });
    const row = (jaaDB.query('raid_decisions', () => true, 99999) || []).filter(r => r.source === 'p6-rec').slice(-1)[0];
    assert.ok(row.meta && 'snapshotId' in row.meta, 'the decision meta must carry the snapshotId');
  });

  await test('T-005', 'a NON-consequential (skipped) action does NOT snapshot — nothing failed', async () => {
    const v = await raid.verifyInIsolation({ source: 'p6', action: 'read' });
    assert.ok(!v.snapshotId, 'a skipped action has nothing to rewind');
  });

  _log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
