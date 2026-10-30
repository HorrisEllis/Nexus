'use strict';
/**
 * tests/modules/test-fiverr-overview-and-a11y.test.js — a new gig's Overview filled (category, subcategory, tags, gated) and a site's
 * remembered accessibility look reset (0.60.283)
 * James, 2026-10-29: "The accessability man. i can't fix it." · "the autofill is still buggy. like i want autofill to do it all if possible.
 * can you get fiverr to work, now with the keybindings, and gates"
 *
 *   FO-01  a new gig's Overview is known (Gig title, SELECT A CATEGORY, Search tags, the new-gig address); its parts are category and tags
 *   FO-02  in Clear Glass: choose finds a dropdown by the text it shows alone; the fill picks the category, then the subcategory (whose
 *          options appear only after), each read back; the tags are typed one by one, each gated on the page showing it
 *   FO-03  the node "Fiverr gig - choose category" is bundled, gated on each value, and its gates validate
 *   FA-01  in Clear Glass: a look the site remembers (a class from its own storage at load) is found, backed up, removed, the site set to
 *          Off, the page reloaded and it stays off; nothing named as accessibility is said with what was looked at
 *   FA-02  Tab mode Off sweeps at load and keeps a removed class off when the site puts it back
 */
require('../../lib/test-sandbox.js').ensure();
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const http = require('http');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const CG = (p) => path.join(ROOT, 'clear-glass', p);

