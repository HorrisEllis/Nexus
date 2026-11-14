'use strict';
// CU-01..05 (COS 0.1.2, Nexus 0.60.137): COS says when a newer COS is out.
// James, 2026-10-17 (COS 0.1.0 refusing a root-layout zip): "can you fix cos for me? the zip doesn't have nested folders anymore."
const assert = require('assert'), fs = require('fs'), path = require('path');
const REPO = path.resolve(__dirname, '..', '..');
const U = require('../../cos/app/app-update.js');
let passed = 0, failed = 0; const tests = [];
const test = (n, f) => tests.push([n, f]);
const fakeFetch = (list, status = 200) => async (url) => ({ ok: status === 200, status, json: async () => list, _url: url });
const LIST = [
  { tag_name: 'v0.60.136', html_url: 'https://github.com/HorrisEllis/Nexus/releases/tag/v0.60.136', assets: [] },
  { tag_name: 'cos-v0.1.1', html_url: 'https://github.com/HorrisEllis/Nexus/releases/tag/cos-v0.1.1', assets: [{ name: 'COS-0.1.1-setup.exe', browser_download_url: 'u1', size: 1 }] },
  { tag_name: 'cos-v0.1.3', html_url: 'https://github.com/HorrisEllis/Nexus/releases/tag/cos-v0.1.3', assets: [{ name: 'COS-0.1.3-setup.exe', browser_download_url: 'u3', size: 3 }] },
  { tag_name: 'cos-v0.2.0', draft: true, assets: [] },
];

test('CU-01 the newest cos-v release, not the newest release: Nexus\'s v0.60.x share the repo, drafts do not count', async () => {
  const r = await U.checkApp({ current: '0.1.2', fetch: fakeFetch(LIST) });
  assert.deepStrictEqual([r.ok, r.latest, r.newer], [true, '0.1.3', true]);
  assert.strictEqual(r.page, 'https://github.com/HorrisEllis/Nexus/releases/tag/cos-v0.1.3');
  assert.ok(r.assets.some(a => a.name === 'COS-0.1.3-setup.exe'));
});
test('CU-02 the same or older is not newer', async () => {
  assert.strictEqual((await U.checkApp({ current: '0.1.3', fetch: fakeFetch(LIST) })).newer, false);
  assert.strictEqual((await U.checkApp({ current: '0.2.1', fetch: fakeFetch(LIST) })).newer, false);
});
test('CU-03 GitHub refusing or unreachable is said, never a guess', async () => {
  assert.ok(/rate limited/.test((await U.checkApp({ current: '0.1.2', fetch: fakeFetch([], 403) })).error));
  assert.ok(/could not reach GitHub/.test((await U.checkApp({ current: '0.1.2', fetch: async () => { throw new Error('offline'); } })).error));
  assert.ok(/no published COS release/.test((await U.checkApp({ current: '0.1.2', fetch: fakeFetch([LIST[0]]) })).error));
});
test('CU-04 the controller checks at most once an hour and keeps the answer', async () => {
  const { Controller } = require('../../cos/app/controller.js');
  const c = Object.create(Controller.prototype);
  let calls = 0; const f = async () => { calls++; return { ok: true, status: 200, json: async () => LIST }; };
  const a = await c.appUpdate({ fetch: f }), b = await c.appUpdate({ fetch: f });
  assert.strictEqual(calls, 1); assert.strictEqual(a, b); assert.strictEqual(a.current, require('../../cos/app/version.js').version);
});
test('CU-05 the window says it and opens only a COS release page of this repo; the exe carries the check', () => {
  const main = fs.readFileSync(path.join(REPO, 'cos/app/desktop/main.js'), 'utf8');
  assert.ok(main.includes("h('appUpdate'") && /cos-v\\d\+/.test(main) && main.includes('shell.openExternal(url)'));
  const pre = fs.readFileSync(path.join(REPO, 'cos/app/desktop/preload.js'), 'utf8');
  assert.ok(pre.includes("appUpdate: call('appUpdate')") && pre.includes("openRelease: call('openRelease')"));
  const ui = fs.readFileSync(path.join(REPO, 'cos/app/desktop/ui/app.js'), 'utf8');
  assert.ok(/appUpdate\(\);/.test(ui) && ui.includes('Open the release page'));
  assert.ok(fs.readFileSync(path.join(REPO, 'scripts/build-cos-app.js'), 'utf8').includes("'cos/app/app-update.js'"), 'staged into the exe');
});

