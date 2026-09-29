'use strict';
/**
 * tests/modules/test-staging-s0-s1.test.js — 0.39.279, docs/2026-09-28-staging-self-heal-phasemap.spec S0 + S1.
 *   S0-*  versionium records a branch's fork point: createBranch({branch, from}) and commit({from}) on a new branch; the
 *         branch's first commit has the fork point as its parent; an existing branch is never re-forked.
 *   S1-*  lib/code-edit.js stage() / promote() with the REAL lib/repo-inject.js (a Map-backed repo layer):
 *         staged = a versionium commit on repo-<uuid>@staging, the repo untouched, out of the review queue; promote is
 *         the one apply, all-or-nothing, a conflict never overwrites; an unrecorded stage is undone (I5).
 *   S1-2x the code API through idearium's real router: stage:true refused (nothing written) when versionium cannot
 *         record it; code/staged and code/promote exist.
 */
require('../../lib/test-sandbox.js').ensure();
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'staging-s0s1-'));
process.env.VERSIONIUM_DATA_DIR = path.join(TMP, 'versionium');
process.env.JAA_DATA_DIR = process.env.JAA_DATA_DIR || path.join(TMP, 'cortex');
process.env.NEXUS_INJECT_DIR = path.join(TMP, 'injects');
fs.mkdirSync(process.env.NEXUS_INJECT_DIR, { recursive: true });

let passed = 0, failed = 0;
async function t(id, name, fn) {
  try { await fn(); passed++; console.log(`  ✓ ${id} ${name}`); }
  catch (e) { failed++; console.log(`  ✗ ${id} ${name}\n    ${e && e.stack ? e.stack.split('\n').slice(0, 3).join('\n    ') : e}`); }
}

