'use strict';
/**
 * tests/modules/test-fiverr-works.test.js — Fiverr's gig editor reachable and its dropdowns chosen, in Clear Glass (0.60.221)
 * James, 2026-10-28: "why did fiverr open in a popout window? like none of the autofill works." · "I want it just to open in a new tab." ·
 * "it needs to do the drop down menus. one by one" · "the drop down doesn't work" · "stop. just get fiverr working."
 *
 *   FW-01  decideOpen: a target=_blank link → tab; background-tab → tab behind; a sized popup → window; about:blank → window; Idearium → its page
 *   FW-02  the popup handler: a link meant as a tab is denied as a window and sent to the window it is in as cg:open-tab; a sized popup is allowed
 *   FW-03  the gig autofill takes Fiverr's placeholder-only pricing boxes at medium (was low: under the default floor, never filled)
 *   FW-04  option-match: '3' → '3 Days' not '30 Days'; 'Data' between two Data options is ambiguous; shows() reads back
 *   FW-05  in Clear Glass, on a page laid out like Fiverr's Scope & Pricing: choose opens each tier's custom DELIVERY TIME with the curved
 *          pointer, clicks the option, and the dropdown shows it — one by one; a native SELECT row by column + row label; a missing option
 *          is refused with the options seen
 */
require('../../lib/test-sandbox.js').ensure();
const assert = require('assert');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const CG = (p) => path.join(ROOT, 'clear-glass', p);

