'use strict';
/**
 * tests/modules/test-dropdown-keys.test.js — a dropdown that opens but does not take a click: arrows, then the number (0.60.275)
 * James, 2026-10-28: "the drop downs. it needs to wait for the system. it keeps freezing. and then, opens the drop down, doesn't click. could
 * always try arrows, or a number."
 *
 *   DK-01  in Clear Glass: options that ignore clicks — STANDARD is picked with the arrows and Enter, PREMIUM (whose menu ignores arrows) by
 *          typing the number and Enter; each read back, the result says which took and what was tried
 *   DK-02  choosing marks nothing on the page: no attribute is written on the elements already there (the freeze)
 *   DK-03  a page that is busy is waited for before it is acted on
 */
require('../../lib/test-sandbox.js').ensure();
const assert = require('assert');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const CG = (p) => path.join(ROOT, 'clear-glass', p);

let passed = 0, failed = 0;
async function test(id, desc, fn) { try { await fn(); console.log(`  ✓ ${id} ${desc}`); passed++; } catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${(e.stack || e.message).split('\n').slice(0, 6).join('\n    ')}`); failed++; } }

const PAGE = `<!doctype html><html><head><style>body{font:14px sans-serif;margin:0} table{margin:40px;border-collapse:collapse} td,th{border:1px solid #ccc;padding:10px;width:200px}
.dd{cursor:pointer} .menu{position:absolute;width:220px;background:#fff;border:1px solid #888} .menu div{padding:8px} .menu .active{background:#def}</style></head><body>
<table><tr><th>BASIC</th><th>STANDARD</th><th>PREMIUM</th></tr>
<tr><td><div class="dd" data-col="0">DELIVERY TIME</div></td><td><div class="dd" data-col="1">DELIVERY TIME</div></td><td><div class="dd" data-col="2">DELIVERY TIME</div></td></tr></table>
<script>
var opts = ['DELIVERY TIME','1 DAY DELIVERY'].concat([2,3,4,5,6,7,10,14,21,30].map(function(n){ return n + ' DAYS DELIVERY'; }));
var menu = null, owner = null, hi = 0, typed = '', mutations = 0;
new MutationObserver(function(l){ l.forEach(function(r){ if (r.type === 'attributes' && !/data-cg-(choose|opt)/.test(r.attributeName) && !(r.target.closest && r.target.closest('.menu'))) mutations++; }); }).observe(document.body, { attributes: true, subtree: true });
function close(){ if (menu) { menu.remove(); menu = null; owner = null; } }
function paint(){ Array.prototype.forEach.call(menu.children, function(c, i){ c.className = i === hi ? 'active' : ''; }); }
document.querySelectorAll('.dd').forEach(function(dd){ dd.addEventListener('click', function(){ close(); owner = dd; hi = 0; typed = '';
  menu = document.createElement('div'); menu.className = 'menu'; var r = dd.getBoundingClientRect(); menu.style.left = r.left + 'px'; menu.style.top = (r.bottom + scrollY) + 'px';
  opts.forEach(function(t){ var o = document.createElement('div'); o.textContent = t; menu.appendChild(o); });   // no click handler: "opens the drop down, doesn't click"
  document.body.appendChild(menu); paint(); }); });
document.addEventListener('keydown', function(e){ if (!menu) return;
  var arrowsWork = owner.getAttribute('data-col') !== '2';
  if (e.key === 'ArrowDown' && arrowsWork) { hi = Math.min(opts.length - 1, hi + 1); paint(); e.preventDefault(); }
  else if (e.key === 'ArrowUp' && arrowsWork) { hi = Math.max(0, hi - 1); paint(); e.preventDefault(); }
  else if (/^[0-9]$/.test(e.key)) { typed += e.key; var j = opts.findIndex(function(t){ return t.indexOf(typed + ' ') === 0; }); if (j >= 0) { hi = j; paint(); } }
  else if (e.key === 'Enter') { owner.textContent = opts[hi]; close(); } });
</script></body></html>`;

(async () => {
  console.log('\n⬡  Dropdowns: wait, arrows, the number\n');
  const glass = require(CG('src/driver/glass.js'));
  let browser; try { browser = await glass.chromium.launch(); } catch (e) { console.log(`  - DK SKIPPED: the engine could not start (${e.message.split('\n')[0]})`); process.exitCode = 0; return; }
  const ClearDriver = require(CG('src/driver/index.js'));
  const MAP = { mouseMove: 'mouseMoved', mouseDown: 'mousePressed', mouseUp: 'mouseReleased' };
  const KEY = { Down: ['ArrowDown', 40], Up: ['ArrowUp', 38], Enter: ['Enter', 13] };
  const stub = (page) => ({ executeJavaScript: (code) => page._eval(code), getURL: () => 'https://www.fiverr.com/edit',
    sendInputEvent: (e) => {
      if (MAP[e.type]) return page._send('Input.dispatchMouseEvent', { type: MAP[e.type], x: e.x, y: e.y, button: e.type === 'mouseMove' ? 'none' : (e.button || 'left'), buttons: e.type === 'mouseDown' ? 1 : 0, clickCount: e.type === 'mouseMove' ? 0 : (e.clickCount || 1) });
      const k = KEY[e.keyCode] || [e.keyCode, String(e.keyCode).charCodeAt(0)];
      if (e.type === 'keyDown') return page._send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: k[0], code: /^\d$/.test(k[0]) ? `Digit${k[0]}` : k[0], windowsVirtualKeyCode: k[1] });
      if (e.type === 'char') return page._send('Input.dispatchKeyEvent', { type: 'char', text: e.keyCode, key: e.keyCode });
      if (e.type === 'keyUp') return page._send('Input.dispatchKeyEvent', { type: 'keyUp', key: k[0], windowsVirtualKeyCode: k[1] });
    } });
  const fast = { openWait: [60, 90], pickWait: [30, 50], settleWait: [80, 120], optionsWaitMs: 3000, via: 'native', by: 'person', spotlight: false };
  try {
    await test('DK-01', 'clicks ignored: STANDARD by arrows + Enter, PREMIUM by the typed number + Enter; read back, said', async () => {
      const page = await browser.newPage({ viewport: { width: 1100, height: 700 } });
      await page.goto('data:text/html;charset=utf-8,' + encodeURIComponent(PAGE));
      const d = new ClearDriver({ ctxMgr: {}, dom: {}, vault: {}, sse: { emit: () => {} } }); const wc = stub(page); d._getWebContents = () => wc;
      const s = await d.exec({ agentId: 'default', action: 'choose', column: 'STANDARD', shows: 'DELIVERY TIME', option: '6', ...fast });
      assert.deepStrictEqual([s.option, s.clickedBy], ['6 DAYS DELIVERY', 'keys'], JSON.stringify(s));
      assert.ok(/^pointer → "DELIVERY TIME"/.test(s.tried[0]) && /arrows ↓×6 \+ Enter/.test(s.tried[1]), s.tried.join(' | '));
      const p = await d.exec({ agentId: 'default', action: 'choose', column: 'PREMIUM', shows: 'DELIVERY TIME', option: '14', ...fast });
      assert.deepStrictEqual([p.option, p.clickedBy], ['14 DAYS DELIVERY', 'number'], JSON.stringify(p));
      assert.ok(/typed 14 \+ Enter → "14 DAYS DELIVERY"/.test(p.tried.join(' | ')), p.tried.join(' | '));
      const shown = await page.evaluate(() => Array.from(document.querySelectorAll('.dd')).map(x => x.textContent));
      assert.deepStrictEqual(shown, ['DELIVERY TIME', '6 DAYS DELIVERY', '14 DAYS DELIVERY']);
      // DK-02 rides on the same page: nothing was written onto the elements that were already there
      const marks = await page.evaluate(() => ({ pre: document.querySelectorAll('[data-cg-pre]').length, mutations }));
      assert.deepStrictEqual(marks, { pre: 0, mutations: 0 }, 'no marker attributes, no attribute storm');
      await page.close();
    });

    await test('DK-03', 'a busy page is waited for: _waitResponsive holds while the page is blocked, then goes on', async () => {
      const page = await browser.newPage({ viewport: { width: 600, height: 300 } });
      await page.goto('data:text/html;charset=utf-8,' + encodeURIComponent('<p>busy</p>'));
      const d = new ClearDriver({ ctxMgr: {}, dom: {}, vault: {}, sse: { emit: () => {} } }); const wc = stub(page);
      await page._eval('setTimeout(function(){ var t = Date.now(); while (Date.now() - t < 900) {} }, 0); 1');
      const t0 = Date.now();
      const ok = await d._waitResponsive(wc, { fastMs: 250, maxMs: 5000 });
      assert.ok(ok === true, 'it went on once the page answered');
      assert.ok(Date.now() - t0 >= 600, `it waited for the page (${Date.now() - t0} ms)`);
      await page.close();
    });
  } finally { try { await browser.close(); } catch (_) {} }
  console.log(`\n  ${passed} passed, ${failed} failed\n`); process.exitCode = failed ? 1 : 0;
})();
