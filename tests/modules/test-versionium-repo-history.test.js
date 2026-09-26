'use strict';
// tests/modules/test-versionium-repo-history.test.js — 0.39.263.
// James: "loom depends on the .git i want versionium to hold the history for each repo."
//
//   VH-0xx  versionium: content staged in batches is recorded; versions() says which commit holds a file's bytes
//   VH-1xx  idearium repo snapshots: a version over one request's cap is staged, not refused
//   VH-2xx  nexus-self: every changed repo (and the index) becomes a versionium version on sync; unchanged → none
//   VH-3xx  nothing in the history path runs git
require('../../lib/test-sandbox.js').ensure();

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.join(__dirname, '../..');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'vh-test-'));
process.env.VERSIONIUM_DATA_DIR = path.join(TMP, 'v');
process.env.NEXUS_SELF_DIR = path.join(TMP, 'self');
process.on('exit', () => { try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (_) {} });

let passed = 0, failed = 0;
async function test(id, name, fn) {
  try { await fn(); console.log(`  ✓ ${id} ${name}`); passed++; }
  catch (e) { console.error(`  ✗ ${id} ${name}\n    ${e.stack}`); failed++; }
}
const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');

async function main() {
  const engine = require('../../versionium/lib/engine.js');
  const files = require('../../versionium/lib/files.js');
  const pipeline = await import('../../idearium/repo/import-pipeline.js');
  const snap = await import('../../idearium/repo/snapshot.js');

  // ── VH-0xx versionium ───────────────────────────────────────────────────
  await test('VH-001', 'staged content is recorded without being sent again; a staged blob is verified by its own hash', () => {
    const repository = 'vh-stage';
    const a = Buffer.from('alpha\n'), b = Buffer.from('beta\n');
    const tree = [{ path: 'a.txt', sha256: sha(a), bytes: a.length }, { path: 'b.txt', sha256: sha(b), bytes: b.length }];
    const st = files.stage({ contents: [{ path: 'a.txt', content_b64: a.toString('base64') }] });
    assert.deepStrictEqual([st.staged, st.files[0].sha256], [1, sha(a)], 'the hash is computed by versionium, not taken from the caller');
    const c = engine.commit({ message: 'v1', branch: `repo-${repository}`, system: 'idearium.repo', state: { kind: 'repo-snapshot', repository } });
    const missing = files.record({ repository, commitId: c.commitId, tree, contents: [] });
    assert.deepStrictEqual([missing.ok, missing.missing], [false, ['b.txt']], 'only the unstaged file is asked for');
    const r = files.record({ repository, commitId: c.commitId, tree, contents: [{ path: 'b.txt', content_b64: b.toString('base64') }] });
    assert.strictEqual(r.ok !== false && !!r.treeHash, true, JSON.stringify(r));
    assert.strictEqual(files.content(repository, c.commitId, 'a.txt').bytes.toString(), 'alpha\n');
    assert.strictEqual(files.stage({ contents: [{ path: 'a.txt', content_b64: a.toString('base64') }] }).already, 1, 'content-addressed: staging again stores nothing');
  });

  await test('VH-002', 'versions(path) lists every commit that wrote a path, newest first, with its bytes\' hash — and a deletion', () => {
    const repository = 'vh-hist';
    const put = (msg, text) => {
      const c = engine.commit({ message: msg, branch: `repo-${repository}`, system: 'idearium.repo', state: { kind: 'repo-snapshot', repository } });
      const tree = text === null ? [] : [{ path: 'f.spec', sha256: sha(Buffer.from(text)), bytes: Buffer.byteLength(text) }];
      files.record({ repository, commitId: c.commitId, tree, contents: text === null ? [] : [{ path: 'f.spec', content_b64: Buffer.from(text).toString('base64') }] });
      return c.commitId;
    };
    const c1 = put('one', 'spec one\n'); const c2 = put('two', 'spec one\nspec two\n'); const c3 = put('gone', null);
    const v = files.versions('f.spec', { repository });
    assert.deepStrictEqual(v.map(x => x.commitId), [c3, c2, c1]);
    assert.deepStrictEqual(v.map(x => x.kind), ['deleted', v[1].kind, 'full']);
    assert.strictEqual(v[1].sha256, sha(Buffer.from('spec one\nspec two\n')), 'a delta row reports the content it produces');
    assert.throws(() => files.versions('../etc/passwd'), /unsafe or invalid path/);
  });

  // ── VH-1xx idearium snapshots ──────────────────────────────────────────
  await test('VH-101', 'a repo version over one request\'s cap is staged in batches under the cap, then recorded — not refused', async () => {
    const dir = path.join(TMP, 'big');
    const FILES = {};
    for (let i = 0; i < 12; i++) FILES[`src/m${i}.js`] = `module.exports = ${JSON.stringify('x'.repeat(900) + i)};\n`;
    for (const [rel, text] of Object.entries(FILES)) { fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true }); fs.writeFileSync(path.join(dir, rel), text); }
    const repo = { uuid: 'vh-big', name: 'vh-big', files: Object.keys(FILES).map(p => ({ path: p })) };
    pipeline.runImportPipeline(repo, dir, { runtimeProof: false, lazyTests: false });
    const batches = [];
    const cap = 4000;   // bytes of base64 per request, so 12 files of ~1.2 KB need several batches
    const fileLayer = {
      limits: async () => ({ ...files.limits(), maxRecordBytes: cap }),
      plan: async (tree) => files.plan({ repository: repo.uuid, tree }),
      stage: async (contents) => { batches.push(contents.reduce((n, c) => n + c.content_b64.length, 0)); return files.stage({ contents }); },
      record: async (x) => files.record({ repository: repo.uuid, ...x }),
    };
    const r = await snap.commitRepoSnapshot({ repo, repoDir: dir, commit: (p) => engine.commit(p), fileLayer });
    assert.strictEqual(r.ok, true, r.error);
    assert.ok(batches.length >= 3 && batches.every(n => n <= cap), `batches ${batches.join(',')}`);
    assert.strictEqual(files.content(repo.uuid, r.commit.commitId, 'src/m7.js').bytes.toString(), FILES['src/m7.js']);
    const noStage = await snap.commitRepoSnapshot({ repo, repoDir: dir, commit: (p) => engine.commit(p), fileLayer: { ...fileLayer, stage: undefined, plan: async (tree) => ({ need: tree.map(e => e.path), deleted: [], tooLarge: [] }) } });
    assert.strictEqual(noStage.code, 'FILES_TOO_BIG', 'a file layer that cannot stage still refuses before committing');
  });

  // ── VH-2xx nexus-self ──────────────────────────────────────────────────
  const live = fs.mkdtempSync(path.join(TMP, 'live-'));
  const w = (rel, text) => { fs.mkdirSync(path.dirname(path.join(live, rel)), { recursive: true }); fs.writeFileSync(path.join(live, rel), text); };
  w('guardian/server.js', 'module.exports = 1;\n');
  w('cortex/boot.js', 'module.exports = 2;\n');
  w('lib/util.js', 'module.exports = 3;\n');
  const se = await import('../../idearium/spec-engine/index.js');
  const { RepoLayer } = await import('../../idearium/repo/index.js');
  const NS = await import('../../idearium/repo/nexus-self.js');
  const rl = new RepoLayer({ specEngine: se });
  const calls = [];
  const commitVersion = async ({ repo, system }) => { calls.push(system); return { ok: true, commitId: `vtm-${system}-${calls.length}` }; };
  const only = ['guardian', 'cortex', 'core'];

  await test('VH-201', 'first sync: every repo and the nexus index become a versionium version, recorded on the repo', async () => {
    const r = await NS.sync(rl, se, { only, liveRoot: live, commitVersion });
    assert.ok(r.ok, JSON.stringify(r.systems));
    assert.deepStrictEqual([...calls].sort(), ['(nexus)', 'core', 'cortex', 'guardian']);
    const g = rl.list({ includeArchived: true }).find(x => x.nexusSelf && x.nexusSelf.system === 'guardian');
    assert.ok(/^vtm-guardian-/.test(g.nexusSelf.versionCommit));
    assert.strictEqual(g.nexusSelf.versions[g.nexusSelf.versions.length - 1].versionCommit, g.nexusSelf.versionCommit, 'the version entry names its versionium commit');
  });

  await test('VH-202', 'an unchanged sync commits nothing; a changed system commits only itself and the index', async () => {
    calls.length = 0;
    await NS.sync(rl, se, { only, liveRoot: live, commitVersion });
    assert.deepStrictEqual(calls, []);
    w('guardian/server.js', 'module.exports = 11;\n');
    await NS.sync(rl, se, { only, liveRoot: live, commitVersion });
    assert.deepStrictEqual([...calls].sort(), ['(nexus)', 'guardian']);
  });

  await test('VH-203', 'a failed version is recorded on the repo and retried by the next sync, never fatal', async () => {
    w('cortex/boot.js', 'module.exports = 22;\n');
    const r = await NS.sync(rl, se, { only, liveRoot: live, commitVersion: async ({ system }) => (system === 'cortex' ? { ok: false, error: 'FILES_TOO_BIG: test' } : { ok: true, commitId: `vtm-${system}-x` }) });
    assert.ok(r.versions.some(v => v.system === 'cortex' && !v.ok));
    const c = rl.list({ includeArchived: true }).find(x => x.nexusSelf && x.nexusSelf.system === 'cortex');
    assert.strictEqual(c.nexusSelf.versionError, 'FILES_TOO_BIG: test');
    calls.length = 0;
    await NS.sync(rl, se, { only, liveRoot: live, commitVersion });
    assert.deepStrictEqual(calls, ['cortex'], 'retried although its content did not change');
  });

  // ── VH-3xx no git ──────────────────────────────────────────────────────
  await test('VH-301', 'the history path runs no git: loom\'s phasemap scanner, idearium snapshots, versionium', () => {
    for (const f of ['loom/scanners/phasemap-map.js', 'idearium/repo/snapshot.js', 'idearium/repo/nexus-self.js', 'versionium/lib/files.js']) {
      const src = fs.readFileSync(path.join(ROOT, f), 'utf8').replace(/^\s*(\*|\/\/).*$/gm, '');
      assert.ok(!/(execFileSync|execSync|spawnSync|spawn|exec)\(\s*['"`]git\b/.test(src), `${f} runs git`);
    }
  });

  console.log(`\n  ${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
