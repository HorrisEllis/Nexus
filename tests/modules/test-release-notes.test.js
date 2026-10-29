'use strict';
/**
 * tests/modules/test-release-notes.test.js — RN2 (0.60.72): every change recorded under the release that shipped it.
 * lib/release-notes.js · lib/nexus-releases.js (pinning) · versionium/lib/releases.js (commits filled on sync) ·
 * idearium releases.changes + the `changes` command.
 * James (2026-10-16): "tell me all the recent changes. i want a changelog for each change or diff. i want it all syncd
 * with git, versionium, the zip."
 *
 * A fixture git repo, built here, holds today's real cases: two branches both release 0.60.2; one is renumbered 0.60.4 at
 * its merge; a map commit carries no version.
 *   RN2-01  every release line shape is read (live, "// prev system:", "// previous:", "previous: x — system:"); another
 *           component's line is not
 *   RN2-02  each release is pinned to its own commit: the renumbered one to the merge that renumbered it, never to the
 *           other branch's line that had the same number
 *   RN2-03  every commit is listed exactly once, under the first release that contains it; the map commit is listed under
 *           the release that shipped it; a commit after the last release is "not yet in a release"
 *   RN2-04  sync gives Versionium each release's commits; a release recorded before (without them) gains them, nothing
 *           else rewritten
 *   RN2-05  wired: GET /api/releases/changes, the `changes` command, `releases --sync --all`, npm run changes
 *   RN2-06  Idearium's Versionium tab shows Releases (RN3): Nexus's parent repo every release, a system's repo only those
 *           whose commits touched it; a row opens to his words, its changelog and every commit; no commits yet says sync
 */
require('../../lib/test-sandbox.js').ensure();
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const ROOT = path.join(__dirname, '../..');
const NR = require(path.join(ROOT, 'versionium/lib/nexus-releases.js'));   // 0.60.277 VS1 — Versionium's (his (a))
const RN = require(path.join(ROOT, 'versionium/lib/release-notes.js'));