// CA10 (COS 0.10.0, Nexus 0.60.540) — COS updates itself. James, 2026-11-14: "so this cant use the update tool?" · "yes."
{
  const os = require('os'), crypto = require('crypto');
  const SETUP = Buffer.from('MZ fake installer bytes'), GOOD = crypto.createHash('sha256').update(SETUP).digest('hex');
  const check = (sum) => ({ ok: true, current: '0.9.0', latest: '0.10.0', newer: true, assets: [
    { name: 'COS-0.10.0-setup.exe', url: 'https://x/setup.exe', api: 'https://api/x/1' }, { name: 'SHA256SUMS', url: 'https://x/sums', api: 'https://api/x/2' }] , _sum: sum });
  const fetchFor = (sum, seen = []) => async (url, o = {}) => { seen.push({ url, auth: (o.headers || {}).Authorization || null, accept: (o.headers || {}).Accept || null });
    const body = /sums|\/2$/.test(url) ? Buffer.from(`${sum}  COS-0.10.0-setup.exe\nabc  COS-0.10.0-portable.exe\n`) : SETUP;
    return { ok: true, status: 200, arrayBuffer: async () => body }; };
  const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'cos-upd-'));
  test('CU-10 CA10: the checksum matches → the setup is run silently (/S), kept in COS\'s own folder', async () => {
    const dir = tmp(); const ran = [];
    const r = await U.installApp({ check: check(GOOD), dir, fetch: fetchFor(GOOD), platform: 'win32', spawn: (exe, args) => { ran.push([exe, args]); return { unref() {} }; } });
    assert.strictEqual(r.ok, true, r.error); assert.strictEqual(r.sha256, GOOD); assert.strictEqual(ran.length, 1); assert.deepStrictEqual(ran[0][1], ['/S', '--force-run']);
    assert.ok(fs.existsSync(path.join(dir, '0.10.0', 'COS-0.10.0-setup.exe')));
  });
  test('CU-11 CA10: a checksum that does not match → nothing runs, the download is removed, said', async () => {
    const dir = tmp(); const ran = [];
    const r = await U.installApp({ check: check('0'.repeat(64)), dir, fetch: fetchFor('0'.repeat(64)), platform: 'win32', spawn: () => { ran.push(1); return {}; } });
    assert.strictEqual(r.ok, false); assert.match(r.error, /not run, removed/); assert.strictEqual(ran.length, 0); assert.ok(!fs.existsSync(path.join(dir, '0.10.0')));
  });
  test('CU-12 CA10: not Windows, not newer, or no SHA256SUMS → refused, said, nothing downloaded', async () => {
    const seen = [];
    assert.match((await U.installApp({ check: check(GOOD), dir: tmp(), fetch: fetchFor(GOOD, seen), platform: 'linux' })).error, /Windows only/);
    assert.match((await U.installApp({ check: { ...check(GOOD), newer: false }, dir: tmp(), fetch: fetchFor(GOOD, seen), platform: 'win32' })).error, /already the newest/);
    const c = check(GOOD); c.assets = c.assets.filter(a => a.name !== 'SHA256SUMS');
    assert.match((await U.installApp({ check: c, dir: tmp(), fetch: fetchFor(GOOD, seen), platform: 'win32' })).error, /cannot check/);
    assert.strictEqual(seen.length, 0);
  });
  test('CU-13 CA10: a private release → the API asset URLs with the sign-in git keeps (git credential fill, never a prompt)', async () => {
    const seen = []; const tok = U.githubToken({ env: {}, run: (cmd, args, o) => { assert.deepStrictEqual([cmd, args], ['git', ['credential', 'fill']]); assert.strictEqual(o.env.GIT_TERMINAL_PROMPT, '0'); return { stdout: 'protocol=https\nhost=github.com\nusername=x\npassword=gho_TEST\n' }; } });
    assert.strictEqual(tok, 'gho_TEST');
    const r = await U.installApp({ check: check(GOOD), dir: tmp(), fetch: fetchFor(GOOD, seen), token: tok, platform: 'win32', spawn: () => ({ unref() {} }) });
    assert.strictEqual(r.ok, true, r.error); assert.ok(seen.every(x => x.url.startsWith('https://api/') && x.auth === 'Bearer gho_TEST' && x.accept === 'application/octet-stream'), JSON.stringify(seen));
  });
  test('CU-14 CA10: the window\'s door offers appCheck and appInstall; Settings › Update draws COS itself only inside the window', () => {
    const pre = fs.readFileSync(path.join(REPO, 'cos/app/desktop/starting-preload.js'), 'utf8'); assert.ok(pre.includes("appInstall: () => ipcRenderer.invoke('cos:appInstall')"));
    assert.ok(fs.readFileSync(path.join(REPO, 'cos/app/desktop/main.js'), 'utf8').includes("h('appInstall'"));
    const pg = fs.readFileSync(path.join(REPO, 'cos/ui/updates/page.js'), 'utf8'); assert.ok(/cosStart\.appCheck/.test(pg) && /if \(!door\) return;/.test(pg));
  });
}

(async () => {
  for (const [n, f] of tests) { try { await f(); passed++; console.log(`  ✓ ${n}`); } catch (e) { failed++; console.log(`  ✗ ${n}\n    ${e.message}`); } }
  console.log(`\n  ${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
