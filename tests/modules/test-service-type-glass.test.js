'use strict';
// run-all: timeout 240000
require('../../lib/test-sandbox.js').ensure();
/**
 * tests/modules/test-service-type-glass.test.js — GT5, 0.60.319. Spec: clear-glass/spec/gated-flows.spec MOD-GT5.
 * James, 2026-10-30: "almost. more timing in between drop down menus. then we need the services, then the bullets for each tab for each catagory."
 * Fiverr's Overview shows "Service type" once the subcategory holds: a dropdown (SELECT A SERVICE TYPE) for some subcategories, radio
 * buttons for others. The bridge's real fill (_gigFill) drives the real driver on a live fixture page in Clear Glass's engine.
 *
 *   ST-01  the gig file keeps serviceType; the parts, the chip row and an edit carry it; the template asks for it
 *   ST-02  in Clear Glass: category → subcategory → SELECT A SERVICE TYPE (arriving 1 s after the subcategory) chosen and read back
 *   ST-03  in Clear Glass: Service type as radio buttons: the one in the gig is ticked by its label and read back
 *   ST-04  in Clear Glass: a service type the page does not offer is refused with the options it does (never a guess)
 *   ST-05  in Clear Glass: no serviceType in the gig while the page asks: left for him and said, with the page's options
 */
const assert = require('assert');
const http = require('http');
const path = require('path');
const fs = require('fs');
const ROOT = path.join(__dirname, '..', '..');
const CG = (p) => path.join(ROOT, 'clear-glass', p);
if (!process.env.GLASS_CHROMIUM) { const c = '/opt/pw-browsers/chromium-1243/chrome-linux64/chrome'; if (fs.existsSync(c) && !fs.existsSync(path.join(ROOT, 'node_modules/electron'))) process.env.GLASS_CHROMIUM = c; }

