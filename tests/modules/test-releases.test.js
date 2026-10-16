'use strict';
/**
 * tests/modules/test-releases.test.js — RN1 (docs/2026-10-15-one-contract-raid-releases-phasemap.spec): releases in
 * Versionium. versionium/lib/releases.js + /api/versionium/tags|releases · lib/nexus-releases.js · lib/repo-releases.js.
 * James (2026-10-15): "i want idearium to have releases and a changelog for each version. it was added to the wrong
 * place" · "use versioning in versionium for versions using the api."
 *
 *   RL-01  a tag never moves: the same name on the same commit is idempotent, on another commit refused; a release
 *          recorded again keeps what it had and only fills what it lacked
 *   RL-02  the API: POST/GET /api/versionium/tags and /releases (one, or a batch), GET /releases/:version; 409 on a move
 *   RL-03  Nexus's releases are read from lib/version.js, the changelogs and git — James's words verbatim — and synced
 *          through the API; a second sync records nothing new
 *   RL-04  a repo's release: the head of its Versionium branch, tagged, with the commits since the last release; refused
 *          (said) with no versions, with nothing new, and below the last version
 *   RL-05  wired: Idearium's routes and the commands (repo releases, releases) name them
 */
require('../../lib/test-sandbox.js').ensure();
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const ROOT = path.join(__dirname, '../..');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'nx-rn1-'));
process.env.VERSIONIUM_DATA_DIR = path.join(TMP, 'v');
process.on('exit', () => { try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (_) {} });

