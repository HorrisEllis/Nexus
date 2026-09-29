'use strict';
/** lib/manifest.js — per-system hash manifests, diff, and sigma-scored drift. */
const assert = require('assert');
const fs = require('fs'), os = require('os'), path = require('path');
const M = require(path.join(__dirname, '../../lib/manifest.js'));

let passed = 0, failed = 0;
function test(id, name, fn) {
  try { fn(); console.log(`  ✓ ${id} ${name}`); passed++; }
  catch (e) { console.log(`  ✗ ${id} ${name}\n    ${e.message}`); failed++; }
}
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'mf-'));
const mk = (p, c) => { const f = path.join(TMP, p); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, c); return f; };

test('MF-1', 'capture refuses a bad system BY NAME, never returns an empty manifest', () => {
  for (const bad of [undefined, null, '', 0, [], {}]) {
    const r = M.capture(bad); assert.strictEqual(r.ok, false); assert.ok(r.reason);
  }
  const r = M.capture('definitely-not-here-xyz');
  assert.strictEqual(r.ok, false);
  assert.ok(/no such system directory/.test(r.reason), 'absence must be named, not returned as 0 files');
});

test('MF-2', 'a manifest declares whether it is COMPLETE', () => {
  mk('a/one.js', 'x'); mk('a/two.js', 'y');
  const m = M.capture(path.join(TMP, 'a'));
  assert.strictEqual(m.ok, true);
  assert.strictEqual(m.fileCount, 2);
  assert.strictEqual(m.complete, true);
  assert.ok(m.entries.every(e => e.sha256 && e.mtime && typeof e.sizeBytes === 'number'));
});

test('MF-3', 'diff detects added / removed / changed', () => {
  const dir = path.join(TMP, 'b');
  mk('b/keep.js', 'same'); mk('b/gone.js', 'bye'); mk('b/edit.js', 'v1');
  const before = M.capture(dir);
  fs.unlinkSync(path.join(dir, 'gone.js'));
  fs.writeFileSync(path.join(dir, 'edit.js'), 'v2');
  mk('b/new.js', 'hello');
  const d = M.diff(before, M.capture(dir));
  assert.strictEqual(d.added.length, 1, 'new.js');
  assert.strictEqual(d.removed.length, 1, 'gone.js');
  assert.strictEqual(d.changed.length, 1, 'edit.js');
  assert.strictEqual(d.unchanged, 1, 'keep.js');
});

test('MF-4', 'a RENAME is one event, not an add plus a remove', () => {
  const dir = path.join(TMP, 'c');
  mk('c/old-name.js', 'identical content here');
  const before = M.capture(dir);
  fs.renameSync(path.join(dir, 'old-name.js'), path.join(dir, 'new-name.js'));
  const d = M.diff(before, M.capture(dir));
  assert.strictEqual(d.renamed.length, 1);
  assert.strictEqual(d.added.length, 0, 'a rename must not also count as an add');
  assert.strictEqual(d.removed.length, 0, 'a rename must not also count as a remove');
  assert.strictEqual(d.renamed[0].from, 'old-name.js');
  assert.strictEqual(d.renamed[0].to, 'new-name.js');
});

test('MF-5', 'a GHOST edit is detected — content changed, mtime did not', () => {
  // The one that hides from every mtime-keyed detector in the tree.
  const dir = path.join(TMP, 'd');
  const f = mk('d/ghost.js', 'original');
  const before = M.capture(dir);
  const mt = fs.statSync(f).mtime;
  fs.writeFileSync(f, 'tampered');
  fs.utimesSync(f, mt, mt);              // put the clock back
  const d = M.diff(before, M.capture(dir));
  assert.strictEqual(d.changed.length, 1);
  assert.strictEqual(d.ghost.length, 1, 'a content change with an unmoved mtime must be flagged GHOST');
  const s = M.sigma(d);
  assert.ok(s.reasons.some(r => /GHOST/.test(r)));
  assert.ok(s.structural >= 0.45, `a ghost edit must dominate the structural axis, got ${s.structural}`);
});

test('MF-6', 'sigma always states its reasons, and STABLE only when nothing moved', () => {
  const dir = path.join(TMP, 'e');
  mk('e/x.js', 'a');
  const m = M.capture(dir);
  const s = M.sigma(M.diff(m, M.capture(dir)));
  assert.strictEqual(s.band, 'STABLE');
  assert.strictEqual(s.totalChanges, 0);
  assert.ok(Array.isArray(s.reasons) && s.reasons.length, 'a score with no reasons is uncheckable (§0.1)');
});

test('MF-7', 'an EXPECTED build scores lower than the same change unexpected', () => {
  const dir = path.join(TMP, 'f');
  mk('f/a.js', '1'); mk('f/b.js', '2');
  const before = M.capture(dir);
  fs.writeFileSync(path.join(dir, 'a.js'), 'changed');
  const d = M.diff(before, M.capture(dir));
  const surprise = M.sigma(d, { expected: false });
  const during = M.sigma(d, { expected: true });
  assert.ok(surprise.sigma > during.sigma,
    'the same delta during a declared build must score lower than the same delta out of nowhere');
  assert.ok(surprise.reasons.some(r => /no build or dispatch/.test(r)));
});

test('MF-8', 'uncomparable is neither same nor different', () => {
  const a = { ok: true, complete: false, ts: 1, entries: [{ path: 'x', sha256: null, sizeBytes: 1, mtime: 1, unhashed: 'too big' }] };
  const b = { ok: true, complete: true, ts: 2, entries: [{ path: 'x', sha256: 'ff', sizeBytes: 1, mtime: 2 }] };
  const d = M.diff(a, b);
  assert.strictEqual(d.changed.length, 1);
  assert.strictEqual(d.changed[0].kind, 'uncomparable');
  assert.strictEqual(d.unchanged, 0, 'an uncompared path must never be counted as unchanged');
  assert.ok(M.sigma(d).reasons.some(r => /UNCOMPARED/.test(r)));
});

test('MF-9', 'the first capture is a BASELINE and is never scored', () => {
  const r = M.drift(path.join(TMP, 'a'), null);
  assert.strictEqual(r.baseline, true);
  assert.ok(!r.sigma, 'nothing compared means nothing scored (§1.1)');
  assert.ok(/baseline/.test(r.note));
});

test('MF-10', 'runs on real NEXUS systems', () => {
  // §0.39.282 — meta/ became intelligence/ (the organs moved; meta/ keeps 4 files); the check follows the real system.
  const m = M.capture('intelligence');
  assert.ok(m.ok && m.fileCount > 20, `expected a real intelligence/ manifest, got ${m.fileCount}`);
  assert.ok(m.complete, 'intelligence/ should hash completely');
  const same = M.diff(m, M.capture('intelligence'));
  assert.strictEqual(same.changed.length, 0, 'two captures of an idle tree must show no change');
  assert.strictEqual(M.sigma(same).band, 'STABLE');
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
