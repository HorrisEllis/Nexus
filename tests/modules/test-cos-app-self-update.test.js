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

(async () => {
  for (const [n, f] of tests) { try { await f(); passed++; console.log(`  ✓ ${n}`); } catch (e) { failed++; console.log(`  ✗ ${n}\n    ${e.message}`); } }
  console.log(`\n  ${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
