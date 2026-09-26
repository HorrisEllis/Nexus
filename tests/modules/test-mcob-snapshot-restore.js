'use strict';
/**
 * tests/modules/test-mcob-snapshot-restore.js — idearium/repo/snapshot-files.js,
 * snapshot.js (file layer) and snapshot-restore.js (MCO-B).
 *
 * §12.2 — a real repo directory, the real import pipeline, the real
 * versionium files layer and engine (in-process, isolated dirs). The one
 * stand-in is the RepoLayer object restore writes through: a small class that
 * writes real files to the repo directory, because the real RepoLayer needs
 * the spec-engine. That is exactly what restore's own final check is for: it
 * re-reads the DISK. The real RepoLayer is exercised over real HTTP in the
 * end-to-end run recorded in CHANGELOG-0.39.176.md.
 *
 * The centre of it: restore, then UNDO the restore from the pre-restore
 * snapshot, and compare bytes with Buffer.equals().
 */
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.join(__dirname, '../..');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'mcob-idearium-'));
process.env.VERSIONIUM_DATA_DIR = path.join(TMP, 'v');
process.env.JAA_DATA_DIR = path.join(TMP, 'c');
process.env.VERSIONIUM_FILE_MAX_BYTES = '3000';

let pass = 0, fail = 0;
async function t(name, fn) {
  try { await fn(); pass++; console.log(`  ✓ ${name}`); }
  catch (e) { fail++; console.log(`  ✗ ${name}\n      ${e.stack ? e.stack.split('\n').slice(0, 3).join('\n      ') : e.message}`); }
}
const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');

