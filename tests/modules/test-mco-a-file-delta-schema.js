'use strict';
/**
 * tests/modules/test-mco-a-file-delta-schema.js — MCO-A gate proof, half 1.
 * idearium-repository-overhaul-phasemap.spec's own gate: "MET when both
 * are indexed in their systems' schemas/index.js and one real round-trip
 * row passes each." This is that round-trip for schema.file_delta.
 *
 * §17.10 (verify before promote) — a schema file existing on disk isn't
 * proof it's usable; a real row, written through the real sovereign
 * store and read back unchanged, is. No production writer exists yet
 * (that's MCO-B's job) — this writes directly against versionium's real
 * store the same way a future versionium.file.delta.capability would,
 * proving the shape now rather than waiting for MCO-B to find out it's
 * wrong.
 */
const assert = require('assert');
const path   = require('path');
const fs     = require('fs');
const os     = require('os');

const ROOT = path.join(__dirname, '../..');
const TMP  = fs.mkdtempSync(path.join(os.tmpdir(), 'mco-a-file-delta-test-'));
process.env.VERSIONIUM_DATA_DIR = TMP;

let passed = 0, failed = 0;
function test(id, desc, fn) {
  try { fn(); console.log(`  ✓ ${id} ${desc}`); passed++; }
  catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${e.stack}`); failed++; }
}

const schemas = require(path.join(ROOT, 'versionium/schemas/index.js'));
const { jaaDB } = require(path.join(ROOT, 'versionium/lib/store.js'));

test('MCOA-001', 'schema.file_delta is indexed in versionium/schemas, status OPEN', () => {
  const def = schemas.get('file_delta');
  assert.ok(def, 'expected file_delta to be indexed');
  assert.ok(['OPEN', 'REAL'].includes(def.status), 'status: ' + def.status); // REAL since MCO-B's writer landed
  const required = Object.entries(def.fields).filter(([, f]) => f.required).map(([k]) => k);
  assert.deepStrictEqual(required.sort(), ['commit_ref', 'diff', 'file_path', 'ts', 'uuid'].sort());
});

test('MCOA-002', 'a real file_delta row round-trips through the sovereign store unchanged', () => {
  // A real commit to reference (commit_ref must point at something real,
  // not a fabricated id — matches §1.1: nothing exists until proven).
  const commit = jaaDB.insert('versionium_commits', {
    uuid: 'vtm-mcoa-fd01', commitId: 'vtm-mcoa-fd01', parentId: null,
    branch: 'main', system: 'idearium', message: 'mco-a schema round-trip fixture',
    ts: Date.now(),
  });

  const row = {
    uuid: 'fd-mcoa-0001',
    file_path: 'idearium/ui/index.html',
    commit_ref: commit.uuid,
    diff: '@@ -1 +1 @@\n-old\n+new\n',
    bytes_saved: 412,
    ts: Date.now(),
  };
  jaaDB.insert('file_deltas', row);

  const back = jaaDB.query('file_deltas', (r) => r.uuid === row.uuid, 1)[0];
  assert.ok(back, 'expected the row to read back');
  for (const key of Object.keys(row)) {
    assert.strictEqual(back[key], row[key], `field "${key}" did not round-trip`);
  }
});

test('MCOA-003', 'a file_delta missing a required field is honestly distinguishable (no fabricated default)', () => {
  const row = { uuid: 'fd-mcoa-0002', file_path: 'x', diff: 'y', ts: Date.now() }; // no commit_ref
  jaaDB.insert('file_deltas', row);
  const back = jaaDB.query('file_deltas', (r) => r.uuid === row.uuid, 1)[0];
  assert.strictEqual(back.commit_ref, undefined, 'a missing required field must stay honestly absent, not defaulted');
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exitCode = failed ? 1 : 0;