let passed = 0, failed = 0;
async function test(id, desc, fn) {
  try { await fn(); console.log(`  ✓ ${id} ${desc}`); passed++; }
  catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${e.stack ? e.stack.split('\n').slice(0, 14).join('\n    ') : e.message}`); failed++; }
}
const quiet = async (fn) => { const w = console.warn, l = console.log; console.warn = () => {}; console.log = () => {}; try { return await fn(); } finally { console.warn = w; console.log = l; } };

(async () => {
  console.log('\ntest-releases — releases in Versionium (RN1)');
  const REL = require(path.join(ROOT, 'versionium/lib/releases.js'));
  const route = require(path.join(ROOT, 'versionium/routes/versionium.js'));
  const engine = require(path.join(ROOT, 'versionium/lib/engine.js'));
  const NR = require(path.join(ROOT, 'lib/nexus-releases.js'));
  const RR = require(path.join(ROOT, 'lib/repo-releases.js'));

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://x');
    const done = await route.handle(req, res, { method: req.method, pathname: url.pathname, url }).catch(e => { res.writeHead(500); res.end(e.message); return true; });
    if (!done) { res.writeHead(404); res.end('{}'); }
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const port = server.address().port;
  const call = (method, p, body) => new Promise((resolve, reject) => {
    const data = body === undefined ? null : JSON.stringify(body);
    const req = http.request({ host: '127.0.0.1', port, path: p, method, headers: data ? { 'content-type': 'application/json', 'content-length': Buffer.byteLength(data) } : {} }, (res) => {
      let t = ''; res.on('data', c => { t += c; }); res.on('end', () => { let j = null; try { j = JSON.parse(t); } catch (_) {} resolve({ status: res.statusCode, body: j }); });
    });
    req.on('error', reject); if (data) req.write(data); req.end();
  });
  // the transport Idearium's _vcall is: throws the error, answers the data
  const v = async (method, p, body) => { const r = await call(method, p, body); if (r.status >= 400 || (r.body && r.body.ok === false)) throw Object.assign(new Error((r.body && r.body.error) || `HTTP ${r.status}`), { status: r.status }); return r.body; };

  await test('RL-01', 'a tag never moves; a release recorded again only fills what it lacked', () => {
    const a = REL.tag({ repository: 'r1', name: 'v1.0.0', commitId: 'vtm-a' });
    assert.ok(REL.tag({ repository: 'r1', name: 'v1.0.0', commitId: 'vtm-a' }).already);
    assert.throws(() => REL.tag({ repository: 'r1', name: 'v1.0.0', commitId: 'vtm-b' }), /a tag never moves/);
    assert.ok(REL.tag({ repository: 'r2', name: 'v1.0.0', commitId: 'vtm-b' }).uuid, 'a tag is per repository');
    const r = REL.release({ repository: 'r3', version: '0.2.0', quote: 'James — "first"' });
    assert.ok(r.unpinned, 'no commit: said, not invented');
    const again = REL.release({ repository: 'r3', version: '0.2.0', gitCommit: 'abc123', quote: 'someone else' });
    assert.strictEqual(again.quote, 'James — "first"', 'what was recorded stays');
    assert.strictEqual(again.gitCommit, 'abc123'); assert.ok(!again.unpinned);
    REL.release({ repository: 'r3', version: '0.10.0' }); REL.release({ repository: 'r3', version: '0.9.1' });
    assert.deepStrictEqual(REL.releases({ repository: 'r3' }).map(x => x.version), ['0.10.0', '0.9.1', '0.2.0'], 'newest first, by semver');
    assert.ok(a.uuid);
  });

  await test('RL-02', 'the API: tags and releases, one or a batch; a move is 409', async () => {
    const c = engine.commit({ message: 'api', branch: 'main', system: 'test' });
    let r = await call('POST', '/api/versionium/tags', { repository: 'api', name: 'first', commitId: c.commitId });
    assert.strictEqual(r.status, 200); assert.strictEqual(r.body.tag.commitId, c.commitId);
    r = await call('POST', '/api/versionium/tags', { repository: 'api', name: 'first', commitId: 'vtm-other' });
    assert.strictEqual(r.status, 409);
    r = await call('POST', '/api/versionium/releases', { repository: 'api', version: '1.0.0', commitId: c.commitId, notes: 'one' });
    assert.strictEqual(r.status, 200); assert.strictEqual(r.body.release.tag, 'v1.0.0');
    r = await call('POST', '/api/versionium/releases', { releases: [{ repository: 'api', version: '1.0.1' }, { repository: 'api', version: 'bad' }, { repository: 'api', version: '1.0.0', commitId: c.commitId }] });
    assert.deepStrictEqual([r.body.recorded, r.body.already, r.body.refused.length], [1, 1, 1], JSON.stringify(r.body));
    r = await call('GET', '/api/versionium/releases?repository=api');
    assert.deepStrictEqual(r.body.releases.map(x => x.version), ['1.0.1', '1.0.0']);
    r = await call('GET', '/api/versionium/releases/v1.0.0?repository=api');
    assert.strictEqual(r.body.release.notes, 'one');
    assert.strictEqual((await call('GET', '/api/versionium/releases/9.9.9?repository=api')).status, 404);
    r = await call('GET', '/api/versionium/tags?repository=api');
    assert.deepStrictEqual(r.body.tags.map(t => t.name), ['first', 'v1.0.0', 'v1.0.1']);
  });

  await test('RL-03', "Nexus's releases: read from version lines, changelogs and git; James's words verbatim; synced through the API", () => quiet(async () => {
    assert.strictEqual(NR.quoteOf('James — "we added gating" · "yes" (to recursion deeper than one level). BR2 built: x'), 'James — "we added gating" · "yes" (to recursion deeper than one level)');
    assert.strictEqual(NR.quoteOf('James: *"i want the picker"* — *"lets do it."*'), 'James: "i want the picker" — "lets do it."');
    assert.strictEqual(NR.quoteOf('staging-self-heal C0 merged'), null, 'a line that does not quote him has no quote, not a made-up one');
    const all = NR.read();
    const cur = require(path.join(ROOT, 'lib/release-version.js')).current().version;
    assert.ok(all.length > 200 && all[all.length - 1].version === cur, `${all.length}, last ${all[all.length - 1].version}`);
    const r40 = all.find(x => x.version === '0.60.40');
    assert.strictEqual(r40.quote, 'James — "we added gating and chunking recursively, dynamically, like bricks" · "yes" (to recursion deeper than one level)');
    assert.strictEqual(r40.changelog, 'CHANGELOG-0.60.40.md'); assert.match(r40.proof, /test-recursive-split 5\/5/);
    for (const x of all) assert.ok(x.gitCommit || x.why, `${x.version}: no commit and no reason`);
    const s1 = await NR.sync(v);
    assert.ok(s1.ok && s1.recorded === all.length, JSON.stringify({ ...s1, refused: s1.refused.slice(0, 2) }));
    const s2 = await NR.sync(v);
    assert.deepStrictEqual([s2.recorded, s2.already], [0, all.length], 'idempotent');
    const got = (await v('GET', '/api/versionium/releases/0.60.40?repository=nexus')).release;
    assert.strictEqual(got.quote, r40.quote);
  }));

  await test('RL-04', "a repo's release: its head, tagged, with the commits since the last; refusals said", async () => {
    const repo = 'rn1-repo';
    await assert.rejects(RR.cut(v, repo), /no versions yet/);
    const put = (m) => engine.commit({ message: m, branch: `repo-${repo}`, system: 'idearium.repo', state: { provenance: { by: ['ollama'] } } });
    put('write lib/a.js'); const h1 = put('write lib/b.js');
    let flushed = 0;
    const r1 = await RR.cut(v, repo, { quote: 'James — "first release"', flush: async () => { flushed++; } });
    assert.strictEqual(flushed, 1, 'pending changes are committed first');
    assert.deepStrictEqual([r1.version, r1.commitId, r1.commits.length], ['0.1.0', h1.commitId, 2]);
    assert.strictEqual(r1.notes, '- write lib/a.js (ollama)\n- write lib/b.js (ollama)', 'notes written from the commits, oldest first');
    await assert.rejects(RR.cut(v, repo), (e) => e.status === 409 && /nothing changed since v0\.1\.0/.test(e.message));
    const h2 = put('write lib/c.js');
    await assert.rejects(RR.cut(v, repo, { version: '0.0.9' }), /not above the last release/);
    const r2 = await RR.cut(v, repo);
    assert.deepStrictEqual([r2.version, r2.commitId, r2.commits.map(c => c.message), r2.since], ['0.1.1', h2.commitId, ['write lib/c.js'], '0.1.0']);
    assert.deepStrictEqual((await RR.list(v, repo)).map(x => x.tag), ['v0.1.1', 'v0.1.0']);
    const again = await RR.cut(v, repo, { version: '0.1.1' });
    assert.ok(again.already, 'the same version on the same head is the same release');
  });

  await test('RL-05', "wired: Idearium's routes and the commands", () => {
    const api = fs.readFileSync(path.join(ROOT, 'idearium/api/index.js'), 'utf8');
    for (const a of ['repo.releases.list', 'repo.releases.create', 'releases.list', 'releases.sync']) assert.ok(api.includes(`'${a}'],`) || api.includes(`'${a}'],    `) || new RegExp(`\\['(GET|POST)',.*'${a.replace(/\./g, '\\.')}'\\]`).test(api), `${a} is routed`);
    assert.ok(api.includes("case 'repo.releases.list': case 'repo.releases.create':"));
    const T = require(path.join(ROOT, 'idearium/cli/route-commands.js'));
    const rows = T.SPEC || T.COMMANDS || T.default || T;
    const keys = (Array.isArray(rows) ? rows : Object.values(rows).find(Array.isArray) || []).map(r => r.key);
    assert.ok(keys.includes('repo.releases') && keys.includes('system.releases'), keys.slice(0, 5).join(','));
  });

  server.close();
  // 0.60.111 — his boot log (a GitHub zip, no .git): "[idearium] releases not synced to versionium yet: Cannot read properties
  // of undefined (reading 'get')". read() must work in a copy with no git history; its releases are then unpinned, said.
  await test('RL-06', 'a copy with no .git (a downloaded zip) still reads its releases, unpinned', () => {
    const t = fs.mkdtempSync(path.join(os.tmpdir(), 'rl-nogit-'));
    fs.mkdirSync(path.join(t, 'lib'));
    fs.copyFileSync(path.join(ROOT, 'lib/version.js'), path.join(t, 'lib/version.js'));
    fs.copyFileSync(path.join(ROOT, 'package.json'), path.join(t, 'package.json'));
    const v = require(path.join(ROOT, 'lib/version.js')).system;
    fs.copyFileSync(path.join(ROOT, `CHANGELOG-${v}.md`), path.join(t, `CHANGELOG-${v}.md`));
    const all = NR.read({ root: t });
    assert.ok(all.some(r => r.version === v), 'the current release is read');
    assert.ok(all.every(r => !r.gitCommit), 'no git, so nothing is pinned to a commit');
    fs.rmSync(t, { recursive: true, force: true });
  });
  console.log(`\n  ${passed} passed, ${failed} failed`);
  process.exitCode = failed ? 1 : 0;
  setTimeout(() => process.exit(process.exitCode), 50).unref();
})();
