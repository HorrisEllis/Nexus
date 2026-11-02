'use strict';
// run-all: timeout 300000
require('../../lib/test-sandbox.js').ensure();
/**
 * tests/modules/test-gig-metadata-dropdown-glass.test.js — FP6, 0.60.339. Spec: clear-glass/spec/flow-cores.spec MOD-FC-OPTION (choose) +
 * clear-glass/spec/gated-flows.spec MOD-GT6 (gig metadata). Map: docs/2026-10-28-first-principles-phasemap.spec FP6.
 * James, 2026-11-01: "do it, I need it fiverr ready, take screenshots if you have to. use idearium as a map if you need, or in the docs the
 * atlas. I need this working for a fact." His live AI Development page: Gig metadata is a table where AI ENGINE is a multi-select DROPDOWN
 * ("Choose…") — the picks show as chips BELOW, while the trigger keeps saying "Choose…" and the open menu is full of the wanted words. So the
 * real _gigMetadata drives the real driver's choose on a live multi-select page in Clear Glass's own engine, gated on the field's chosen chips.
 *
 *   DD-01  metaDropdownScript finds AI ENGINE + PROGRAMMING LANGUAGE as dropdown fields (not the DELIVERY TYPE radios)
 *   DD-02  his case: AI ENGINE ← Claude, ChatGPT, Gemini — three chips, each gated on the chosen state (not the trigger text); a screenshot
 *   DD-03  a value the dropdown does not offer is said with its list (§1.2); the offered ones are still chosen
 *   DD-04  idempotent: a value already chosen is not toggled back off (changed:false), the chip stays
 *   DD-05  mixed table: a dropdown field and a radio field (DELIVERY TYPE) filled in one call
 */
const assert = require('assert');
const http = require('http');
const path = require('path');
const fs = require('fs');
const ROOT = path.join(__dirname, '..', '..');
const CG = (p) => path.join(ROOT, 'clear-glass', p);
const SHOT = path.join(ROOT, '_artifacts', 'fp6-ai-engine-dropdown.png');
if (!process.env.GLASS_CHROMIUM) { const c = '/opt/pw-browsers/chromium-1243/chrome-linux64/chrome'; if (fs.existsSync(c) && !fs.existsSync(path.join(ROOT, 'node_modules/electron'))) process.env.GLASS_CHROMIUM = c; }