let passed = 0, failed = 0;
async function test(id, desc, fn) { try { await fn(); console.log(`  ✓ ${id} ${desc}`); passed++; } catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${(e.stack || e.message).split('\n').slice(0, 6).join('\n    ')}`); failed++; } }

// a page laid out like Fiverr's new-gig Overview: the title, two custom dropdowns (the subcategory's options appear after a category), a tags box
const OVERVIEW = `<!doctype html><html><head><style>body{font:14px sans-serif;margin:30px} .dd{border:1px solid #888;padding:10px;width:260px;cursor:pointer;margin:6px 0}
.menu{position:absolute;background:#fff;border:1px solid #888;width:260px} .menu div{padding:6px} .chip{display:inline-block;border:1px solid #ccc;padding:2px 6px;margin:2px}</style></head><body>
<h3>Gig title</h3><textarea id="t" placeholder="I will do something I'm really good at"></textarea>
<h3>Category</h3><div class="dd" id="cat">SELECT A CATEGORY</div><div class="dd" id="sub">SELECT A SUBCATEGORY</div>
<section id="tagsec"><h3>Search tags</h3><p>Positive keywords</p><div id="chips"></div><input id="tag" type="text" placeholder="Enter search terms"></section>
<script>var SUBS = { 'Programming & Tech': ['Website Development', 'AI Development', 'Chatbot Development'], 'Writing & Translation': ['Articles'] }, menu = null;
function close(){ if (menu) { menu.remove(); menu = null; } }
function open(dd, opts){ close(); menu = document.createElement('div'); menu.className = 'menu'; var r = dd.getBoundingClientRect(); menu.style.left = r.left + 'px'; menu.style.top = (r.bottom + scrollY) + 'px';
  opts.forEach(function(t){ var o = document.createElement('div'); o.textContent = t; o.onclick = function(){ dd.textContent = t; close(); if (dd.id === 'cat') document.getElementById('sub').textContent = 'SELECT A SUBCATEGORY'; }; menu.appendChild(o); }); document.body.appendChild(menu); }
document.getElementById('cat').onclick = function(){ open(this, Object.keys(SUBS)); };
document.getElementById('sub').onclick = function(){ var c = document.getElementById('cat').textContent; open(this, SUBS[c] || []); };
document.getElementById('tag').addEventListener('keydown', function(e){ if (e.key !== 'Enter' || !this.value.trim()) return; var c = document.createElement('span'); c.className = 'chip'; c.textContent = this.value.trim(); document.getElementById('chips').appendChild(c); this.value = ''; });
</script></body></html>`;

// a site that remembers its accessibility look: a class on html from its own localStorage at every load, links in yellow on black
const A11Y = `<!doctype html><html><head><style>html.a11y-mode a{color:yellow;background:black;letter-spacing:.2em}</style>
<script>if (localStorage.getItem('fvr_a11y_mode') === 'on') document.documentElement.classList.add('a11y-mode');</script></head>
<body><a href="#x">Dashboard</a><script>window.putBack = function(){ document.documentElement.classList.add('a11y-mode'); };</script></body></html>`;

(async () => {
  console.log('\n⬡  Fiverr: a new gig\'s Overview, and a site\'s remembered accessibility look\n');
  const GP = require(CG('src/autofill/gig-pages.js'));

  await test('FO-01', 'a new gig\'s Overview is known; its parts are category and tags', async () => {
    const r = GP.gigPage({ url: 'https://www.fiverr.com/users/x/manage_gigs/new?wizard=0&tab=general', title: 'Fiverr', text: 'Gig title Category SELECT A CATEGORY SELECT A SUBCATEGORY Search tags Positive keywords' });
    assert.strictEqual(r.page, 'overview', JSON.stringify(r));
    assert.strictEqual(GP.gigPage({ url: 'https://www.fiverr.com/x', text: 'Gig title Search tags' }).page, 'overview', 'two signs are enough without the address');
    assert.deepStrictEqual(GP.PARTS.overview, ['title', 'category', 'tags']);   // 2026-10-30 GF2: the title too ("work with all fields")
    assert.strictEqual(GP.valueOf({ tags: ['a', 'b', 'c', 'd', 'e', 'f'] }, 'tags'), 'a, b, c, d, e', 'at most 5');
  });

  const srv = http.createServer((req, res) => { res.setHeader('Content-Type', 'text/html'); res.end(req.url.startsWith('/a11y') ? A11Y : OVERVIEW); });
  await new Promise(r => srv.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${srv.address().port}`;
  const glass = require(CG('src/driver/glass.js'));
  let browser; try { browser = await glass.chromium.launch(); } catch (e) { console.log(`  - FO-02/FA SKIPPED: the engine could not start (${e.message.split('\n')[0]})`); }
  const MAP = { mouseMove: 'mouseMoved', mouseDown: 'mousePressed', mouseUp: 'mouseReleased' };
  const KEY = { Enter: ['Enter', 13], Down: ['ArrowDown', 40], Up: ['ArrowUp', 38], A: ['a', 65], Backspace: ['Backspace', 8] };
  const fast = { openWait: [40, 60], pickWait: [20, 30], settleWait: [60, 80], optionsWaitMs: 1500, via: 'native', spotlight: false };
  function driverOn(page) {
    const ClearDriver = require(CG('src/driver/index.js'));
    const d = new ClearDriver({ ctxMgr: {}, dom: {}, vault: {}, sse: { emit: () => {} } });
    d._getWebContents = () => ({ executeJavaScript: (c) => page._eval(c), getURL: () => base, insertText: (t) => page._send('Input.insertText', { text: t }), sendInputEvent: (e) => {
      if (MAP[e.type]) return page._send('Input.dispatchMouseEvent', { type: MAP[e.type], x: e.x, y: e.y, button: e.type === 'mouseMove' ? 'none' : (e.button || 'left'), buttons: e.type === 'mouseDown' ? 1 : 0, clickCount: e.type === 'mouseMove' ? 0 : (e.clickCount || 1) });
      if (e.type === 'char') return page._send('Input.insertText', { text: e.keyCode });
      const k = KEY[e.keyCode] || [e.keyCode, String(e.keyCode).toUpperCase().charCodeAt(0)];
      if (e.type === 'keyDown') return page._send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: k[0], code: k[0], windowsVirtualKeyCode: k[1] });
      if (e.type === 'keyUp') return page._send('Input.dispatchKeyEvent', { type: 'keyUp', key: k[0], windowsVirtualKeyCode: k[1] }); } });
    return d;
  }

  if (browser) await test('FO-02', 'in Clear Glass: category then subcategory by the text they show, read back; tags one by one, gated', async () => {
    const page = await browser.newPage({ viewport: { width: 1000, height: 800 } });
    await page.goto(base + '/users/x/manage_gigs/new?wizard=0&tab=general');
    const d = driverOn(page);
    await assert.rejects(d.exec({ agentId: 'w', action: 'choose', option: 'x' }), /choose requires selector, column with row or shows, or shows alone/);
    const Bridge = require(CG('src/ipc/bridge.js'));
    const gig = { title: 'I will build an AI agent workflow', category: 'Programming & Tech', subcategory: 'AI Development', tags: ['ai agent', 'automation', 'workflow'], packages: {} };
    // the page is served locally; what it reads is said to be at Fiverr's new-gig address (the detection reads the address too)
    const FIVERR = 'https://www.fiverr.com/users/x/manage_gigs/new?wizard=0&tab=general';
    const self = { dom: { handleQuery: async () => [], handleMutate: async () => ({}) }, postEvent: () => {}, _humanCheckGate: async () => ({ pass: true }),
      _gigTags: Bridge.prototype._gigTags, _gigFeatures: Bridge.prototype._gigFeatures,
      driver: { exec: (a) => (a.action === 'readPage' ? d.exec(a).then(x => ({ ...x, url: FIVERR }))
        : d.exec({ ...a, ...(a.action === 'choose' ? fast : {}), ...(a.action === 'type' ? { delay: 5 } : {}) })) } };
    const r = await Bridge.prototype._gigFill.call(self, { gig });
    assert.strictEqual(r.page, 'overview', JSON.stringify(r).slice(0, 400));
    const cat = r.dropdowns.find(x => x.key === 'category');
    assert.ok(cat && cat.ok && cat.via === 'built-in' && cat.option === 'Programming & Tech > AI Development', JSON.stringify(r.dropdowns) + ' ' + JSON.stringify(r.notFound));
    assert.deepStrictEqual(await page.evaluate(() => [document.getElementById('cat').textContent, document.getElementById('sub').textContent]), ['Programming & Tech', 'AI Development']);
    assert.deepStrictEqual(r.tags, { done: ['ai agent', 'automation', 'workflow'], missed: [] }, JSON.stringify(r.notFound));
    assert.deepStrictEqual(await page.evaluate(() => Array.prototype.map.call(document.querySelectorAll('.chip'), c => c.textContent)), ['ai agent', 'automation', 'workflow']);
    await page.close();
  });

  await test('FO-03', 'the node "Fiverr gig - choose category" is bundled, gated on each value', async () => {
    const N = require(path.join(ROOT, 'lib/automation-nodes.js'));
    const node = N.bundledNode(CG('automation/nodes'), 'Fiverr gig - choose category');
    assert.ok(node, 'bundled');
    const doc = N.parse(fs.readFileSync(CG('automation/nodes/fiverr-gig-choose-category.macro'), 'utf8'));
    const steps = doc.payload.steps.filter(s => s.action === 'choose');
    assert.deepStrictEqual(steps.map(s => [s.data.shows, s.data.option, s.gate.text, s.gate.retries]), [['SELECT A CATEGORY', '{{category}}', '{{category}}', 2], ['SELECT A SUBCATEGORY', '{{subcategory}}', '{{subcategory}}', 2]]);
    assert.strictEqual(doc.fingerprint, N.macroFingerprint(doc.payload));
    const GE = require(path.join(ROOT, 'lib/agent-tools/tools/clear-glass/gate-eval.js'));
    for (const s of steps) assert.ok(GE.validateGate(s.gate).ok);
    assert.match(fs.readFileSync(CG('src/ipc/bridge.js'), 'utf8'), /this\._gigNodeMacro\(agentId, 'Fiverr gig - choose category', \{ category: gig\.category, subcategory: gig\.subcategory \|\| '' \}\)/);
  });

  if (browser) await test('FA-01', 'in Clear Glass: the remembered look found, backed up, removed, the site set to Off, reloaded and gone', async () => {
    const page = await browser.newPage({ viewport: { width: 800, height: 400 } });
    await page.goto(base + '/a11y');
    await page.evaluate(() => { localStorage.setItem('fvr_a11y_mode', 'on'); localStorage.setItem('cart', '2'); });
    await page.goto(base + '/a11y');
    assert.strictEqual(await page.evaluate(() => document.documentElement.classList.contains('a11y-mode')), true, 'the site brings its look back at load');
    const Bridge = require(CG('src/ipc/bridge.js'));
    const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'fa-'));
    const set = [];
    const wc = { isDestroyed: () => false, getURL: () => base + '/a11y', executeJavaScript: (c) => page._eval(c), reload: () => { page.goto(base + '/a11y'); } };
    const self = { _electron: { webContents: { fromId: () => wc }, app: { getPath: () => userData } }, _siteProfile: () => ({ setSite: async (u, k, v) => { set.push([k, v]); return { ok: true }; } }) };
    const check = await Bridge.prototype._a11y.call(self, 7, { reset: false });
    assert.deepStrictEqual([check.found, check.storage, check.classes.html], [2, [{ area: 'local', key: 'fvr_a11y_mode' }], ['a11y-mode']], JSON.stringify(check));
    assert.ok(check.link && /0\.2|3\.2px/.test(check.link.letterSpacing + '') || check.link, 'how a link looks is said');
    // the check alone puts nothing back… it removes the class from this page view but leaves storage
    await page.goto(base + '/a11y');
    const r = await Bridge.prototype._a11y.call(self, 7, { reset: true });
    assert.ok(r.reloaded && r.backup && fs.existsSync(r.backup), JSON.stringify(r));
    assert.deepStrictEqual(JSON.parse(fs.readFileSync(r.backup, 'utf8')).storage, [{ area: 'local', key: 'fvr_a11y_mode', value: 'on' }], 'the backup holds the value, so it can be put back');
    assert.deepStrictEqual(set, [['accessibility.tabMode', 'off']]);
    await page.waitForTimeout(400);
    assert.deepStrictEqual(await page.evaluate(() => [document.documentElement.classList.contains('a11y-mode'), localStorage.getItem('fvr_a11y_mode'), localStorage.getItem('cart')]), [false, null, '2'], 'gone after the reload; his other storage kept');
    const none = await Bridge.prototype._a11y.call(self, 7, { reset: false });
    assert.ok(none.found === 0 && none.otherKeys.includes('local:cart'), 'nothing named: said, with the keys it looked at');
    await page.close();
  });

  if (browser) await test('FA-02', 'Tab mode Off sweeps at load and keeps a removed class off when the site puts it back', async () => {
    const page = await browser.newPage({ viewport: { width: 800, height: 400 } });
    await page.goto(base + '/a11y');
    await page.evaluate(() => localStorage.setItem('fvr_a11y_mode', 'on'));
    await page.goto(base + '/a11y');
    const K = require(CG('src/page/keyboard-mode.js'));
    assert.strictEqual(await page._eval(K.offScript()), 'on');
    const atLoad = await page.evaluate(() => window.__cgTabOff.atLoad);
    assert.deepStrictEqual([atLoad.classes.html, atLoad.storage.map(x => x.key)], [['a11y-mode'], ['fvr_a11y_mode']]);
    await page.evaluate(() => window.putBack());
    await page.waitForTimeout(100);
    assert.strictEqual(await page.evaluate(() => document.documentElement.classList.contains('a11y-mode')), false, 'kept off');
    assert.match(fs.readFileSync(CG('src/main/index.js'), 'utf8'), /tabMode\(url\) === 'off'/);
    await page.close();
  });

  if (browser) try { await browser.close(); } catch (_) {}
  srv.close();
  console.log(`\n  ${passed} passed, ${failed} failed\n`); process.exitCode = failed ? 1 : 0;
})();
