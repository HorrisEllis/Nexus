'use strict';
/**
 * tests/modules/test-fiverr-works.test.js — Fiverr's gig editor reachable and its dropdowns chosen, in Clear Glass (0.60.221)
 * James, 2026-10-28: "why did fiverr open in a popout window? like none of the autofill works." · "I want it just to open in a new tab." ·
 * "it needs to do the drop down menus. one by one" · "the drop down doesn't work" · "stop. just get fiverr working."
 *
 *   FW-01  decideOpen: a target=_blank link → tab; background-tab → tab behind; a sized popup → window; about:blank → window; Idearium → its page
 *   FW-02  the popup handler: a link meant as a tab is denied as a window and sent to the window it is in as cg:open-tab (from a bare window: the main window); a sized popup is allowed
 *   FW-03  the gig autofill takes Fiverr's placeholder-only pricing boxes at medium (was low: under the default floor, never filled)
 *   FW-04  option-match: '3' → '3 Days' not '30 Days'; 'Data' between two Data options is ambiguous; shows() reads back
 *   FW-05  in Clear Glass, on a page laid out like Fiverr's Scope & Pricing (and a dropdown of plain divs): choose opens each tier's custom DELIVERY TIME with the curved
 *          pointer, clicks the option, and the dropdown shows it — one by one; a native SELECT row by column + row label; a missing option
 *          is refused with the options seen
 *   FW-06  (0.60.222) the page is detected from what it shows — Overview, Scope & Pricing, or unknown (said); the suggested category is matched
 *   FW-07  a picked element is remembered per site and page, replaced by a newer pick, forgotten on request
 *   FW-08  in Clear Glass, the pick → a selector that finds exactly the picked element (three same-placeholder boxes), kept for the part
 *   FW-09  the fill on Scope & Pricing: a learned target first, delivery chosen per tier, what it could not find listed; Overview: the category link
 *   FW-10  (0.60.224) in Clear Glass, the real browser.html: the gig panel is wired (window.cg — never set before, so its buttons did nothing);
 *          Fill reports the page and lists "Point at it"; Record my choices → recordStart, then Stop → the recording kept as the page's macro
 *   FW-11  a recording becomes the page's macro: a ticked box is a check (not a toggle), no navigation, clicks wait for their element, Save /
 *          Continue left out by what the button said
 */