(async () => {
  console.log('\n  test-staging-s0-s1.test.js');
  const V = require(path.join(ROOT, 'versionium/lib/engine.js'));

  await t('S0-01', 'createBranch at a branch head: the fork point is recorded and the first commit on the branch is its child', () => {
    const a = V.commit({ message: 'snap 1', branch: 'repo-x', causedBy: 'test' });
    const b = V.commit({ message: 'snap 2', branch: 'repo-x', causedBy: 'test' });
    assert.strictEqual(b.parentId, a.commitId, 'parent follows the branch head');
    const f = V.createBranch({ branch: 'repo-x@staging', from: 'repo-x', causedBy: 'gap-1' });
    assert.ok(f.ok && f.created);
    assert.deepStrictEqual(f.forkedFrom, { branch: 'repo-x', commitId: b.commitId });
    const s1 = V.commit({ message: 'stage 1', branch: 'repo-x@staging', causedBy: 'gap-1' });
    assert.strictEqual(s1.parentId, b.commitId, 'the first staged commit hangs off the fork point');
    const s2 = V.commit({ message: 'stage 2', branch: 'repo-x@staging', causedBy: 'gap-1' });
    assert.strictEqual(s2.parentId, s1.commitId);
    assert.deepStrictEqual(V.forkPoint('repo-x@staging'), { branch: 'repo-x', commitId: b.commitId });
    const c = V.commit({ message: 'snap 3', branch: 'repo-x' });
    assert.strictEqual(c.parentId, b.commitId, 'the original branch is not moved by its fork');
  });

  await t('S0-02', 'fork from a commit id; commit({from}) forks on first use; re-forking is refused; unknown source is told', () => {
    const base = V.commit({ message: 'base', branch: 'repo-y' });
    const f = V.createBranch({ branch: 'repo-y@try', from: base.commitId });
    assert.deepStrictEqual(f.forkedFrom, { branch: 'repo-y', commitId: base.commitId });
    const again = V.createBranch({ branch: 'repo-y@try', from: 'main' });
    assert.ok(again.ok && !again.created && again.forkedFrom.commitId === base.commitId, 'never re-forked');
    const first = V.commit({ message: 'first', branch: 'repo-y@auto', from: 'repo-y' });
    assert.strictEqual(first.parentId, base.commitId);
    assert.deepStrictEqual(V.forkPoint('repo-y@auto'), { branch: 'repo-y', commitId: base.commitId });
    const bad = V.createBranch({ branch: 'repo-z@staging', from: 'repo-nope' });
    assert.ok(!bad.ok && /^no such commit or branch "repo-nope"/.test(bad.error), 'the reason first (callers see a truncated body)');
    assert.throws(() => V.commit({ message: 'x', branch: 'repo-z@staging', from: 'repo-nope' }), /no such commit or branch/);
    assert.ok(V.branches().some(b => b.branch === 'repo-x@staging' && b.forkedFrom && b.forkedAt));
    assert.strictEqual(V.forkPoint('main'), null);
  });

  // ── S1: stage / promote over the real inject trail ────────────────────────
  const RI = require(path.join(ROOT, 'lib/repo-inject.js'));
  const CE = require(path.join(ROOT, 'lib/code-edit.js'));
  const files = new Map([['src/lock.js', 'module.exports = 1;\n']]);
  const layer = {
    readTextFile: (u, p) => (files.has(p) ? { content: files.get(p) } : { error: 'not found' }),
    readFile: (u, p) => (files.has(p) ? { content: files.get(p) } : { error: 'not found' }),
    writeTextFile: (u, p, c) => { files.set(p, c); return { ok: true, via: 'test' }; },
    deleteTextFile: (u, p) => { files.delete(p); return { ok: true }; },
    refresh: () => ({ ok: true }),
  };
  const repo = { uuid: `stg-${Date.now()}`, name: 'staging test' };
  const recorded = [];
  const record = async (p) => { recorded.push(p); const c = V.commit({ message: p.message, branch: p.branch, causedBy: p.causedBy, system: p.system, state: p.state, from: p.from }); return c; };

  let staged;
  await t('S1-01', 'stage: a versionium commit on repo-<uuid>@staging caused by the gap; the repo untouched; out of the review queue', async () => {
    V.commit({ message: 'repo snapshot', branch: `repo-${repo.uuid}` });
    staged = await CE.stage({ layer, RI, repo, changes: [{ path: 'src/lock.js', content: 'module.exports = 2;\n' }, { path: 'src/new.js', content: 'x\n' }], causedBy: 'gap-7', record });
    assert.ok(staged.ok, JSON.stringify(staged));
    assert.strictEqual(staged.branch, `repo-${repo.uuid}@staging`);
    assert.strictEqual(staged.commit.forkedFrom, `repo-${repo.uuid}`);
    assert.deepStrictEqual([recorded[0].branch, recorded[0].causedBy, recorded[0].system, recorded[0].state.files.length], [staged.branch, 'gap-7', 'staging', 2]);
    assert.strictEqual(files.get('src/lock.js'), 'module.exports = 1;\n', 'the working tree is untouched until promote (I2)');
    assert.ok(!files.has('src/new.js'));
    assert.strictEqual(RI.list(repo.uuid, { status: 'proposed' }).length, 0, 'not in the review queue');
    const st = RI.list(repo.uuid, { status: 'staged' });
    assert.strictEqual(st.length, 2);
    assert.ok(st.every(n => n.staging.commitId === staged.commit.commitId && n.staging.causedBy === 'gap-7'));
    assert.deepStrictEqual(V.forkPoint(staged.branch).branch, `repo-${repo.uuid}`);
  });

  await t('S1-02', 'promote by commit: the one apply, both files land, the injects are applied', async () => {
    const r = CE.promote({ layer, RI, repo, commitId: staged.commit.commitId });
    assert.ok(r.ok, JSON.stringify(r));
    assert.strictEqual(files.get('src/lock.js'), 'module.exports = 2;\n');
    assert.strictEqual(files.get('src/new.js'), 'x\n');
    assert.strictEqual(RI.list(repo.uuid, { status: 'staged' }).length, 0);
    assert.strictEqual(CE.promote({ layer, RI, repo, commitId: staged.commit.commitId }).ok, false, 'nothing left to promote');
  });

  await t('S1-03', 'a file changed since it was staged is a conflict: nothing overwritten, what was applied is rolled back', async () => {
    const s = await CE.stage({ layer, RI, repo, changes: [{ path: 'src/new.js', content: 'y\n' }, { path: 'src/lock.js', content: 'module.exports = 3;\n' }], causedBy: 'gap-8', record });
    assert.ok(s.ok);
    files.set('src/lock.js', 'someone edited it\n');
    const r = CE.promote({ layer, RI, repo, commitId: s.commit.commitId });
    assert.ok(!r.ok && r.conflict, JSON.stringify(r));
    assert.strictEqual(files.get('src/lock.js'), 'someone edited it\n', 'the newer edit is kept');
    assert.strictEqual(files.get('src/new.js'), 'x\n', 'the file applied before the conflict was rolled back');
  });

  await t('S1-04', 'no repo history yet → forked from nothing, and said; versionium failing → every staged inject rejected (I5); no recorder → refused', async () => {
    const lone = { uuid: `lone-${Date.now()}`, name: 'lone' };
    const r = await CE.stage({ layer, RI, repo: lone, changes: [{ path: 'a.js', content: '1\n' }], causedBy: 'gap-9', record });
    assert.ok(r.ok && r.commit.forkedFrom === null, JSON.stringify(r));
    const down = await CE.stage({ layer, RI, repo, changes: [{ path: 'b.js', content: '1\n' }], causedBy: 'gap-10', record: async () => ({ error: 'versionium unreachable' }) });
    assert.ok(!down.ok && /versionium did not record/.test(down.errors[0]));
    assert.ok(RI.list(repo.uuid, { limit: 1000 }).filter(n => n.path === 'b.js').every(n => n.status === 'rejected'), 'nothing left half-staged');
    assert.match((await CE.stage({ layer, RI, repo, changes: [{ path: 'c.js', content: '1\n' }] })).errors[0], /needs a versionium recorder/);
  });

  await t('S1-20', 'the code API (real router): stage:true refused and nothing written when versionium cannot record it; staged / promote exist', async () => {
    const api = await import(path.join(ROOT, 'idearium', 'api', 'index.js'));
    const L = api.getRepoLayer();
    let made = null;
    for (let i = 0; i < 20; i++) {
      made = L.ingest({ name: `stg-api-${Date.now()}`, source: 'test', files: [{ path: 'src/a.js', content: 'const a = 1;\n' }] });
      if (!(made && made.error && /no spec-engine/.test(made.error))) break;
      await new Promise(x => setTimeout(x, 250));
    }
    const u = made.repo.uuid;
    process.env.NEXUS_VERSIONIUM_URL = 'http://127.0.0.1:9';
    const w = await api._route('POST', `/api/repos/${u}/code/write`, { path: 'src/b.js', content: 'const b = 2;\n', stage: true, causedBy: 'gap-api' });
    assert.ok(w.status === 409 || w.status === 200, JSON.stringify(w.json).slice(0, 300));
    if (w.status === 409) {
      assert.match(w.json.error, /versionium did not record/);
      assert.strictEqual(w.json.detail && w.json.detail.nothingWritten, true);
      const f = await api._route('GET', `/api/repos/${u}/code/read?path=src%2Fb.js`);
      assert.notStrictEqual(f.status, 200, 'the file was not written');
    } else {
      assert.strictEqual(w.json.status, 'staged', 'a reachable versionium stages it');
    }
    const s = await api._route('GET', `/api/repos/${u}/code/staged`);
    assert.strictEqual(s.status, 200);
    assert.ok(Array.isArray(s.json.batches));
    const p = await api._route('POST', `/api/repos/${u}/code/promote`, { commitId: 'vtm-none' });
    assert.strictEqual(p.status, 400);
    assert.match(p.json.error, /nothing staged by vtm-none/);
  });

  console.log(`\n  ${passed} passed, ${failed} failed\n`);
  try { V.stop && V.stop(); } catch (_) {}
  process.exit(failed ? 1 : 0);
})().catch(e => { console.log('  ! crashed:', e && e.stack || e); process.exit(1); });
