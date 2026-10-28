'use strict';
/**
 * tests/modules/test-changelogs-home.test.js — the changelogs live in Versionium, read in Idearium (0.60.274)
 * James, 2026-10-28: "can we move the changelogs to versionium and idearium"
 *
 *   CH-01  every CHANGELOG*.md is in versionium/changelogs, none at the root; lib/changelogs finds each; an older tree's root copy is still read
 *   CH-02  the readers ask lib/changelogs: releases name each changelog by its new path; the release agrees with its changelog
 *   CH-03  wired: GET /api/releases/changelog and the command `system changelog [x.y.z]`
 *   CH-04  Idearium's Releases view: a release opens to its changelog's text, read from the route the first time it is opened
 */
require('../../lib/test-sandbox.js').ensure();
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const CL = require(path.join(ROOT, 'lib/changelogs.js'));

let passed = 0, failed = 0;
async function test(id, desc, fn) { try { await fn(); console.log(`  ✓ ${id} ${desc}`); passed++; } catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${(e.stack || e.message).split('\n').slice(0, 6).join('\n    ')}`); failed++; } }

(async () => {
  console.log('\n⬡  The changelogs in Versionium, read in Idearium\n');
  const v = require(path.join(ROOT, 'lib/version.js')).system;

  await test('CH-01', 'all in versionium/changelogs, none at the root; found by version; an older tree\'s root copy still read', async () => {
    assert.deepStrictEqual(fs.readdirSync(ROOT).filter(n => /^CHANGELOG.*\.md$/.test(n)), [], 'none left at the root');
    const all = CL.list();
    assert.ok(all.length > 400 && all.every(c => c.rel.startsWith('versionium/changelogs/')), `${all.length}`);
    const f = CL.forVersion(undefined, v);
    assert.strictEqual(f.rel, `versionium/changelogs/CHANGELOG-${v}.md`);
    assert.ok(/^# /.test(CL.read(undefined, `v${v}`).text));
    const t = fs.mkdtempSync(path.join(os.tmpdir(), 'ch-old-'));
    fs.writeFileSync(path.join(t, 'CHANGELOG-0.1.2.md'), '# 0.1.2 old\n');
    assert.deepStrictEqual(CL.list(t).map(c => [c.rel, c.version]), [['CHANGELOG-0.1.2.md', '0.1.2']]);
    fs.mkdirSync(path.join(t, CL.DIR), { recursive: true }); fs.writeFileSync(path.join(t, CL.DIR, 'CHANGELOG-0.1.2.md'), '# 0.1.2 new\n');
    assert.strictEqual(CL.read(t, '0.1.2').text, '# 0.1.2 new\n', 'the new home first');
    assert.strictEqual(CL.list(t).length, 1, 'one per name');
    fs.rmSync(t, { recursive: true, force: true });
  });

  await test('CH-02', 'the readers: the release names its changelog by its new path, and agrees with it', async () => {
    const RV = require(path.join(ROOT, 'lib/release-version.js'));
    assert.ok(RV.released().includes(v));
    const place = RV.agreement().places.find(p => /CHANGELOG/.test(p.place));
    assert.deepStrictEqual([place.place, place.ok], [`versionium/changelogs/CHANGELOG-${v}.md`, true]);
    const PC = require(path.join(ROOT, 'lib/phase-census.js'));
    if (typeof PC.releases === 'function') assert.ok(PC.releases(ROOT).some(r => r.ref === `CHANGELOG-${v}.md`));
  });

  await test('CH-03', 'wired: the route and the command', async () => {
    const api = fs.readFileSync(path.join(ROOT, 'idearium/api/index.js'), 'utf8');
    assert.ok(/\['GET',\s+\['api','releases','changelog'\],\s+'releases\.changelog'\]/.test(api) && /case 'releases\.changelog'/.test(api) && /'releases\.changelog': CAPS\.READ_IDEAS/.test(api));
    const { SPEC } = require(path.join(ROOT, 'idearium/cli/route-commands.js'));
    const row = SPEC.find(r => r.key === 'system.changelog');
    assert.strictEqual(row.req({ flags: {}, args: ['0.60.273'] }).path, '/api/releases/changelog?version=0.60.273');
    assert.strictEqual(row.req({ flags: {}, args: [] }).path, '/api/releases/changelog');
  });

  await test('CH-04', 'Idearium\'s Releases: a release opens to its changelog\'s text, read once', async () => {
    const { JSDOM } = require('jsdom');
    const w = new JSDOM('<div id="rel-index"></div>', { runScripts: 'outside-only' }).window;
    const releases = [{ version: '0.60.273', tag: 'v0.60.273', quote: 'James: "need the accessability settings"', changelog: 'CHANGELOG-0.60.273.md',
      changelogPath: 'versionium/changelogs/CHANGELOG-0.60.273.md', gitCommit: 'd411d51e00', commits: [] }];
    const calls = [];
    w.api = async (p) => { calls.push(p); if (p.startsWith('/api/releases/changelog')) return { version: '0.60.273', text: '# 0.60.273 — accessibility per site' }; return { releases, current: '0.60.273' }; };
    w.toast = () => {};
    w.eval(fs.readFileSync(path.join(ROOT, 'idearium/ui/js/repo-releases.js'), 'utf8'));
    await w.renderReleases({ uuid: 'nx', nexusSelf: { role: 'parent' } });
    w.openRelease('0.60.273');
    const el = w.document.getElementById('rel-index');
    assert.ok(/versionium\/changelogs\/CHANGELOG-0\.60\.273\.md/.test(el.textContent), el.textContent);
    const d = el.querySelector('details.rel-cl');
    assert.ok(d, 'the changelog row');
    d.open = true; await w.readChangelog(d); await w.readChangelog(d);
    assert.strictEqual(d.querySelector('.rel-cl-text').textContent, '# 0.60.273 — accessibility per site');
    assert.strictEqual(calls.filter(c => c.startsWith('/api/releases/changelog')).length, 1, 'read once');
    assert.strictEqual(calls.find(c => c.startsWith('/api/releases/changelog')), '/api/releases/changelog?version=0.60.273');
  });

  console.log(`\n  ${passed} passed, ${failed} failed\n`); process.exitCode = failed ? 1 : 0;
})();
