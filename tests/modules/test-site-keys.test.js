'use strict';
/**
 * tests/modules/test-site-keys.test.js — keys bound to elements, per site (KB2/KB3, 0.60.275)
 * James, 2026-10-28: "could always try arrows, or a number. any way you can add all of that to the keybindings. like elements to keys, per site?"
 *
 *   SK-01  site-keys: a key bound on one site only; plain typing refused; each kind validated; the driver steps it runs
 *   SK-02  in Clear Glass: Alt+6 bound to "choose 6" on a dropdown the picker named by XPath — marked on the page, chosen, read back
 *   SK-03  wired: the store, main's key catcher (site key before global), IPC, the /cli routes, the preload, the `glass keys` command
 *   SK-04  in Clear Glass: Settings › Keyboard shortcuts › Keys on sites lists a binding, and Add key saves one through ClearGlass.shortcuts.siteSet
 *   SK-05  in Clear Glass: the "Bind a key" bar after a pick — the keys pressed, what they do, Save → siteSet with the picked XPath
 */
require('../../lib/test-sandbox.js').ensure();
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');
const ROOT = path.join(__dirname, '..', '..');
const CG = (p) => path.join(ROOT, 'clear-glass', p);
const SK = require(CG('src/shortcuts/site-keys.js'));

let passed = 0, failed = 0;
async function test(id, desc, fn) { try { await fn(); console.log(`  ✓ ${id} ${desc}`); passed++; } catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${(e.stack || e.message).split('\n').slice(0, 6).join('\n    ')}`); failed++; } }

const PAGE = `<!doctype html><html><head><style>body{font:14px sans-serif;margin:0} table{margin:40px;border-collapse:collapse} td,th{border:1px solid #ccc;padding:10px;width:200px}
.dd{cursor:pointer} .menu{position:absolute;width:220px;background:#fff;border:1px solid #888} .menu div{padding:8px}</style></head><body>
<table><tr><th>BASIC</th><th>STANDARD</th></tr><tr><td><div class="dd">DELIVERY TIME</div></td><td><div class="dd">DELIVERY TIME</div></td></tr></table>
<script>var opts = ['DELIVERY TIME','1 DAY DELIVERY'].concat([2,3,4,5,6,7].map(function(n){ return n + ' DAYS DELIVERY'; })); var menu = null;
document.querySelectorAll('.dd').forEach(function(dd){ dd.addEventListener('click', function(){ if (menu) menu.remove();
  menu = document.createElement('div'); menu.className = 'menu'; var r = dd.getBoundingClientRect(); menu.style.left = r.left + 'px'; menu.style.top = (r.bottom + scrollY) + 'px';
  opts.forEach(function(t){ var o = document.createElement('div'); o.textContent = t; o.addEventListener('click', function(){ dd.textContent = t; menu.remove(); menu = null; }); menu.appendChild(o); });
  document.body.appendChild(menu); }); });</script></body></html>`;

(async () => {
  console.log('\n⬡  Keys bound to elements, per site\n');

  await test('SK-01', 'one site only; plain typing refused; each kind validated; the steps it runs', async () => {
    let r = SK.bind({}, 'https://www.fiverr.com/users/x/edit', 'alt+6', { do: 'choose', selector: '/html/body/table/tr[2]/td[2]/div', option: '6', label: 'Standard delivery' });
    assert.deepStrictEqual(Object.keys(r.map), ['https://www.fiverr.com']);
    assert.deepStrictEqual(SK.lookup(r.map, 'https://www.fiverr.com/other', 'Alt+6').option, '6');
    assert.strictEqual(SK.lookup(r.map, 'https://www.google.com/', 'Alt+6'), null, 'another site keeps the key');
    assert.match(SK.bind({}, 'https://a.com', '6', { do: 'click', selector: 'a' }).error, /would steal ordinary typing/);
    assert.match(SK.bind({}, 'file:///x', 'Alt+1', { do: 'click', selector: 'a' }).error, /not a site/);
    assert.match(SK.bind({}, 'https://a.com', 'Alt+1', { do: 'choose', selector: 'a' }).error, /needs the option/);
    assert.match(SK.bind({}, 'https://a.com', 'Alt+1', { do: 'click' }).error, /needs the element/);
    assert.match(SK.bind({}, 'https://a.com', 'Alt+1', { do: 'jump', selector: 'a' }).error, /do is one of/);
    assert.deepStrictEqual(SK.steps({ do: 'key', key: 'Down', selector: '#a' }).map(s => s.action), ['pointer', 'pressKey']);
    assert.deepStrictEqual(SK.steps({ do: 'macro', macro: 'Fiverr gig - choose delivery' }), [{ macro: 'Fiverr gig - choose delivery' }]);
    r = SK.unbind(r.map, 'https://www.fiverr.com', 'Alt+6');
    assert.deepStrictEqual(r.map, {}, 'the last key of a site takes the site with it');
    assert.ok(SK.isXPath('//div[2]') && SK.isXPath('(//a)[1]') && !SK.isXPath('.dd'));
  });

  await test('SK-03', 'wired: store, main (site key before global), IPC, /cli, preload, command', async () => {
    const store = fs.readFileSync(CG('src/options/store.js'), 'utf8'), main = fs.readFileSync(CG('src/main/index.js'), 'utf8');
    const bridge = fs.readFileSync(CG('src/ipc/bridge.js'), 'utf8'), pre = fs.readFileSync(CG('src/preload/index.js'), 'utf8');
    assert.ok(/getSiteKeys\(\)/.test(store) && /setSiteKey\(url, accel, binding\)/.test(store) && /removeSiteKey\(url, accel\)/.test(store));
    const i = main.indexOf('lookup(nexusOptions.getSiteKeys(), contents.getURL(), accel)'), j = main.indexOf('bindings = nexusOptions ? nexusOptions.getShortcuts().bindings');
    assert.ok(i > 0 && j > i, 'the site key is looked up before the global shortcuts');
    assert.ok(/async function _runSiteKey\(contents, b, accel\)/.test(main) && /SK\.markScript\(sel\)/.test(main) && /did not run: \$\{e\.message\}/.test(main));
    for (const ch of ['siteKeys:list', 'siteKeys:set', 'siteKeys:remove']) assert.ok(bridge.includes(`'${ch}'`) && pre.includes(`'${ch}'`), ch);
    assert.ok(/'\/cli\/site-keys'/.test(bridge) && /'\/cli\/site-keys\/remove'/.test(bridge));
    const { SPEC } = require(path.join(ROOT, 'idearium/cli/route-commands.js'));
    const row = SPEC.find(r => r.key === 'glass.keys');
    assert.deepStrictEqual(row.req({ args: ['https://www.fiverr.com'], flags: {} }), { system: 'clear-glass', method: 'GET', path: '/cli/site-keys?url=https%3A%2F%2Fwww.fiverr.com' });
    assert.deepStrictEqual(row.req({ args: ['bind', 'https://www.fiverr.com', 'Alt+6', 'choose'], flags: { selector: '//x', option: '6' } }).body.binding, { do: 'choose', selector: '//x', option: '6', key: undefined, macro: undefined, label: undefined, part: undefined });   // 2026-10-30 GF4: --part passed through
    assert.strictEqual(row.req({ args: ['unbind', 'https://www.fiverr.com', 'Alt+6'], flags: {} }).path, '/cli/site-keys/remove');
  });

  const glass = require(CG('src/driver/glass.js'));
  let browser; try { browser = await glass.chromium.launch(); } catch (e) { console.log(`  - SK-02/04/05 SKIPPED: the engine could not start (${e.message.split('\n')[0]})`); }
  if (browser) {
    await test('SK-02', 'in Clear Glass: Alt+6 → choose "6" on the dropdown the picker named by XPath; marked, chosen, read back', async () => {
      const page = await browser.newPage({ viewport: { width: 900, height: 600 } });
      await page.goto('data:text/html;charset=utf-8,' + encodeURIComponent(PAGE));
      const map = SK.bind({}, 'https://www.fiverr.com/edit', 'Alt+6', { do: 'choose', selector: '/html/body/table/tbody/tr[2]/td[2]/div', option: '6' }).map;
      const b = SK.lookup(map, 'https://www.fiverr.com/edit', 'Alt+6');
      assert.strictEqual(await page._eval(SK.markScript(b.selector)), true);
      assert.strictEqual(await page._eval(SK.markScript('//nothing[9]')), false, 'an element not on the page is said, not guessed');
      await page._eval(SK.markScript(b.selector));
      const ClearDriver = require(CG('src/driver/index.js'));
      const d = new ClearDriver({ ctxMgr: {}, dom: {}, vault: {}, sse: { emit: () => {} } });
      const MAP = { mouseMove: 'mouseMoved', mouseDown: 'mousePressed', mouseUp: 'mouseReleased' };
      d._getWebContents = () => ({ executeJavaScript: (c) => page._eval(c), getURL: () => 'https://www.fiverr.com/edit',
        sendInputEvent: (e) => { if (MAP[e.type]) page._send('Input.dispatchMouseEvent', { type: MAP[e.type], x: e.x, y: e.y, button: e.type === 'mouseMove' ? 'none' : (e.button || 'left'), buttons: e.type === 'mouseDown' ? 1 : 0, clickCount: e.type === 'mouseMove' ? 0 : (e.clickCount || 1) }); } });
      for (const st of SK.steps({ ...b, selector: SK.MARKED })) await d.exec({ agentId: 'wc:1', by: 'person', ...st, openWait: [60, 90], pickWait: [30, 50], settleWait: [80, 120], optionsWaitMs: 3000, via: 'native', spotlight: false });
      const shown = await page.evaluate(() => Array.from(document.querySelectorAll('.dd')).map(x => x.textContent));
      assert.deepStrictEqual(shown, ['DELIVERY TIME', '6 DAYS DELIVERY']);
      await page.close();
    });

    await test('SK-04', 'in Clear Glass: Settings › Keyboard shortcuts › Keys on sites lists one, and Add key saves one', async () => {
      const { initScript } = require(CG('src/driver/cg-stub.js'));
      const errors = [];
      const page = await browser.newPage({ viewport: { width: 1280, height: 900 } }); page.on('pageerror', e => errors.push(e.message));
      await page.addInitScript(initScript({ answers: { 'options.get': {}, 'accounts.list': [], 'macros.list': [],
        'shortcuts.list': { actions: [{ id: 'tab.new', group: 'Tabs', label: 'New tab', keys: 'Ctrl+T' }], bindings: { 'Ctrl+T': 'tab.new' }, defaults: { 'Ctrl+T': 'tab.new' } },
        'shortcuts.siteList': { siteKeys: { 'https://www.fiverr.com': { 'Alt+6': { do: 'choose', selector: '//div[2]', option: '6', label: 'Standard delivery' } } } },
        'shortcuts.siteSet': { ok: true, origin: 'https://www.fiverr.com', accel: 'Alt+Down', binding: { do: 'key', key: 'Down' } } } }));
      await page.addInitScript('window.ClearGlass.accounts.portal = new Proxy({}, { get: (_, k) => async () => (/list|providers/.test(k) ? [] : {}) });');
      await page.goto(pathToFileURL(CG('renderer/settings.html')).href + '#shortcuts');
      await page.waitForSelector('.sk-form');
      const t = await page.evaluate(() => document.body.textContent);
      assert.ok(/Keys on sites/.test(t) && /Choose “6” · Standard delivery/.test(t) && /https:\/\/www\.fiverr\.com · \/\/div\[2\]/.test(t), t.slice(0, 400));
      await page.evaluate(() => {
        const [site, keys, does, sel, extra] = document.querySelectorAll('.sk-form .sk-in');
        site.value = 'https://www.fiverr.com'; does.value = 'key'; sel.value = '//div[3]'; extra.value = 'Down';
        keys.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', code: 'ArrowDown', altKey: true, bubbles: true }));
        [...document.querySelectorAll('.sk-form button')].find(b => /Add key/.test(b.textContent)).click();
      });
      await page.waitForTimeout(300);
      const calls = await page.evaluate(() => window.__cgCalls.filter(c => c.key === 'shortcuts.siteSet').map(c => c.args));
      assert.deepStrictEqual(calls, [['https://www.fiverr.com', 'Alt+Down', { do: 'key', selector: '//div[3]', key: 'Down' }]]);
      assert.deepStrictEqual(errors, []);
      await page.close();
    });

    await test('SK-05', 'in Clear Glass: the "Bind a key" bar after a pick saves the keys, what they do and the picked XPath', async () => {
      const page = await browser.newPage({ viewport: { width: 1000, height: 600 } });
      const errors = []; page.on('pageerror', e => errors.push(e.message));
      await page.goto('data:text/html;charset=utf-8,' + encodeURIComponent('<!doctype html><html><body><p>chrome</p></body></html>'));
      await page._eval(fs.readFileSync(CG('renderer/site-keys/bind-bar.js'), 'utf8') + '\n;1');
      await page.evaluate(() => { window.__saved = []; window.CGSiteKeyBar.mount({ cg: { shortcuts: { siteSet: async (u, a, b) => { window.__saved.push([u, a, b]); return { ok: true, origin: 'https://www.fiverr.com', accel: a, binding: b }; } } } }); });
      assert.strictEqual(await page.evaluate(() => window.CGSiteKeyBar.offer({ xpath: '//div[2]', url: 'file:///x' })), false, 'not a site: no bar');
      assert.strictEqual(await page.evaluate(() => window.CGSiteKeyBar.offer({ xpath: '/html/body/table/tbody/tr[2]/td[2]/div', url: 'https://www.fiverr.com/edit' })), true);
      await page.evaluate(() => {
        const bar = document.getElementById('cg-key-bind');
        bar.querySelector('.kb-keys').dispatchEvent(new KeyboardEvent('keydown', { key: '6', code: 'Digit6', altKey: true, bubbles: true }));
        const d = bar.querySelector('.kb-do'); d.value = 'choose'; d.dispatchEvent(new Event('change'));
        bar.querySelector('.kb-extra').value = '6'; bar.querySelector('.kb-label').value = 'Standard delivery';
        bar.querySelector('.kb-save').click();
      });
      await page.waitForTimeout(200);
      const saved = await page.evaluate(() => window.__saved);
      assert.deepStrictEqual(saved, [['https://www.fiverr.com/edit', 'Alt+6', { do: 'choose', selector: '/html/body/table/tbody/tr[2]/td[2]/div', label: 'Standard delivery', option: '6' }]]);
      assert.match(await page.evaluate(() => document.querySelector('#cg-key-bind .kb-say').textContent), /Alt\+6 saved on www\.fiverr\.com/);
      assert.deepStrictEqual(errors, []);
      await page.close();
    });
    try { await browser.close(); } catch (_) {}
  }
  console.log(`\n  ${passed} passed, ${failed} failed\n`); process.exitCode = failed ? 1 : 0;
})();
