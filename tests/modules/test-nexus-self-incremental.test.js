'use strict';
// tests/modules/test-nexus-self-incremental.test.js — 0.39.288 (PF1–PF5).
// James: "it takes forever to load the repos on boot … running really bad."
//
// Measured on the real tree before the fix: every boot one core file changed, and the sync re-ingested ALL of
// nexus/core — ~2,000 chunk files and ~2,000 .chunk nodes written, the old ~2,000 of each deleted — holding
// idearium's loop 3–4 s here (45 s of "systems" on James's disk). After: the same file set updates in place.
//
//   NI-001  the async ingest gives the same chunks as the sync one
//   NI-002  one changed file: the spec is updated IN PLACE (same uuid), only that chunk rewritten, its file too
//   NI-003  a file added: the whole re-ingest runs (new spec uuid), the old one purged
//   NI-004  the snapshot names which files' content changed (the sync log prints them)
//   NI-005  saveSpec writes manifest.meta.json; a cold reader takes it while the stamp matches, never after
//           manifest.json was written some other way
require('../../lib/test-sandbox.js').ensure();

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const { pathToFileURL } = require('url');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'ni-test-'));
process.env.NEXUS_SELF_DIR = path.join(TMP, 'self');
process.on('exit', () => { try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (_) {} });

let passed = 0, failed = 0;
async function test(id, name, fn) {
  try { await fn(); console.log(`  ✓ ${id} ${name}`); passed++; }
  catch (e) { console.error(`  ✗ ${id} ${name}\n    ${e.stack}`); failed++; }
}

