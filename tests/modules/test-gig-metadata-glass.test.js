'use strict';
// run-all: timeout 240000
require('../../lib/test-sandbox.js').ensure();
/**
 * tests/modules/test-gig-metadata-glass.test.js — GT6, 0.60.320. Spec: clear-glass/spec/gated-flows.spec MOD-GT6.
 * James, 2026-10-30: "then the bullets for each tab for each catagory." His screenshot: Gig metadata, tabs PROGRAMMING LANGUAGE* (one
 * choice), FRONTEND FRAMEWORK and BACKEND FRAMEWORK (up to five, a counter "0 / 5"), EXPERTISE. The bridge's real _gigMetadata (and the
 * real _gigFill) drive the real driver on a live fixture page in Clear Glass's engine. The panel re-renders on every tab click, as a
 * framework's does, and the page itself refuses a sixth box.
 *
 *   MD-01  the gig file keeps metadata as { TAB: [values] } (a lone value, a "*" in the name); parts, chip row, edits and template carry it
 *   MD-02  his acceptance: JavaScript in PROGRAMMING LANGUAGE, three frontend frameworks ticked and read back, the counter 3 / 5
 *   MD-03  past the limit: the first five kept, the sixth said, nothing else unticked
 *   MD-04  a value the tab does not offer and a tab the page does not have: each said with the page's own list
 *   MD-05  a required tab (*) the gig names nothing for: said before the fill ends, with its list; nothing chosen for him
 *   MD-06  through the fill (_gigFill on the Overview): r.metadata carries it, and a gate per value
 *   MD-07  GT6b 0.60.342 — James, 2026-11-01: "still not doing the metadata. everything but the meta data." His screen: AI ENGINE*, whose
 *          choices are a "CHOOSE ..." dropdown and an "Other" radio. Two engines picked through the dropdown and read back; one not offered,
 *          said with the dropdown's own list; nothing ticked that he did not name
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

const PAGE = `<!doctype html><html><head><style>body{font:14px sans-serif;margin:30px} #tabs li{cursor:pointer;padding:6px;list-style:none} #tabs li.active{font-weight:bold}
#meta{display:flex;gap:30px} label{display:block;padding:3px}</style></head><body>
<h3>Gig title</h3><textarea id="t"></textarea>
<section id="gm"><h3>Gig metadata</h3><div id="meta"><ul id="tabs"></ul><div id="panel"></div></div></section>
<section><h3>Search tags</h3><p>Positive keywords</p><input id="tag" type="text"></section>
<script>
var TABS = [{ n: 'PROGRAMMING LANGUAGE', req: true, kind: 'radio', opts: ['JavaScript', 'Python', 'TypeScript', 'Go'] },
  { n: 'FRONTEND FRAMEWORK', kind: 'checkbox', limit: 5, opts: ['React', 'Vue.js', 'Angular', 'Svelte', 'Next.js', 'Nuxt.js', 'Ember'] },
  { n: 'BACKEND FRAMEWORK', kind: 'checkbox', limit: 5, opts: ['Express', 'Django', 'Flask', 'Rails'] },
  { n: 'EXPERTISE', req: true, kind: 'checkbox', limit: 5, opts: ['Chatbots', 'Agents', 'RAG'] }];
var chosen = {}, cur = 0; TABS.forEach(function(t){ chosen[t.n] = []; });
function renderTabs(){ var ul = document.getElementById('tabs'); ul.innerHTML = '';
  TABS.forEach(function(t, i){ var li = document.createElement('li'); li.textContent = t.n + (t.req ? '*' : ''); if (i === cur) li.className = 'active'; li.onclick = function(){ cur = i; renderTabs(); renderPanel(); }; ul.appendChild(li); }); }
function renderPanel(){ var t = TABS[cur], p = document.getElementById('panel'); p.innerHTML = '';   // a fresh panel every time, as a framework renders it
  t.opts.forEach(function(o){ var l = document.createElement('label'), b = document.createElement('input'); b.type = t.kind; b.name = 'x'; b.checked = chosen[t.n].indexOf(o) >= 0;
    if (t.kind === 'checkbox' && !b.checked && chosen[t.n].length >= t.limit) b.disabled = true;
    b.onchange = function(){ if (t.kind === 'radio') chosen[t.n] = [o]; else if (b.checked) chosen[t.n].push(o); else chosen[t.n] = chosen[t.n].filter(function(x){ return x !== o; }); setTimeout(renderPanel, 50); };
    l.appendChild(b); l.appendChild(document.createTextNode(' ' + o)); p.appendChild(l); });
  if (t.limit) { var c = document.createElement('div'); c.textContent = chosen[t.n].length + ' / ' + t.limit; p.appendChild(c); } }
renderTabs(); renderPanel();
</script></body></html>`;

const PAGE_DD = `<!doctype html><html><head><style>body{font:14px sans-serif;margin:30px} #tabs li{cursor:pointer;padding:6px;list-style:none} #tabs li.active{font-weight:bold}
#meta{display:flex;gap:30px} .dd{border:1px solid #999;padding:6px;cursor:pointer;width:120px} .list div{padding:4px;cursor:pointer} .chip{margin-right:6px}</style></head><body>
<section id="gm"><h3>Gig metadata</h3><div id="meta"><ul id="tabs"></ul><div id="panel"></div></div></section>
<script>
var TABS = [{ n: 'AI ENGINE', req: true, opts: ['ChatGPT', 'Claude', 'Gemini', 'Llama'] }, { n: 'DELIVERY TYPE', req: true, opts: ['Code', 'Hosted app'] }];
var chosen = {}, other = {}, cur = 0, open = false; TABS.forEach(function(t){ chosen[t.n] = []; other[t.n] = false; });
function renderTabs(){ var ul = document.getElementById('tabs'); ul.innerHTML = '';
  TABS.forEach(function(t, i){ var li = document.createElement('li'); li.textContent = t.n + (t.req ? ' *' : ''); if (i === cur) li.className = 'active'; li.onclick = function(){ cur = i; open = false; renderTabs(); renderPanel(); }; ul.appendChild(li); }); }
function renderPanel(){ var t = TABS[cur], p = document.getElementById('panel'); p.innerHTML = '';
  var h = document.createElement('p'); h.textContent = 'Please choose which AI engine(s) you have experience working with:'; p.appendChild(h);
  var chips = document.createElement('div'); chosen[t.n].forEach(function(o){ var c = document.createElement('span'); c.className = 'chip'; c.textContent = o; chips.appendChild(c); }); p.appendChild(chips);
  var dd = document.createElement('div'); dd.className = 'dd'; dd.textContent = 'CHOOSE ...'; dd.onclick = function(){ open = !open; renderPanel(); }; p.appendChild(dd);
  if (open) { var l = document.createElement('div'); l.className = 'list'; t.opts.filter(function(o){ return chosen[t.n].indexOf(o) < 0; }).forEach(function(o){ var d = document.createElement('div'); d.textContent = o;
    d.onclick = function(){ chosen[t.n].push(o); open = false; setTimeout(renderPanel, 50); }; l.appendChild(d); }); p.appendChild(l); }
  var lab = document.createElement('label'), b = document.createElement('input'); b.type = 'radio'; b.checked = other[t.n]; b.onchange = function(){ other[t.n] = true; renderPanel(); };
  lab.appendChild(b); lab.appendChild(document.createTextNode(' Other')); p.appendChild(lab); }
renderTabs(); renderPanel();
</script></body></html>`;

(async () => {
  console.log('\n⬡  Fiverr: the Gig metadata bullets, tab by tab — driven in Clear Glass on a live page\n');
  const G = require(CG('src/autofill/gig.js')), M = require(CG('src/autofill/gig-menu.js'));

  await test('MD-01', 'the gig file keeps metadata; parts, chip row, edits and template carry it', async () => {
    const p = G.parseGig(JSON.stringify({ title: 'I will build an AI agent', category: 'Programming & Tech', subcategory: 'AI Development', metadata: { 'PROGRAMMING LANGUAGE*': 'JavaScript', 'FRONTEND FRAMEWORK': ['React', 'Vue.js'], EMPTY: [] }, tags: ['ai'], description: 'x'.repeat(200), packages: {} }));
    assert.ok(p.ok);
    assert.deepStrictEqual(p.gig.metadata, { 'PROGRAMMING LANGUAGE': ['JavaScript'], 'FRONTEND FRAMEWORK': ['React', 'Vue.js'] });
    assert.strictEqual(G.gigParts(p.gig).find(x => x.key === 'metadata').text, 'PROGRAMMING LANGUAGE: JavaScript · FRONTEND FRAMEWORK: React, Vue.js');
    const row = M.menu(p.gig).rows.find(x => x.key === 'metadata');
    assert.deepStrictEqual(M.apply(p.gig, { metadata: row.value }).metadata, p.gig.metadata, 'the row reads back as it was written');
    assert.deepStrictEqual(M.apply(p.gig, { metadata: 'EXPERTISE: Agents, RAG' }).metadata, { EXPERTISE: ['Agents', 'RAG'] });
    assert.ok(/metadata:/.test(G.gigTemplate().text));
  });

  const srv = http.createServer((req, res) => { res.setHeader('Content-Type', 'text/html'); res.end(/[?&]dd=1/.test(req.url) ? PAGE_DD : PAGE); });
  await new Promise(r => srv.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${srv.address().port}`;
  const glass = require(CG('src/driver/glass.js'));
  let browser; try { browser = await glass.chromium.launch(); } catch (e) { console.log(`  - MD-02..06 SKIPPED: the engine could not start (${e.message.split('\n')[0]})`); }
  const MAP = { mouseMove: 'mouseMoved', mouseDown: 'mousePressed', mouseUp: 'mouseReleased' };
  const FIVERR = 'https://www.fiverr.com/users/x/manage_gigs/new?wizard=0&tab=general';
  const Bridge = require(CG('src/ipc/bridge.js'));
  const on = async (dd = false) => {
    const page = await browser.newPage({ viewport: { width: 1000, height: 900 } });
    await page.goto(base + '/users/x/manage_gigs/new?wizard=0&tab=general' + (dd ? '&dd=1' : ''));
    const ClearDriver = require(CG('src/driver/index.js'));
    const d = new ClearDriver({ ctxMgr: {}, dom: {}, vault: {}, sse: { emit: () => {} } });
    d._getWebContents = () => ({ executeJavaScript: (c) => page._eval(c), getURL: () => base, sendInputEvent: (e) => {
      if (MAP[e.type]) return page._send('Input.dispatchMouseEvent', { type: MAP[e.type], x: e.x, y: e.y, button: e.type === 'mouseMove' ? 'none' : 'left', buttons: e.type === 'mouseDown' ? 1 : 0, clickCount: e.type === 'mouseMove' ? 0 : 1 }); } });
    const self = { dom: { handleQuery: async () => [], handleMutate: async () => ({}) }, postEvent: () => {}, _humanCheckGate: async () => ({ pass: true }),
      _gigTags: Bridge.prototype._gigTags, _gigFeatures: Bridge.prototype._gigFeatures, _gigText: Bridge.prototype._gigText, _gigMetadata: Bridge.prototype._gigMetadata,
      driver: { exec: (a) => (a.action === 'readPage' ? d.exec(a).then(x => ({ ...x, url: FIVERR })) : d.exec({ ...a, via: 'native' })) } };
    return { page, self };
  };
  const chosen = (page) => page.evaluate(() => chosen);

  if (browser) {
    await test('MD-02', 'his acceptance: JavaScript in PROGRAMMING LANGUAGE, three frontend frameworks ticked and read back, 3 / 5', async () => {
      const { page, self } = await on();
      const r = await Bridge.prototype._gigMetadata.call(self, 'w', { metadata: { 'PROGRAMMING LANGUAGE': ['JavaScript'], 'FRONTEND FRAMEWORK': ['React', 'vue.js', 'Svelte'], EXPERTISE: ['Agents'] } });
      assert.deepStrictEqual(r.failed, [], JSON.stringify(r));
      const c = await chosen(page);
      assert.deepStrictEqual([c['PROGRAMMING LANGUAGE'], c['FRONTEND FRAMEWORK'], c.EXPERTISE], [['JavaScript'], ['React', 'Vue.js', 'Svelte'], ['Agents']]);
      assert.ok(r.filled.filter(f => f.tab === 'FRONTEND FRAMEWORK').every(f => f.counter === '3 / 5'), JSON.stringify(r.filled));
      assert.strictEqual(r.gates.filter(g => /^metadata\.FRONTEND FRAMEWORK\./.test(g.key) && g.open).length, 3, JSON.stringify(r.gates));
      assert.deepStrictEqual(r.left, [], 'both required tabs have a value');
      await page.close();
    });
    await test('MD-03', 'past the limit: the first five kept, the sixth said, nothing else unticked', async () => {
      const { page, self } = await on();
      const six = ['React', 'Vue.js', 'Angular', 'Svelte', 'Next.js', 'Nuxt.js'];
      const r = await Bridge.prototype._gigMetadata.call(self, 'w', { metadata: { 'FRONTEND FRAMEWORK': six } });
      assert.deepStrictEqual((await chosen(page))['FRONTEND FRAMEWORK'], six.slice(0, 5));
      assert.deepStrictEqual(r.over.map(o => o.value), ['Nuxt.js'], JSON.stringify(r));
      assert.ok(/takes 5 and has 5/.test(r.over[0].why));
      await page.close();
    });
    await test('MD-04', 'a value the tab does not offer, and a tab the page does not have: each said with the page\'s own list', async () => {
      const { page, self } = await on();
      const r = await Bridge.prototype._gigMetadata.call(self, 'w', { metadata: { 'BACKEND FRAMEWORK': ['Cobol on Wheels', 'Django'], 'DATABASE': ['Postgres'] } });
      const v = r.failed.find(f => f.value === 'Cobol on Wheels'), t = r.failed.find(f => f.tab === 'DATABASE');
      assert.ok(v && /Express \| Django \| Flask \| Rails/.test(v.why), JSON.stringify(r.failed));
      assert.ok(t && /PROGRAMMING LANGUAGE \| FRONTEND FRAMEWORK \| BACKEND FRAMEWORK \| EXPERTISE/.test(t.why), JSON.stringify(r.failed));
      assert.deepStrictEqual((await chosen(page))['BACKEND FRAMEWORK'], ['Django'], 'the one offered still ticked');
      await page.close();
    });
    await test('MD-05', 'a required tab (*) the gig names nothing for: said with its list; nothing chosen for him', async () => {
      const { page, self } = await on();
      const r = await Bridge.prototype._gigMetadata.call(self, 'w', { metadata: { 'FRONTEND FRAMEWORK': ['React'] } });
      assert.deepStrictEqual(r.left.map(l => l.tab), ['PROGRAMMING LANGUAGE', 'EXPERTISE'], JSON.stringify(r));
      assert.ok(/JavaScript \| Python \| TypeScript \| Go/.test(r.left[0].why));
      const c = await chosen(page); assert.deepStrictEqual([c['PROGRAMMING LANGUAGE'], c.EXPERTISE], [[], []]);
      await page.close();
    });
    await test('MD-06', 'through the fill (_gigFill on the Overview): r.metadata carries it, a gate per value', async () => {
      const { page, self } = await on();
      const r = await Bridge.prototype._gigFill.call(self, { gig: { title: 'I will build an AI agent', tags: [], packages: {}, metadata: { 'PROGRAMMING LANGUAGE': ['Python'], EXPERTISE: ['RAG'] } } });
      assert.strictEqual(r.page, 'overview', JSON.stringify(r).slice(0, 300));
      assert.ok(r.metadata && r.metadata.filled.length === 2, JSON.stringify(r.metadata));
      const c = await chosen(page); assert.deepStrictEqual([c['PROGRAMMING LANGUAGE'], c.EXPERTISE], [['Python'], ['RAG']]);
      await page.close();
    });
    await test('MD-07', 'GT6b: AI ENGINE as on his screen — a CHOOSE dropdown and an Other radio; two engines picked and read back, one not offered said', async () => {
      const { page, self } = await on(true);
      const r = await Bridge.prototype._gigMetadata.call(self, 'w', { metadata: { 'AI ENGINE': ['Claude', 'ChatGPT', 'Grok'], 'DELIVERY TYPE': ['Code'] } });
      const c = await page.evaluate(() => ({ chosen, other }));
      assert.deepStrictEqual(c.chosen['AI ENGINE'], ['Claude', 'ChatGPT'], JSON.stringify(r));
      assert.deepStrictEqual(c.chosen['DELIVERY TYPE'], ['Code'], JSON.stringify(r));
      assert.deepStrictEqual([c.other['AI ENGINE'], c.other['DELIVERY TYPE']], [false, false], 'Other is never ticked for him');
      assert.deepStrictEqual(r.filled.map(f => `${f.tab}:${f.value}:${f.via}`), ['AI ENGINE:Claude:dropdown', 'AI ENGINE:ChatGPT:dropdown', 'DELIVERY TYPE:Code:dropdown'], JSON.stringify(r));
      assert.strictEqual(r.gates.filter(g => /^metadata\.AI ENGINE\./.test(g.key) && g.open).length, 2, JSON.stringify(r.gates));
      const grok = r.failed.find(f => f.value === 'Grok');
      assert.ok(grok && /Gemini/.test(grok.why), `Grok said with the dropdown's own list: ${JSON.stringify(r.failed)}`);
      await page.close();
    });
    await browser.close();
  }
  srv.close();
  console.log(`\n  ${passed} passed, ${failed} failed\n`);
  process.exit(failed ? 1 : 0);
})();
