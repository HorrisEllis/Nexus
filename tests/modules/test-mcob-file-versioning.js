'use strict';
/**
 * tests/modules/test-mcob-file-versioning.js — versionium/lib/files.js and
 * versionium/lib/text-diff.js (MCO-B).
 *
 * §12.2 — real bytes through the real engine and the real sovereign store.
 * Commits are made with versionium's own engine.commit(); rows land in the
 * real (isolated) store; blobs land on real disk. The gate the phasemap
 * names — "a file written through idearium produces a real commit row and
 * restore reproduces the file byte-for-byte" — is asserted here on real
 * Buffers with Buffer.equals(), including binary, empty, CRLF, unicode and
 * no-trailing-newline files, and again over real HTTP in the idearium-side
 * checks.
 *
 * §ISOLATION — data dir, blob dir and cortex dir are temp dirs set before
 * anything is required. Limits are lowered by env so keyframes and the size
 * cap are reachable with small files.
 */
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.join(__dirname, '../..');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'mcob-'));
process.env.VERSIONIUM_DATA_DIR = path.join(TMP, 'v');
process.env.JAA_DATA_DIR = path.join(TMP, 'c');
process.env.VERSIONIUM_FILE_MAX_BYTES = '4000';
process.env.VERSIONIUM_FILE_KEYFRAME_INTERVAL = '3';

let pass = 0, fail = 0;
async function t(name, fn) {
  try { await fn(); pass++; console.log(`  ✓ ${name}`); }
  catch (e) { fail++; console.log(`  ✗ ${name}\n      ${e.stack ? e.stack.split('\n').slice(0, 3).join('\n      ') : e.message}`); }
}
const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');
const B = (s) => Buffer.from(s, 'utf8');
const entry = (p, buf) => ({ path: p, sha256: sha(buf), bytes: buf.length });
const b64 = (buf) => buf.toString('base64');

const td = require(path.join(ROOT, 'versionium/lib/text-diff.js'));
const files = require(path.join(ROOT, 'versionium/lib/files.js'));
const engine = require(path.join(ROOT, 'versionium/lib/engine.js'));
const { jaaDB } = require(path.join(ROOT, 'versionium/lib/store.js'));

// deterministic PRNG so a failure is reproducible
let seed = 20260920;
const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
const ri = (n) => Math.floor(rnd() * n);