let passed = 0, failed = 0;
async function test(id, desc, fn) { try { await fn(); console.log(`  ✓ ${id} ${desc}`); passed++; } catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${(e.stack || e.message).split('\n').slice(0, 6).join('\n    ')}`); failed++; } }

const PAGE = `<!doctype html><meta charset="utf-8"><style>
body{font:14px sans-serif;margin:20px} table{border-collapse:collapse} td,th{border:1px solid #ccc;padding:8px;width:180px;height:40px}
.dd{cursor:pointer;text-transform:uppercase} .pop{position:absolute;background:#fff;border:1px solid #999;list-style:none;margin:0;padding:0;z-index:9}
.pop li{padding:4px 8px} .pop li:hover{background:#eef}</style>
<table><tr><th></th><th>BASIC</th><th>STANDARD</th><th>PREMIUM</th></tr>
<tr><td></td><td><textarea placeholder="Name your package"></textarea></td><td><textarea placeholder="Name your package"></textarea></td><td><textarea placeholder="Name your package"></textarea></td></tr>
<tr><td></td><td><div class="dd" data-t="b">Delivery time</div></td><td><div class="dd" data-t="s">Delivery time</div></td><td><div class="dd" data-t="p">Delivery time</div></td></tr>
<tr><td>Number of APIs integrated</td><td><select><option>Select</option><option>1</option><option>2</option><option>3</option></select></td>
<td><select><option>Select</option><option>1</option><option>2</option><option>3</option></select></td><td><select><option>Select</option><option>1</option><option>2</option><option>3</option></select></td></tr>
</table>
<a id="edit" href="https://www.fiverr.com/edit" target="_blank">Edit Gig</a>
<script>
// a custom dropdown like Fiverr's: a div, a list added on click, the choice written back into the div
document.querySelectorAll('.dd').forEach(function(dd){ dd.addEventListener('click', function(){
  document.querySelectorAll('.pop').forEach(function(p){ p.remove(); });
  var r = dd.getBoundingClientRect(), ul = document.createElement('ul'); ul.className = 'pop';
  ul.style.left = (r.left + scrollX) + 'px'; ul.style.top = (r.bottom + scrollY) + 'px';
  ['1 Day', '2 Days', '3 Days', '5 Days', '7 Days', '30 Days'].forEach(function(t){ var li = document.createElement('li'); li.textContent = t;
    li.addEventListener('click', function(ev){ ev.stopPropagation(); dd.textContent = t; ul.remove(); }); ul.appendChild(li); });
  document.body.appendChild(ul); }); });
</script>`;

(async () => {
  console.log('\n⬡  Fiverr works in Clear Glass\n');
  const { decideOpen } = require(CG('src/tabs/open-decision.js'));
  const OM = require(CG('src/page/option-match.js'));

  await test('FW-01', 'decideOpen: link-tab → tab; background → tab behind; sized popup → window; about:blank → window; Idearium → its page', () => {
    assert.deepStrictEqual([decideOpen({ url: 'https://www.fiverr.com/x/edit', disposition: 'foreground-tab' }).open, decideOpen({ url: 'https://a.b', disposition: 'background-tab' }).background], ['tab', true]);
    assert.strictEqual(decideOpen({ url: 'https://accounts.google.com/o', disposition: 'new-window', features: 'width=500,height=600' }).open, 'window');
    assert.strictEqual(decideOpen({ url: 'about:blank', disposition: 'foreground-tab' }).open, 'window');
    assert.strictEqual(decideOpen({ url: 'http://127.0.0.1:7000/desktop.html', disposition: 'new-window', compartment: 'desktop' }).open, 'compartment-page');
    assert.match(decideOpen({ url: 'https://a.b', disposition: 'other' }).why, /as before/);
  });

  await test('FW-02', 'the popup handler sends a link-tab to its window as cg:open-tab and denies the window; a sized popup is allowed', () => {
    const CW = require(CG('src/main/compartment-window.js'));
    const sent = []; let handler = null;
    const contents = { getType: () => 'webview', setWindowOpenHandler: (h) => { handler = h; }, on: () => {}, hostWebContents: { isDestroyed: () => false, send: (ch, d) => sent.push([ch, d]) } };
    assert.ok(CW.attach(contents));
    assert.deepStrictEqual(handler({ url: 'https://www.fiverr.com/edit', features: '', disposition: 'foreground-tab' }), { action: 'deny' });
    assert.deepStrictEqual(sent, [['cg:open-tab', { url: 'https://www.fiverr.com/edit', background: false }]]);
    assert.strictEqual(handler({ url: 'https://accounts.google.com/o', features: 'width=500,height=600', disposition: 'new-window' }).action, 'allow');
    assert.strictEqual(sent.length, 1);
    const js = require('fs').readFileSync(CG('renderer/browser.js'), 'utf8');
    assert.match(js, /ClearGlass\.on\('cg:open-tab'[^\n]*_tabs\.newTab\(d\.url\)/, 'the window opens it as a tab');
  });

  await test('FW-03', "Fiverr's placeholder-only pricing boxes match at medium, so the default fill types into them", () => {
    const G = require(CG('src/autofill/gig.js'));
    const gig = { title: 'I will build it', tags: [], description: 'd', faq: [], requirements: [], packages: { basic: { name: 'Starter', description: 'one', price: 30, deliveryDays: 3 }, standard: { name: 'Plus', description: 'two', price: 60, deliveryDays: 5 } } };
    const m = G.matchGigFields([{ id: 'a', tag: 'textarea', attrs: { placeholder: 'Name your package' } }, { id: 'b', tag: 'textarea', attrs: { placeholder: 'Name your package' } },
      { id: 'c', tag: 'textarea', attrs: { placeholder: 'Describe the details of your offering' } }, { id: 'd', tag: 'input', attrs: { placeholder: 'Price' } }], gig);
    assert.deepStrictEqual(m.map(x => [x.key, x.confidence]), [['basic.name', 'medium'], ['standard.name', 'medium'], ['basic.description', 'medium'], ['basic.price', 'low']]);
  });

  await test('FW-04', "option-match: '3' is '3 Days' not '30 Days'; 'Data' is ambiguous; shows() reads back", () => {
    assert.strictEqual(OM.matchOption(['1 Day', '3 Days', '30 Days'], '3').option, '3 Days');
    assert.strictEqual(OM.matchOption(['Programming & Tech', 'Writing'], 'programming & tech').option, 'Programming & Tech');
    const a = OM.matchOption(['Data Entry', 'Data Science'], 'Data'); assert.ok(!a.ok && a.candidates.length === 2, JSON.stringify(a));
    assert.ok(!OM.matchOption(['1 Day'], '9').ok);
    assert.ok(OM.shows('3 DAYS', '3 Days') && !OM.shows('DELIVERY TIME', '3 Days'));
  });

  const glass = require(CG('src/driver/glass.js'));
  let browser; try { browser = await glass.chromium.launch(); } catch (e) { console.log(`  - FW-05 SKIPPED: the engine could not start (${e.message.split('\n')[0]})`); return done(); }
  console.log(`  · driven by Clear Glass (clear-glass/src/driver/glass.js), engine: ${glass.engine().kind}`);
  try {
    await test('FW-05', 'choose, one by one: each tier\'s custom DELIVERY TIME through the curved pointer, read back; a native SELECT row; a miss refused', async () => {
      const page = await browser.newPage({ viewport: { width: 1100, height: 700 } });
      await page.goto('data:text/html;charset=utf-8,' + encodeURIComponent(PAGE));
      const ClearDriver = require(CG('src/driver/index.js'));
      const d = new ClearDriver({ ctxMgr: {}, dom: {}, vault: {}, sse: { emit: () => {} } });
      const MAP = { mouseMove: 'mouseMoved', mouseDown: 'mousePressed', mouseUp: 'mouseReleased' };
      const wc = { executeJavaScript: (code) => page._eval(code), getURL: () => 'https://www.fiverr.com/edit',
        sendInputEvent: (e) => { if (MAP[e.type]) page._send('Input.dispatchMouseEvent', { type: MAP[e.type], x: e.x, y: e.y, button: e.type === 'mouseMove' ? 'none' : (e.button || 'left'), buttons: e.type === 'mouseDown' ? 1 : 0, clickCount: e.type === 'mouseMove' ? 0 : (e.clickCount || 1) }); } };
      d._getWebContents = () => wc;
      const out = [];
      for (const [column, days] of [['BASIC', '3'], ['STANDARD', '5'], ['PREMIUM', '30']]) out.push(await d.exec({ agentId: 'default', action: 'choose', column, shows: 'DELIVERY TIME', option: days, by: 'person', spotlight: false }));
      assert.deepStrictEqual(out.map(r => [r.kind, r.option]), [['widget', '3 Days'], ['widget', '5 Days'], ['widget', '30 Days']]);
      const shown = await page.evaluate(() => Array.from(document.querySelectorAll('.dd')).map(x => x.textContent));
      assert.deepStrictEqual(shown, ['3 Days', '5 Days', '30 Days'], 'the page shows each choice');
      const n = await d.exec({ agentId: 'default', action: 'choose', column: 'STANDARD', row: 'Number of APIs integrated', option: '2', by: 'person' });
      assert.deepStrictEqual([n.kind, n.option], ['native', '2']);
      assert.strictEqual(await page.evaluate(() => document.querySelectorAll('select')[1].value), '2');
      await assert.rejects(d.exec({ agentId: 'default', action: 'choose', column: 'PREMIUM', row: 'Number of APIs integrated', option: '9', by: 'person' }), /no option matches "9" — options: Select \| 1 \| 2 \| 3/);
      await assert.rejects(d.exec({ agentId: 'default', action: 'choose', column: 'GOLD', shows: 'DELIVERY TIME', option: '3', by: 'person' }), /no column headed "GOLD"/);
      await page.close();
    });
  } finally { try { await browser.close(); } catch (_) {} }
  done();
})();

function done() { console.log(`\n  ${passed} passed, ${failed} failed\n`); process.exitCode = failed ? 1 : 0; }