async function main() {
  const live = fs.mkdtempSync(path.join(TMP, 'live-'));
  const w = (rel, text) => { fs.mkdirSync(path.dirname(path.join(live, rel)), { recursive: true }); fs.writeFileSync(path.join(live, rel), text); };
  w('lib/a.js', 'module.exports = 1;\n');
  w('lib/b.js', 'module.exports = 2;\n');
  w('docs/readme.md', '# core\n');
  const se = await import('../../idearium/spec-engine/index.js');
  const { RepoLayer } = await import('../../idearium/repo/index.js');
  const NS = await import('../../idearium/repo/nexus-self.js');
  const rl = new RepoLayer({ specEngine: se });
  const only = ['core'];
  const core = () => rl.list({ includeArchived: true }).find(r => r.nexusSelf && r.nexusSelf.system === 'core');

  await test('NI-001', 'the async ingest gives the same chunks as the sync one', async () => {
    const files = [{ path: 'x/one.js', content: 'a=1\n' }, { path: 'two.md', content: '# two\n' }, { path: 'empty.txt', content: '' }];
    const a = se.ingestFilesAsSpec({ name: 'ni-sync', files });
    const b = await se.ingestFilesAsSpecAsync({ name: 'ni-async', files, yieldEvery: 1 });
    const shape = (m) => m.chunks.map(c => [c.realPath, c.status, c.content || null, c.agent]);
    assert.deepStrictEqual(shape(b), shape(a));
    assert.strictEqual(b.doneChunks, a.doneChunks);
    assert.ok(!b.ingesting, 'the final save clears ingesting');
    // idearium/api calls the engine through `m.default || m` (SC-008): both new paths must be on that surface
    for (const fn of ['ingestFilesAsSpecAsync', 'updateIngestedSpecAsync', 'loadSpecMeta']) assert.strictEqual(typeof se.default[fn], 'function', `default export lacks ${fn}`);
  });

  await NS.sync(rl, se, { only, liveRoot: live });
  const first = core();

  await test('NI-002', 'one changed file updates the spec in place — same uuid, only that chunk rewritten', async () => {
    const before = se.loadSpec(first.specUuid);
    const untouched = before.chunks.find(c => c.realPath === 'lib/b.js');
    const untouchedAt = untouched.updatedAt;
    w('lib/a.js', 'module.exports = 42;\n');
    const out = await NS.sync(rl, se, { only, liveRoot: live });
    const sys = out.systems.find(s => s.system === 'core');
    assert.strictEqual(sys.status, 'updated');
    assert.strictEqual(sys.steps.inPlaceChunks, 1, JSON.stringify(sys.steps));
    assert.strictEqual(core().specUuid, first.specUuid, 'same spec');
    const after = se.loadSpec(first.specUuid);
    const a = after.chunks.find(c => c.realPath === 'lib/a.js');
    assert.strictEqual(a.content, 'module.exports = 42;');
    assert.match(fs.readFileSync(a.filePath, 'utf8'), /module\.exports = 42;/);
    assert.strictEqual(after.chunks.find(c => c.realPath === 'lib/b.js').updatedAt, untouchedAt, 'the unchanged chunk is not rewritten');
    assert.strictEqual(core().rootHash, after.rootHash, 'the repo row follows the manifest');
    const mat = rl.materialize(core().uuid);
    assert.match(fs.readFileSync(path.join(mat.dir, 'lib/a.js'), 'utf8'), /42/, 'the materialized file is the new one');
  });

  await test('NI-003', 'a file added runs the whole re-ingest (new spec), the old spec purged', async () => {
    w('lib/c.js', 'module.exports = 3;\n');
    const out = await NS.sync(rl, se, { only, liveRoot: live });
    const sys = out.systems.find(s => s.system === 'core');
    assert.strictEqual(sys.status, 'updated');
    assert.ok(!('inPlaceChunks' in sys.steps), 'not in place');
    assert.notStrictEqual(core().specUuid, first.specUuid);
    assert.throws(() => se.loadSpec(first.specUuid), /not found/, 'the replaced version is purged');
  });

  await test('NI-004', 'the snapshot names the files whose content changed', async () => {
    w('docs/readme.md', '# core, edited\n');
    const out = await NS.sync(rl, se, { only, liveRoot: live });
    assert.deepStrictEqual(out.stats0.changed, ['docs/readme.md']);
    assert.strictEqual(out.stats0.changedCount, 1);
    const api = fs.readFileSync(path.join(__dirname, '../../idearium/api/index.js'), 'utf8');
    assert.match(api, /changed: \$\{r\.stats0\.changed\.join/, 'the sync log prints them');
  });

  await test('NI-005', 'the meta sidecar serves a cold read only while its stamp matches the manifest', async () => {
    const uuid = core().specUuid;
    const root = se.SPECS_ROOT || path.dirname(path.dirname(se.loadSpec(uuid).chunks[0].filePath));
    const dir = path.join(root, uuid);
    const sc = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.meta.json'), 'utf8'));
    const st = fs.statSync(path.join(dir, 'manifest.json'));
    assert.deepStrictEqual(sc.of, { size: st.size, mtimeMs: st.mtimeMs });
    assert.ok(sc.meta.chunks.every(c => !('content' in c)), 'no chunk content in the sidecar');
    const url = pathToFileURL(path.join(__dirname, '../../idearium/spec-engine/index.js')).href;
    const cold = (tag) => execFileSync(process.execPath, ['--input-type=module', '-e',
      `import(${JSON.stringify(url)}).then(m => { const x = m.loadSpecMeta(${JSON.stringify(uuid)}); console.log(JSON.stringify({ name: x.name, tag: x.__ni || null })); })`],
      { encoding: 'utf8', env: process.env }).trim().split('\n').pop();
    // mark the sidecar: a cold reader that took it shows the mark
    sc.meta.__ni = 'from-sidecar';
    fs.writeFileSync(path.join(dir, 'manifest.meta.json'), JSON.stringify(sc));
    assert.strictEqual(JSON.parse(cold()).tag, 'from-sidecar');
    // manifest.json written some other way — the stamp no longer matches, the full parse runs
    const m = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'));
    m.name = m.name + ' (edited by hand)';
    fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify(m, null, 2));
    const r = JSON.parse(cold());
    assert.strictEqual(r.tag, null);
    assert.match(r.name, /edited by hand/);
  });

  console.log(`\n  ${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}
main().catch(e => { console.error(e); process.exit(1); });
