'use strict';
/**
 * tests/modules/test-mco3-repo-snapshot.js — idearium/repo/snapshot.js, MCO3.
 *
 * §12.2 — no fixture records. A real repository is written to a real temp
 * directory, the REAL import pipeline runs over it, the REAL lazy queue is
 * drained, a REAL git repo is initialised in it, and the record is built
 * from what is actually on disk. The gate is proven through versionium's
 * REAL engine: commit, then read the state back with getState() and check
 * all nine §33 keys survived. Expected values are computed here,
 * independently of snapshot.js (own sha256, own git rev-parse).
 *
 * §ISOLATION — VERSIONIUM_DATA_DIR and JAA_DATA_DIR are set BEFORE the
 * engine or anything touching cortex's jaa-db is required, so nothing here
 * can write into the real stores.
 */

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '../..');
process.env.VERSIONIUM_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'mco3-versionium-'));
process.env.JAA_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'mco3-cortex-'));

let pass = 0, fail = 0;
async function t(name, fn) {
  try { await fn(); pass++; console.log(`  ✓ ${name}`); }
  catch (e) { fail++; console.log(`  ✗ ${name}\n      ${e.message}`); }
}

const sha = (x) => crypto.createHash('sha256').update(x).digest('hex');
const git = (dir, ...args) => execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', '-C', dir, ...args], { encoding: 'utf8' }).trim();

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'mco3-'));

function writeFiles(repoDir, files) {
  for (const [rel, content] of Object.entries(files)) {
    const abs = path.join(repoDir, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, content, 'utf8');
  }
}