(async () => {
  const pipeline = await import(path.join(ROOT, 'idearium/repo/import-pipeline.js'));
  const verifyLazy = await import(path.join(ROOT, 'idearium/repo/verify-lazy.js'));
  const snap = await import(path.join(ROOT, 'idearium/repo/snapshot.js'));
  const sf = await import(path.join(ROOT, 'idearium/repo/snapshot-files.js'));
  const restore = await import(path.join(ROOT, 'idearium/repo/snapshot-restore.js'));
  const workQueue = require(path.join(ROOT, 'lib/work-queue.js'));
  const engine = require(path.join(ROOT, 'versionium/lib/engine.js'));
  const files = require(path.join(ROOT, 'versionium/lib/files.js'));
  const { jaaDB } = require(path.join(ROOT, 'versionium/lib/store.js'));

  const NODE_DIR = path.join(ROOT, 'idearium/data/nodes/repository');
  const uuids = [];
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'mcob-repo-'));

  // ── a real repo on disk ─────────────────────────────────────────────────
  const BIN = Buffer.from([0, 1, 2, 250, 251, 0, 255]);
  const BASE = {
    'src/app.js': Buffer.from("const { b } = require('./b.js');\r\nmodule.exports = { a: b + 1 };\r\n"), // CRLF
    'src/b.js': Buffer.from('const b = 2;\nmodule.exports = { b };\n'),
    'src/noeol.txt': Buffer.from('no trailing newline'),
    'docs/日本語.md': Buffer.from('# 日本語\n\nüñí\n'),
    'assets/logo.bin': BIN,
    'package.json': Buffer.from(JSON.stringify({ name: 'r', dependencies: {} })),
  };
  function makeRepo(name, fileMap) {
    const dir = path.join(tmpRoot, name); uuids.push(name);
    for (const [rel, b] of Object.entries(fileMap)) { fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true }); fs.writeFileSync(path.join(dir, rel), b); }
    return { repo: { uuid: name, name, files: Object.keys(fileMap).map(p => ({ path: p })) }, dir };
  }
  const index = async (r) => { pipeline.runImportPipeline(r.repo, r.dir); await workQueue.get(verifyLazy.QUEUE_NAME).drain(); };

  // the in-process stand-ins for the HTTP transports
  const fileLayerFor = (repo, over = {}) => ({
    limits: async () => files.limits(),
    plan: async (tree) => files.plan({ repository: repo.uuid, tree }),
    record: async ({ commitId, tree, contents }) => files.record({ repository: repo.uuid, commitId, tree, contents }),
    ...over,
  });
  const layerFor = (repo) => ({
    limits: async () => files.limits(),
    tree: async (id) => files.tree(repo.uuid, id),
    content: async (id, p) => files.content(repo.uuid, id, p),
  });
  const commitFn = (payload) => engine.commit(payload);
  const take = (r, over = {}) => snap.commitRepoSnapshot({ repo: r.repo, repoDir: r.dir, commit: commitFn, fileLayer: fileLayerFor(r.repo), ...over });

  // A RepoLayer stand-in: writes REAL files into the repo directory.
  class FakeRepoLayer {
    constructor(r, { ignore = [], sourceOwned = null } = {}) { this.r = r; this.ignore = new Set(ignore); this.calls = []; this.refreshed = 0; this.owned = sourceOwned ? new Set(sourceOwned) : null; }
    // the source layer (an imported project's real files) — only when asked for
    isSourceOwned(u, p) { return !!this.owned && this.owned.has(p); }
    writeSourceBytes(u, p, buf) { this.calls.push(['sourcewrite', p, false]); if (this.ignore.has(p)) return { ok: true }; const abs = path.join(this.r.dir, p); fs.mkdirSync(path.dirname(abs), { recursive: true }); fs.writeFileSync(abs, buf); return { ok: true }; }
    deleteSourceFile(u, p) { this.calls.push(['sourcedelete', p, false]); fs.rmSync(path.join(this.r.dir, p), { force: true }); return { ok: true }; }
    writeFile(uuid, p, text, opts) {
      this.calls.push(['write', p, !!(opts && opts.defer)]);
      if (this.ignore.has(p)) return { ok: true }; // claims success, changes nothing
      const abs = path.join(this.r.dir, p); fs.mkdirSync(path.dirname(abs), { recursive: true }); fs.writeFileSync(abs, text, 'utf8');
      if (!this.r.repo.files.some(f => f.path === p)) this.r.repo.files.push({ path: p });
      return { ok: true };
    }
    deleteFile(uuid, p, opts) {
      this.calls.push(['delete', p, !!(opts && opts.defer)]);
      const abs = path.join(this.r.dir, p);
      if (!fs.existsSync(abs)) return { error: `file not found in repo: ${p}` };
      fs.rmSync(abs); this.r.repo.files = this.r.repo.files.filter(f => f.path !== p); return { ok: true };
    }
    refresh() { this.refreshed++; }
    get() { return this.r.repo; }
  }
  const disk = (r, p) => fs.readFileSync(path.join(r.dir, p));
  const restoreOf = (r, commitId, record, over = {}) => restore.restoreRepoSnapshot({
    repo: r.repo, repoDir: r.dir, commitId, record, layer: layerFor(r.repo), repoLayer: new FakeRepoLayer(r),
    takeSnapshot: () => take(r), dryRun: false, ...over,
  });

  console.log('\n── snapshot with a file layer ───────────────────────────');
  const A = makeRepo('mcob-a', BASE);
  fs.writeFileSync(path.join(A.dir, 'big.dat'), Buffer.alloc(3001, 7));         // over the 3000 cap
  A.repo.files.push({ path: 'big.dat' }, { path: 'ghost.txt' }, { path: '../escape.txt' });
  fs.symlinkSync(path.join(A.dir, 'src/b.js'), path.join(A.dir, 'link.js')); A.repo.files.push({ path: 'link.js' });
  await index(A);
  const s1 = await take(A, { message: 'first' });

  await t('a snapshot with a file layer commits and records the tree', () => {
    assert.strictEqual(s1.ok, true, s1.error);
    assert.ok(s1.record.files); assert.strictEqual(s1.record.files.layer, 'versionium');
    assert.strictEqual(s1.files.ok, true);
  });
  await t('the recorded tree hash equals one this test computes from the bytes on disk', () => {
    const want = sha(Object.keys(BASE).sort().map(p => `${p}\t${sha(BASE[p])}\n`).join(''));
    assert.strictEqual(s1.record.files.treeHash, want);
    assert.strictEqual(files.tree(A.repo.uuid, s1.commit.commitId).treeHash, want);
    assert.strictEqual(s1.record.files.fileCount, Object.keys(BASE).length);
  });
  await t('idearium\'s treeHashOf and versionium\'s treeHash agree on the same entries', () => {
    const entries = Object.entries(BASE).map(([p, b]) => ({ path: p, sha256: sha(b), bytes: b.length }));
    assert.strictEqual(sf.treeHashOf(entries), files.treeHash(entries));
  });
  await t('files that cannot be captured are LISTED with a reason and are NOT in the tree', () => {
    const sk = Object.fromEntries(s1.record.files.skipped.map(x => [x.path, x.reason]));
    assert.ok(/per-file limit/.test(sk['big.dat']), JSON.stringify(sk));
    assert.ok(/not on disk/.test(sk['ghost.txt']));
    assert.ok(/unsafe/.test(sk['../escape.txt']));
    assert.ok(/not a regular file/.test(sk['link.js']));
    const inTree = files.tree(A.repo.uuid, s1.commit.commitId).files.map(f => f.path);
    for (const p of ['big.dat', 'ghost.txt', '../escape.txt', 'link.js']) assert.ok(!inTree.includes(p), p);
  });
  await t('every captured file comes back byte-for-byte from versionium', () => {
    for (const [p, b] of Object.entries(BASE)) assert.ok(files.content(A.repo.uuid, s1.commit.commitId, p).bytes.equals(b), p);
  });
  await t('the list shows the snapshot has files; the MCO3 record fields are all still there', () => {
    const rows = [{ ...s1.commit, wall: 1 }];
    const list = snap.summarizeRepoSnapshots(rows, A.repo.uuid);
    assert.deepStrictEqual(list[0].files, { count: Object.keys(BASE).length, bytes: Object.values(BASE).reduce((n, b) => n + b.length, 0) });
    assert.deepStrictEqual(snap.verifyMustRecord(s1.record), { complete: true, missing: [] });
  });

  console.log('\n── refusals happen BEFORE any commit ────────────────────');
  const commitCount = () => jaaDB.query('versionium_commits', () => true, 1e9).length;
  await t('changed content over the per-snapshot limit: FILES_TOO_BIG, no commit made', async () => {
    const before = commitCount();
    const r = await take(A, { fileLayer: fileLayerFor(A.repo, { limits: async () => ({ ...files.limits(), maxRecordBytes: 5 }) }), message: 'x' });
    // nothing changed since s1 -> need is empty -> under any limit; so change a file first
    fs.appendFileSync(path.join(A.dir, 'src/b.js'), '// changed\n');
    const r2 = await take(A, { fileLayer: fileLayerFor(A.repo, { limits: async () => ({ ...files.limits(), maxRecordBytes: 5 }) }), message: 'x' });
    assert.strictEqual(r2.ok, false); assert.strictEqual(r2.code, 'FILES_TOO_BIG');
    assert.strictEqual(commitCount(), before + (r.ok ? 1 : 0));
    fs.writeFileSync(path.join(A.dir, 'src/b.js'), BASE['src/b.js']); // put it back
  });
  await t('the file layer failing at plan time: FILES_PLAN_FAILED, no commit made', async () => {
    const before = commitCount();
    const r = await take(A, { fileLayer: fileLayerFor(A.repo, { plan: async () => { throw new Error('versionium unreachable'); } }) });
    assert.strictEqual(r.ok, false); assert.strictEqual(r.code, 'FILES_PLAN_FAILED'); assert.ok(/no snapshot was made/.test(r.error));
    assert.strictEqual(commitCount(), before);
  });

  console.log('\n── commit made, file record failed ──────────────────────');
  const F = makeRepo('mcob-f', BASE); await index(F);
  const sF = await take(F, { fileLayer: fileLayerFor(F.repo, { record: async () => { throw new Error('disk full'); } }) });
  await t('reports FILES_RECORD_FAILED, keeps the commit, says it cannot restore', () => {
    assert.strictEqual(sF.ok, false); assert.strictEqual(sF.code, 'FILES_RECORD_FAILED');
    assert.ok(sF.commit && sF.commit.commitId); assert.ok(/cannot restore/.test(sF.error));
  });
  await t('restoring that snapshot is refused (FILE_LAYER_MISMATCH), nothing touched', async () => {
    const before = fs.readFileSync(path.join(F.dir, 'src/b.js'));
    const r = await restoreOf(F, sF.commit.commitId, sF.record);
    assert.strictEqual(r.ok, false); assert.strictEqual(r.code, 'FILE_LAYER_MISMATCH');
    assert.ok(disk(F, 'src/b.js').equals(before));
  });
  await t('a snapshot taken WITHOUT a file layer (MCO3 style) has no files and cannot restore', async () => {
    const s = await snap.commitRepoSnapshot({ repo: F.repo, repoDir: F.dir, commit: commitFn });
    assert.strictEqual(s.ok, true); assert.strictEqual(s.record.files, undefined);
    const r = await restoreOf(F, s.commit.commitId, s.record);
    assert.strictEqual(r.code, 'NO_FILE_LAYER');
  });

  console.log('\n── restore: dry run, real restore, undo ─────────────────');
  const R = makeRepo('mcob-r', BASE); await index(R);
  const sR = await take(R, { message: 'the state to return to' });
  // now drift: edit a text file, delete one, add one (binary untouched)
  fs.writeFileSync(path.join(R.dir, 'src/b.js'), 'const b = 999;\nmodule.exports = { b };\n');
  fs.rmSync(path.join(R.dir, 'docs/日本語.md')); R.repo.files = R.repo.files.filter(f => f.path !== 'docs/日本語.md');
  fs.writeFileSync(path.join(R.dir, 'src/new.js'), 'module.exports = "new";\n'); R.repo.files.push({ path: 'src/new.js' });
  const DRIFT = {}; for (const f of R.repo.files) DRIFT[f.path] = disk(R, f.path);

  await t('dry run: reports write/delete/unchanged and changes nothing', async () => {
    const fake = new FakeRepoLayer(R);
    const r = await restoreOf(R, sR.commit.commitId, sR.record, { dryRun: true, repoLayer: fake });
    assert.strictEqual(r.ok, true); assert.strictEqual(r.dryRun, true); assert.strictEqual(r.restorable, true);
    assert.deepStrictEqual(r.plan.write.sort(), ['docs/日本語.md', 'src/b.js']);
    assert.deepStrictEqual(r.plan.delete, ['src/new.js']);
    assert.strictEqual(r.plan.unchanged, Object.keys(BASE).length - 2);
    assert.deepStrictEqual(fake.calls, []);
    for (const [p, b] of Object.entries(DRIFT)) assert.ok(disk(R, p).equals(b), `${p} changed by a dry run`);
  });

  const fakeR = new FakeRepoLayer(R);
  const res = await restoreOf(R, sR.commit.commitId, sR.record, { repoLayer: fakeR });
  await t('restore writes only what differs, deletes only what is extra, batched (defer) then refreshed ONCE', () => {
    assert.strictEqual(res.ok, true, JSON.stringify(res.failures) + JSON.stringify(res.mismatches));
    assert.deepStrictEqual(fakeR.calls.map(c => `${c[0]} ${c[1]}`).sort(), ['delete src/new.js', 'write docs/日本語.md', 'write src/b.js']);
    assert.ok(fakeR.calls.every(c => c[2] === true), 'every call must pass {defer:true}');
    assert.strictEqual(fakeR.refreshed, 1);
  });
  await t('GATE: after restore every snapshot file is byte-for-byte what it was (Buffer.equals), incl. CRLF, no-EOL, unicode, binary', () => {
    for (const [p, b] of Object.entries(BASE)) assert.ok(disk(R, p).equals(b), p);
    assert.ok(!fs.existsSync(path.join(R.dir, 'src/new.js')));
    assert.strictEqual(res.verified, true); assert.strictEqual(res.treeMatches, true);
  });
  await t('a pre-restore snapshot was taken first, WITH its own file layer', () => {
    assert.ok(res.preRestoreCommitId);
    const tr = files.tree(R.repo.uuid, res.preRestoreCommitId);
    assert.ok(tr.files.some(f => f.path === 'src/new.js'), 'the pre-restore tree should hold the drifted file');
  });
  await t('GATE: UNDO — restoring the pre-restore snapshot returns the drifted state byte-for-byte', async () => {
    const preRec = jaaDB.get('versionium_commits', { commitId: res.preRestoreCommitId }).state;
    const undo = await restoreOf(R, res.preRestoreCommitId, preRec);
    assert.strictEqual(undo.ok, true, JSON.stringify(undo.mismatches));
    const now = {}; for (const f of R.repo.files) now[f.path] = disk(R, f.path);
    assert.deepStrictEqual(Object.keys(now).sort(), Object.keys(DRIFT).sort());
    for (const [p, b] of Object.entries(DRIFT)) assert.ok(now[p].equals(b), p);
  });
  await t('restoring when nothing differs is a no-op: changed:false and NO pre-restore snapshot', async () => {
    await restoreOf(R, sR.commit.commitId, sR.record); // back to the snapshot state
    const before = commitCount();
    const again = await restoreOf(R, sR.commit.commitId, sR.record);
    assert.strictEqual(again.ok, true); assert.strictEqual(again.changed, false);
    assert.strictEqual(commitCount(), before);
  });

  console.log('\n── honesty when restore cannot do what was asked ────────');
  const H = makeRepo('mcob-h', BASE); await index(H);
  const sH = await take(H);
  fs.writeFileSync(path.join(H.dir, 'src/b.js'), 'drift\n');
  await t('a repo layer that CLAIMS success but did not write: verified:false, ok:false, names the file and the way back', async () => {
    const r = await restoreOf(H, sH.commit.commitId, sH.record, { repoLayer: new FakeRepoLayer(H, { ignore: ['src/b.js'] }) });
    assert.strictEqual(r.ok, false); assert.strictEqual(r.verified, false);
    assert.deepStrictEqual(r.mismatches.map(m => m.path), ['src/b.js']);
    assert.ok(r.preRestoreCommitId && r.note.includes(r.preRestoreCommitId));
  });
  fs.writeFileSync(path.join(H.dir, 'src/b.js'), 'drift again\n');
  await t('a failed pre-restore snapshot stops the restore before it writes anything', async () => {
    const fake = new FakeRepoLayer(H);
    const r = await restoreOf(H, sH.commit.commitId, sH.record, { repoLayer: fake, takeSnapshot: async () => ({ ok: false, error: 'versionium down' }) });
    assert.strictEqual(r.ok, false); assert.strictEqual(r.code, 'PRE_SNAPSHOT_FAILED');
    assert.deepStrictEqual(fake.calls, []);
    assert.strictEqual(disk(H, 'src/b.js').toString(), 'drift again\n');
  });
  fs.writeFileSync(path.join(H.dir, 'assets/logo.bin'), Buffer.from([9, 9, 0, 9])); // binary changed since
  await t('a changed BINARY blocks the restore whole, names it, and writes nothing (dry run says restorable:false)', async () => {
    const dry = await restoreOf(H, sH.commit.commitId, sH.record, { dryRun: true });
    assert.strictEqual(dry.restorable, false); assert.deepStrictEqual(dry.plan.blocked.map(b => b.path), ['assets/logo.bin']);
    const fake = new FakeRepoLayer(H); const before = commitCount();
    const r = await restoreOf(H, sH.commit.commitId, sH.record, { repoLayer: fake });
    assert.strictEqual(r.ok, false); assert.strictEqual(r.code, 'BLOCKED');
    assert.deepStrictEqual(fake.calls, []); assert.strictEqual(commitCount(), before, 'no pre-restore snapshot for a refused restore');
  });
  await t('a delete the repo layer rejects is reported as a failure, not swallowed', async () => {
    const H2 = makeRepo('mcob-h2', BASE); await index(H2);
    const s = await take(H2);
    fs.writeFileSync(path.join(H2.dir, 'extra.txt'), 'x\n'); H2.repo.files.push({ path: 'extra.txt' });
    const fake = new FakeRepoLayer(H2); fake.deleteFile = () => ({ error: 'file not found in repo: extra.txt' });
    const r = await restoreOf(H2, s.commit.commitId, s.record, { repoLayer: fake });
    assert.strictEqual(r.ok, false); assert.deepStrictEqual(r.failures.map(f => f.path), ['extra.txt']);
  });
  await t('a file too big to track now is left alone by a restore, and reported', async () => {
    const K = makeRepo('mcob-k', { 'a.txt': Buffer.from('a\n'), 'huge.dat': Buffer.alloc(3500, 1) });
    await index(K);
    const s = await take(K);
    assert.ok(s.record.files.skipped.some(x => x.path === 'huge.dat'));
    fs.writeFileSync(path.join(K.dir, 'a.txt'), 'changed\n');
    const r = await restoreOf(K, s.commit.commitId, s.record);
    assert.strictEqual(r.ok, true);
    assert.ok(fs.existsSync(path.join(K.dir, 'huge.dat')), 'huge.dat was deleted');
    assert.ok(r.plan.leftAlone.tooLargeNow.includes('huge.dat'));
    assert.strictEqual(disk(K, 'a.txt').toString(), 'a\n');
  });
  await t('a file the snapshot SKIPPED that is trackable NOW (shrunk since) is protected from deletion, not treated as "extra"', async () => {
    const K2 = makeRepo('mcob-k2', { 'a.txt': Buffer.from('a\n'), 'was-huge.dat': Buffer.alloc(3500, 1) });
    await index(K2);
    const s = await take(K2);
    assert.ok(s.record.files.skipped.some(x => x.path === 'was-huge.dat'));
    fs.writeFileSync(path.join(K2.dir, 'was-huge.dat'), 'small now\n');   // now under the cap, still not in the snapshot's tree
    fs.writeFileSync(path.join(K2.dir, 'a.txt'), 'changed\n');
    const r = await restoreOf(K2, s.commit.commitId, s.record);
    assert.strictEqual(r.ok, true, JSON.stringify(r.mismatches));
    assert.strictEqual(disk(K2, 'was-huge.dat').toString(), 'small now\n', 'a file the snapshot never captured was deleted');
    assert.ok(r.plan.leftAlone.notInSnapshotButProtected.includes('was-huge.dat'));
    assert.ok(!r.plan.delete.includes('was-huge.dat'));
  });
  await t('a file the snapshot recorded as NOT ON DISK, present now, IS deleted by a restore (it did not exist then)', async () => {
    const Z = makeRepo('mcob-z', { 'a.txt': Buffer.from('a\n') }); Z.repo.files.push({ path: 'listed-but-absent.txt' });
    await index(Z);
    const s = await take(Z);
    assert.ok(s.record.files.skipped.some(x => x.path === 'listed-but-absent.txt' && /not on disk/.test(x.reason)));
    fs.writeFileSync(path.join(Z.dir, 'listed-but-absent.txt'), 'appeared later\n');
    const r = await restoreOf(Z, s.commit.commitId, s.record);
    assert.strictEqual(r.ok, true, JSON.stringify(r.mismatches));
    assert.ok(!fs.existsSync(path.join(Z.dir, 'listed-but-absent.txt')), 'a file that did not exist at the snapshot survived the restore');
  });
  await t('a snapshot id that is not one of this repo\'s (wrong tree hash) restores nothing', async () => {
    const other = makeRepo('mcob-o', { 'z.txt': Buffer.from('z\n') }); await index(other);
    const so = await take(other);
    const r = await restoreOf(H, so.commit.commitId, sH.record); // record from H, tree from another repo's commit
    assert.strictEqual(r.ok, false);
    assert.ok(['FILE_LAYER_MISMATCH', 'FILE_LAYER_UNAVAILABLE'].includes(r.code), r.code);
  });

  console.log('\n── source-owned files (an imported project\'s real files) ─');
  const S = makeRepo('mcob-s', BASE); await index(S);
  const sS = await take(S);
  const OWN = Object.keys(BASE); // pretend the whole tree is source-owned, as an imported zip's is
  fs.writeFileSync(path.join(S.dir, 'assets/logo.bin'), Buffer.from([7, 7, 0, 7]));            // a binary changed
  fs.writeFileSync(path.join(S.dir, 'src/b.js'), 'const b = 555;\n');                           // a text file changed
  fs.rmSync(path.join(S.dir, 'src/noeol.txt'));                                                 // a file removed
  await t('dry run: a source-owned binary is RESTORABLE (not blocked) and the plan says it goes via the source layer', async () => {
    const dry = await restoreOf(S, sS.commit.commitId, sS.record, { dryRun: true, repoLayer: new FakeRepoLayer(S, { sourceOwned: OWN }) });
    assert.strictEqual(dry.restorable, true, JSON.stringify(dry.plan.blocked));
    assert.deepStrictEqual(dry.plan.blocked, []);
    assert.deepStrictEqual(dry.plan.viaSourceLayer.sort(), ['assets/logo.bin', 'src/b.js', 'src/noeol.txt']);
  });
  await t('the SAME change on a repo with no source layer is still BLOCKED by the binary', async () => {
    const dry = await restoreOf(S, sS.commit.commitId, sS.record, { dryRun: true, repoLayer: new FakeRepoLayer(S) });
    assert.strictEqual(dry.restorable, false); assert.deepStrictEqual(dry.plan.blocked.map(b => b.path), ['assets/logo.bin']);
  });
  const fakeS = new FakeRepoLayer(S, { sourceOwned: OWN });
  const rS = await restoreOf(S, sS.commit.commitId, sS.record, { repoLayer: fakeS });
  await t('restore writes source-owned files as BYTES (binary included) and keeps a text file\'s chunk in step', () => {
    assert.strictEqual(rS.ok, true, JSON.stringify(rS.mismatches) + JSON.stringify(rS.failures));
    const kinds = Object.fromEntries(fakeS.calls.map(c => [c[1], c[0]]));
    assert.ok(fakeS.calls.some(c => c[0] === 'sourcewrite' && c[1] === 'assets/logo.bin'));
    assert.ok(fakeS.calls.some(c => c[0] === 'write' && c[1] === 'src/b.js' && c[2] === true), 'text chunk not synced');
    assert.ok(!fakeS.calls.some(c => c[0] === 'write' && c[1] === 'assets/logo.bin'), 'a binary must never go to the chunk store');
    assert.ok(kinds['src/noeol.txt']);
  });
  await t('GATE: the binary, the edited text and the removed file are all byte-for-byte back, verified against disk', () => {
    for (const [p, b] of Object.entries(BASE)) assert.ok(disk(S, p).equals(b), p);
    assert.strictEqual(rS.verified, true);
  });
  await t('a source-owned file added after the snapshot is deleted through the source layer', async () => {
    fs.writeFileSync(path.join(S.dir, 'extra.dat'), Buffer.from([1, 2, 3])); S.repo.files.push({ path: 'extra.dat' });
    const f = new FakeRepoLayer(S, { sourceOwned: [...OWN, 'extra.dat'] });
    const r = await restoreOf(S, sS.commit.commitId, sS.record, { repoLayer: f });
    assert.strictEqual(r.ok, true, JSON.stringify(r.mismatches));
    assert.ok(f.calls.some(c => c[0] === 'sourcedelete' && c[1] === 'extra.dat'));
    assert.ok(!fs.existsSync(path.join(S.dir, 'extra.dat')));
  });

  fs.rmSync(TMP, { recursive: true, force: true }); fs.rmSync(tmpRoot, { recursive: true, force: true });
  for (const u of uuids) fs.rmSync(path.join(NODE_DIR, `${u}.repository`), { force: true });
  console.log(`\n${fail ? '✗' : '✓'} mcob-snapshot-restore: ${pass} passed, ${fail} failed\n`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