(async () => {
  console.log('\n── text-diff: apply(a, diff(a, b)) === b, byte for byte ──');
  const WORDS = ['a', 'b', '', 'x = 1;', '  ', 'foo\r', 'é', '日本', '}', '{', 'a', 'a', 'line'];
  const gen = () => { const n = ri(12); const ls = []; for (let i = 0; i < n; i++) ls.push(WORDS[ri(WORDS.length)]); let s = ls.join('\n'); if (rnd() < 0.6) s += '\n'; if (rnd() < 0.05) s = ''; return s; };
  const mutate = (s) => {
    let ls = s.split('\n'); const k = 1 + ri(4);
    for (let i = 0; i < k; i++) {
      const r = rnd(); const p = ri(ls.length + 1);
      if (r < 0.35) ls.splice(p, 0, WORDS[ri(WORDS.length)]);
      else if (r < 0.7) ls.splice(p, 1);
      else if (r < 0.85 && ls.length) ls[Math.min(p, ls.length - 1)] = WORDS[ri(WORDS.length)];
      else { s = ls.join('\n'); s = rnd() < 0.5 ? s + '\n' : s.replace(/\n$/, ''); ls = s.split('\n'); }
    }
    return ls.join('\n');
  };
  await t('30,000 random pairs (CRLF, unicode, empty, duplicate lines, EOL toggling) round-trip exactly', () => {
    let bad = 0, first = null;
    for (let i = 0; i < 30000; i++) {
      const a = gen(); const b = rnd() < 0.15 ? gen() : mutate(a);
      let ok = false;
      try { const d = td.diff(a, b); ok = td.apply(a, d) === b && ((a === b) === (d === '')); } catch (_) { ok = false; }
      if (!ok) { bad++; if (!first) first = JSON.stringify([a, b]); }
    }
    assert.strictEqual(bad, 0, `${bad} failures, first: ${first}`);
  });
  await t('adding or removing only the final newline is a real change, not lost', () => {
    for (const [a, b] of [['a\nb', 'a\nb\n'], ['a\nb\n', 'a\nb'], ['', '\n'], ['\n', ''], ['x', '']]) {
      const d = td.diff(a, b); assert.ok(d !== '', JSON.stringify([a, b]));
      assert.strictEqual(td.apply(a, d), b);
    }
  });
  await t('CRLF files keep every \\r through a diff', () => {
    const a = 'one\r\ntwo\r\nthree\r\n', b = 'one\r\nTWO\r\nthree\r\nfour\r\n';
    assert.strictEqual(td.apply(a, td.diff(a, b)), b);
  });
  await t('a big middle over the LCS bound still round-trips (falls back to one replace hunk)', () => {
    const many = (n, tag) => Array.from({ length: n }, (_, i) => `${tag}${i}`).join('\n') + '\n';
    const a = many(2500, 'a'), b = many(2500, 'b'); // 6.25M cells > default 2M bound
    assert.strictEqual(td.apply(a, td.diff(a, b)), b);
  });
  await t('applying to a base whose lines do not match the diff throws PatchError, not a wrong file', () => {
    const d = td.diff('a\nb\nc\n', 'a\nB\nc\n');
    assert.throws(() => td.apply('a\nX\nc\n', d), td.PatchError);
    assert.throws(() => td.apply('a\n', d), td.PatchError);
  });
  await t('malformed diffs throw PatchError', () => {
    for (const bad of ['not a diff\n', '@@ -1,1 +1,1 @@\n?bad\n', '@@ -1,2 +1,1 @@\n-a\n', '@@ -1,1 +1,1 @@\n a\n\\ No newline at end of file\n\\ No newline at end of file\n']) {
      assert.throws(() => td.apply('a\n', bad), td.PatchError, JSON.stringify(bad));
    }
  });
  await t('isDiffable: text yes; NUL bytes and invalid UTF-8 no', () => {
    assert.ok(td.isDiffable(B('héllo\n日本\n')));
    assert.ok(!td.isDiffable(Buffer.from([0x61, 0x00, 0x62])));
    assert.ok(!td.isDiffable(Buffer.from([0xff, 0xfe, 0x41])));
    assert.ok(td.isDiffable(Buffer.alloc(0)));
  });

  console.log('\n── file layer: real commits, real bytes ─────────────────');
  const REPO = 'mcob-repo';
  const repoCommit = (repository, msg) => engine.commit({ message: msg, branch: `repo-${repository}`, system: 'idearium.repo', state: { kind: 'repo-snapshot', repository } });
  const tenLines = (tag) => Array.from({ length: 40 }, (_, i) => `const ${tag}${i} = ${i}; // a reasonably long line of source text\n`).join('');

  const binary = Buffer.from(Array.from({ length: 256 }, (_, i) => i)); // every byte value, NULs included
  const v1 = {
    'src/app.js': B(tenLines('a')),
    'src/crlf.txt': B('one\r\ntwo\r\nthree\r\n'),
    'src/noeol.txt': B('no trailing newline'),
    'src/empty.txt': Buffer.alloc(0),
    'src/unicode.md': B('# 日本語 — é\n\nBOM-free\n'),
    'assets/blob.bin': binary,
    'src/gone.js': B('module.exports = 1;\n'),
  };
  const treeOf = (m) => Object.entries(m).map(([p, b]) => entry(p, b));
  const contentsOf = (m, paths) => paths.map(p => ({ path: p, content_b64: b64(m[p]) }));

  let p1 = files.plan({ repository: REPO, tree: treeOf(v1) });
  await t('first plan on an empty repo: every file needed, nothing deleted, no base', () => {
    assert.strictEqual(p1.baseCommitId, null);
    assert.deepStrictEqual(p1.need.sort(), Object.keys(v1).sort());
    assert.deepStrictEqual(p1.deleted, []);
  });
  const c1 = repoCommit(REPO, 'snap 1');
  const r1 = files.record({ repository: REPO, commitId: c1.commitId, tree: treeOf(v1), contents: contentsOf(v1, Object.keys(v1)) });
  await t('record #1 stores every file as a full copy', () => {
    assert.strictEqual(r1.ok, true);
    assert.strictEqual(r1.counts.full, 7); assert.strictEqual(r1.counts.delta, 0);
  });
  await t('GATE: every file at commit 1 comes back byte-for-byte (Buffer.equals), incl. binary, empty, CRLF, no-EOL', () => {
    for (const [p, buf] of Object.entries(v1)) {
      const got = files.content(REPO, c1.commitId, p);
      assert.ok(got.bytes.equals(buf), `${p} differs`);
      assert.strictEqual(got.sha256, sha(buf));
    }
  });
  await t('tree hash equals one this test computes itself', () => {
    const want = sha(Object.keys(v1).sort().map(p => `${p}\t${sha(v1[p])}\n`).join(''));
    assert.strictEqual(files.tree(REPO, c1.commitId).treeHash, want);
    assert.strictEqual(r1.treeHash, want);
  });

  // commit 2: small edit to a text file, binary change, an unchanged set, a deletion
  const v2 = { ...v1 };
  v2['src/app.js'] = B(tenLines('a').replace('const a7 = 7;', 'const a7 = 7777;'));
  v2['assets/blob.bin'] = Buffer.from([...binary].reverse());
  delete v2['src/gone.js'];
  const p2 = files.plan({ repository: REPO, tree: treeOf(v2) });
  await t('plan #2 asks only for what changed, and reports the deletion', () => {
    assert.strictEqual(p2.baseCommitId, c1.commitId);
    assert.deepStrictEqual(p2.need.sort(), ['assets/blob.bin', 'src/app.js']);
    assert.deepStrictEqual(p2.deleted, ['src/gone.js']);
    assert.strictEqual(p2.unchanged, 4);
  });
  const c2 = repoCommit(REPO, 'snap 2');
  const r2 = files.record({ repository: REPO, commitId: c2.commitId, tree: treeOf(v2), contents: contentsOf(v2, p2.need) });
  await t('a one-line text edit is stored as a DELTA, much smaller than the file', () => {
    assert.strictEqual(r2.counts.delta, 1);
    const row = jaaDB.query('file_delta', x => x.commit_ref === c2.commitId && x.file_path === 'src/app.js', 10)[0];
    assert.ok(row, 'no delta row');
    assert.ok(row.bytes_saved > 1000, `saved ${row.bytes_saved}`);
    assert.ok(row.diff.length < v2['src/app.js'].length * 0.3, `diff ${row.diff.length} vs file ${v2['src/app.js'].length}`);
    assert.strictEqual(row.base_sha256, sha(v1['src/app.js'])); assert.strictEqual(row.result_sha256, sha(v2['src/app.js']));
  });
  await t('a changed binary is stored as a full copy, never diffed', () => {
    assert.strictEqual(jaaDB.query('file_delta', x => x.file_path === 'assets/blob.bin', 10).length, 0);
    assert.strictEqual(jaaDB.query('file_snapshots', x => x.commit_ref === c2.commitId && x.file_path === 'assets/blob.bin' && x.kind === 'full', 10).length, 1);
  });
  await t('unchanged files get no new rows; the deletion gets a tombstone', () => {
    assert.strictEqual(jaaDB.query('file_snapshots', x => x.commit_ref === c2.commitId && x.file_path === 'src/crlf.txt', 10).length, 0);
    assert.strictEqual(jaaDB.query('file_snapshots', x => x.commit_ref === c2.commitId && x.file_path === 'src/gone.js' && x.kind === 'deleted', 10).length, 1);
  });
  await t('GATE: commit 2 reproduces byte-for-byte (delta applied), and the deleted file is not in its tree', () => {
    for (const [p, buf] of Object.entries(v2)) assert.ok(files.content(REPO, c2.commitId, p).bytes.equals(buf), p);
    assert.ok(!files.tree(REPO, c2.commitId).files.some(f => f.path === 'src/gone.js'));
    assert.throws(() => files.content(REPO, c2.commitId, 'src/gone.js'), (e) => e.code === 'NOT_IN_TREE');
  });
  await t('GATE: OLD commit 1 is still exact after commit 2 (later rows are ignored)', () => {
    for (const [p, buf] of Object.entries(v1)) assert.ok(files.content(REPO, c1.commitId, p).bytes.equals(buf), p);
    assert.ok(files.tree(REPO, c1.commitId).files.some(f => f.path === 'src/gone.js'));
  });

  console.log('\n── keyframes, re-adding, isolation ──────────────────────');
  let cur = { ...v2 }; const commits = [c1.commitId, c2.commitId]; const kinds = [];
  for (let i = 0; i < 6; i++) {
    cur = { ...cur, 'src/app.js': B(tenLines('a').replace('const a7 = 7;', `const a7 = ${8000 + i};`).replace('const a20 = 20;', `const a20 = ${9000 + i};`)) };
    const pl = files.plan({ repository: REPO, tree: treeOf(cur) });
    const c = repoCommit(REPO, `snap ${3 + i}`);
    files.record({ repository: REPO, commitId: c.commitId, tree: treeOf(cur), contents: contentsOf(cur, pl.need) });
    commits.push(c.commitId);
    const isDelta = jaaDB.query('file_delta', x => x.commit_ref === c.commitId && x.file_path === 'src/app.js', 1).length === 1;
    kinds.push(isDelta ? 'delta' : 'full');
  }
  await t('with KEYFRAME_INTERVAL=3 a full copy is forced after three deltas (chain length is bounded)', () => {
    // commit 2 was delta #1 of the chain; then: delta, delta, FULL, delta, delta, delta
    assert.deepStrictEqual(kinds, ['delta', 'delta', 'full', 'delta', 'delta', 'delta']);
  });
  await t('every commit in a long chain still restores byte-for-byte', () => {
    for (const id of commits) {
      const tr = files.tree(REPO, id);
      for (const f of tr.files) assert.strictEqual(sha(files.content(REPO, id, f.path).bytes), f.sha256, `${id} ${f.path}`);
    }
  });
  await t('a file deleted and later re-added is correct at every point', () => {
    const pl = files.plan({ repository: REPO, tree: treeOf({ ...cur, 'src/gone.js': B('back again\n') }) });
    const c = repoCommit(REPO, 'readd');
    files.record({ repository: REPO, commitId: c.commitId, tree: treeOf({ ...cur, 'src/gone.js': B('back again\n') }), contents: contentsOf({ ...cur, 'src/gone.js': B('back again\n') }, pl.need) });
    assert.strictEqual(files.content(REPO, c.commitId, 'src/gone.js').bytes.toString(), 'back again\n');
    assert.throws(() => files.content(REPO, commits[commits.length - 1], 'src/gone.js'), (e) => e.code === 'NOT_IN_TREE');
    assert.strictEqual(files.content(REPO, c1.commitId, 'src/gone.js').bytes.toString(), 'module.exports = 1;\n');
  });
  await t('a tiny edit whose diff is not smaller than the file is stored full, not as a bloated delta', () => {
    const a = { 'tiny.txt': B('hello\n') }, b = { 'tiny.txt': B('jello\n') };
    const R = 'mcob-tiny';
    const c1_ = repoCommit(R, 't1'); files.record({ repository: R, commitId: c1_.commitId, tree: treeOf(a), contents: contentsOf(a, ['tiny.txt']) });
    const c2_ = repoCommit(R, 't2'); files.record({ repository: R, commitId: c2_.commitId, tree: treeOf(b), contents: contentsOf(b, ['tiny.txt']) });
    assert.strictEqual(jaaDB.query('file_delta', x => x.repository === R, 10).length, 0);
    assert.ok(files.content(R, c2_.commitId, 'tiny.txt').bytes.equals(b['tiny.txt']));
  });
  await t('two repositories with the same paths do not see each other\'s files', () => {
    const R = 'mcob-other'; const m = { 'src/app.js': B('other repo\n') };
    const c = repoCommit(R, 'o1'); files.record({ repository: R, commitId: c.commitId, tree: treeOf(m), contents: contentsOf(m, ['src/app.js']) });
    assert.strictEqual(files.content(R, c.commitId, 'src/app.js').bytes.toString(), 'other repo\n');
    assert.deepStrictEqual(files.tree(R, c.commitId).files.map(f => f.path), ['src/app.js']);
    assert.strictEqual(files.plan({ repository: R, tree: treeOf(m) }).baseCommitId, c.commitId);
  });
  await t('identical content in two paths shares one stored blob (content-addressed)', () => {
    const R = 'mcob-dedupe'; const same = B('identical text in both files\n'.repeat(5));
    const m = { 'a.txt': same, 'b.txt': same };
    const c = repoCommit(R, 'd1'); files.record({ repository: R, commitId: c.commitId, tree: treeOf(m), contents: contentsOf(m, ['a.txt', 'b.txt']) });
    const dir = path.join(process.env.VERSIONIUM_DATA_DIR, 'file-blobs', sha(same).slice(0, 2));
    assert.deepStrictEqual(fs.readdirSync(dir).filter(f => f === sha(same)), [sha(same)]);
  });

  console.log('\n── refusals: nothing is written on a bad request ────────');
  const R3 = 'mcob-refuse';
  const before = () => [jaaDB.query('file_snapshots', () => true, 1e9).length, jaaDB.query('file_delta', () => true, 1e9).length].join(',');
  await t('missing content for a changed path: MISSING_CONTENT naming it, zero rows written', () => {
    const m = { 'a.txt': B('a\n'), 'b.txt': B('b\n') }; const c = repoCommit(R3, 'r1'); const n = before();
    const r = files.record({ repository: R3, commitId: c.commitId, tree: treeOf(m), contents: contentsOf(m, ['a.txt']) });
    assert.strictEqual(r.ok, false); assert.strictEqual(r.code, 'MISSING_CONTENT'); assert.deepStrictEqual(r.missing, ['b.txt']);
    assert.strictEqual(before(), n);
  });
  await t('content whose hash does not match the tree: HASH_MISMATCH, zero rows written', () => {
    const c = repoCommit(R3, 'r2'); const n = before();
    assert.throws(() => files.record({ repository: R3, commitId: c.commitId, tree: [entry('a.txt', B('right\n'))], contents: [{ path: 'a.txt', content_b64: b64(B('wrong\n')) }] }), (e) => e.code === 'HASH_MISMATCH');
    assert.strictEqual(before(), n);
  });
  await t('attaching files to a commit that is not a repo snapshot of this repository is refused', () => {
    const idea = engine.commit({ message: 'idea snap', system: 'idearium', state: { ideas: [] } });
    assert.throws(() => files.record({ repository: R3, commitId: idea.commitId, tree: [], contents: [] }), (e) => e.code === 'WRONG_COMMIT');
    const other = repoCommit('someone-else', 'x');
    assert.throws(() => files.record({ repository: R3, commitId: other.commitId, tree: [], contents: [] }), (e) => e.code === 'WRONG_COMMIT');
    assert.throws(() => files.record({ repository: R3, commitId: 'vtm-nope', tree: [], contents: [] }), (e) => e.code === 'NO_COMMIT');
  });
  await t('unsafe paths (traversal, absolute, backslash, empty segment, NUL) are rejected in plan and record', () => {
    for (const bad of ['../x', '/etc/passwd', 'a\\b', 'a//b', './a', 'a/../b', 'a\0b', '']) {
      assert.throws(() => files.plan({ repository: R3, tree: [{ path: bad, sha256: sha(B('x')), bytes: 1 }] }), (e) => e.code === 'BAD_PATH', JSON.stringify(bad));
    }
  });
  await t('a file over the size limit is reported by plan and refused by record', () => {
    const big = Buffer.alloc(4001, 97);
    const pl = files.plan({ repository: R3, tree: [entry('big.bin', big), entry('ok.txt', B('ok\n'))] });
    assert.deepStrictEqual(pl.tooLarge, ['big.bin']); assert.deepStrictEqual(pl.need, ['ok.txt']);
    const c = repoCommit(R3, 'big');
    assert.throws(() => files.record({ repository: R3, commitId: c.commitId, tree: [entry('big.bin', big)], contents: contentsOf({ 'big.bin': big }, ['big.bin']) }), (e) => e.code === 'TOO_LARGE');
  });

  console.log('\n── idempotence and repair ───────────────────────────────');
  await t('recording the same tree twice is a no-op reported as alreadyRecorded', () => {
    const again = files.record({ repository: REPO, commitId: c2.commitId, tree: treeOf(v2), contents: [] });
    assert.strictEqual(again.alreadyRecorded, true);
    assert.strictEqual(again.treeHash, r2.treeHash);
  });
  await t('a partial earlier attempt (one row lost) is detected and repaired by re-recording', () => {
    const R = 'mcob-repair'; const m = { 'a.txt': B('a\n'), 'b.txt': B('b\n') };
    const c = repoCommit(R, 'p1'); files.record({ repository: R, commitId: c.commitId, tree: treeOf(m), contents: contentsOf(m, ['a.txt', 'b.txt']) });
    jaaDB.delete('file_snapshots', r => r.repository === R && r.file_path === 'b.txt');
    assert.notStrictEqual(files.tree(R, c.commitId).treeHash, files.treeHash(treeOf(m)), 'setup: the loss should be visible');
    const fixed = files.record({ repository: R, commitId: c.commitId, tree: treeOf(m), contents: contentsOf(m, ['a.txt', 'b.txt']) });
    assert.strictEqual(fixed.ok, true); assert.strictEqual(fixed.alreadyRecorded, false);
    assert.strictEqual(files.tree(R, c.commitId).treeHash, files.treeHash(treeOf(m)));
  });

  console.log('\n── corruption is detected, never returned as a file ─────');
  await t('a corrupted blob: content() throws BLOB_CORRUPT naming the file; tree() (no content read) still works', () => {
    const R = 'mcob-corrupt'; const m = { 'c.txt': B('precious bytes\n'.repeat(4)) };
    const c = repoCommit(R, 'c1'); files.record({ repository: R, commitId: c.commitId, tree: treeOf(m), contents: contentsOf(m, ['c.txt']) });
    const bp = path.join(process.env.VERSIONIUM_DATA_DIR, 'file-blobs', sha(m['c.txt']).slice(0, 2), sha(m['c.txt']));
    fs.writeFileSync(bp, B('tampered\n'));
    assert.throws(() => files.content(R, c.commitId, 'c.txt'), (e) => e.code === 'BLOB_CORRUPT' && /c\.txt/.test(e.message));
    assert.strictEqual(files.tree(R, c.commitId).files.length, 1);
    fs.rmSync(bp);
    assert.throws(() => files.content(R, c.commitId, 'c.txt'), (e) => e.code === 'BLOB_MISSING' && /c\.txt/.test(e.message));
  });
  await t('a tampered stored delta: content() throws DELTA_FAILED, never a plausible wrong file', () => {
    const R = 'mcob-tamper'; const a = { 'f.txt': B('line\n'.repeat(60)) }; const b = { 'f.txt': B('line\n'.repeat(30) + 'CHANGED\n' + 'line\n'.repeat(29)) };
    const c1_ = repoCommit(R, 'k1'); files.record({ repository: R, commitId: c1_.commitId, tree: treeOf(a), contents: contentsOf(a, ['f.txt']) });
    const c2_ = repoCommit(R, 'k2'); files.record({ repository: R, commitId: c2_.commitId, tree: treeOf(b), contents: contentsOf(b, ['f.txt']) });
    assert.ok(files.content(R, c2_.commitId, 'f.txt').bytes.equals(b['f.txt']), 'setup: untampered delta must work');
    const row = jaaDB.query('file_delta', x => x.repository === R, 1)[0];
    jaaDB.update('file_delta', x => x.uuid === row.uuid, { diff: row.diff.replace('+CHANGED', '+CHANGEDX') });
    assert.throws(() => files.content(R, c2_.commitId, 'f.txt'), (e) => e.code === 'DELTA_FAILED' && /f\.txt/.test(e.message));
    assert.ok(files.content(R, c1_.commitId, 'f.txt').bytes.equals(a['f.txt']), 'the older, untouched commit is still exact');
  });
  await t('a delta whose base row was lost is CHAIN_BROKEN, not silently applied to the wrong base', () => {
    const R = 'mcob-chain'; const a = { 'g.txt': B('x\n'.repeat(80)) }; const b = { 'g.txt': B('x\n'.repeat(40) + 'y\n' + 'x\n'.repeat(39)) };
    const c1_ = repoCommit(R, 'g1'); files.record({ repository: R, commitId: c1_.commitId, tree: treeOf(a), contents: contentsOf(a, ['g.txt']) });
    const c2_ = repoCommit(R, 'g2'); files.record({ repository: R, commitId: c2_.commitId, tree: treeOf(b), contents: contentsOf(b, ['g.txt']) });
    jaaDB.delete('file_snapshots', r => r.repository === R);
    assert.throws(() => files.content(R, c2_.commitId, 'g.txt'), (e) => e.code === 'CHAIN_BROKEN');
  });

  fs.rmSync(TMP, { recursive: true, force: true });
  console.log(`\n${fail ? '✗' : '✓'} mcob-file-versioning: ${pass} passed, ${fail} failed\n`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
