'use strict';
/**
 * tests/modules/test-versionium-sovereign.js — real, isolated tests for
 * VS1 (docs/2026-09-02-versionium-sovereign-and-cleanup-phasemap.spec):
 * versionium's own sovereign engine, store, and legacy-data migration.
 *
 * §RELATIONSHIP TO test-versionium-migration.js — that file still tests
 * cortex/versionium/index.js, which is now real, unexecuted archive code
 * (nothing in production requires it anymore — see this migration's own
 * commit for why it's kept, not deleted, per §0.3). Kept passing, not
 * deleted, since it's still real, accurate coverage of real code that
 * still exists on disk. This file is the new, separate coverage for the
 * code that's actually live in production now: versionium/lib/*.
 *
 * §ISOLATION — uses VERSIONIUM_DATA_DIR (this migration's own new env
 * override, added to versionium/config.js for exactly this reason),
 * matching the same isolated-temp-dir convention every other test in
 * this tree uses via JAA_DATA_DIR.
 */
const assert = require('assert');
const path   = require('path');
const fs     = require('fs');
const os     = require('os');

const ROOT = path.join(__dirname, '../..');
const TMP  = fs.mkdtempSync(path.join(os.tmpdir(), 'versionium-sovereign-test-'));
process.env.VERSIONIUM_DATA_DIR = TMP;

// §FIXED 2026-09-15 — real bug found running this suite after cortex/ was
// extracted into the working tree (previously cortex/memory/jaa-db.js was
// unreachable, so VSOV-007's migrateLegacyData() call always hit the
// early "cortex jaaDB unavailable" skip path and never actually touched a
// store). With cortex/ present, that require() now succeeds — and without
// JAA_DATA_DIR set BEFORE it, cortex/memory/jaa-db.js's own module-level
// DATA_DIR falls back to its real default (data/cortex/memory/, this
// repo's actual production path), so VSOV-007 silently wrote real files
// there. Set here, at the top, before any test (not just the new V5
// tests below) requires cortex/memory/jaa-db.js either directly or
// transitively via migrate-legacy-data.js/migrate-idearium-snapshots.js —
// same isolation discipline as VERSIONIUM_DATA_DIR above, just for the
// legacy side of the migration.
const cortexTmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cortex-legacy-test-'));
process.env.JAA_DATA_DIR = cortexTmp;

