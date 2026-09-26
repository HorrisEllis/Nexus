'use strict';
/**
 * tests/modules/test-mcoc-import-baseline.js — the MCO-C hook
 * (idearium/repo/import-baseline.js) and the snapshot_mode / import_baseline
 * config it and MCO-B now read.
 *
 * Real pipeline, real snapshot library, real versionium engine + file layer
 * (in-process, isolated dirs). The hook's wiring into the API import routes is
 * exercised over real HTTP with a real zip (CHANGELOG-0.39.177.md).
 */
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.join(__dirname, '../..');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'mcoc-'));
process.env.VERSIONIUM_DATA_DIR = path.join(TMP, 'v');
process.env.JAA_DATA_DIR = path.join(TMP, 'c');

let pass = 0, fail = 0;
async function t(name, fn) {
  try { await fn(); pass++; console.log(`  ✓ ${name}`); }
  catch (e) { fail++; console.log(`  ✗ ${name}\n      ${e.stack ? e.stack.split('\n').slice(0, 3).join('\n      ') : e.message}`); }
}
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

(async () => {
  const pipeline = await import(path.join(ROOT, 'idearium/repo/import-pipeline.js'));
  const verifyLazy = await import(path.join(ROOT, 'idearium/repo/verify-lazy.js'));
  const snap = await import(path.join(ROOT, 'idearium/repo/snapshot.js'));
  const base = await import(path.join(ROOT, 'idearium/repo/import-baseline.js'));
  const workQueue = require(path.join(ROOT, 'lib/work-queue.js'));
  const engine = require(path.join(ROOT, 'versionium/lib/engine.js'));
  const files = require(path.join(ROOT, 'versionium/lib/files.js'));
  const { jaaDB } = require(path.join(ROOT, 'versionium/lib/store.js'));
  const core = require(path.join(ROOT, 'idearium/lib/config-core.cjs'));

  const NODE_DIR = path.join(ROOT, 'idearium/data/nodes/repository');
  const uuids = []; const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'mcoc-repo-'));
  const big = (tag) => Array.from({ length: 40 }, (_, i) => `const ${tag}${i} = ${i}; // a reasonably long line of source text\n`).join('');
  async function makeRepo(name, fileMap) {
    const dir = path.join(tmpRoot, name); uuids.push(name);
    for (const [rel, b] of Object.entries(fileMap)) { fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true }); fs.writeFileSync(path.join(dir, rel), b); }
    const repo = { uuid: name, name, files: Object.keys(fileMap).map(p => ({ path: p })) };
    pipeline.runImportPipeline(repo, dir); await workQueue.get(verifyLazy.QUEUE_NAME).drain();
    return { repo, dir };
  }
  const fileLayerFor = (repo) => ({
    limits: async () => files.limits(),
    plan: async (tree) => files.plan({ repository: repo.uuid, tree }),
    record: async ({ commitId, tree, contents, mode }) => files.record({ repository: repo.uuid, commitId, tree, contents, mode }),
  });
  const commitFn = async (payload) => { await sleep(3); return engine.commit(payload); };
  const rowsFor = (uuid) => jaaDB.query('versionium_commits', r => r.system === snap.SNAPSHOT_SYSTEM && r.state && r.state.repository === uuid, 1e9);
  const wire = (r, over = {}) => ({
    repo: r.repo, repoDir: r.dir, reason: 'test',
    listSnapshots: async () => snap.summarizeRepoSnapshots(rowsFor(r.repo.uuid), r.repo.uuid),
    takeSnapshot: ({ message }) => snap.commitRepoSnapshot({ repo: r.repo, repoDir: r.dir, message, commit: commitFn, fileLayer: fileLayerFor(r.repo) }),
    ...over,
  });

  console.log('\n── the baseline hook ────────────────────────────────────');
  const A = await makeRepo('mcoc-a', { 'src/a.js': big('a'), 'src/b.js': big('b'), 'README.md': '# hi\n', 'assets/x.bin': Buffer.from([0, 1, 2, 3, 255]) });
  const r1 = await base.ensureBaselineSnapshot(wire(A, { reason: 'import-archive' }));
  await t('a repo with no snapshots gets ONE baseline, with a file layer holding every materialized file', () => {
    assert.strictEqual(r1.status, 'taken', JSON.stringify(r1));
    const rows = rowsFor('mcoc-a'); assert.strictEqual(rows.length, 1);
    assert.strictEqual(rows[0].message, 'baseline: import-archive');
    const tr = files.tree('mcoc-a', rows[0].commitId);
    assert.deepStrictEqual(tr.files.map(f => f.path).sort(), ['README.md', 'assets/x.bin', 'src/a.js', 'src/b.js']);
    assert.strictEqual(tr.treeHash, rows[0].state.files.treeHash);
  });
  await t('GATE: every file in the baseline comes back byte-for-byte from versionium (incl. the binary)', () => {
    const id = rowsFor('mcoc-a')[0].commitId;
    for (const f of A.repo.files) assert.ok(files.content('mcoc-a', id, f.path).bytes.equals(fs.readFileSync(path.join(A.dir, f.path))), f.path);
  });
  await t('the baseline records test state as PENDING when the lazy pass had not finished', async () => {
    const B = await makeRepo('mcoc-pending', { 'p.js': 'module.exports = 1;\n' });
    // The lazy queue is fire-and-forget and finishes within a few ticks, so a
    // re-index followed by awaits cannot hold it at 'pending' deterministically.
    // Put back exactly the artifact scheduleLazyVerification() writes at
    // schedule time (verify-lazy.js) and snapshot against that.
    fs.writeFileSync(path.join(B.dir, 'verification.lazy.json'), JSON.stringify({ repository: B.repo.uuid, status: 'pending', scopedTo: ['p.js'], scheduledAt: Date.now() }));
    const r = await base.ensureBaselineSnapshot(wire(B));
    assert.strictEqual(r.status, 'taken');
    const rec = rowsFor('mcoc-pending')[0].state.mustRecord;
    assert.strictEqual(rec.testState.available, false); assert.strictEqual(rec.testState.status, 'pending');
  });
  await t('an IMPORTED repo\'s source-layer files (a binary that is not in repo.files) are captured in the baseline', async () => {
    const sourceFiles = await import(path.join(ROOT, 'idearium/repo/source-files.js'));
    const dir = path.join(tmpRoot, 'mcoc-src'); uuids.push('mcoc-src');
    const bin = Buffer.from([0, 1, 2, 250, 255, 0, 7]);
    const w = sourceFiles.writeSourceFiles(dir, [
      { path: 'proj/src/a.js', buffer: Buffer.from('module.exports = 1;\n') },
      { path: 'proj/assets/logo.bin', buffer: bin },
    ]);
    assert.strictEqual(w.ok, true);
    const repo = { uuid: 'mcoc-src', name: 'src', files: [{ path: 'proj/src/a.js' }] }; // chunk list has NO binary, as an imported repo's does
    pipeline.runImportPipeline(repo, dir); await workQueue.get(verifyLazy.QUEUE_NAME).drain();
    const r = await base.ensureBaselineSnapshot({ repo, repoDir: dir, listSnapshots: async () => [], takeSnapshot: ({ message }) => snap.commitRepoSnapshot({ repo, repoDir: dir, message, commit: commitFn, fileLayer: fileLayerFor(repo) }) });
    assert.strictEqual(r.status, 'taken', JSON.stringify(r));
    const id = rowsFor('mcoc-src')[0].commitId;
    assert.deepStrictEqual(files.tree('mcoc-src', id).files.map(f => f.path).sort(), ['proj/assets/logo.bin', 'proj/src/a.js']);
    assert.ok(files.content('mcoc-src', id, 'proj/assets/logo.bin').bytes.equals(bin));
  });
  await t('a second call finds the existing snapshot and takes nothing', async () => {
    let called = false;
    const r = await base.ensureBaselineSnapshot(wire(A, { takeSnapshot: async () => { called = true; return { ok: true }; } }));
    assert.strictEqual(r.status, 'exists'); assert.strictEqual(called, false);
    assert.strictEqual(rowsFor('mcoc-a').length, 1);
  });
  await t('disabled by config: nothing listed, nothing taken', async () => {
    let touched = false;
    const r = await base.ensureBaselineSnapshot({ ...wire(A), enabled: false, listSnapshots: async () => { touched = true; return []; }, takeSnapshot: async () => { touched = true; } });
    assert.strictEqual(r.status, 'disabled'); assert.strictEqual(touched, false);
  });
  await t('five concurrent calls for one repo share ONE attempt: one snapshot, same result for all', async () => {
    const C = await makeRepo('mcoc-c', { 'c.js': big('c') });
    let takes = 0;
    const w = wire(C, { takeSnapshot: async (a) => { takes++; return snap.commitRepoSnapshot({ repo: C.repo, repoDir: C.dir, message: a.message, commit: commitFn, fileLayer: fileLayerFor(C.repo) }); } });
    const out = await Promise.all([1, 2, 3, 4, 5].map(() => base.ensureBaselineSnapshot(w)));
    assert.strictEqual(takes, 1); assert.strictEqual(rowsFor('mcoc-c').length, 1);
    assert.ok(out.every(o => o.status === 'taken' && o.commitId === out[0].commitId));
  });
  await t('concurrent calls for DIFFERENT repos are independent', async () => {
    const D = await makeRepo('mcoc-d', { 'd.js': 'd\n' }), E = await makeRepo('mcoc-e', { 'e.js': 'e\n' });
    const [a, b] = await Promise.all([base.ensureBaselineSnapshot(wire(D)), base.ensureBaselineSnapshot(wire(E))]);
    assert.ok(a.status === 'taken' && b.status === 'taken' && a.commitId !== b.commitId);
  });

  console.log('\n── source-layer single-file primitives (real) ───────────');
  const sfm = await import(path.join(ROOT, 'idearium/repo/source-files.js'));
  const sdir = path.join(tmpRoot, 'src-prim');
  const initial = [{ path: 'a.txt', buffer: Buffer.from('one\n') }, { path: 'b.bin', buffer: Buffer.from([0, 1, 2]), binary: true }, { path: 'c.txt', buffer: Buffer.from('three\n') }];
  sfm.writeSourceFiles(sdir, initial);
  await t('setSourceFile replaces ONE entry and its bytes, keeps every other entry, recomputes totals', () => {
    const r = sfm.setSourceFile(sdir, 'a.txt', Buffer.from('ONE changed\n'));
    assert.strictEqual(r.ok, true, r.error);
    const m = sfm.loadSourceManifest(sdir);
    assert.deepStrictEqual(m.files.map(f => f.path).sort(), ['a.txt', 'b.bin', 'c.txt']);
    assert.strictEqual(m.totalFiles, 3);
    assert.strictEqual(m.totalBytes, 'ONE changed\n'.length + 3 + 'three\n'.length);
    assert.strictEqual(fs.readFileSync(path.join(sdir, 'a.txt'), 'utf8'), 'ONE changed\n');
    assert.strictEqual(m.files.find(f => f.path === 'a.txt').sha256, require('crypto').createHash('sha256').update('ONE changed\n').digest('hex'));
    assert.strictEqual(m.files.find(f => f.path === 'b.bin').binary, true);
  });
  await t('setSourceFile keeps a binary flagged binary, and flags a new binary correctly', () => {
    sfm.setSourceFile(sdir, 'b.bin', Buffer.from([9, 0, 9]));
    assert.strictEqual(sfm.loadSourceManifest(sdir).files.find(f => f.path === 'b.bin').binary, true);
    sfm.setSourceFile(sdir, 'new.bin', Buffer.from([0, 0, 1]));
    assert.strictEqual(sfm.loadSourceManifest(sdir).files.find(f => f.path === 'new.bin').binary, true);
  });
  await t('removeSourceFile deletes the file and only its entry; refuses a path the layer does not own', () => {
    assert.strictEqual(sfm.removeSourceFile(sdir, 'new.bin').ok, true);
    assert.ok(!fs.existsSync(path.join(sdir, 'new.bin')));
    assert.deepStrictEqual(sfm.loadSourceManifest(sdir).files.map(f => f.path).sort(), ['a.txt', 'b.bin', 'c.txt']);
    assert.strictEqual(sfm.removeSourceFile(sdir, 'nope.txt').ok, false);
  });
  await t('both refuse unsafe paths, the reserved manifest name, and a repo with no source layer', () => {
    for (const bad of ['../x', '/etc/x', '.idearium-sources.json']) {
      assert.strictEqual(sfm.setSourceFile(sdir, bad, Buffer.from('x')).ok, false, bad);
      assert.strictEqual(sfm.removeSourceFile(sdir, bad).ok, false, bad);
    }
    const none = path.join(tmpRoot, 'no-source-layer'); fs.mkdirSync(none, { recursive: true });
    assert.strictEqual(sfm.setSourceFile(none, 'a.txt', Buffer.from('x')).ok, false);
    assert.ok(!fs.existsSync(path.join(none, 'a.txt')), 'must not write a file it cannot record');
  });

  console.log('\n── it never throws and never blocks an import ───────────');
  const F = await makeRepo('mcoc-f', { 'f.js': 'f\n' });
  await t('versionium unreachable when listing: status failed / LIST_FAILED, nothing taken, no throw', async () => {
    let took = false;
    const r = await base.ensureBaselineSnapshot(wire(F, { listSnapshots: async () => { throw new Error('versionium unreachable'); }, takeSnapshot: async () => { took = true; } }));
    assert.strictEqual(r.status, 'failed'); assert.strictEqual(r.code, 'LIST_FAILED'); assert.ok(/unreachable/.test(r.error)); assert.strictEqual(took, false);
  });
  await t('the file layer refusing (plan fails): failed with its code, and NO commit left behind', async () => {
    const before = rowsFor('mcoc-f').length;
    const r = await base.ensureBaselineSnapshot(wire(F, { takeSnapshot: ({ message }) => snap.commitRepoSnapshot({ repo: F.repo, repoDir: F.dir, message, commit: commitFn, fileLayer: { ...fileLayerFor(F.repo), plan: async () => { throw new Error('down'); } } }) }));
    assert.strictEqual(r.status, 'failed'); assert.strictEqual(r.code, 'FILES_PLAN_FAILED');
    assert.strictEqual(rowsFor('mcoc-f').length, before);
  });
  await t('a commit that succeeded but whose file record failed is reported with its commit id', async () => {
    const r = await base.ensureBaselineSnapshot(wire(F, { takeSnapshot: ({ message }) => snap.commitRepoSnapshot({ repo: F.repo, repoDir: F.dir, message, commit: commitFn, fileLayer: { ...fileLayerFor(F.repo), record: async () => { throw new Error('disk full'); } } }) }));
    assert.strictEqual(r.status, 'failed'); assert.strictEqual(r.code, 'FILES_RECORD_FAILED'); assert.ok(r.commitId);
  });
  await t('takeSnapshot throwing is caught (TAKE_THREW); a bad call is BAD_INPUT, not a crash', async () => {
    const G = await makeRepo('mcoc-g', { 'g.js': 'g\n' });
    const r = await base.ensureBaselineSnapshot(wire(G, { takeSnapshot: async () => { throw new Error('boom'); } }));
    assert.strictEqual(r.code, 'TAKE_THREW');
    assert.strictEqual((await base.ensureBaselineSnapshot({})).code, 'BAD_INPUT');
  });
  await t('after a failed attempt the in-flight slot is released, so a retry can succeed', async () => {
    const H = await makeRepo('mcoc-h', { 'h.js': 'h\n' });
    const bad = await base.ensureBaselineSnapshot(wire(H, { takeSnapshot: async () => ({ ok: false, code: 'X', error: 'nope' }) }));
    assert.strictEqual(bad.status, 'failed');
    assert.strictEqual((await base.ensureBaselineSnapshot(wire(H))).status, 'taken');
  });
  await t('a repo the pipeline never indexed cannot get a baseline (NOT_INDEXED), and says so', async () => {
    const dir = path.join(tmpRoot, 'bare'); fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(path.join(dir, 'x.js'), '1;\n');
    const repo = { uuid: 'mcoc-bare', name: 'bare', files: [{ path: 'x.js' }] };
    const r = await base.ensureBaselineSnapshot({ repo, repoDir: dir, listSnapshots: async () => [], takeSnapshot: ({ message }) => snap.commitRepoSnapshot({ repo, repoDir: dir, message, commit: commitFn, fileLayer: fileLayerFor(repo) }) });
    assert.strictEqual(r.status, 'failed'); assert.strictEqual(r.code, 'NOT_INDEXED');
  });

  console.log('\n── pipeline.snapshot_mode is now READ ───────────────────');
  await t('snapshot_mode "delta": a one-line edit to a text file is stored as a delta', async () => {
    const R = await makeRepo('mcoc-delta', { 'big.js': big('z') });
    const commit = (p) => commitFn(p);
    const s1 = await snap.commitRepoSnapshot({ repo: R.repo, repoDir: R.dir, commit, fileLayer: fileLayerFor(R.repo), snapshotMode: 'delta' });
    fs.writeFileSync(path.join(R.dir, 'big.js'), big('z').replace('z7 = 7', 'z7 = 777'));
    const s2 = await snap.commitRepoSnapshot({ repo: R.repo, repoDir: R.dir, commit, fileLayer: fileLayerFor(R.repo), snapshotMode: 'delta' });
    assert.strictEqual(s1.ok && s2.ok, true); assert.strictEqual(s2.files.counts.delta, 1);
  });
  await t('snapshot_mode "full": the same edit is stored as a full copy, no delta rows, and still restores exactly', async () => {
    const R = await makeRepo('mcoc-full', { 'big.js': big('z') });
    const commit = (p) => commitFn(p);
    await snap.commitRepoSnapshot({ repo: R.repo, repoDir: R.dir, commit, fileLayer: fileLayerFor(R.repo), snapshotMode: 'full' });
    const edited = big('z').replace('z7 = 7', 'z7 = 777'); fs.writeFileSync(path.join(R.dir, 'big.js'), edited);
    const s2 = await snap.commitRepoSnapshot({ repo: R.repo, repoDir: R.dir, commit, fileLayer: fileLayerFor(R.repo), snapshotMode: 'full' });
    assert.strictEqual(s2.files.counts.delta, 0); assert.strictEqual(s2.files.counts.full, 1);
    assert.strictEqual(jaaDB.query('file_delta', x => x.repository === 'mcoc-full', 5).length, 0);
    assert.strictEqual(files.content('mcoc-full', s2.commit.commitId, 'big.js').bytes.toString(), edited);
  });
  await t('the file layer refuses an unknown mode (BAD_INPUT) and writes nothing', () => {
    const c = engine.commit({ message: 'm', branch: 'repo-mcoc-mode', system: 'idearium.repo', state: { kind: 'repo-snapshot', repository: 'mcoc-mode' } });
    const n = jaaDB.query('file_snapshots', () => true, 1e9).length;
    assert.throws(() => files.record({ repository: 'mcoc-mode', commitId: c.commitId, tree: [], contents: [], mode: 'partial' }), (e) => e.code === 'BAD_INPUT');
    assert.strictEqual(jaaDB.query('file_snapshots', () => true, 1e9).length, n);
  });

  console.log('\n── config ───────────────────────────────────────────────');
  await t('snapshots.import_baseline exists, defaults ON, is copilot-writable; snapshot_mode is full|delta defaulting to delta', () => {
    const d = core.defaults();
    assert.strictEqual(d.snapshots.import_baseline, true);
    assert.strictEqual(core.SCHEMA.snapshots.import_baseline.copilot_writable, true);
    assert.strictEqual(d.pipeline.snapshot_mode, 'delta');
    assert.deepStrictEqual(core.SCHEMA.pipeline.snapshot_mode.enum, ['full', 'delta']);
  });

  console.log('\n── wiring (structural — the routes are exercised over HTTP) ──');
  const api = fs.readFileSync(path.join(ROOT, 'idearium/api/index.js'), 'utf8');
  const caseBody = (name) => { const i = api.indexOf(`case '${name}': {`); return api.slice(i, api.indexOf("\n    case '", i + 10)); };
  await t('archive import, project import and chunk run each call the baseline hook, never awaited', () => {
    for (const [c, reason] of [['repo.import-archive', 'import-archive'], ['project-import.finalize', 'project-import'], ['repo.chunk.run', 'chunk-run']]) {
      const body = caseBody(c);
      assert.ok(new RegExp(`void _baselineSnapshot\\([^)]*'${reason}'\\)`).test(body), `${c} missing the hook`);
      assert.ok(!/await _baselineSnapshot/.test(body), `${c} awaits the hook`);
    }
  });
  await t('a deferred project import does NOT baseline at finalize (no index yet); chunk run does it later', () => {
    assert.ok(/!body\.deferChunking && pipeline && pipeline\.state !== 'FAULT'\) void _baselineSnapshot/.test(caseBody('project-import.finalize')));
  });
  await t('a pipeline FAULT does not trigger a baseline', () => {
    assert.ok(/pipeline\.state !== 'FAULT'\) void _baselineSnapshot/.test(caseBody('repo.import-archive')));
  });

  fs.rmSync(TMP, { recursive: true, force: true }); fs.rmSync(tmpRoot, { recursive: true, force: true });
  for (const u of uuids) fs.rmSync(path.join(NODE_DIR, `${u}.repository`), { force: true });
  console.log(`\n${fail ? '✗' : '✓'} mcoc-import-baseline: ${pass} passed, ${fail} failed\n`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
