'use strict';
/**
 * tests/modules/test-site-a11y-and-dropdowns.test.js — the Tab switch per site; dropdown options scrolled within their list (0.60.273)
 * James, 2026-10-28, with three screenshots: "need the accessability settings, per site. look at picture 2.  image 3, its the drop downs"
 *
 *   SA-01  accessibility.tabMode is a site key ('site' | 'off', default 'site'); readers.tabMode reads it; the Site Settings table draws it
 *   SA-02  in Clear Glass: a page that turns on a yellow-link look on Tab — with offScript it is undone and focus still moves; without, it stays
 *   SA-03  in Clear Glass: his picture 3 — a menu in a scrolling list near the bottom that closes when the PAGE scrolls; choose picks
 *          "7 Days" from below the list's fold without moving the page, and reads it back
 */
require('../../lib/test-sandbox.js').ensure();
const assert = require('assert');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const CG = (p) => path.join(ROOT, 'clear-glass', p);

let passed = 0, failed = 0;
async function test(id, desc, fn) { try { await fn(); console.log(`  ✓ ${id} ${desc}`); passed++; } catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${(e.stack || e.message).split('\n').slice(0, 6).join('\n    ')}`); failed++; } }

const TAB_PAGE = `<!doctype html><html><head><style>body{font:14px sans-serif} a{color:#06c}</style></head><body>
<a href="#x">Programming &amp; Tech</a> <input id="a"> <input id="b">
<script>document.addEventListener('keydown', function(e){ if (e.key !== 'Tab') return; document.body.classList.add('kbd-mode');
  if (!document.getElementById('a11y')) { var s = document.createElement('style'); s.id = 'a11y'; s.textContent = 'body.kbd-mode a{background:#000;color:#ff0;letter-spacing:.2em}'; document.head.appendChild(s); } });</script></body></html>`;

const MENU_PAGE = `<!doctype html><html><head><style>
body{font:14px sans-serif;margin:0;height:2400px} table{margin:40px;border-collapse:collapse} td,th{border:1px solid #ccc;padding:10px;width:200px}
.dd{cursor:pointer} .menu{position:fixed;right:20px;bottom:0;width:240px;max-height:160px;overflow-y:auto;background:#fff;border:1px solid #888}
.menu div{padding:12px}</style></head><body>
<table><tr><th>BASIC</th><th>STANDARD</th><th>PREMIUM</th></tr>
<tr><td><div class="dd">DELIVERY TIME</div></td><td><div class="dd">DELIVERY TIME</div></td><td><div class="dd">DELIVERY TIME</div></td></tr></table>
<script>
var opts = ['DELIVERY TIME','1 DAY DELIVERY'].concat([2,3,4,5,6,7,10,14,21,30].map(function(n){ return n + ' DAYS DELIVERY'; }));
var menu = null;
function close(){ if (menu) { menu.remove(); menu = null; } }
window.addEventListener('scroll', close);     // like Fiverr's menu: the page moving closes it
document.querySelectorAll('.dd').forEach(function(dd){ dd.addEventListener('click', function(){ close();
  menu = document.createElement('div'); menu.className = 'menu';
  opts.forEach(function(t){ var o = document.createElement('div'); o.textContent = t; o.addEventListener('click', function(){ dd.textContent = t; close(); }); menu.appendChild(o); });
  document.body.appendChild(menu); }); });
</script></body></html>`;

(async () => {
  console.log('\n⬡  Accessibility per site; dropdown options within their list\n');

  await test('SA-01', 'accessibility.tabMode: a site key, read by readers.tabMode, drawn from the table', async () => {
    const K = require(CG('src/site-settings/keys.js'));
    const k = K.get('accessibility.tabMode');
    assert.ok(k && k.feature === 'accessibility' && k.default === 'site' && K.FEATURES.includes('accessibility'));
    assert.deepStrictEqual(K.validate('accessibility.tabMode', 'off'), { ok: true, value: 'off' });
    assert.ok(!K.validate('accessibility.tabMode', 'never').ok);
    const R = require(CG('src/site-settings/readers.js'));
    const P = require(CG('src/site-settings/profile.js'));
    const vals = new Map();
    const store = { get: (u, key) => vals.get(key), set: (u, key, v) => vals.set(key, v), clear: (u, key) => vals.delete(key) };
    const sp = (P.createSiteProfile || P)({ store, net: { routeFor: () => ({ via: 'default' }) } });
    R.install((u) => sp.siteProfile(u));
    assert.strictEqual(R.tabMode('https://www.fiverr.com/users/x/portfolio'), 'site');
    vals.set('accessibility.tabMode', 'off');
    assert.strictEqual(R.tabMode('https://www.fiverr.com/users/x/portfolio'), 'off');
    assert.strictEqual(R.tabMode('file:///x.html'), null);
    const groups = require('fs').readFileSync(CG('renderer/site-profile-groups.js'), 'utf8');
    assert.ok(/accessibility: 'Accessibility'/.test(groups) && /'resume', 'accessibility'/.test(groups));
  });

  const glass = require(CG('src/driver/glass.js'));
  let browser; try { browser = await glass.chromium.launch(); } catch (e) { console.log(`  - SA-02/03 SKIPPED: the engine could not start (${e.message.split('\n')[0]})`); }
  if (browser) {
    await test('SA-02', 'in Clear Glass: Off undoes what Tab turned on, focus still moves; without it the look stays', async () => {
      const KM = require(CG('src/page/keyboard-mode.js'));
      const look = async (page) => page.evaluate(() => ({ kbd: document.body.classList.contains('kbd-mode'), sheet: !!document.getElementById('a11y') && !document.getElementById('a11y').disabled,
        bg: getComputedStyle(document.querySelector('a')).backgroundColor, focus: document.activeElement && document.activeElement.id }));
      const plain = await browser.newPage({ viewport: { width: 800, height: 400 } });
      await plain.goto('data:text/html;charset=utf-8,' + encodeURIComponent(TAB_PAGE));
      await plain.keyboard.press('Tab'); await plain.waitForTimeout(1300);
      const before = await look(plain);
      assert.ok(before.kbd && before.sheet && before.bg === 'rgb(0, 0, 0)', 'the site turns its look on: ' + JSON.stringify(before));
      await plain.close();
      const page = await browser.newPage({ viewport: { width: 800, height: 400 } });
      await page.goto('data:text/html;charset=utf-8,' + encodeURIComponent(TAB_PAGE));
      assert.strictEqual(await page._eval(KM.offScript()), 'on');
      assert.strictEqual(await page._eval(KM.offScript()), 'already');
      await page.keyboard.press('Tab'); await page.keyboard.press('Tab'); await page.keyboard.press('Tab'); await page.waitForTimeout(1300);
      const after = await look(page);
      assert.ok(!after.kbd && !after.sheet && after.bg !== 'rgb(0, 0, 0)', JSON.stringify(after));
      assert.strictEqual(after.focus, 'b', 'Tab still moves focus');
      const st = await page.evaluate(() => window.__cgTabOff);
      assert.ok(st.reverted >= 1 && st.last && !st.last.empty, JSON.stringify(st));
      await page.close();
    });

    await test('SA-03', 'in Clear Glass: picture 3 — "7 Days" from below the list\'s fold, the page not moved, read back', async () => {
      const page = await browser.newPage({ viewport: { width: 1100, height: 500 } });
      await page.goto('data:text/html;charset=utf-8,' + encodeURIComponent(MENU_PAGE));
      const ClearDriver = require(CG('src/driver/index.js'));
      const d = new ClearDriver({ ctxMgr: {}, dom: {}, vault: {}, sse: { emit: () => {} } });
      const MAP = { mouseMove: 'mouseMoved', mouseDown: 'mousePressed', mouseUp: 'mouseReleased' };
      const wc = { executeJavaScript: (code) => page._eval(code), getURL: () => 'https://www.fiverr.com/edit',
        sendInputEvent: (e) => { if (MAP[e.type]) page._send('Input.dispatchMouseEvent', { type: MAP[e.type], x: e.x, y: e.y, button: e.type === 'mouseMove' ? 'none' : (e.button || 'left'), buttons: e.type === 'mouseDown' ? 1 : 0, clickCount: e.type === 'mouseMove' ? 0 : (e.clickCount || 1) }); } };
      d._getWebContents = () => wc;
      const fast = { openWait: [50, 80], pickWait: [30, 50], settleWait: [60, 90] };
      const out = [];
      for (const [column, days] of [['STANDARD', '7'], ['PREMIUM', '30']]) out.push(await d.exec({ agentId: 'default', action: 'choose', column, shows: 'DELIVERY TIME', option: days, via: 'native', by: 'person', spotlight: false, ...fast }));
      assert.deepStrictEqual(out.map(r => [r.option, r.clickedBy]), [['7 DAYS DELIVERY', 'pointer'], ['30 DAYS DELIVERY', 'pointer']], JSON.stringify(out));
      const shown = await page.evaluate(() => Array.from(document.querySelectorAll('.dd')).map(x => x.textContent));
      assert.deepStrictEqual(shown, ['DELIVERY TIME', '7 DAYS DELIVERY', '30 DAYS DELIVERY']);
      await page.close();
    });
    try { await browser.close(); } catch (_) {}
  }
  console.log(`\n  ${passed} passed, ${failed} failed\n`); process.exitCode = failed ? 1 : 0;
})();