let passed = 0, failed = 0;
async function test(id, desc, fn) {
  try { await fn(); console.log(`  ✓ ${id} ${desc}`); passed++; }
  catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${e.stack.split('\n').slice(0, 6).join('\n    ')}`); failed++; }
}

// ── the fixture repo ────────────────────────────────────────────────────────────────────────────────────────────────
const R = fs.mkdtempSync(path.join(os.tmpdir(), 'rn2-'));
let clock = Date.parse('2026-10-15T10:00:00Z');
const git = (...a) => execFileSync('git', a, { cwd: R, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, GIT_AUTHOR_DATE: new Date(clock).toISOString(), GIT_COMMITTER_DATE: new Date(clock).toISOString(), GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' } }).trim();
const put = (f, t) => { fs.mkdirSync(path.dirname(path.join(R, f)), { recursive: true }); fs.writeFileSync(path.join(R, f), t); };
const version = (live, prev) => put('lib/version.js', `const VERSION = {\n  system: ${live}\n${prev.map(p => `  ${p}`).join('\n')}\n  copilot: '3.7.1',   // [0.39.282: not a release]\n};\n`);
const commit = (msg) => { clock += 60000; git('add', '-A'); git('commit', '-qm', msg); return git('rev-parse', 'HEAD'); };
const L = {
  v1: `'0.60.1',   // [0.60.1: James: "first"]`,
  v2main: `'0.60.2',   // [0.60.2: James: "main's two"]`,
  v2branch: `'0.60.2',   // [0.60.2: James: "the branch's two"]`,
  v3: `'0.60.3',   // [0.60.3: James: "three"]`,
  v4: `'0.60.4',   // [0.60.4 (built on the branch as 0.60.2; renumbered at the merge): James: "the branch's two"]`,
};
git('init', '-q', '-b', 'main');
version(L.v1, []); put('CHANGELOG-0.60.1.md', '# 0.60.1\n'); put('a.js', '1'); const c1 = commit('0.60.1: first');
git('checkout', '-q', '-b', 'side');
version(L.v2branch, [`// prev system: ${L.v1}`]); put('CHANGELOG-0.60.2.md', '# 0.60.2 (branch)\n'); put('clear-glass/b.js', 'b'); const cBranch = commit('0.60.2: the branch');
git('checkout', '-q', 'main');
version(L.v2main, [`// prev system: ${L.v1}`]); put('CHANGELOG-0.60.2.md', '# 0.60.2\n'); put('guardian/m.js', 'm'); const c2 = commit('0.60.2: main');
put('docs/x-phasemap.spec', 'map'); const cMap = commit('Map: a phasemap, no version');
version(L.v3, [`// prev system: ${L.v2main}`, `// previous: ${L.v1}`]); put('CHANGELOG-0.60.3.md', '# 0.60.3\n'); const c3 = commit('0.60.3: three');
clock += 60000;
try { git('merge', '-q', '--no-ff', 'side', '-m', 'Merge side; its 0.60.2 renumbered 0.60.4'); } catch (_) { /* conflicts: resolved below */ }
version(L.v4, [`// prev system: ${L.v3}`, `// prev system: ${L.v2main}`, `// previous: ${L.v1}`]);
put('CHANGELOG-0.60.2.md', '# 0.60.2\n'); put('CHANGELOG-0.60.4.md', '# 0.60.4 (built as 0.60.2)\n');
git('add', '-A'); git('commit', '-qm', 'Merge side; its 0.60.2 renumbered 0.60.4', '--no-edit'); const cMerge = git('rev-parse', 'HEAD');
put('later.js', 'later'); const cAfter = commit('a change after the last release');

(async () => {
  console.log('\ntest-release-notes — every change under the release that shipped it (RN2, 0.60.72)');

  await test('RN2-01', 'every release line shape is read; another component\'s is not', async () => {
    assert.deepStrictEqual(NR.lineOf(`  system: ${L.v1}`), { version: '0.60.1', body: 'James: "first"' });
    assert.strictEqual(NR.lineOf(`  // prev system: ${L.v4}`).version, '0.60.4');
    assert.strictEqual(NR.lineOf(`  // previous: '0.60.55',   // [0.60.55: James — "x"]`).version, '0.60.55');
    assert.strictEqual(NR.lineOf(`  // previous: 0.41.0 — system: '0.41.0',   // [0.41.0: James: "y"]`).version, '0.41.0');
    assert.strictEqual(NR.lineOf(`  copilot: '3.7.1',   // [0.39.282: not a release]`), null);
    assert.strictEqual(NR.lineOf(`  // previous: 0.39.335 — copilot:      '3.7.1',   // [0.39.282: PATCH]`), null);
  });

  const rel = NR.read({ root: R });
  const by = new Map(rel.map(r => [r.version, r]));
  await test('RN2-02', 'each release is pinned to its own commit; the renumbered one to its merge', async () => {
    assert.deepStrictEqual([...by.keys()], ['0.60.1', '0.60.2', '0.60.3', '0.60.4']);
    assert.strictEqual(by.get('0.60.1').gitCommit, c1);
    assert.strictEqual(by.get('0.60.2').gitCommit, c2, 'main\'s 0.60.2 — not the branch\'s commit that also wrote 0.60.2');
    assert.notStrictEqual(by.get('0.60.2').gitCommit, cBranch);
    assert.strictEqual(by.get('0.60.3').gitCommit, c3);
    assert.strictEqual(by.get('0.60.4').gitCommit, cMerge, 'the merge that renumbered it (its line is added by the merge)');
    assert.ok(rel.every(r => r.pinnedBy === 'line'), JSON.stringify(rel.map(r => [r.version, r.pinnedBy])));
    assert.strictEqual(by.get('0.60.4').quote, 'James: "the branch\'s two"');
  });

  await test('RN2-03', 'every commit once, under the first release that contains it', async () => {
    const m = RN.commitsOf(rel, { root: R });
    const ids = (v) => (m.get(v) || []).map(c => c.sha);
    assert.deepStrictEqual(ids('0.60.1'), [c1]);
    assert.deepStrictEqual(ids('0.60.2'), [c2]);
    assert.deepStrictEqual(ids('0.60.3'), [c3, cMap], 'the map commit ships with 0.60.3');
    assert.deepStrictEqual(ids('0.60.4'), [cBranch], 'the branch\'s work ships with the release its merge made');
    assert.deepStrictEqual(ids('unreleased'), [cAfter]);
    const all = [...m.values()].flat().map(c => c.sha);
    assert.strictEqual(new Set(all).size, all.length, 'no commit twice');
    assert.strictEqual(all.length, Number(git('rev-list', '--no-merges', '--count', 'HEAD')), 'none lost');
    const md = RN.markdown(rel, { root: R, since: '0.60.1' });
    assert.ok(/## Not yet in a release[\s\S]*a change after the last release/.test(md));
    assert.ok(/## 0\.60\.3[\s\S]*Map: a phasemap, no version[\s\S]*`docs\/x-phasemap\.spec`/.test(md), md.slice(0, 900));
    assert.ok(!/## 0\.60\.1\b/.test(md), 'since excludes it');
    const sinced = RN.commitsOf(rel, { root: R, since: '0.60.2' });
    assert.deepStrictEqual((sinced.get('0.60.3') || []).map(c => c.sha), [c3, cMap], 'since gives the same answer for what it covers');
  });

  await test('RN2-04', 'sync gives Versionium each release\'s commits; one recorded before gains them', async () => {
    const REL = require(path.join(ROOT, 'versionium/lib/releases.js'));
    REL.release({ repository: 'nexus', version: '0.60.3', quote: 'James: "three"' });   // recorded by RN1, no commits
    const v = async (method, p, body) => {
      assert.strictEqual(p, '/api/versionium/releases');
      let recorded = 0, already = 0;
      for (const r of body.releases) { const x = REL.release(r); if (x.already) already++; else recorded++; }
      return { recorded, already, refused: [] };
    };
    const s = await NR.sync(v, { root: R, commits: 'all' });
    assert.ok(s.ok && s.withCommits === 4, JSON.stringify(s));
    const r3 = REL.get({ repository: 'nexus', version: '0.60.3' });
    assert.deepStrictEqual(r3.commits.map(c => c.sha), [c3, cMap], 'filled in');
    assert.strictEqual(r3.quote, 'James: "three"', 'what was recorded stays');
    assert.deepStrictEqual(Object.keys(r3.files).sort(), ['docs', 'lib', 'root']);
  });

  await test('RN2-05', 'wired: the route, the commands, npm run changes', async () => {
    const api = fs.readFileSync(path.join(ROOT, 'idearium/api/index.js'), 'utf8');
    assert.ok(/\['GET',\s+\['api','releases','changes'\],\s+'releases\.changes'\]/.test(api) && /case 'releases\.changes'/.test(api));
    const { SPEC } = require(path.join(ROOT, 'idearium/cli/route-commands.js'));
    const row = SPEC.find(r => r.key === 'system.changes');
    assert.ok(row && /since=0\.60\.47/.test(row.req({ flags: { since: '0.60.47' }, args: [] }).path));
    const rel = SPEC.find(r => r.key === 'system.releases');
    assert.deepStrictEqual(rel.req({ flags: { sync: true, all: true }, args: [] }).body, { all: true });
    assert.ok(/release-notes\.js/.test(JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).scripts.changes || ''));
  });

  await test('RN2-06', 'the Versionium tab\'s Releases: all for Nexus, a system\'s own, a row opens to what landed', async () => {
    const { JSDOM } = require('jsdom');
    const w = new JSDOM('<div id="rel-index"></div>', { runScripts: 'outside-only' }).window;
    const releases = [
      { version: '0.60.3', tag: 'v0.60.3', quote: 'James: "three"', changelog: 'CHANGELOG-0.60.3.md', gitCommit: 'c3c3c3c3c3', files: { docs: ['docs/x.spec'], lib: ['lib/version.js'] },
        commits: [{ sha: 'c3c3c3c3c3', at: '2026-10-15T10:05:00Z', subject: '0.60.3: three', systems: ['lib'], files: 1, added: 2, removed: 1 },
                  { sha: 'mapmapmap0', at: '2026-10-15T10:04:00Z', subject: 'Map: a phasemap', systems: ['docs'], files: 1, added: 1, removed: 0 }] },
      { version: '0.60.2', tag: 'v0.60.2', quote: 'James: "two"', gitCommit: 'c2c2c2c2c2', files: { guardian: ['guardian/m.js'] }, commits: [{ sha: 'c2c2c2c2c2', at: '2026-10-15T10:03:00Z', subject: '0.60.2: main', systems: ['guardian'], files: 1, added: 1, removed: 0 }] },
      { version: '0.60.1', tag: 'v0.60.1', quote: 'James: "first"' },
    ];
    const calls = [];
    w.api = async (p) => { calls.push(p); return { releases, current: '0.60.3' }; };
    w.toast = () => {};
    w.eval(fs.readFileSync(path.join(ROOT, 'idearium/ui/js/repo-releases.js'), 'utf8'));
    await w.renderReleases({ uuid: 'nx', nexusSelf: { role: 'parent' } });
    const text = () => w.document.getElementById('rel-index').textContent;
    assert.ok(/releases \(3\)/.test(text()) && /running 0\.60\.3/.test(text()) && /sync \(1 without commits\)/.test(text()), text());
    assert.strictEqual(calls[0], '/api/releases');
    w.openRelease('0.60.3');
    assert.ok(/what landed \(2\)/.test(text()) && /Map: a phasemap/.test(text()) && /CHANGELOG-0\.60\.3\.md/.test(text()), text());
    await w.renderReleases({ uuid: 'gd', nexusSelf: { role: 'system', system: 'guardian' } });
    assert.ok(/releases \(1\) · touching guardian/.test(text()) && /v0\.60\.2/.test(text()) && !/v0\.60\.3/.test(text()), text());
    await w.renderReleases({ uuid: 'repo-1' });
    assert.strictEqual(calls[calls.length - 1], '/api/repos/repo-1/releases', 'an ordinary repo reads its own');
    const app = fs.readFileSync(path.join(ROOT, 'idearium/ui/js/app.js'), 'utf8'), html = fs.readFileSync(path.join(ROOT, 'idearium/ui/index.html'), 'utf8');
    assert.ok(/id="rel-index"/.test(app) && /renderReleases\(repo\)/.test(app) && /js\/repo-releases\.js/.test(html));
  });

  if (!process.env.RN2_KEEP) { try { fs.rmSync(R, { recursive: true, force: true }); } catch (_) {} } else console.log("fixture:", R);
  console.log(`\n  ${passed} passed, ${failed} failed`);
  process.exitCode = failed ? 1 : 0;
  setTimeout(() => process.exit(process.exitCode), 50).unref();
})();