require('../../lib/test-sandbox.js').ensure();
process.env.APPDATA = require('fs').mkdtempSync(require('path').join(require('os').tmpdir(), 'fw-mem-'));   // page-memory's dir: never his
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
<tr><td>Revisions</td><td><div class="dv">Select</div></td><td><div class="dv">Select</div></td><td><div class="dv">Select</div></td></tr>
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
// a dropdown whose options are plain divs: no li, no option/item class, no role
document.querySelectorAll('.dv').forEach(function(dv){ dv.addEventListener('click', function(){
  document.querySelectorAll('.menu').forEach(function(p){ p.remove(); });
  var r = dv.getBoundingClientRect(), box = document.createElement('div'); box.className = 'menu pop';
  box.style.left = (r.left + scrollX) + 'px'; box.style.top = (r.bottom + scrollY) + 'px';
  ['1', '2', '3', 'Unlimited'].forEach(function(t){ var d = document.createElement('div'); d.textContent = t; d.style.padding = '4px 8px';
    d.addEventListener('click', function(ev){ ev.stopPropagation(); dv.textContent = t; box.remove(); }); box.appendChild(d); });
  document.body.appendChild(box); }); });
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

  await test('FW-02', 'the popup handler sends a link-tab to its window as cg:open-tab (from a bare window: to the main window) and denies the window; a sized popup is allowed', () => {
    const CW = require(CG('src/main/compartment-window.js'));
    const sent = []; let handler = null;
    const contents = { getType: () => 'webview', setWindowOpenHandler: (h) => { handler = h; }, on: () => {}, hostWebContents: { isDestroyed: () => false, send: (ch, d) => sent.push([ch, d]) } };
    assert.ok(CW.attach(contents));
    assert.deepStrictEqual(handler({ url: 'https://www.fiverr.com/edit', features: '', disposition: 'foreground-tab' }), { action: 'deny' });
    assert.deepStrictEqual(sent, [['cg:open-tab', { url: 'https://www.fiverr.com/edit', background: false }]]);
    assert.strictEqual(handler({ url: 'https://accounts.google.com/o', features: 'width=500,height=600', disposition: 'new-window' }).action, 'allow');
    assert.strictEqual(sent.length, 1);
    // a bare window (an earlier pop-out) has no tab strip: its link-tab goes to the main window as a tab
    const opened = []; let h2 = null;
    CW.attach({ getType: () => 'window', setWindowOpenHandler: (h) => { h2 = h; }, on: () => {}, hostWebContents: null }, { openTab: (u, o) => { opened.push([u, o.background]); return true; } });
    assert.deepStrictEqual(h2({ url: 'https://www.fiverr.com/edit2', features: '', disposition: 'foreground-tab' }), { action: 'deny' });
    assert.deepStrictEqual(opened, [['https://www.fiverr.com/edit2', false]]);
    assert.strictEqual(h2({ url: 'https://accounts.google.com/o', features: 'width=500', disposition: 'new-window' }).action, 'allow');
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

  const GP = require(CG('src/autofill/gig-pages.js'));
  await test('FW-06', 'the page is detected from what it shows; an unknown Fiverr page is said; the suggested category is matched', () => {
    const fv = 'https://www.fiverr.com/users/james_broooj/manage_gigs/x/edit';
    assert.strictEqual(GP.gigPage({ url: fv, headings: [{ text: 'Scope & Pricing' }, { text: 'Packages' }] }).page, 'pricing');
    assert.strictEqual(GP.gigPage({ url: fv, headings: [], text: 'Suggested categories\nService type\nGig metadata' }).page, 'overview');
    const u = GP.gigPage({ url: fv, headings: [{ text: 'Gallery' }] }); assert.ok(u.page === null && /point at the fields/.test(u.why), u.why);
    assert.strictEqual(GP.gigPage({ url: 'https://example.com', headings: [{ text: 'Scope & Pricing' }, { text: 'Packages' }] }).page, null);
    const links = [{ text: 'Programming & Tech > AI Development', selector: 'a:nth-of-type(1)' }, { text: 'Programming & Tech > Software Development', selector: 'a:nth-of-type(2)' }];
    assert.strictEqual(GP.suggestedCategory(links, { category: 'Programming & Tech', subcategory: 'AI Development' }).link.selector, 'a:nth-of-type(1)');
    assert.match(GP.suggestedCategory(links, { category: 'Writing', subcategory: 'Blogs' }).why, /suggested: Programming/);
  });

  await test('FW-07', 'a pick is remembered per site and page, replaced by a newer one, forgotten on request', () => {
    const mem = require(CG('src/page/page-memory.js')).createMemory({ dir: require('fs').mkdtempSync(path.join(require('os').tmpdir(), 'fw-t-')) });
    const key = GP.targetKey('pricing', 'basic.delivery');
    assert.ok(mem.setTarget('https://www.fiverr.com', key, { selector: '#a' }).ok);
    mem.setTarget('https://www.fiverr.com', key, { selector: '#b' });
    assert.strictEqual(mem.target('https://www.fiverr.com', key).selector, '#b');
    assert.strictEqual(mem.target('https://other.example', key), null);
    assert.ok(mem.forget('https://www.fiverr.com', key).ok && !mem.target('https://www.fiverr.com', key));
  });

  await test('FW-09', 'the fill does the detected page only: a learned target first, delivery per tier, the rest listed; Overview clicks the category', async () => {
    const Bridge = require(CG('src/ipc/bridge.js'));
    const gig = { title: 'I will build it', category: 'Programming & Tech', subcategory: 'AI Development', tags: [], description: 'd', faq: [], requirements: [],
      packages: { basic: { name: 'Starter', description: 'one', price: 30, deliveryDays: 3 }, standard: { name: 'Plus', description: 'two', price: 60, deliveryDays: 5 } } };
    const run = async (read) => {
      const calls = [];
      const self = { dom: { handleQuery: async () => [], handleMutate: async () => ({}) }, postEvent: () => {}, _humanCheckGate: async () => ({ pass: true }), _gigFeatures: Bridge.prototype._gigFeatures,   // 0.60.281 AP1 the package rows
        driver: { exec: async (c) => { calls.push(c); if (c.action === 'readPage') return read; if (c.action === 'choose') return { option: c.option + ' Days' }; return {}; } } };
      return { r: await Bridge.prototype._gigFill.call(self, { gig }), calls };
    };
    const mem = require(CG('src/page/page-memory.js')).shared();
    mem.setTarget('https://www.fiverr.com', 'fiverr:pricing:basic.name', { selector: '#learned-basic-name' });
    const { r, calls } = await run({ url: 'https://www.fiverr.com/edit', headings: [{ text: 'Scope & Pricing' }, { text: 'Packages' }], links: [] });
    assert.strictEqual(r.page, 'pricing');
    assert.ok(calls.some(c => c.action === 'setValue' && c.selector === '#learned-basic-name' && c.value === 'Starter'), 'the learned target is used');
    assert.deepStrictEqual(calls.filter(c => c.action === 'choose').map(c => [c.column, c.option]), [['BASIC', '3'], ['STANDARD', '5']]);
    assert.deepStrictEqual(r.notFound.map(n => n.key).sort(), ['basic.description', 'standard.description', 'standard.name'], 'listed to point at');
    assert.ok(!calls.some(c => c.action === 'pointer'), 'no category click on the pricing page');
    const o = await run({ url: 'https://www.fiverr.com/edit', headings: [], text: 'Suggested categories Gig metadata', links: [{ text: 'Programming & Tech > AI Development', selector: '#cat1' }] });
    assert.strictEqual(o.r.page, 'overview');
    assert.ok(o.calls.some(c => c.action === 'pointer' && c.selector === '#cat1' && c.do === 'click'));
    assert.ok(!o.calls.some(c => c.action === 'choose'), 'no delivery on the overview page');
    mem.forget('https://www.fiverr.com', 'fiverr:pricing:basic.name');
  });

  await test('FW-11', "a recording becomes the page's macro: a tick is a check, no navigation, clicks wait for their element, Save & Continue left out", () => {
    const { recordingToSteps } = require(CG('src/macros/recording.js'));
    const rec = recordingToSteps([
      { type: 'click', sel: 'label.c', ts: 1000 }, { type: 'click', sel: '#c1', ts: 1001 }, { type: 'change', sel: '#c1', inputType: 'checkbox', checked: true, value: 'on', ts: 1002 },
      { type: 'click', sel: '.dd', text: 'AUTOMATIONS & AGENTS', ts: 3000 }, { type: 'click', sel: '.menu > div:nth-of-type(2)', text: 'Chatbots', ts: 3300 },
      { type: 'click', sel: 'div.footer > button:nth-of-type(2)', text: 'Save & Continue', ts: 6000 }], { startUrl: 'https://www.fiverr.com/old-gig/edit' });
    assert.deepStrictEqual(rec.steps.find(x => x.action === 'check'), { action: 'check', data: { selector: '#c1', checked: true } });
    assert.ok(!rec.steps.some(x => x.action === 'type'), 'a checkbox is never "type on"');
    const { steps, dropped } = GP.pageMacroSteps(rec.steps);
    assert.ok(!steps.some(x => x.action === 'navigate'), 'no navigation to the old gig');
    assert.deepStrictEqual(steps.filter(x => x.action !== 'wait').map(x => [x.action, (x.data || {}).selector]),
      [['check', '#c1'], ['wait_for', '.dd'], ['click', '.dd'], ['wait_for', '.menu > div:nth-of-type(2)'], ['click', '.menu > div:nth-of-type(2)']]);
    assert.ok(dropped.some(d => /Save & Continue/.test(d)), JSON.stringify(dropped));
    const BA = require(path.join(ROOT, 'lib/agent-tools/tools/browser/browser-action.js'));
    for (const a of ['check', 'choose', 'select', 'pointer', 'wait_for']) assert.ok(BA.parameters.properties.action.enum.includes(a), a);
    assert.deepStrictEqual(BA.driverCall('check', { selector: '#c1', checked: true }), { action: 'check', selector: '#c1', checked: true });
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
      const pv = await d.exec({ agentId: 'default', action: 'choose', column: 'PREMIUM', row: 'Revisions', option: 'unlimited', by: 'person' });
      assert.deepStrictEqual([pv.kind, pv.option], ['widget', 'Unlimited'], 'options that are plain divs are found by what appeared on opening');
      assert.strictEqual(await page.evaluate(() => document.querySelectorAll('.dv')[2].textContent), 'Unlimited');
      await page.close();
    });

    await test('FW-08', 'in Clear Glass: the pick becomes a selector for exactly that element (three same-placeholder boxes), kept for the part', async () => {
      const page = await browser.newPage({ viewport: { width: 1100, height: 700 } });
      await page.goto('data:text/html;charset=utf-8,' + encodeURIComponent(PAGE));
      const xpath = await page.evaluate(() => { const el = document.querySelectorAll('textarea')[1]; const parts = []; let n = el;
        while (n && n.nodeType === 1) { let i = 1, s = n.previousSibling; while (s) { if (s.nodeType === 1 && s.tagName === n.tagName) i++; s = s.previousSibling; } parts.unshift(n.tagName.toLowerCase() + '[' + i + ']'); n = n.parentNode; }
        return '/' + parts.join('/'); });
      const wc = { executeJavaScript: (code) => page._eval(code), getURL: () => 'https://www.fiverr.com/edit' };
      const Bridge = require(CG('src/ipc/bridge.js'));
      const a = await Bridge.prototype._gigAssign.call({ driver: { _getWebContents: () => wc } }, { page: 'pricing', part: 'standard.name', xpath });
      assert.ok(a.ok, JSON.stringify(a));
      assert.strictEqual(await page.evaluate((sel) => { const n = document.querySelectorAll(sel); return n.length === 1 && n[0] === document.querySelectorAll('textarea')[1]; }, a.selector), true, a.selector);
      const mem = require(CG('src/page/page-memory.js')).shared();
      assert.strictEqual(mem.target('https://www.fiverr.com', 'fiverr:pricing:standard.name').selector, a.selector);
      const bad = await Bridge.prototype._gigAssign.call({ driver: { _getWebContents: () => wc } }, { page: 'pricing', part: 'gold.name', xpath });
      assert.match(bad.error, /unknown part gold.name/);
      await page.close();
    });

    await test('FW-10', 'in Clear Glass, browser.html: the gig panel is wired; Fill reports the page and "Point at it"; Record → Stop keeps the page macro', async () => {
      const { initScript } = require(CG('src/driver/cg-stub.js'));
      const page = await browser.newPage({ viewport: { width: 1280, height: 800 } }); const errors = []; page.on('pageerror', e => errors.push(e.message));
      const gig = { title: 'I will build your AI agent', tags: ['ai'], description: 'd', faq: [], requirements: [], packages: { basic: { name: 'Starter', description: 'one', price: 30, deliveryDays: 3 } } };
      await page.addInitScript(`try { localStorage.setItem('cg.gig.last', ${JSON.stringify(JSON.stringify(gig))}); } catch (_) {}`);
      await page.addInitScript(initScript({ answers: { 'providers.list': [], 'toolbar.commands': [], 'bookmarks.list': [], 'plugins.list': [], 'options.get': {},
        'autofill.gigFill': { page: 'pricing', filled: [{ key: 'basic.name' }], dropdowns: [{ key: 'basic.delivery', ok: true, option: '3 Days' }], learned: [], failed: [], skipped: [],
          notFound: [{ key: 'basic.description', why: 'not found on the page' }], macro: { name: 'fiverr pricing', ok: true, steps: 4 } },
        'autofill.gigPage': { page: 'overview', why: 'shows the category and gig metadata sections' }, 'macros.recordStart': { ok: true }, 'macros.recordStop': { ok: true, steps: [{ action: 'check', data: { selector: '#c1', checked: true } }] },
        'autofill.gigSaveRecording': { ok: true, name: 'fiverr overview', steps: 1, dropped: [] } } }));
      await page.goto(require('url').pathToFileURL(CG('renderer/browser.html')).href + '?agentId=t');
      await page.waitForTimeout(400);
      assert.strictEqual(await page.evaluate(() => typeof window.cg === 'object' && typeof window.cg.autofill.gigFill), 'function', 'window.cg is the wrapped API');
      await page.evaluate(() => document.getElementById('btn-gig').click());
      assert.ok(await page.evaluate(() => document.getElementById('gig-panel').classList.contains('visible')), 'the Fiverr button opens the panel');
      await page.evaluate(() => document.getElementById('gig-fill').click());
      await page.waitForSelector('#gig-missing .gig-miss button');
      const status = await page.evaluate(() => document.getElementById('gig-write-status').textContent);
      assert.match(status, /Scope & Pricing page: typed 1, chose 1, replayed your choices \("fiverr pricing"\)/, status);
      assert.match(await page.evaluate(() => document.getElementById('gig-missing').textContent), /basic\.description.*Point at it/);
      await page.evaluate(() => document.getElementById('gig-record').click());
      await page.waitForTimeout(200);
      assert.strictEqual(await page.evaluate(() => document.getElementById('gig-record').textContent), 'Stop and keep my choices');
      await page.evaluate(() => document.getElementById('gig-record').click());
      await page.waitForTimeout(200);
      assert.match(await page.evaluate(() => document.getElementById('gig-write-status').textContent), /Kept 1 step\(s\) as "fiverr overview"/);
      const calls = await page.evaluate(() => window.__cgCalls.map(c => c.key));
      for (const k of ['autofill.gigFill', 'autofill.gigPage', 'macros.recordStart', 'macros.recordStop', 'autofill.gigSaveRecording']) assert.ok(calls.includes(k), k);
      const saved = await page.evaluate(() => window.__cgCalls.find(c => c.key === 'autofill.gigSaveRecording').args[0]);
      assert.deepStrictEqual(saved, { page: 'overview', steps: [{ action: 'check', data: { selector: '#c1', checked: true } }] });
      assert.deepStrictEqual(errors.filter(e => /gig|cg\b/i.test(e)), []);
      await page.close();
    });
  } finally { try { await browser.close(); } catch (_) {} }
  done();
})();

function done() { console.log(`\n  ${passed} passed, ${failed} failed\n`); process.exitCode = failed ? 1 : 0; }
