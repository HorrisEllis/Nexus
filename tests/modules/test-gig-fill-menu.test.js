'use strict';
/**
 * tests/modules/test-gig-fill-menu.test.js — the gig's fill menu (GM1–GM3, 0.60.286)
 * James, 2026-10-29: "okay the autofill still isn't working, do everything you can, invent, expand, anything to get fiverr operational as a
 * source of income. need to do better than a button, make a full menu with check boxes, adn drop downs if applicable."
 *
 *   GM-01  the model: a bundled gig → a row per part (price and revisions included), choices with options holding the gig's value, ticked
 *          for the open page; apply() puts edits back
 *   GM-02  in Clear Glass: typeAt types a price at its column and row and reads it back; _gigFill with only fills the ticked parts and
 *          nothing else (price typed, revisions chosen and read back, delivery left alone)
 *   GM-03  in Clear Glass: the menu screen — rows grouped with ticks, a dropdown edit, Fill selected sends only the ticked keys with the
 *          edits and marks each row's result; a part not found offers Point at it
 */
require('../../lib/test-sandbox.js').ensure();
const assert = require('assert');
const fs = require('fs');
const http = require('http');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const CG = (p) => path.join(ROOT, 'clear-glass', p);

let passed = 0, failed = 0;
async function test(id, desc, fn) { try { await fn(); console.log(`  ✓ ${id} ${desc}`); passed++; } catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${(e.stack || e.message).split('\n').slice(0, 6).join('\n    ')}`); failed++; } }

(async () => {
  console.log('\n⬡  The gig\'s fill menu\n');
  const GM = require(CG('src/autofill/gig-menu.js'));
  const G = require(CG('src/autofill/gig.js'));
  const gig = G.parseGig(fs.readFileSync(CG('docs/gigs/ai-agent-workflow-automation.gig'), 'utf8')).gig;

  await test('GM-01', 'a row per part, price and revisions included; choices hold the gig\'s value; ticked for the page; apply puts edits back', async () => {
    const m = GM.menu(gig, 'pricing');
    const keys = m.rows.map(r => r.key);
    for (const k of ['title', 'category', 'tags', 'basic.name', 'basic.delivery', 'basic.revisions', 'basic.price', 'premium.price', 'description']) assert.ok(keys.includes(k), k);
    assert.ok(m.rows.some(r => /\.feature\./.test(r.key)), 'the package rows are rows too');
    const del = m.rows.find(r => r.key === 'basic.delivery'); assert.strictEqual(del.kind, 'choice'); assert.ok(del.options.includes(del.value) && del.value === `${gig.packages.basic.deliveryDays} day${gig.packages.basic.deliveryDays === 1 ? '' : 's'}`);
    assert.ok(m.rows.find(r => r.key === 'basic.revisions').options.includes('Unlimited'));
    assert.ok(m.rows.filter(r => r.checked).every(r => r.page === 'pricing'), 'only the open page is ticked');
    assert.ok(!m.rows.find(r => r.key === 'title').checked && m.rows.find(r => r.key === 'basic.price').checked);
    const g2 = GM.apply(gig, { 'basic.price': '$75', 'standard.revisions': 'Unlimited', 'basic.delivery': '5 days', tags: 'a, b', 'faq.0.answer': 'yes' });
    assert.deepStrictEqual([g2.packages.basic.price, g2.packages.standard.revisions, g2.packages.basic.deliveryDays, g2.tags, g2.faq[0].answer], [75, 'unlimited', 5, ['a', 'b'], 'yes']);
    assert.strictEqual(gig.packages.basic.price === 75, false, 'the gig itself is not changed');
    assert.match(GM.menu(null).why, /no gig/);
  });

  const glass = require(CG('src/driver/glass.js'));
  let browser; try { browser = await glass.chromium.launch(); } catch (e) { console.log(`  - GM-02/03 SKIPPED: the engine could not start (${e.message.split('\n')[0]})`); }
  const PAGE = `<!doctype html><html><head><title>Fiverr - edit gig</title><style>body{font:14px sans-serif;margin:0} table{margin:40px;border-collapse:collapse} td,th{border:1px solid #ccc;padding:10px;width:180px}
  .dd{cursor:pointer} .menu{position:absolute;width:200px;background:#fff;border:1px solid #888} .menu div{padding:6px} input{width:120px}</style></head><body>
  <h1>Scope &amp; Pricing</h1><h2>Packages</h2>
  <table><tr><th></th><th>BASIC</th><th>STANDARD</th><th>PREMIUM</th></tr>
  <tr><td>Delivery Time</td><td><div class="dd" id="d1">DELIVERY TIME</div></td><td><div class="dd">DELIVERY TIME</div></td><td><div class="dd">DELIVERY TIME</div></td></tr>
  <tr><td>Revisions</td><td><div class="dd">Select</div></td><td><div class="dd" id="rv2">Select</div></td><td><div class="dd">Select</div></td></tr>
  <tr><td>Price</td><td><input id="p1"></td><td><input id="p2"></td><td><input id="p3"></td></tr></table>
  <script>var menu = null; function close(){ if (menu) { menu.remove(); menu = null; } }
  document.querySelectorAll('.dd').forEach(function(dd){ dd.addEventListener('click', function(){ close();
    var opts = dd.textContent === 'DELIVERY TIME' || /day/.test(dd.textContent) ? ['1 day','3 days','5 days'] : ['1','2','3','Unlimited'];
    menu = document.createElement('div'); menu.className = 'menu'; var r = dd.getBoundingClientRect(); menu.style.left = r.left + 'px'; menu.style.top = (r.bottom + scrollY) + 'px';
    opts.forEach(function(t){ var o = document.createElement('div'); o.textContent = t; o.addEventListener('click', function(){ dd.textContent = t; close(); }); menu.appendChild(o); });
    document.body.appendChild(menu); }); });</script></body></html>`;
  const MAP = { mouseMove: 'mouseMoved', mouseDown: 'mousePressed', mouseUp: 'mouseReleased' };
  const fast = { openWait: [40, 60], pickWait: [20, 30], settleWait: [60, 80], optionsWaitMs: 1500, via: 'native', spotlight: false };
  async function driverOn(page) {
    const ClearDriver = require(CG('src/driver/index.js'));
    const d = new ClearDriver({ ctxMgr: {}, dom: {}, vault: {}, sse: { emit: () => {} } });
    d._getWebContents = () => ({ executeJavaScript: (c) => page._eval(c), getURL: () => 'https://www.fiverr.com/users/x/manage_gigs/y/edit?tab=pricing', isDestroyed: () => false, sendInputEvent: (e) => {
      if (MAP[e.type]) return page._send('Input.dispatchMouseEvent', { type: MAP[e.type], x: e.x, y: e.y, button: e.type === 'mouseMove' ? 'none' : (e.button || 'left'), buttons: e.type === 'mouseDown' ? 1 : 0, clickCount: e.type === 'mouseMove' ? 0 : (e.clickCount || 1) }); } });
    d._waitResponsive = async () => {};
    return d;
  }

  if (browser) {
    await test('GM-02', 'in Clear Glass: typeAt types a price and reads it back; _gigFill with only fills the ticked parts and nothing else', async () => {
      const page = await browser.newPage({ viewport: { width: 1000, height: 700 } });
      await page.goto('data:text/html;charset=utf-8,' + encodeURIComponent(PAGE));
      const d = await driverOn(page);
      const t = await d.exec({ agentId: 'w', action: 'typeAt', column: 'PREMIUM', row: 'Price', text: '250' });
      assert.strictEqual(t.value, '250'); assert.strictEqual(await page.evaluate(() => document.getElementById('p3').value), '250');
      await assert.rejects(d.exec({ agentId: 'w', action: 'typeAt', column: 'BASIC', row: 'Nope', text: '1' }), /no row labelled "Nope"/);
      const Bridge = require(CG('src/ipc/bridge.js'));
      const self = Object.create(Bridge.prototype);
      Object.assign(self, { dom: { handleQuery: async () => [], handleMutate: async () => ({}) }, autofillStore: null, macroTool: null, postEvent: () => {},
        _humanCheckGate: async () => ({ pass: true }), driver: { exec: (a) => d.exec({ ...a, ...(a.action === 'choose' ? fast : { via: 'native' }) }) } });
      const g = { ...gig, packages: { basic: { ...gig.packages.basic, price: 40, revisions: 2, features: {} }, standard: { ...gig.packages.standard, revisions: 'unlimited', features: {} }, premium: { ...gig.packages.premium, features: {} } } };
      const r = await self._gigFill({ gig: g, agentId: 'w', only: ['basic.price', 'standard.revisions'], replay: false, edits: { 'basic.price': '55' } });
      assert.ok(!r.error, r.error);
      assert.strictEqual(r.page, 'pricing', r.pageWhy);
      assert.deepStrictEqual(r.filled.map(f => f.key), ['basic.price']);
      assert.deepStrictEqual(r.dropdowns.map(x => `${x.key}=${x.option}`), ['standard.revisions=Unlimited']);
      assert.deepStrictEqual(r.notFound, []);
      const shown = await page.evaluate(() => [document.getElementById('p1').value, document.getElementById('p2').value, document.getElementById('rv2').textContent, document.getElementById('d1').textContent]);
      assert.deepStrictEqual(shown, ['55', '', 'Unlimited', 'DELIVERY TIME'], 'the edit is what was typed; the unticked delivery is untouched');
      await page.close();
    });

    await test('GM-03', 'in Clear Glass: the menu — grouped ticks, a dropdown edit, Fill selected sends only the ticked keys and marks each row', async () => {
      const menu = GM.menu(gig, 'pricing');
      const HTML = `<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="/browser.css"></head><body style="width:440px">
        <button id="gig-menu-open">Fill menu…</button><div id="gig-menu" class="gig-menu" hidden></div>
        <script>window.__calls = []; window.CgGigPanel = { gig: () => (${JSON.stringify(gig)}), agentId: 'w', setGig: (g) => { window.__kept = g; }, point: (p, k) => { window.__pointed = k; } };
        window.cg = { autofill: { gigMenu: async () => ({ ok: true, ...${JSON.stringify(menu)}, pageName: 'Scope & Pricing' }),
          gigFill: async (g, a, c, o) => { window.__calls.push({ c, o }); return { ok: true, page: 'pricing', filled: [{ key: 'basic.price' }], dropdowns: [{ key: 'basic.delivery', ok: true, option: '5 days' }], notFound: [{ key: 'standard.name', why: 'not found on the page' }], failed: [] }; } } };</script>
        <script src="/gig-menu.js"></script></body></html>`;
      const srv = http.createServer((req, res) => {
        const u = new URL(req.url, 'http://x');
        if (u.pathname === '/') { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); return res.end(HTML); }
        const f = CG(`renderer${u.pathname}`); if (!fs.existsSync(f)) { res.writeHead(404); return res.end(); }
        res.writeHead(200, { 'Content-Type': f.endsWith('.js') ? 'text/javascript; charset=utf-8' : 'text/css; charset=utf-8' }); fs.createReadStream(f).pipe(res);
      });
      await new Promise(r => srv.listen(0, '127.0.0.1', r));
      try {
        const page = await browser.newPage({ viewport: { width: 460, height: 1400 } });
        const errors = []; page.on('pageerror', e => errors.push(e.message));
        await page.goto(`http://127.0.0.1:${srv.address().port}/`);
        await page.click('#gig-menu-open');
        await page.waitForSelector('.gm-row');
        const groups = await page.$$eval('.gm-group legend', els => els.map(e => e.textContent.trim()));
        assert.deepStrictEqual(groups.slice(0, 2), ['Overview', 'Basic package']);
        // the basic delivery dropdown changed: the row stays ticked and its edit goes with the fill
        await page.evaluate(() => { const r = window.CgGigMenu.rows(); const i = r.findIndex(x => x.key === 'basic.delivery'); const s = document.querySelector(`.gm-val[data-i="${i}"]`); s.value = '5 days'; s.dispatchEvent(new Event('change', { bubbles: true })); });
        await page.click('[data-gm="none"]');
        await page.evaluate(() => { for (const k of ['basic.price', 'basic.delivery', 'standard.name']) { const i = window.CgGigMenu.rows().findIndex(x => x.key === k); const t = document.querySelector(`.gm-tick[data-i="${i}"]`); t.click(); } });
        assert.strictEqual(await page.textContent('.gm-count'), `3 of ${menu.rows.length} ticked`);
        await page.click('[data-gm="fill"]');
        await page.waitForFunction(() => window.__calls.length === 1 && /typed/.test(document.getElementById('gm-status').textContent));
        const call = await page.evaluate(() => window.__calls[0]);
        assert.deepStrictEqual(call.o.only, ['basic.delivery', 'basic.price', 'standard.name']);
        assert.deepStrictEqual(call.o.edits, { 'basic.delivery': '5 days' });
        const res = await page.evaluate(() => ['basic.price', 'basic.delivery', 'standard.name'].map(k => document.querySelector(`[data-res="${k}"]`).textContent));
        assert.match(res[0], /✓ typed/); assert.match(res[1], /✓ 5 days/); assert.match(res[2], /not found.*Point at it/);
        assert.strictEqual((await page.evaluate(() => window.__kept)).packages.basic.deliveryDays, 5, 'the edit is kept in his gig');
        if (process.env.GM_SHOT) await page.screenshot({ path: process.env.GM_SHOT, fullPage: true });
        assert.deepStrictEqual(errors, []);
        await page.close();
      } finally { srv.close(); }
    });
    await browser.close();
  }

  console.log(`\n  ${passed} passed, ${failed} failed\n`);
  process.exit(failed ? 1 : 0);
})();