(async () => {
  const pipeline = await import(path.join(ROOT, 'idearium/repo/import-pipeline.js'));
  const verifyLazy = await import(path.join(ROOT, 'idearium/repo/verify-lazy.js'));
  const graphMod = await import(path.join(ROOT, 'idearium/repo/graph.js'));
  const snap = await import(path.join(ROOT, 'idearium/repo/snapshot.js'));
  const workQueue = require(path.join(ROOT, 'lib/work-queue.js'));
  const engine = require(path.join(ROOT, 'versionium/lib/engine.js'));
  const { jaaDB } = require(path.join(ROOT, 'versionium/lib/store.js'));

  const drain = () => workQueue.get(verifyLazy.QUEUE_NAME).drain();

  // runImportPipeline() also writes idearium/data/nodes/repository/<uuid>.repository
  // (repo-node.js has no directory override). Track and remove exactly the
  // files this suite created so running it never leaves residue in the
  // real data directory.
  const NODE_DIR = path.join(ROOT, 'idearium/data/nodes/repository');
  const createdUuids = [];
  function prepareRepo(uuid, files, { dirName = uuid, extra = {} } = {}) {
    const repoDir = path.join(tmpRoot, dirName);
    writeFiles(repoDir, files);
    createdUuids.push(uuid);
    return { repo: { uuid, name: uuid, files: Object.keys(files).map(p => ({ path: p })), ...extra }, repoDir };
  }
  async function makeRepo(uuid, files, { drainLazy = true, dirName, extra } = {}) {
    const { repo, repoDir } = prepareRepo(uuid, files, { dirName, extra });
    const result = pipeline.runImportPipeline(repo, repoDir);
    if (drainLazy) await drain();
    return { repo, repoDir, result };
  }

  const FILES = {
    'package.json': JSON.stringify({ name: 'x', version: '1.0.0', dependencies: { express: '^5.0.0', lodash: '^4.0.0' }, devDependencies: { jest: '^29.0.0' } }),
    'package-lock.json': '{"lockfileVersion":3}',
    'src/a.js': "const { b } = require('./b.js');\nmodule.exports = { a: b + 1 };\n",
    'src/b.js': 'const b = 2;\nmodule.exports = { b };\n',
    'src/b.test.js': "const assert = require('assert');\nassert.strictEqual(require('./b.js').b, 2);\nconsole.log('ok');\n",
  };

  console.log('\n── the record, built from a real indexed + git repo ─────');
  const main = await makeRepo('mco3-main', FILES, { extra: { compartmentId: 'cmp-test-1' } });
  git(main.repoDir, 'init', '-q');
  git(main.repoDir, 'add', '-A');
  git(main.repoDir, 'commit', '-q', '-m', 'initial');
  const HEAD = git(main.repoDir, 'rev-parse', 'HEAD');

  const built = snap.buildSnapshotRecord({ repo: main.repo, repoDir: main.repoDir, now: 1234567890 });
  const R = built.record;
  const mr = R && R.mustRecord;

  await t('pipeline reached READY on the real repo (precondition)', () => assert.strictEqual(main.result.state, 'READY'));
  await t('a record builds ok, kind/schema/repository/takenAt set', () => {
    assert.strictEqual(built.ok, true);
    assert.strictEqual(R.kind, 'repo-snapshot');
    assert.strictEqual(R.schema, snap.SCHEMA_VERSION);
    assert.strictEqual(R.repository, 'mco3-main');
    assert.strictEqual(R.takenAt, 1234567890);
  });
  await t('all nine §33 keys present, each carrying a boolean `available`', () => {
    assert.deepStrictEqual(Object.keys(mr).sort(), [...snap.MUST_RECORD].sort());
    for (const k of snap.MUST_RECORD) assert.strictEqual(typeof mr[k].available, 'boolean', k);
    assert.deepStrictEqual(snap.verifyMustRecord(R), { complete: true, missing: [] });
  });
  await t('on a fully indexed, git-tracked repo every one of the nine is available', () => {
    for (const k of snap.MUST_RECORD) assert.strictEqual(mr[k].available, true, `${k}: ${mr[k].reason || ''}`);
  });

  await t('sourceHash equals a hash this test computes itself from the files on disk', () => {
    const lines = Object.keys(FILES).sort().map(p => `${p}\t${sha(fs.readFileSync(path.join(main.repoDir, p), 'utf8'))}\n`).join('');
    assert.strictEqual(mr.sourceHash.value, sha(lines));
    assert.strictEqual(mr.sourceHash.diskHash, mr.sourceHash.value);
    assert.strictEqual(mr.sourceHash.fresh, true);
    assert.strictEqual(mr.sourceHash.indexedFileCount, Object.keys(FILES).length);
  });

  await t('gitCommit is the real HEAD (compared with a separate git rev-parse), clean tree', () => {
    assert.strictEqual(mr.gitCommit.commit, HEAD);
    assert.strictEqual(mr.gitCommit.dirty, false);
    assert.ok(mr.gitCommit.branch);
  });

  await t('atlasVersion: no declared version, identity is the file hash', () => {
    assert.strictEqual(mr.atlasVersion.declaredVersion, null);
    assert.strictEqual(mr.atlasVersion.sha256, sha(fs.readFileSync(path.join(main.repoDir, 'atlas.json'))));
    assert.strictEqual(mr.atlasVersion.fileCount, Object.keys(FILES).length);
  });
  await t('chunkIndexVersion: hash of chunks/index.json and its real chunk count', () => {
    const raw = fs.readFileSync(path.join(main.repoDir, 'chunks/index.json'));
    assert.strictEqual(mr.chunkIndexVersion.declaredVersion, null);
    assert.strictEqual(mr.chunkIndexVersion.sha256, sha(raw));
    assert.strictEqual(mr.chunkIndexVersion.chunkCount, JSON.parse(raw).length);
    assert.ok(mr.chunkIndexVersion.chunkCount > 0);
  });
  await t('graphVersion: the DECLARED graph version plus hash and real counts', () => {
    const g = JSON.parse(fs.readFileSync(path.join(main.repoDir, 'graph.json'), 'utf8'));
    assert.strictEqual(mr.graphVersion.declaredVersion, graphMod.GRAPH_VERSION);
    assert.strictEqual(mr.graphVersion.sha256, sha(fs.readFileSync(path.join(main.repoDir, 'graph.json'))));
    assert.strictEqual(mr.graphVersion.edgeCount, g.edgeCount);
    assert.strictEqual(mr.graphVersion.nodeCount, g.nodeCount);
  });

  await t('dependencyState: manifests with the index content hashes, lockfile, declared counts', () => {
    const d = mr.dependencyState;
    const pkg = d.manifests.find(m => m.path === 'package.json');
    const lock = d.manifests.find(m => m.path === 'package-lock.json');
    assert.strictEqual(pkg.sha256, sha(FILES['package.json']));
    assert.strictEqual(lock.lockfile, true);
    assert.strictEqual(pkg.lockfile, false);
    assert.strictEqual(d.lockfilePresent, true);
    assert.deepStrictEqual([d.declared.dependencies, d.declared.devDependencies, d.declared.optionalDependencies], [2, 1, 0]);
    assert.strictEqual(d.nodeModulesPresent, false);
  });

  await t('environment: compartmentId from the repo record; runtime honestly null with a reason', () => {
    assert.strictEqual(mr.environment.compartmentId, 'cmp-test-1');
    assert.strictEqual(mr.environment.host.node, process.version);
    assert.strictEqual(mr.environment.runtime, null);
    assert.ok(mr.environment.runtimeReason.length > 0);
  });

  await t('testState: the real L6 result — one test found, run, passed', () => {
    assert.strictEqual(mr.testState.status, 'passed');
    assert.deepStrictEqual([mr.testState.testsFound, mr.testState.testsRun, mr.testState.testsSkipped, mr.testState.failedCount], [1, 1, 0, 0]);
  });

  await t('verificationState: L0..L8 all present and passed, lazy pass finished', () => {
    const v = mr.verificationState;
    assert.deepStrictEqual(v.tiers.map(x => x.level), ['L0', 'L1', 'L2', 'L3', 'L4', 'L5', 'L6', 'L7', 'L8']);
    assert.strictEqual(v.status, 'passed');
    assert.strictEqual(v.lazy.status, 'passed');
    assert.deepStrictEqual(v.failedTiers, []);
    // L8 has no interaction-contract.json here: not_applicable, not passed.
    assert.strictEqual(v.tiers.find(x => x.level === 'L8').state, 'not_applicable');
  });

  console.log('\n── honesty: stale, dirty, absent, pending ───────────────');
  fs.appendFileSync(path.join(main.repoDir, 'src/b.js'), '// edited after indexing\n');
  const stale = snap.buildSnapshotRecord({ repo: main.repo, repoDir: main.repoDir }).record.mustRecord;
  await t('a file edited after indexing: sourceHash.fresh is false and names the file', () => {
    assert.strictEqual(stale.sourceHash.fresh, false);
    assert.deepStrictEqual(stale.sourceHash.mismatched, ['src/b.js']);
    assert.notStrictEqual(stale.sourceHash.diskHash, stale.sourceHash.value);
  });
  await t('...and git now reports the tree dirty, at the same HEAD', () => {
    assert.strictEqual(stale.gitCommit.dirty, true);
    assert.strictEqual(stale.gitCommit.commit, HEAD);
  });

  {
    // An indexed repo dir with NO .git of its own, nested inside a real git
    // repo. git would walk upward and report the outer repo's HEAD.
    const outer = path.join(tmpRoot, 'outer');
    fs.mkdirSync(outer, { recursive: true });
    fs.writeFileSync(path.join(outer, 'x.txt'), 'x');
    git(outer, 'init', '-q'); git(outer, 'add', '-A'); git(outer, 'commit', '-q', '-m', 'outer');
    const nested = await makeRepo('mco3-nested', { 'src/i.js': 'module.exports = 1;\n' }, { dirName: 'outer/inner' });
    const rec = snap.buildSnapshotRecord({ repo: nested.repo, repoDir: nested.repoDir }).record.mustRecord;
    await t('a repo with no .git of its own inside a git repo does NOT report the outer commit', () => {
      assert.strictEqual(git(outer, 'rev-parse', 'HEAD').length, 40); // the outer repo really has a HEAD
      assert.strictEqual(rec.gitCommit.available, false);
      assert.ok(/no \.git/.test(rec.gitCommit.reason));
      assert.strictEqual(rec.gitCommit.commit, undefined);
    });
    await t('a repo with no tests reports no_tests — not passed, not zero-and-fine', () => {
      assert.strictEqual(rec.testState.status, 'no_tests');
      assert.strictEqual(rec.testState.testsFound, 0);
    });
    await t('a repo with no package.json has nodeModulesPresent null, declared null', () => {
      assert.strictEqual(rec.dependencyState.declared, null);
      assert.strictEqual(rec.dependencyState.nodeModulesPresent, null);
      assert.strictEqual(rec.dependencyState.lockfilePresent, false);
    });
  }

  {
    // Built in the SAME synchronous tick as the pipeline call: the lazy pass
    // is queued fire-and-forget and an await here would let it finish.
    const { repo, repoDir } = prepareRepo('mco3-pending', { 'src/p.js': 'module.exports = 1;\n', 'src/p.test.js': "require('./p.js');\n" });
    pipeline.runImportPipeline(repo, repoDir);
    const rec = snap.buildSnapshotRecord({ repo, repoDir }).record.mustRecord;
    await t('lazy pass not finished: testState unavailable with status pending, L6-L8 pending', () => {
      assert.strictEqual(rec.testState.available, false);
      assert.strictEqual(rec.testState.status, 'pending');
      assert.deepStrictEqual(rec.verificationState.tiers.filter(x => x.state === 'pending').map(x => x.level), ['L6', 'L7', 'L8']);
      assert.strictEqual(rec.verificationState.lazy.status, 'pending');
    });
    await drain();
  }

  {
    const failing = await makeRepo('mco3-failing', {
      'src/f.js': 'module.exports = 1;\n',
      'src/f.test.js': "throw new Error('deliberate');\n",
    });
    const rec = snap.buildSnapshotRecord({ repo: failing.repo, repoDir: failing.repoDir }).record.mustRecord;
    await t('a failing test is recorded as failed with the file named — never passed', () => {
      assert.strictEqual(rec.testState.status, 'failed');
      assert.deepStrictEqual(rec.testState.failed, ['src/f.test.js']);
      assert.ok(rec.verificationState.failedTiers.includes('L6'));
    });
  }

  await t('never-indexed repo is refused with NOT_INDEXED, not recorded as a wall of unavailable', () => {
    const bare = path.join(tmpRoot, 'bare');
    writeFiles(bare, { 'a.js': '1;\n' });
    const r = snap.buildSnapshotRecord({ repo: { uuid: 'bare' }, repoDir: bare });
    assert.strictEqual(r.ok, false);
    assert.strictEqual(r.code, 'NOT_INDEXED');
  });
  await t('missing directory and missing repo are refused with their own codes', () => {
    assert.strictEqual(snap.buildSnapshotRecord({ repo: { uuid: 'x' }, repoDir: path.join(tmpRoot, 'nope') }).code, 'NO_DIR');
    assert.strictEqual(snap.buildSnapshotRecord({ repoDir: tmpRoot }).code, 'NO_REPO');
  });
  await t('verifyMustRecord rejects a bare null, an empty object, and a missing key', () => {
    assert.deepStrictEqual(snap.verifyMustRecord(null).missing.length, 9);
    assert.deepStrictEqual(snap.verifyMustRecord({ mustRecord: {} }).missing.length, 9);
    const partial = JSON.parse(JSON.stringify(R)); partial.mustRecord.gitCommit = null; delete partial.mustRecord.testState;
    assert.deepStrictEqual(snap.verifyMustRecord(partial).missing.sort(), ['gitCommit', 'testState']);
  });

  console.log('\n── THE GATE: commit through versionium, read back ───────');
  // Restore the file edit so the committed record is the clean, fresh one.
  fs.writeFileSync(path.join(main.repoDir, 'src/b.js'), FILES['src/b.js']);
  const committed = await snap.commitRepoSnapshot({
    repo: main.repo, repoDir: main.repoDir, causedBy: 'mco3-test',
    commit: (payload) => engine.commit(payload),
  });

  await t('commit succeeds through the real engine.commit()', () => {
    assert.strictEqual(committed.ok, true, committed.error);
    assert.ok(committed.commit.commitId.startsWith('vtm-'));
  });
  await t('the versionium commit carries the repo-snapshot system and per-repo branch', () => {
    assert.strictEqual(committed.commit.system, 'idearium.repo');
    assert.strictEqual(committed.commit.branch, 'repo-mco3-main');
    assert.strictEqual(committed.commit.causedBy, 'mco3-test');
  });

  const back = engine.getState(committed.commit.commitId);
  await t('getState() returns the stored state — read back through versionium, not from memory here', () => {
    assert.ok(!back.error, back.error);
    assert.strictEqual(back.state.kind, 'repo-snapshot');
  });
  await t('GATE: all nine §33 must_record keys round-trip, each with its data intact', () => {
    assert.deepStrictEqual(snap.verifyMustRecord(back.state), { complete: true, missing: [] });
    for (const k of snap.MUST_RECORD) assert.deepStrictEqual(back.state.mustRecord[k], committed.record.mustRecord[k], k);
    assert.strictEqual(back.state.mustRecord.gitCommit.commit, HEAD);
    assert.strictEqual(back.state.mustRecord.sourceHash.value, mr.sourceHash.value);
    assert.strictEqual(back.state.mustRecord.graphVersion.declaredVersion, graphMod.GRAPH_VERSION);
  });

  await t('a second snapshot chains on the same per-repo branch (parentId is the first)', () => {
    return snap.commitRepoSnapshot({ repo: main.repo, repoDir: main.repoDir, commit: (p) => engine.commit(p) }).then(second => {
      assert.strictEqual(second.ok, true);
      assert.strictEqual(second.commit.parentId, committed.commit.commitId);
    });
  });

  console.log('\n── isolation from idea snapshots ────────────────────────');
  // What IdeaOS.commitSnapshot() writes: system 'idearium', state with ideas.
  const ideaCommit = engine.commit({ message: 'idea snapshot', system: 'idearium', state: { ideas: [{ uuid: 'i1' }], specs: [], gaps: [], links: [] } });
  const rows = jaaDB.query('versionium_commits', () => true, 500);
  await t('history?system=idearium (what the idea snapshot list reads) contains NO repo snapshot', () => {
    const ideaRows = rows.filter(r => r.system === 'idearium');
    assert.ok(ideaRows.some(r => r.commitId === ideaCommit.commitId));
    assert.strictEqual(ideaRows.some(r => r.state && r.state.kind === 'repo-snapshot'), false);
  });
  await t('summarizeRepoSnapshots lists this repo\'s snapshots newest first, and only those', () => {
    const list = snap.summarizeRepoSnapshots(rows, 'mco3-main');
    assert.strictEqual(list.length, 2);
    assert.ok(list[0].ts >= list[1].ts);
    assert.strictEqual(list[1].commitId, committed.commit.commitId);
    assert.strictEqual(list[1].sourceHash, mr.sourceHash.value);
    assert.strictEqual(list[1].gitCommit, HEAD);
    assert.strictEqual(list[1].verification, 'passed');
    assert.strictEqual(list[1].tests, 'passed');
    assert.strictEqual(snap.summarizeRepoSnapshots(rows, 'someone-else').length, 0);
  });

  console.log('\n── transport failures are reported, not swallowed ───────');
  await t('a commit function that returns {error} yields COMMIT_FAILED with that error', async () => {
    const r = await snap.commitRepoSnapshot({ repo: main.repo, repoDir: main.repoDir, commit: () => ({ error: 'versionium down' }) });
    assert.strictEqual(r.ok, false); assert.strictEqual(r.code, 'COMMIT_FAILED'); assert.ok(/versionium down/.test(r.error));
  });
  await t('a commit function that throws yields COMMIT_FAILED, does not throw out', async () => {
    const r = await snap.commitRepoSnapshot({ repo: main.repo, repoDir: main.repoDir, commit: () => { throw new Error('boom'); } });
    assert.strictEqual(r.code, 'COMMIT_FAILED'); assert.ok(/boom/.test(r.error));
  });
  await t('no commit function at all is refused before anything is built', async () => {
    assert.strictEqual((await snap.commitRepoSnapshot({ repo: main.repo, repoDir: main.repoDir })).code, 'NO_TRANSPORT');
  });
  await t('a never-indexed repo is refused BEFORE the transport is called', async () => {
    let called = false;
    const r = await snap.commitRepoSnapshot({ repo: { uuid: 'bare' }, repoDir: path.join(tmpRoot, 'bare'), commit: () => { called = true; return {}; } });
    assert.strictEqual(r.code, 'NOT_INDEXED'); assert.strictEqual(called, false);
  });

  console.log('\n── materialize() must not sweep pipeline/CI artifacts ───');
  // Found over real HTTP: RepoLayer.materialize() deletes every top-level
  // entry not in its PRESERVE set, and that set predated graph.json,
  // verification.lazy.json and the CI files. Derived here from a REAL run,
  // not a hardcoded list, so the next artifact a phase adds fails this test.
  {
    const repoIndexSrc = fs.readFileSync(path.join(ROOT, 'idearium/repo/index.js'), 'utf8');
    const m = /const PRESERVE = new Set\(\[([^\]]*)\]\)/.exec(repoIndexSrc);
    const preserved = new Set(m ? [...m[1].matchAll(/'([^']+)'/g)].map(x => x[1]) : []);
    const sourceTop = new Set(Object.keys(FILES).map(f => f.split('/')[0]));
    const produced = fs.readdirSync(main.repoDir).filter(e => !sourceTop.has(e));
    await t('every top-level entry a real pipeline run produced is in materialize()\'s PRESERVE set', () => {
      assert.ok(m, 'could not find the PRESERVE set in idearium/repo/index.js');
      assert.ok(produced.includes('graph.json') && produced.includes('verification.lazy.json'), `precondition: ${produced}`);
      const swept = produced.filter(e => !preserved.has(e));
      assert.deepStrictEqual(swept, [], `materialize() would delete: ${swept.join(', ')}`);
    });
    await t('the CI config file and run-history dir are preserved, matching cos/ci\'s own constants', () => {
      const ci = require(path.join(ROOT, 'cos/ci/index.js'));
      assert.ok(preserved.has(ci.CONFIG_FILENAME), ci.CONFIG_FILENAME);
      assert.ok(preserved.has(path.basename(ci.runsDir('/x'))), path.basename(ci.runsDir('/x')));
    });
  }

  console.log('\n── IdeaOS wiring (structural — the class needs a live versionium) ──');
  const ideaSrc = fs.readFileSync(path.join(ROOT, 'idearium/index.js'), 'utf8');
  await t('restoreSnapshot refuses a repo-snapshot state BEFORE the pre-restore stash commit', () => {
    const fn = ideaSrc.slice(ideaSrc.indexOf('async restoreSnapshot('));
    const guard = fn.indexOf('REPO_SNAPSHOT_KIND');
    const stash = fn.indexOf('pre-restore snapshot (before pulling');
    assert.ok(guard > 0 && stash > 0 && guard < stash, `guard@${guard} stash@${stash}`);
  });
  await t('commitSnapshot and restoreSnapshot no longer address the 410-ing cortex versionium route', () => {
    assert.strictEqual(/nx\.(post|get)\('cortex',\s*[`']\/api\/versionium/.test(ideaSrc), false);
  });

  fs.rmSync(tmpRoot, { recursive: true, force: true });
  for (const u of createdUuids) fs.rmSync(path.join(NODE_DIR, `${u}.repository`), { force: true });
  console.log(`\n${fail ? '✗' : '✓'} mco3-repo-snapshot: ${pass} passed, ${fail} failed\n`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
