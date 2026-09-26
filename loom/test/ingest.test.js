'use strict';
/**
 * loom/test/ingest.test.js — Phase 144 verification.
 * Uses small synthetic zips (not the 178MB real archive — that's the
 * manual real-world check already run once, see session notes) so this
 * suite runs in milliseconds and the assertions are exact.
 * Run: node loom/test/ingest.test.js
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const assert = require('assert');
const { execFileSync } = require('child_process');
const { LoomIngest } = require('../ingest/index');

let pass = 0, fail = 0;
function check(label, fn) {
  try { fn(); pass++; console.log(`  PASS  ${label}`); }
  catch (e) { fail++; console.log(`  FAIL  ${label} — ${e.message}`); }
}

const work = fs.mkdtempSync(path.join(os.tmpdir(), 'loom-ingest-test-'));
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'loom-ingest-data-'));

// ── build two small synthetic zips: v1, then v2 with a real, known diff ────
const v1dir = path.join(work, 'v1'); fs.mkdirSync(v1dir);
fs.writeFileSync(path.join(v1dir, 'a.txt'), 'hello');
fs.writeFileSync(path.join(v1dir, 'b.txt'), 'world');
execFileSync('zip', ['-qr', path.join(work, 'v1.zip'), '.'], { cwd: v1dir });

const v2dir = path.join(work, 'v2'); fs.mkdirSync(v2dir);
fs.writeFileSync(path.join(v2dir, 'a.txt'), 'hello');           // unchanged
fs.writeFileSync(path.join(v2dir, 'b.txt'), 'world!! bigger');  // changed (size differs)
fs.writeFileSync(path.join(v2dir, 'c.txt'), 'new file');        // added
// b.txt kept, a.txt kept, no removals in v2 — add a v3 that removes one
execFileSync('zip', ['-qr', path.join(work, 'v2.zip'), '.'], { cwd: v2dir });

const v3dir = path.join(work, 'v3'); fs.mkdirSync(v3dir);
fs.writeFileSync(path.join(v3dir, 'a.txt'), 'hello'); // b.txt and c.txt both removed
execFileSync('zip', ['-qr', path.join(work, 'v3.zip'), '.'], { cwd: v3dir });

const ingest = new LoomIngest({ dataDir });

console.log(`\nLOOM Phase 144 — ingest test\n`);

let r1, r2, r3;

check('first ingest — no parent, firstRevision true', () => {
  r1 = ingest.ingestZip(path.join(work, 'v1.zip'), { label: 'v1' });
  assert.strictEqual(r1.diff.firstRevision, true);
  assert.strictEqual(r1.fileCount, 2);
  assert.strictEqual(r1.parentId, null);
});

check('second ingest — detects 1 added, 1 changed, 0 removed', () => {
  r2 = ingest.ingestZip(path.join(work, 'v2.zip'), { label: 'v2' });
  assert.strictEqual(r2.parentId, r1.id);
  assert.strictEqual(r2.diff.addedCount, 1);
  assert.strictEqual(r2.diff.changedCount, 1);
  assert.strictEqual(r2.diff.removedCount, 0);
  assert.strictEqual(r2.diff.unchangedCount, 1);
  assert.deepStrictEqual(r2.diff.added, ['c.txt']);
  assert.deepStrictEqual(r2.diff.changed, ['b.txt']);
});

check('third ingest — detects 2 removed, chained to v2 not v1', () => {
  r3 = ingest.ingestZip(path.join(work, 'v3.zip'), { label: 'v3' });
  assert.strictEqual(r3.parentId, r2.id);
  assert.strictEqual(r3.diff.removedCount, 2);
  assert.deepStrictEqual(r3.diff.removed.sort(), ['b.txt', 'c.txt']);
});

check('chain() returns full lineage, oldest first', () => {
  const chain = ingest.revisions.chain(r3.id);
  assert.strictEqual(chain.length, 3);
  assert.deepStrictEqual(chain.map(r => r.label), ['v1', 'v2', 'v3']);
});

check('re-ingesting an already-ingested zip is idempotent, not a duplicate', () => {
  const again = ingest.ingestZip(path.join(work, 'v1.zip'), { label: 'v1 again' });
  assert.strictEqual(again.alreadyIngested, true);
  assert.strictEqual(again.id, r1.id);
  assert.strictEqual(Object.keys(ingest.revisions.all()).length, 3); // still 3, not 4
});

check('ingesting a nonexistent path throws a clear error, not a silent failure', () => {
  assert.throws(() => ingest.ingestZip('/tmp/does-not-exist-at-all.zip'), /file not found/);
});

check('revision record actually persisted to disk', () => {
  const onDisk = JSON.parse(fs.readFileSync(path.join(dataDir, 'revisions.json'), 'utf8'));
  assert.strictEqual(Object.keys(onDisk.revisions).length, 3);
});

console.log(`\n${pass} passed, ${fail} failed\n`);
if (fail > 0) process.exit(1);
