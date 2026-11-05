'use strict';
/**
 * tests/modules/test-cg-bookmark-macros.test.js — BM1: a bookmark runs its macro when it opens (docs/2026-11-05-bookmark-macros-phasemap.spec)
 * James, 2026-11-05: "bookmarks with ability to bind macros."
 *
 *   BK-01  bindMacro keeps a macro on a bookmark, unbinds with null, refuses a macro that does not exist and a bookmark that does not
 *   BK-02  the bridge checks the name against his macros; the preload exposes bindMacro
 *   BK-03  the bar: opening a bound bookmark waits for the page to load, then runs its macro (macros:run); a failure is said; ⚡ marks it
 *   BK-04  the Library: each bookmark has "Macro on open" (his macros), bound through bindMacro, and opening it runs the macro
 */
require('../../lib/test-sandbox.js').ensure();
const assert = require('assert'), fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const Store = require(path.join(ROOT, 'clear-glass/src/bookmarks/store.js'));
let passed = 0, failed = 0;
function test(id, d, fn) { try { fn(); console.log(`  ✓ ${id} ${d}`); passed++; } catch (e) { console.error(`  ✗ ${id} ${d}\n    ${(e.stack || e.message).split('\n').slice(0, 4).join('\n    ')}`); failed++; } }
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');

console.log('\n⬡  Bookmarks that run a macro (BM1)\n');
test('BK-01', 'bind, unbind, refuse an unknown macro and an unknown bookmark', () => {
  const s = new Store(); s._save = () => {};
  const { bookmark } = s.add({ url: 'https://www.fiverr.com/users/me/manage_gigs/new', title: 'New gig' });
  const exists = (n) => n === 'fiverr-gig-fill';
  assert.deepStrictEqual(s.bindMacro({ id: bookmark.id, macro: 'fiverr-gig-fill', exists }).bound, true);
  assert.strictEqual(s.list({})[0].macro, 'fiverr-gig-fill');
  assert.match(s.bindMacro({ id: bookmark.id, macro: 'nope', exists }).error, /no macro "nope"/);
  assert.strictEqual(s.list({})[0].macro, 'fiverr-gig-fill', 'a refused bind leaves the old one');
  assert.strictEqual(s.bindMacro({ id: bookmark.id, macro: null }).bound, false);
  assert.strictEqual(s.list({})[0].macro, null);
  assert.match(s.bindMacro({ id: 'x', macro: 'fiverr-gig-fill' }).error, /no bookmark/);
});
test('BK-02', 'the bridge checks his macros; the preload exposes it', () => {
  const b = read('clear-glass/src/ipc/bridge.js');
  assert.match(b, /ipcMain\.handle\('bookmarks:bindMacro'[\s\S]{0,400}this\.macroTool\.execute\(\{ action: 'list' \}\)[\s\S]{0,300}this\.bookmarks\.bindMacro\(/);
  assert.match(read('clear-glass/src/preload/index.js'), /bindMacro: +\(payload\) => ipcRenderer\.invoke\('bookmarks:bindMacro', +payload\)/);
});
test('BK-03', 'the bar runs a bound macro after the page loads; a failure is said; ⚡ marks it', () => {
  const js = read('clear-glass/renderer/browser.js');
  assert.match(js, /function _afterLoad\(ms = 30000\)[\s\S]{0,200}wv\.addEventListener\('did-stop-loading', fin\)/);
  assert.match(js, /async function _runBoundMacro\(bk, loaded = _afterLoad\(\)\) \{[\s\S]{0,120}await loaded;[\s\S]{0,200}cg\.macros\.run\(bk\.macro, \{ agentId \}\)[\s\S]{0,200}did not run/);
  assert.match(js, /const loaded = _afterLoad\(\);\n    navigate\(bk\.url\);\n    cg\.bookmarks\.visit\(\{ id: bk\.id \}\);\n    return _runBoundMacro\(bk, loaded\);/, 'the wait starts before the navigation, so a fast page is not missed');
  assert.match(js, /if \(bk\.macro\) \{ const m = document\.createElement\('span'\); m\.className = 'bk-macro'; m\.textContent = '\\u26A1';/);
});
test('BK-04', 'the Library: Macro on open, bound through bindMacro, run on open', () => {
  const js = read('clear-glass/renderer/library/sections/bookmarks.js');
  assert.match(js, /cg\.macros\.list\(\)/);
  assert.match(js, /select\(macroOpts, b\.macro \|\| '', \{ 'aria-label': 'Macro on open'/);
  assert.match(js, /cg\.bookmarks\.bindMacro\(\{ id: b\.id, macro: sel\.value \|\| null \}\)/);
  assert.match(js, /toast\(`Opened in \$\{b\.agentId \|\| 'default'\}`\);\n      await runBound\(b\);/);
  assert.match(js, /cg\.macros\.run\(b\.macro, \{ agentId: b\.agentId \|\| 'default' \}\)/);
});
console.log(`\n  ${passed} passed, ${failed} failed\n`); process.exitCode = failed ? 1 : 0;
