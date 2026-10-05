'use strict';
// tests/modules/test-nexus-self-visible.test.js — 0.39.266.
// James: "nexus should be in idearium but isn't."
//
// Failure mode (reproduced against a live :4800 before the fix): DELETE /api/repos/<nexus/core>
// archived the immutable repo (RepoLayer.archive had no immutable guard). list() hides archived
// rows; the sync's _findRepo read with includeArchived, saw an unchanged hash, returned
// 'unchanged', and never touched it again. nexus/core + the parent stayed hidden forever, and
// with them the 13 system repos (the library shows systems only from inside nexus).
//
//   NV-001  an immutable repo refuses archive (code IMMUTABLE)
//   NV-002  a nexus repo archived before the guard is restored by the next sync
//   NV-003  an archived row with an active twin stays archived; the active one is used
//   NV-004  the UI reloads the repo list on nexus-self.* events (first boot fills without a reload)
require('../../lib/test-sandbox.js').ensure();

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.join(__dirname, '../..');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'nv-test-'));
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
  const rl = new RepoLayer({ specEngine: se });
  const only = ['guardian', 'core'];
  await NS.sync(rl, se, { only, liveRoot: live });
  const visible = () => rl.list().filter(r => r.nexusSelf);
  const core = () => rl.list({ includeArchived: true }).find(r => r.nexusSelf && r.nexusSelf.system === 'core');
  const parent = () => rl.list({ includeArchived: true }).find(r => r.nexusSelf && r.nexusSelf.role === 'parent');

  await test('NV-001', 'an immutable repo refuses archive (code IMMUTABLE)', () => {
    const r = rl.archive(core().uuid);
    assert.strictEqual(r.code, 'IMMUTABLE', JSON.stringify(r));
    assert.notStrictEqual(core().status, 'archived');
  });

  await test('NV-002', 'a nexus repo archived before the guard existed is restored by the next sync', async () => {
    // simulate the pre-0.39.266 state: the rows were archived directly, bypassing the guard
    for (const r of [core(), parent()]) { const row = rl.repos.repos.find(x => x.uuid === r.uuid); row.status = 'archived'; }
    rl._save();
    assert.ok(!visible().some(r => r.nexusSelf.system === 'core'), 'precondition: core hidden');
    const out = await NS.sync(rl, se, { only, liveRoot: live });
    assert.deepStrictEqual(out.restored.map(x => x.name).sort(), ['nexus', 'nexus/core']);
    assert.ok(visible().some(r => r.nexusSelf.system === 'core'), 'core visible again');
    assert.ok(visible().some(r => r.nexusSelf.role === 'parent'), 'parent visible again');
    assert.deepStrictEqual((await NS.sync(rl, se, { only, liveRoot: live })).restored, [], 'idempotent');
  });

  await test('NV-003', 'an archived twin stays archived when an active row for the same system exists', async () => {
    const twin = rl.ingest({ name: 'nexus/guardian-old', files: [{ path: 'x.js', content: 'x=1\n' }] });
    rl.annotate(twin.repo.uuid, { nexusSelf: { role: 'system', system: 'guardian', hash: 'old' } });
    rl.repos.repos.find(x => x.uuid === twin.repo.uuid).status = 'archived'; rl._save();
    const out = await NS.sync(rl, se, { only, liveRoot: live });
    assert.ok(!out.restored.some(x => x.uuid === twin.repo.uuid), 'twin not restored');
    assert.strictEqual(visible().filter(r => r.nexusSelf.system === 'guardian').length, 1);
    assert.strictEqual(out.systems.find(s => s.system === 'guardian').status, 'unchanged', 'the active row is the one compared');
  });

  await test('NV-004', 'the UI reloads the repo list on nexus-self.* events', () => {
    const app = fs.readFileSync(path.join(ROOT, 'idearium/ui/js/app.js'), 'utf8');
    const fn = app.slice(app.indexOf('function refreshOnEvent('), app.indexOf("if (t.startsWith('queue.'))"));
    assert.match(fn, /t\.startsWith\('nexus-self\.'\)[^\n]*loadApiRepos/);
    // 0.39.330 (VP7) — the repo's Settings renderer moved from app.js to repo-settings.js; the guard moved with it
    const rs = fs.readFileSync(path.join(ROOT, 'idearium/ui/js/repo-settings.js'), 'utf8');
    assert.match(rs, /repo\.immutable \? '<div[^']*'[^:]*: '<div class="rs-danger-row">[\s\S]*?<button class="action-btn danger" onclick="openDeleteRepoModal\(\)"/, 'no Delete button on an immutable repo');
  });

  console.log(`\n  ${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}
main().catch(e => { console.error(e); process.exit(1); });
