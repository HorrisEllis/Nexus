'use strict';
// tests/modules/test-nexus-specs-and-ideas-cleanup.test.js — 0.39.266.
// James: "delete old specs, idearium is supposed to do that when removing them from the list, the specs
// aren't supposed to stay ideas. right now there is 15 and 15 but supposed to only be nexus and the nested
// repos." Measured before: every repo ingest minted a "Repo: <name>" idea (the nexus sync alone: 15), and
// every nexus/core change kept a new ~55 MB spec version forever; removing a spec only flagged it.
//
//   SC-001  a nexus repo mints no idea
//   SC-002  a changed system keeps exactly one spec on disk (the replaced version is purged, chunk nodes too)
//   SC-003  nexus repos made before this: their auto idea is removed and old versions purged by the next sync
//   SC-004  an idea a person wrote is never removed by the cleanup
//   SC-005  purgeSpec removes the directory and the cortex mirror rows
//   SC-006  deleting a user repo purges its specs; a spec another live repo uses stays
//   SC-007  orphaned "Repo: nexus/…" ideas (from earlier re-registrations, linked to nothing) are removed too
//   SC-008  purgeSpec is on spec-engine's DEFAULT export — the surface idearium/api actually calls (m.default || m).
//           Live run caught it missing: every purge was silently skipped while the tests (named import) passed.
require('../../lib/test-sandbox.js').ensure();

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'sc-test-'));
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
  w('guardian/server.js', 'module.exports = 1;\n');
  w('lib/util.js', 'module.exports = 3;\n');

  const se = await import('../../idearium/spec-engine/index.js');
  const { RepoLayer } = await import('../../idearium/repo/index.js');
  const NS = await import('../../idearium/repo/nexus-self.js');
  const { jaaDB } = require('../../cortex/memory/jaa-db.js');
  const ideas = [];
  const ideaOS = { db: { ideas }, createIdea: ({ text, phase, source }) => { const i = { uuid: `idea-${ideas.length + 1}`, text, phase, source }; ideas.push(i); return i; } };
  const rl = new RepoLayer({ ideaOS, specEngine: se });
  const only = ['guardian', 'core'];
  const onDisk = (id) => fs.existsSync(path.join(se.SPECS_ROOT || path.join(require('../../idearium/lib/data-dir.cjs').ideariumDataDir(), 'specs'), id));
  const nexus = () => rl.list({ includeArchived: true }).filter(r => r.nexusSelf);

  await NS.sync(rl, se, { only, liveRoot: live });

  await test('SC-001', 'a nexus repo mints no idea', () => {
    assert.strictEqual(ideas.length, 0, JSON.stringify(ideas));
    assert.ok(nexus().every(r => !r.ideaUuid));
  });

  await test('SC-002', 'a changed system keeps exactly one spec on disk', async () => {
    const core = () => nexus().find(r => r.nexusSelf.system === 'core');
    const first = core().specUuid;
    const firstChunks = (se.loadSpecMeta(first).chunks || []).map(c => c.uuid);
    w('lib/util.js', 'module.exports = 4;\n');
    await NS.sync(rl, se, { only, liveRoot: live });
    const now = core();
    assert.notStrictEqual(now.specUuid, first, 'a new version was made');
    assert.strictEqual(onDisk(first), false, 'the replaced version is gone from disk');
    assert.strictEqual(onDisk(now.specUuid), true);
    const nodesDir = require('../../idearium/lib/data-dir.cjs').resolveIdeariumPath('data/nodes/chunk');
    const left = fs.existsSync(nodesDir) ? fs.readdirSync(nodesDir).filter(f => firstChunks.some(u => f.endsWith(`.${u}.chunk`))) : [];
    assert.deepStrictEqual(left, [], 'its .chunk nodes are gone too');
  });

  await test('SC-003', 'older nexus repos: auto idea removed, old versions purged by the next sync', async () => {
    const g = nexus().find(r => r.nexusSelf.system === 'guardian');
    const idea = ideaOS.createIdea({ text: 'Repo: nexus/guardian', phase: 'specced', source: 'repo-ingest' });
    rl.annotate(g.uuid, { ideaUuid: idea.uuid });
    const stale = se.ingestFilesAsSpec({ name: 'nexus/guardian', files: [{ path: 'guardian/x.js', content: 'x\n' }], author: 'nexus-self', repoUuid: g.uuid });
    const row = rl.repos.repos.find(x => x.uuid === g.uuid);
    row.specHistory = [...(row.specHistory || []), { specUuid: stale.uuid, until: Date.now() }]; rl._save();
    const out = await NS.sync(rl, se, { only, liveRoot: live });
    assert.deepStrictEqual(out.cleaned, { ideas: 1, specs: 1 });
    assert.strictEqual(ideas.find(i => i.uuid === idea.uuid), undefined);
    assert.strictEqual(onDisk(stale.uuid), false);
    assert.deepStrictEqual((await NS.sync(rl, se, { only, liveRoot: live })).cleaned, { ideas: 0, specs: 0 }, 'idempotent');
  });

  await test('SC-004', 'an idea a person wrote is never removed by the cleanup', async () => {
    const g = nexus().find(r => r.nexusSelf.system === 'guardian');
    ideas.push({ uuid: 'mine', text: 'make guardian faster', source: 'person' });
    rl.annotate(g.uuid, { ideaUuid: 'mine' });
    await NS.sync(rl, se, { only, liveRoot: live });
    assert.ok(ideas.find(i => i.uuid === 'mine'));
  });

  await test('SC-005', 'purgeSpec removes the directory and the cortex mirror rows', () => {
    const m = se.ingestFilesAsSpec({ name: 'throwaway', files: [{ path: 'a.js', content: 'a\n' }], author: 'test' });
    assert.ok(jaaDB.query('idearium_spec_chunks', r => r.specUuid === m.uuid).length > 0, 'mirrored first');
    const p = se.purgeSpec(m.uuid);
    assert.strictEqual(p.purged, true);
    assert.strictEqual(onDisk(m.uuid), false);
    assert.strictEqual(jaaDB.query('idearium_spec_chunks', r => r.specUuid === m.uuid).length, 0);
    assert.strictEqual(jaaDB.query('idearium_spec_manifests', r => r.uuid === m.uuid).length, 0);
    assert.ok(!se.listSpecs({ includeDeleted: true }).some(s => s.uuid === m.uuid));
  });

  await test('SC-006', 'deleting a user repo purges its specs; a spec another live repo uses stays', () => {
    const a = rl.ingest({ name: 'user-a', files: [{ path: 'a.js', content: 'a = 1\n' }] });
    const b = rl.ingest({ name: 'user-b', files: [{ path: 'b.js', content: 'b = 1\n' }] });
    rl.repos.repos.find(x => x.uuid === b.repo.uuid).specHistory = [{ specUuid: a.repo.specUuid }];   // b once pointed at a's spec
    const out = rl.archive(b.repo.uuid);
    assert.deepStrictEqual(out.purgedSpecs, [b.repo.specUuid], 'b\'s own spec goes; a\'s (live) stays');
    assert.strictEqual(onDisk(a.repo.specUuid), true);
    assert.strictEqual(onDisk(b.repo.specUuid), false);
  });

  await test('SC-007', 'orphaned "Repo: nexus/…" ideas are removed; a person\'s idea with the same words is kept', async () => {
    ideas.push({ uuid: 'orphan-1', text: 'Repo: nexus/cortex', source: 'repo-ingest' });
    ideas.push({ uuid: 'orphan-2', text: 'Repo: nexus', source: 'repo-ingest' });
    ideas.push({ uuid: 'person', text: 'Repo: nexus/cortex', source: 'person' });
    const out = await NS.sync(rl, se, { only, liveRoot: live });
    assert.ok(out.cleaned.ideas >= 2, JSON.stringify(out.cleaned));
    assert.deepStrictEqual(ideas.filter(i => /^Repo: nexus/.test(i.text)).map(i => i.uuid), ['person']);
  });

  await test('SC-008', 'purgeSpec is on the default export idearium/api uses', async () => {
    const m = await import('../../idearium/spec-engine/index.js');
    const apiView = m.default || m;
    assert.strictEqual(typeof apiView.purgeSpec, 'function');
  });

  console.log(`\n  ${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}
main().catch(e => { console.error(e); process.exit(1); });