let passed = 0, failed = 0;
async function test(id, desc, fn) { try { await fn(); console.log(`  ✓ ${id} ${desc}`); passed++; } catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${(e.stack || e.message).split('\n').slice(0, 4).join('\n    ')}`); failed++; } }

// a new gig's Overview; ?st=radio shows Service type as radio buttons, else a dropdown. The section appears 1 s after the subcategory is chosen.
const PAGE = (radio) => `<!doctype html><html><head><style>body{font:14px sans-serif;margin:30px} .dd{border:1px solid #888;padding:10px;width:260px;cursor:pointer;margin:6px 0}
.menu{position:absolute;background:#fff;border:1px solid #888;width:260px} .menu div{padding:6px}</style></head><body>
<h3>Gig title</h3><textarea id="t"></textarea>
<h3>Category</h3><div class="dd" id="cat">SELECT A CATEGORY</div><div class="dd" id="sub">SELECT A SUBCATEGORY</div><div id="svc"></div>
<section><h3>Search tags</h3><p>Positive keywords</p><input id="tag" type="text"></section>
<script>var SUBS = { 'Programming & Tech': ['Website Development', 'AI Development'] }, TYPES = ['AI Agents', 'AI Chatbot', 'AI Integrations'], menu = null;
function close(){ if (menu) { menu.remove(); menu = null; } }
function open(dd, opts, after){ close(); menu = document.createElement('div'); menu.className = 'menu'; var r = dd.getBoundingClientRect(); menu.style.left = r.left + 'px'; menu.style.top = (r.bottom + scrollY) + 'px';
  opts.forEach(function(t){ var o = document.createElement('div'); o.setAttribute('role', 'option'); o.textContent = t; o.onclick = function(){ dd.textContent = t; close(); if (after) after(t); }; menu.appendChild(o); }); document.body.appendChild(menu); }
function service(){ var s = document.getElementById('svc'); s.innerHTML = '<h4>Service type</h4>';
  if (${radio ? 'true' : 'false'}) TYPES.forEach(function(t, i){ var l = document.createElement('label'); l.style.display = 'block'; l.innerHTML = '<input type="radio" name="st" value="' + i + '"> ' + t; s.appendChild(l); });
  else { var d = document.createElement('div'); d.className = 'dd'; d.id = 'st'; d.setAttribute('role', 'combobox'); d.textContent = 'SELECT A SERVICE TYPE'; d.onclick = function(){ open(d, TYPES); }; s.appendChild(d); } }
document.getElementById('cat').onclick = function(){ open(this, Object.keys(SUBS), function(){ document.getElementById('sub').textContent = 'SELECT A SUBCATEGORY'; }); };
document.getElementById('sub').onclick = function(){ open(this, SUBS[document.getElementById('cat').textContent] || [], function(){ setTimeout(service, 1000); }); };
</script></body></html>`;

(async () => {
  console.log('\n⬡  Fiverr: the service type, after the subcategory — driven in Clear Glass on a live page\n');
  const G = require(CG('src/autofill/gig.js')), M = require(CG('src/autofill/gig-menu.js')), GP = require(CG('src/autofill/gig-pages.js'));

  await test('ST-01', 'the gig file keeps serviceType; parts, chip row and an edit carry it; the template asks for it', async () => {
    const p = G.parseGig(JSON.stringify({ title: 'I will build an AI agent', category: 'Programming & Tech', subcategory: 'AI Development', serviceType: 'AI Agents', tags: ['ai'], description: 'x'.repeat(200), packages: {} }));
    assert.ok(p.ok); assert.strictEqual(p.gig.serviceType, 'AI Agents');
    assert.strictEqual(G.gigParts(p.gig).find(x => x.key === 'serviceType').text, 'AI Agents');
    assert.strictEqual(M.menu(p.gig).rows.find(x => x.key === 'serviceType').value, 'AI Agents');
    assert.strictEqual(M.apply(p.gig, { serviceType: 'AI Chatbot' }).serviceType, 'AI Chatbot');
    assert.ok(/serviceType:/.test(G.gigTemplate().text), 'the template has the line');
    assert.deepStrictEqual(GP.PARTS.overview, ['title', 'category', 'serviceType', 'tags']);
    assert.strictEqual(GP.valueOf({}, 'serviceType'), null, 'none in the gig: nothing to fill');
  });

  const srv = http.createServer((req, res) => { res.setHeader('Content-Type', 'text/html'); res.end(PAGE(/st=radio/.test(req.url))); });
  await new Promise(r => srv.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${srv.address().port}`;
  const glass = require(CG('src/driver/glass.js'));
  let browser; try { browser = await glass.chromium.launch(); } catch (e) { console.log(`  - ST-02..05 SKIPPED: the engine could not start (${e.message.split('\n')[0]})`); }
  const MAP = { mouseMove: 'mouseMoved', mouseDown: 'mousePressed', mouseUp: 'mouseReleased' };
  const fast = { openWait: [40, 60], pickWait: [20, 30], settleWait: [60, 80], optionsWaitMs: 1500, via: 'native', spotlight: false };
  const FIVERR = 'https://www.fiverr.com/users/x/manage_gigs/new?wizard=0&tab=general';
  const fill = async (query, gig) => {
    const page = await browser.newPage({ viewport: { width: 1000, height: 900 } });
    await page.goto(base + '/users/x/manage_gigs/new?wizard=0&tab=general' + query);
    const ClearDriver = require(CG('src/driver/index.js')), Bridge = require(CG('src/ipc/bridge.js'));
    const d = new ClearDriver({ ctxMgr: {}, dom: {}, vault: {}, sse: { emit: () => {} } });
    d._getWebContents = () => ({ executeJavaScript: (c) => page._eval(c), getURL: () => base, sendInputEvent: (e) => {
      if (MAP[e.type]) return page._send('Input.dispatchMouseEvent', { type: MAP[e.type], x: e.x, y: e.y, button: e.type === 'mouseMove' ? 'none' : 'left', buttons: e.type === 'mouseDown' ? 1 : 0, clickCount: e.type === 'mouseMove' ? 0 : 1 }); } });
    const self = { dom: { handleQuery: async () => [], handleMutate: async () => ({}) }, postEvent: () => {}, _humanCheckGate: async () => ({ pass: true }),
      _gigTags: Bridge.prototype._gigTags, _gigFeatures: Bridge.prototype._gigFeatures, _gigText: Bridge.prototype._gigText,
      driver: { exec: (a) => (a.action === 'readPage' ? d.exec(a).then(x => ({ ...x, url: FIVERR })) : d.exec({ ...a, ...(a.action === 'choose' ? fast : { via: 'native' }) })) } };
    const r = await Bridge.prototype._gigFill.call(self, { gig: { title: 'I will build an AI agent', category: 'Programming & Tech', subcategory: 'AI Development', tags: [], packages: {}, ...gig } });
    return { r, page };
  };

  if (browser) {
    await test('ST-02', 'in Clear Glass: category → subcategory → SELECT A SERVICE TYPE (1 s later) chosen and read back', async () => {
      const { r, page } = await fill('', { serviceType: 'AI Chatbot' });
      const st = r.dropdowns.find(x => x.key === 'serviceType');
      assert.ok(st && st.ok && st.via === 'dropdown', JSON.stringify(r.dropdowns) + ' ' + JSON.stringify(r.notFound));
      assert.deepStrictEqual(await page.evaluate(() => [document.getElementById('cat').textContent, document.getElementById('sub').textContent, document.getElementById('st').textContent]), ['Programming & Tech', 'AI Development', 'AI Chatbot']);
      assert.ok(r.gates.some(g => g.key === 'serviceType' && g.open && g.kind === 'choice'), JSON.stringify(r.gates));
      await page.close();
    });
    await test('ST-03', 'in Clear Glass: Service type as radio buttons: ticked by its label, read back', async () => {
      const { r, page } = await fill('&st=radio', { serviceType: 'ai integrations' });
      const st = r.dropdowns.find(x => x.key === 'serviceType');
      assert.ok(st && st.ok && st.via === 'radio' && st.option === 'AI Integrations', JSON.stringify(r.dropdowns) + ' ' + JSON.stringify(r.notFound));
      assert.deepStrictEqual(await page.evaluate(() => Array.prototype.map.call(document.querySelectorAll('input[type=radio]'), i => i.checked)), [false, false, true]);
      await page.close();
    });
    await test('ST-04', 'in Clear Glass: a service type the page does not offer is refused with the options it does', async () => {
      const { r, page } = await fill('&st=radio', { serviceType: 'Quantum Toasters' });
      const nf = r.notFound.find(x => x.key === 'serviceType');
      assert.ok(nf && /AI Agents \| AI Chatbot \| AI Integrations/.test(nf.why), JSON.stringify(r.notFound));
      assert.deepStrictEqual(await page.evaluate(() => Array.prototype.map.call(document.querySelectorAll('input[type=radio]'), i => i.checked)), [false, false, false], 'nothing guessed');
      await page.close();
    });
    await test('ST-05', 'in Clear Glass: no serviceType in the gig while the page asks: left for him, said with the options', async () => {
      const { r, page } = await fill('&st=radio', {});
      await new Promise(res => setTimeout(res, 0));
      const nf = r.notFound.find(x => x.key === 'serviceType');
      assert.ok(nf && /left for you/.test(nf.why) && /AI Chatbot/.test(nf.why), JSON.stringify(r.notFound));
      await page.close();
    });
    await browser.close();
  }
  srv.close();
  console.log(`\n  ${passed} passed, ${failed} failed\n`);
  process.exit(failed ? 1 : 0);
})();