let passed = 0, failed = 0;
function test(id, desc, fn) {
  try { fn(); console.log(`  ✓ ${id} ${desc}`); passed++; }
  catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${e.stack}`); failed++; }
}

const engine = require(path.join(ROOT, 'versionium/lib/engine.js'));
const { jaaDB } = require(path.join(ROOT, 'versionium/lib/store.js'));

test('VSOV-001', 'the sovereign store is genuinely isolated — nothing in the isolated dir before any write', () => {
  const files = fs.readdirSync(TMP);
  assert.strictEqual(files.length, 0, 'expected a clean, isolated temp dir with no pre-existing data');
});

test('VSOV-002', 'commit() works against the sovereign store, with a system and state payload', () => {
  const c = engine.commit({ message: 'sovereign test commit', system: 'test-system', state: { real: true } });
  assert.ok(c.commitId.startsWith('vtm-'));
  assert.strictEqual(c.system, 'test-system');
  assert.deepStrictEqual(c.state, { real: true });
  // §FIXED — jaa-store.js's insert() debounces its disk write
  // (this._schedule(table)), so checking the filesystem immediately
  // after commit() returns is a real timing bug in the TEST, not the
  // product: the row is genuinely there (every other test in this file
  // reads it back correctly via jaaDB.query(), which hits the real,
  // already-updated in-memory Map, same as production reads do).
  // Verify the same way: read it back through the real store, not the
  // filesystem's own async write timing.
  const rows = jaaDB.query('versionium_commits', r => r.commitId === c.commitId, 1);
  assert.strictEqual(rows.length, 1, 'expected the commit to be immediately readable back from the store');
});

test('VSOV-003', 'getState() reads back the real, deep-cloned state', () => {
  const c = engine.commit({ message: 'state test', state: { nested: { value: 42 } } });
  const r = engine.getState(c.commitId);
  assert.deepStrictEqual(r.state, { nested: { value: 42 } });
});

test('VSOV-004', 'restore() gives a real completion record for a real commit', () => {
  const c = engine.commit({ message: 'restore test' });
  const r = engine.restore(c.commitId);
  assert.ok(!r.error, `unexpected error: ${r.error}`);
  assert.strictEqual(r.commit.commitId, c.commitId);
});

test('VSOV-005', 'calendar() reflects a manual commit (the real V-006 bug fix, still true here)', () => {
  const c = engine.commit({ message: 'calendar test' });
  const today = new Date().toISOString().slice(0, 10);
  const entries = engine.calendar(today);
  assert.ok(entries.some(e => e.commitId === c.commitId));
});

test('VSOV-006', 'branch scoping has no cross-branch parentId leak', () => {
  const a = engine.commit({ message: 'main 1', branch: 'main' });
  const b = engine.commit({ message: 'feature 1', branch: 'feature-x' });
  assert.strictEqual(b.parentId, null);
  const c = engine.commit({ message: 'main 2', branch: 'main' });
  assert.strictEqual(c.parentId, a.commitId);
});

// ── Legacy-data migration ───────────────────────────────────────────────
test('VSOV-007', 'migrateLegacyData() is idempotent — a second run migrates zero new rows', () => {
  const { migrateLegacyData } = require(path.join(ROOT, 'versionium/lib/migrate-legacy-data.js'));
  const r1 = migrateLegacyData({ log: () => {} });
  assert.strictEqual(r1.ok, true);
  const r2 = migrateLegacyData({ log: () => {} });
  assert.strictEqual(r2.ok, true);
  assert.strictEqual(r2.commits, 0);
  assert.strictEqual(r2.branches, 0);
  assert.strictEqual(r2.calendar, 0);
});

// ── Idearium-snapshots migration (gap V5) ────────────────────────────────
// §CLOSES V5 2026-09-15 — real, isolated coverage for migrate-idearium-
// snapshots.js, modeled directly on VSOV-007 above (same idempotency
// shape, sibling gap V6). JAA_DATA_DIR (cortex's legacy store) was
// already isolated at the top of this file, before VSOV-007 ran — see
// that comment for why doing it there, not just here, matters.
const { jaaDB: legacyJaaDB } = require(path.join(ROOT, 'cortex/memory/jaa-db.js'));
legacyJaaDB.insert('idearium_snapshots', {
  uuid: 'vtm-mig0test1', commitId: 'vtm-mig0test1', parentId: null,
  branch: 'main', message: 'seed idea', author: 'test-author',
  state: { ideas: [{ uuid: 'i1' }] }, ts: 1000,
});
legacyJaaDB.insert('idearium_snapshots', {
  uuid: 'vtm-mig0test2', commitId: 'vtm-mig0test2', parentId: 'vtm-mig0test1',
  branch: 'main', message: 'second idea', author: 'test-author',
  state: { ideas: [{ uuid: 'i1' }, { uuid: 'i2' }] }, ts: 2000,
});

test('VSOV-009', 'migrateIdeariumSnapshots() copies pre-merge rows into versionium_commits, tagged system:idearium', () => {
  const { migrateIdeariumSnapshots } = require(path.join(ROOT, 'versionium/lib/migrate-idearium-snapshots.js'));
  const r = migrateIdeariumSnapshots({ log: () => {} });
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.commits, 2);
  const rows = jaaDB.query('versionium_commits', (row) => row.commitId === 'vtm-mig0test1', 1);
  assert.strictEqual(rows.length, 1);
  assert.strictEqual(rows[0].system, 'idearium');
  assert.strictEqual(rows[0].branch, 'main');
  assert.deepStrictEqual(rows[0].state, { ideas: [{ uuid: 'i1' }] });
  // real commit graph preserved, not flattened — the second row still
  // points back at the first via parentId, same as it did pre-migration.
  const second = jaaDB.query('versionium_commits', (row) => row.commitId === 'vtm-mig0test2', 1)[0];
  assert.strictEqual(second.parentId, 'vtm-mig0test1');
});

test('VSOV-010', 'migrateIdeariumSnapshots() is idempotent — a second run migrates zero new rows', () => {
  const { migrateIdeariumSnapshots } = require(path.join(ROOT, 'versionium/lib/migrate-idearium-snapshots.js'));
  const r = migrateIdeariumSnapshots({ log: () => {} });
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.commits, 0);
  assert.strictEqual(r.skippedExisting, 2);
});

test('VSOV-011', 'a migrated commit round-trips through getState() exactly like a live one', () => {
  const r = engine.getState('vtm-mig0test2');
  assert.ok(!r.error, `unexpected error: ${r.error}`);
  assert.deepStrictEqual(r.state, { ideas: [{ uuid: 'i1' }, { uuid: 'i2' }] });
});

// §VSOV-008 — real, async: jaa-store.js's own insert() debounces its disk
// write (this._schedule(table, delay=1500)). Every test above correctly
// verifies reads through the live store (matching real production
// reads), not the filesystem directly — but the debounced write ITSELF
// is real, separate behavior worth actually confirming lands, not just
// trusted. Waits past the real 1500ms default delay, then checks disk.
function finish() {
  setTimeout(() => {
    try {
      const files = fs.readdirSync(TMP);
      const hasCommits = files.some(f => f.includes('versionium_commits'));
      if (hasCommits) { console.log('  ✓ VSOV-008 the debounced disk write genuinely lands within the real 1500ms window'); passed++; }
      else { console.error('  ✗ VSOV-008 the debounced disk write genuinely lands within the real 1500ms window\n    no versionium_commits file found in the isolated data dir after waiting'); failed++; }
    } catch (e) {
      console.error(`  ✗ VSOV-008 ${e.stack}`); failed++;
    }
    console.log(`\n${passed} passed, ${failed} failed`);
    delete process.env.VERSIONIUM_DATA_DIR;
    delete process.env.JAA_DATA_DIR;
    process.exitCode = failed ? 1 : 0;
  }, 1800);
}
finish();