let passed = 0, failed = 0;
async function test(id, desc, fn) { try { await fn(); console.log(`  ✓ ${id} ${desc}`); passed++; } catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${(e.stack || e.message).split('\n').slice(0, 5).join('\n    ')}`); failed++; } }

// A live Fiverr-shaped metadata table: two multi-select "Choose…" dropdowns (chips below, the trigger never changes) and a radio group.
const PAGE = `<!doctype html><html><head><meta charset="utf-8"><style>
body{font:14px/1.4 sans-serif;margin:28px;color:#222}
h3{margin:18px 0 8px}
.row{display:flex;align-items:flex-start;gap:18px;margin:14px 0}
.lbl{width:210px;font-weight:700;text-transform:uppercase;letter-spacing:.3px;color:#404145}
.dd{position:relative;width:340px}
.trig{border:1px solid #c4c4c4;border-radius:6px;padding:9px 12px;cursor:pointer;color:#62646a;background:#fff}
.menu{position:absolute;left:0;right:0;border:1px solid #e4e5e7;border-radius:6px;background:#fff;box-shadow:0 8px 24px rgba(0,0,0,.14);margin-top:4px;z-index:9;max-height:220px;overflow:auto}
.menu [role=option]{padding:9px 12px;cursor:pointer}
.menu [role=option][aria-selected=true]{opacity:.45}
.menu [role=option]:hover{background:#eef4ff}
.chips{display:flex;flex-wrap:wrap;gap:7px;margin-top:9px}
.chip{background:#1dbf73;color:#fff;border-radius:14px;padding:3px 6px 3px 11px;font-size:12px;display:inline-flex;align-items:center;gap:5px}
.chip button{background:transparent;border:0;color:#fff;cursor:pointer;font-size:13px;line-height:1}
label.rb{display:block;padding:4px 0;cursor:pointer}
</style></head><body>
<h3>Overview</h3>
<section id="gm"><h3>Gig metadata</h3>
  <div class="row"><div class="lbl">AI ENGINE *</div>
    <div class="dd" data-f="AI ENGINE"><div class="trig">Choose...</div><div class="menu" style="display:none"></div><div class="chips"></div></div></div>
  <div class="row"><div class="lbl">DELIVERY TYPE</div>
    <div><label class="rb"><input type="radio" name="dt"> Website</label><label class="rb"><input type="radio" name="dt"> Application code</label><label class="rb"><input type="radio" name="dt"> AI model</label></div></div>
  <div class="row"><div class="lbl">PROGRAMMING LANGUAGE</div>
    <div class="dd" data-f="PROGRAMMING LANGUAGE"><div class="trig">Choose...</div><div class="menu" style="display:none"></div><div class="chips"></div></div></div>
</section>
<script>
var OPTS = { 'AI ENGINE': ['Claude','ChatGPT','Gemini','Llama','Mistral'], 'PROGRAMMING LANGUAGE': ['Python','JavaScript','TypeScript','Go'] };
window.chosen = { 'AI ENGINE': [], 'PROGRAMMING LANGUAGE': [], 'DELIVERY TYPE': [] };
document.querySelectorAll('.dd').forEach(function(dd){
  var f = dd.getAttribute('data-f'), trig = dd.querySelector('.trig'), menu = dd.querySelector('.menu'), chips = dd.querySelector('.chips');
  function renderMenu(){ menu.innerHTML=''; OPTS[f].forEach(function(o){ var d=document.createElement('div'); d.setAttribute('role','option'); d.textContent=o;
    if(window.chosen[f].indexOf(o)>=0) d.setAttribute('aria-selected','true');
    d.onclick=function(){ if(window.chosen[f].indexOf(o)<0){ window.chosen[f].push(o); renderChips(); } renderMenu(); }; menu.appendChild(d); }); }
  function renderChips(){ chips.innerHTML=''; window.chosen[f].forEach(function(o){ var c=document.createElement('span'); c.className='chip'; c.appendChild(document.createTextNode(o));
    var b=document.createElement('button'); b.textContent='\\u00d7'; b.onclick=function(e){ e.stopPropagation(); window.chosen[f]=window.chosen[f].filter(function(x){return x!==o;}); renderChips(); renderMenu(); }; c.appendChild(b); chips.appendChild(c); }); }
  trig.onclick=function(){ renderMenu(); menu.style.display='block'; };   // always (re)open with fresh nodes, as a framework renders it
});
// realistic: a click anywhere but inside the open dropdown closes it (so moving to another field dismisses the prior menu); Escape closes all
document.addEventListener('click', function(e){ var inside = e.target.closest('.dd'); document.querySelectorAll('.dd .menu').forEach(function(m){ if(!inside || !inside.contains(m)) m.style.display='none'; }); });
document.addEventListener('keydown', function(e){ if(e.key==='Escape') document.querySelectorAll('.dd .menu').forEach(function(m){ m.style.display='none'; }); });
document.querySelectorAll('input[name=dt]').forEach(function(r){ r.onchange=function(){ if(r.checked) window.chosen['DELIVERY TYPE']=[r.parentElement.textContent.trim()]; }; });
</script></body></html>`;

(async () => {
  console.log('\n⬡  Fiverr: the AI ENGINE multi-select dropdown — driven in Clear Glass on a live page\n');
  const GF = require(CG('src/autofill/gig-fields.js'));

  const srv = http.createServer((req, res) => { res.setHeader('Content-Type', 'text/html'); res.end(PAGE); });
  await new Promise(r => srv.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${srv.address().port}`;
  const glass = require(CG('src/driver/glass.js'));
  let browser; try { browser = await glass.chromium.launch(); } catch (e) { console.log(`  - DD-01..05 SKIPPED: the engine could not start (${e.message.split('\n')[0]})`); }
  const MAP = { mouseMove: 'mouseMoved', mouseDown: 'mousePressed', mouseUp: 'mouseReleased' };
  const FIVERR = 'https://www.fiverr.com/users/x/manage_gigs/new?wizard=0&tab=general';
  const Bridge = require(CG('src/ipc/bridge.js'));
  const on = async () => {
    const page = await browser.newPage({ viewport: { width: 1040, height: 820 } });
    await page.goto(base + '/users/x/manage_gigs/new?wizard=0&tab=general');
    const ClearDriver = require(CG('src/driver/index.js'));
    const d = new ClearDriver({ ctxMgr: {}, dom: {}, vault: {}, sse: { emit: () => {} } });
    d._getWebContents = () => ({ executeJavaScript: (c) => page._eval(c), getURL: () => base, sendInputEvent: (e) => {
      if (e.type === 'keyDown' || e.type === 'keyUp' || e.type === 'char') return page._send('Input.dispatchKeyEvent', { type: e.type === 'char' ? 'char' : e.type, key: e.keyCode, text: e.type === 'char' ? e.keyCode : undefined });
      if (MAP[e.type]) return page._send('Input.dispatchMouseEvent', { type: MAP[e.type], x: e.x, y: e.y, button: e.type === 'mouseMove' ? 'none' : 'left', buttons: e.type === 'mouseDown' ? 1 : 0, clickCount: e.type === 'mouseMove' ? 0 : 1 }); } });
    const self = { dom: { handleQuery: async () => [], handleMutate: async () => ({}) }, postEvent: () => {}, _humanCheckGate: async () => ({ pass: true }),
      _gigMetadata: Bridge.prototype._gigMetadata,
      driver: { exec: (a) => (a.action === 'readPage' ? d.exec(a).then(x => ({ ...x, url: FIVERR })) : d.exec({ ...a, via: 'native' })) } };
    return { page, self };
  };
  const chosen = (page) => page.evaluate(() => window.chosen);

  if (browser) {
    await test('DD-01', 'metaDropdownScript finds AI ENGINE + PROGRAMMING LANGUAGE (not the DELIVERY TYPE radios)', async () => {
      const { page } = await on();
      const r = await page.evaluate(GF.metaDropdownScript());
      assert.ok(r.found, JSON.stringify(r));
      const names = r.fields.map(f => f.name).sort();
      assert.deepStrictEqual(names, ['AI ENGINE', 'PROGRAMMING LANGUAGE'], JSON.stringify(r.fields));
      assert.ok(r.fields.every(f => f.native === false), 'these are widget dropdowns, not native <select>');
      await page.close();
    });

    await test('DD-02', 'AI ENGINE ← Claude, ChatGPT, Gemini: three chips, each gated on the chosen state; a screenshot', async () => {
      const { page, self } = await on();
      const r = await Bridge.prototype._gigMetadata.call(self, 'w', { metadata: { 'AI ENGINE': ['Claude', 'chatgpt', 'Gemini'] } });
      assert.deepStrictEqual(r.failed, [], JSON.stringify(r));
      assert.deepStrictEqual((await chosen(page))['AI ENGINE'], ['Claude', 'ChatGPT', 'Gemini'], 'all three chosen, matched case-insensitively');
      const gates = r.gates.filter(g => /^metadata\.AI ENGINE\./.test(g.key));
      assert.strictEqual(gates.length, 3, JSON.stringify(r.gates));
      assert.ok(gates.every(g => g.open), JSON.stringify(gates));
      assert.ok(r.filled.filter(f => f.tab === 'AI ENGINE' && f.via === 'dropdown' && f.changed).length === 3, JSON.stringify(r.filled));
      // his evidence: open the menu so the chips and the selected options both show, then a screenshot
      await page.evaluate(() => { var t = document.querySelector('[data-f="AI ENGINE"] .trig'); if (t) t.click(); });
      await page.screenshot({ path: SHOT });
      assert.ok(fs.existsSync(SHOT) && fs.statSync(SHOT).size > 2000, 'a screenshot was written');
      console.log(`    ↳ screenshot: ${SHOT}`);
      await page.close();
    });

    await test('DD-03', 'a value not offered is said with the list (§1.2); the offered ones still chosen', async () => {
      const { page, self } = await on();
      const r = await Bridge.prototype._gigMetadata.call(self, 'w', { metadata: { 'AI ENGINE': ['Claude', 'Grok-9 Ultra', 'Gemini'] } });
      assert.deepStrictEqual((await chosen(page))['AI ENGINE'], ['Claude', 'Gemini'], 'the two offered are chosen');
      const miss = r.failed.find(f => f.value === 'Grok-9 Ultra');
      assert.ok(miss && /Claude|ChatGPT|Gemini|Llama|Mistral/.test(miss.why), JSON.stringify(r.failed));
      await page.close();
    });

    await test('DD-04', 'idempotent: a value already chosen is not toggled back off', async () => {
      const { page, self } = await on();
      await Bridge.prototype._gigMetadata.call(self, 'w', { metadata: { 'AI ENGINE': ['Claude', 'ChatGPT'] } });
      const r = await Bridge.prototype._gigMetadata.call(self, 'w', { metadata: { 'AI ENGINE': ['Claude', 'ChatGPT', 'Gemini'] } });
      assert.deepStrictEqual((await chosen(page))['AI ENGINE'], ['Claude', 'ChatGPT', 'Gemini'], 'Claude/ChatGPT kept, Gemini added');
      const already = r.filled.filter(f => f.tab === 'AI ENGINE' && !f.changed).map(f => f.value).sort();
      assert.deepStrictEqual(already, ['ChatGPT', 'Claude'], JSON.stringify(r.filled));
      await page.close();
    });

    await test('DD-05', 'mixed table: a dropdown field and a radio field in one call', async () => {
      const { page, self } = await on();
      const r = await Bridge.prototype._gigMetadata.call(self, 'w', { metadata: { 'AI ENGINE': ['Claude'], 'DELIVERY TYPE': ['Application code'], 'PROGRAMMING LANGUAGE': ['Python', 'JavaScript'] } });
      assert.deepStrictEqual(r.failed, [], JSON.stringify(r));
      const c = await chosen(page);
      assert.deepStrictEqual(c['AI ENGINE'], ['Claude']);
      assert.deepStrictEqual(c['PROGRAMMING LANGUAGE'], ['Python', 'JavaScript']);
      assert.deepStrictEqual(c['DELIVERY TYPE'], ['Application code'], 'the radio field filled by the panel path');
      await page.close();
    });

    await browser.close();
  }
  srv.close();
  console.log(`\n  ${passed} passed, ${failed} failed\n`);
  process.exit(failed ? 1 : 0);
})();
