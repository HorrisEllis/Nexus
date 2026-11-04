'use strict';
/**
 * tests/modules/test-gig-stop-and-toast.test.js — a gate reads the element against the gig; a failed step stops with a toast (GF6, 0.60.298)
 * James, 2026-10-30, with Fiverr's category menu open and nothing chosen, and Settings › Pipelines empty: "how about having a condition to the
 * next gate, like what the element says, if it aligns with the gig. it needs to stop, and display toast with an error on any step."
 *
 *   GS-01  in Clear Glass: the page offers Suggested categories whose click does nothing; the category gate reads the dropdowns (the links always
 *          show the words, so they no longer pass it), the fill falls through to the built-in pick and both dropdowns show the gig's values
 *   GS-02  in Clear Glass: a subcategory the menu does not have stops the fill at category: nothing after it runs (no tags typed), a toast says
 *          the part and why, and Co-pilot's line says where it stopped and what was done
 *   GS-03  in Clear Glass: categoryChosenScript is closed on the suggestion links alone and open on the dropdowns; a choose's gate is the dropdown
 *          it opened (element-gate derive with the driver's selector)
 *   GS-05  in Clear Glass (2026-11-04, "it gets to the service drop down"): the gig's Service type is chosen in its row and gated on that dropdown;
 *          an option the menu does not have stops the fill there with a toast
 *   GS-06  in Clear Glass (2026-11-04, "service type still gets skipped. needs more timing"): the row appears after the subcategory and is waited for;
 *          a gig with no serviceType stops there, the dropdown's options named
 *   GS-04  Settings › Pipelines lists the bundled Fiverr gig (imported once, its gate the dropdown element); a failed pipeline task's event
 *          carries its label and error, and main turns it into a toast
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

// Fiverr's new-gig Overview as on his screen: two dropdowns, Suggested categories links (here their click does nothing), the tags box
const OVERVIEW = `<!doctype html><html><head><meta charset="utf-8"><style>body{font:14px sans-serif;margin:30px} .dd{border:1px solid #888;padding:10px;width:260px;cursor:pointer;margin:6px 0;display:inline-block}
.menu{position:absolute;background:#fff;border:1px solid #888;width:260px} .menu div{padding:6px} .chip{display:inline-block;border:1px solid #ccc;padding:2px 6px;margin:2px} a{color:#1dbf73;display:block}</style></head><body>
<h3>Gig title</h3><textarea id="t" placeholder="I will do something I'm really good at"></textarea>
<h3>Category</h3><div class="dd" id="cat">SELECT A CATEGORY</div> <div class="dd" id="sub">SELECT A SUBCATEGORY</div>
<div class="row" id="svcrow" style="display:none;gap:20px;align-items:center"><span>Service type</span><div class="dd" id="svc">SELECT A SERVICE TYPE</div></div>
<h4>Suggested categories</h4><a href="#s1" onclick="return false">Programming &amp; Tech &gt; Software Development</a><a href="#s2" onclick="return false">Programming &amp; Tech &gt; AI Development</a>
<section id="tagsec"><h3>Search tags</h3><p>Positive keywords</p><div id="chips"></div><input id="tag" type="text" placeholder="Enter search terms"></section>
<script>var SUBS = { 'Graphics & Design': ['Logo Design'], 'Programming & Tech': ['Website Development', 'AI Development', 'Chatbot Development'] }, menu = null;
function close(){ if (menu) { menu.remove(); menu = null; } }
function open(dd, opts){ close(); menu = document.createElement('div'); menu.className = 'menu'; var r = dd.getBoundingClientRect(); menu.style.left = r.left + 'px'; menu.style.top = (r.bottom + scrollY) + 'px';
  opts.forEach(function(t){ var o = document.createElement('div'); o.textContent = t; o.onclick = function(){ dd.textContent = t; close(); if (dd.id === 'cat') document.getElementById('sub').textContent = 'SELECT A SUBCATEGORY'; if (dd.id === 'sub') setTimeout(function(){ document.getElementById('svcrow').style.display = 'flex'; }, 900); }; menu.appendChild(o); }); document.body.appendChild(menu); }
document.getElementById('cat').onclick = function(){ open(this, Object.keys(SUBS)); };
document.getElementById('sub').onclick = function(){ var c = document.getElementById('cat').textContent; open(this, SUBS[c] || []); };
document.addEventListener('keydown', function(e){ if (e.key === 'Escape') close(); });
document.getElementById('svc').onclick = function(){ open(this, ['Web Application', 'Desktop Application', 'Automation']); };
document.getElementById('tag').addEventListener('keydown', function(e){ if (e.key !== 'Enter' || !this.value.trim()) return; var c = document.createElement('span'); c.className = 'chip'; c.textContent = this.value.trim(); document.getElementById('chips').appendChild(c); this.value = ''; });
</script></body></html>`;

(async () => {
  console.log('\n⬡  A gate reads the element against the gig; a failed step stops with a toast (GF6)\n');
  const srv = http.createServer((req, res) => { res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.end(OVERVIEW); });
  await new Promise(r => srv.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${srv.address().port}`;
  const glass = require(CG('src/driver/glass.js'));
  let browser; try { browser = await glass.chromium.launch(); } catch (e) { console.log(`  - GS-01..03 SKIPPED: the engine could not start (${e.message.split('\n')[0]})`); }
  const MAP = { mouseMove: 'mouseMoved', mouseDown: 'mousePressed', mouseUp: 'mouseReleased' };
  const KEY = { Enter: ['Enter', 13], Down: ['ArrowDown', 40], Up: ['ArrowUp', 38], Backspace: ['Backspace', 8], Escape: ['Escape', 27] };
  const fast = { openWait: [40, 60], pickWait: [20, 30], settleWait: [60, 80], optionsWaitMs: 1200, via: 'native', spotlight: false };
  const FIVERR = 'https://www.fiverr.com/users/x/manage_gigs/new?wizard=0&tab=general';
  const Bridge = require(CG('src/ipc/bridge.js'));
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
  function selfOn(d, toasts, chooses = []) {
    const exec = (a) => (a.action === 'readPage' ? d.exec(a).then(x => ({ ...x, url: FIVERR })) : d.exec({ ...a, ...(a.action === 'choose' ? fast : {}), ...(a.action === 'type' ? { delay: 5 } : {}) }));
    return { dom: { handleQuery: async () => [], handleMutate: async () => ({}) }, postEvent: () => {}, _humanCheckGate: async () => ({ pass: true }),
      _gigTags: Bridge.prototype._gigTags, _gigFeatures: Bridge.prototype._gigFeatures, _gigText: Bridge.prototype._gigText, _gigSiteKey: async () => ({ ok: false, why: 'no key bound for it here' }),
      _gigToast: (m) => toasts.push(m), driver: { exec: (a) => { if (a.action === 'choose') chooses.push([a.shows, a.option]); return exec(a); } } };
  }

  if (browser) await test('GS-01', 'in Clear Glass: a suggestion that does not take falls through; the dropdowns are read and show the gig', async () => {
    const page = await browser.newPage({ viewport: { width: 1000, height: 900 } });
    await page.goto(base + '/users/x/manage_gigs/new');
    const d = driverOn(page); const toasts = [], chooses = [];
    const gig = { title: 'I will build an AI agent workflow', category: 'Programming & Tech', subcategory: 'AI Development', serviceType: 'Automation', tags: ['ai agent'], packages: {} };
    const r = await Bridge.prototype._gigFill.call(selfOn(d, toasts, chooses), { gig });
    const cat = r.dropdowns.find(x => x.key === 'category');
    assert.ok(cat && cat.ok && cat.via === 'built-in' && /the suggestion "Programming & Tech > AI Development" did not take/.test(cat.why), JSON.stringify(r.dropdowns) + JSON.stringify(r.notFound));
    assert.deepStrictEqual(chooses, [['SELECT A CATEGORY', 'Programming & Tech'], ['SELECT A SUBCATEGORY', 'AI Development'], [undefined, 'Automation']], 'the Service type waited for and chosen after the row appeared');
    assert.deepStrictEqual(await page.evaluate(() => [document.getElementById('cat').textContent, document.getElementById('sub').textContent]), ['Programming & Tech', 'AI Development']);
    const g = r.gates.filter(x => x.key === 'category');
    assert.ok(g.length === 1 && g[0].open && /the dropdowns show Programming & Tech > AI Development/.test(g[0].saw), JSON.stringify(r.gates));
    assert.ok(!r.stopped && !toasts.length, JSON.stringify(toasts));
    assert.deepStrictEqual(r.tags && r.tags.done, ['ai agent'], 'the part after it ran');
    await page.close();
  });

  if (browser) await test('GS-02', 'in Clear Glass: a part that cannot be done stops the fill there, with a toast and the Co-pilot line saying so', async () => {
    const page = await browser.newPage({ viewport: { width: 1000, height: 900 } });
    await page.goto(base + '/users/x/manage_gigs/new');
    const d = driverOn(page); const toasts = [];
    const gig = { title: 'I will build an AI agent workflow', category: 'Programming & Tech', subcategory: 'Quantum Development', tags: ['ai agent', 'automation'], packages: {} };
    const r = await Bridge.prototype._gigFill.call(selfOn(d, toasts), { gig });
    assert.ok(r.stopped && r.stopped.key === 'category', JSON.stringify(r.stopped) + JSON.stringify(r.notFound));
    assert.ok(/Quantum Development/.test(r.stopped.why), r.stopped.why);
    assert.strictEqual(r.tags, undefined, 'nothing after the failed part ran (no tags typed)');
    assert.strictEqual(await page.evaluate(() => document.querySelectorAll('.chip').length), 0);
    assert.strictEqual(toasts.length, 1); assert.match(toasts[0], /^Gig fill stopped at category: .*Quantum Development/);
    const V = require(CG('src/copilot/verbs.js'));
    const line = V.describeJob({ kind: 'fill', gig: true }, { ok: true, title: gig.title, ...r });
    assert.match(line, /Filled the gig "I will build an AI agent workflow": title\. Stopped at category: /, line);
    assert.ok(!/Left to copy by hand: [^.]*\btitle\b/.test(line), 'the title it typed is not listed as left: ' + line);
    await page.close();
  });

  if (browser) await test('GS-03', 'in Clear Glass: the category check is closed on the suggestion links alone; a choose is gated on its own dropdown', async () => {
    const page = await browser.newPage({ viewport: { width: 1000, height: 900 } });
    await page.goto(base + '/users/x/manage_gigs/new');
    const GF = require(CG('src/autofill/gig-fields.js'));
    const before = await page._eval(GF.categoryChosenScript('Programming & Tech', 'AI Development'));
    assert.strictEqual(before.open, false); assert.match(before.saw, /still shown: SELECT A CATEGORY, SELECT A SUBCATEGORY/);
    const d = driverOn(page);
    const c = await d.exec({ agentId: 'x', action: 'choose', shows: 'SELECT A CATEGORY', option: 'Programming & Tech', ...fast });
    assert.match(c.selector, /^\[data-cg-choose="\d+"\]$/);
    const EG = require(CG('src/page/element-gate.js'));
    const exp = EG.derive('choose', { shows: 'SELECT A CATEGORY', option: 'Programming & Tech' }, c);
    assert.deepStrictEqual([exp.selector, exp.shows, exp.text], [c.selector, 'Programming & Tech', undefined]);
    const st = await page._eval(EG.stateScript(exp));
    assert.ok(EG.evaluate(exp, st, require(CG('src/page/option-match.js'))).open, JSON.stringify(st));
    const half = await page._eval(GF.categoryChosenScript('Programming & Tech', 'AI Development'));
    assert.strictEqual(half.open, false); assert.match(half.saw, /still shown: SELECT A SUBCATEGORY/);
    await d.exec({ agentId: 'x', action: 'choose', shows: 'SELECT A SUBCATEGORY', option: 'AI Development', ...fast });
    const after = await page._eval(GF.categoryChosenScript('Programming & Tech', 'AI Development'));
    assert.deepStrictEqual(after, { open: true, saw: 'the dropdowns show Programming & Tech > AI Development' });
    // the bundled macro's gate is the same idea as an xpath: the dropdown shows the value, the links do not count
    const N = require(path.join(ROOT, 'lib/automation-nodes.js'));
    const mac = N.parse(fs.readFileSync(CG('automation/nodes/fiverr-gig-choose-category.macro'), 'utf8'));
    assert.ok(mac.supersedes.includes('bf337cf8bb667995') && mac.fingerprint === N.macroFingerprint(mac.payload));
    const xp = mac.payload.steps[2].gate.xpath.replace(/\{\{subcategory\}\}/g, 'AI Development');
    const hits = await page.evaluate((x) => { const r = document.evaluate(x, document, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null); const o = []; for (let i = 0; i < r.snapshotLength; i++) o.push(r.snapshotItem(i).id || r.snapshotItem(i).tagName); return o; }, xp);
    assert.deepStrictEqual(hits, ['sub'], 'only the dropdown, not the "… > AI Development" suggestion link');
    await page.close();
  });

  if (browser) await test('GS-05', 'in Clear Glass: the Service type is chosen in its row and gated; a missing option stops there with a toast', async () => {
    const page = await browser.newPage({ viewport: { width: 1000, height: 900 } });
    await page.goto(base + '/users/x/manage_gigs/new');
    const d = driverOn(page); const toasts = [];
    const gig = { title: 'I will spec and architect your project', category: 'Programming & Tech', subcategory: 'AI Development', serviceType: 'Desktop Application', tags: ['spec'], packages: {} };
    const r = await Bridge.prototype._gigFill.call(selfOn(d, toasts), { gig });
    const sv = r.dropdowns.find(x => x.key === 'serviceType');
    assert.ok(sv && sv.ok && sv.option === 'Desktop Application', JSON.stringify(r.dropdowns) + JSON.stringify(r.notFound));
    assert.strictEqual(await page.evaluate(() => document.getElementById('svc').textContent), 'Desktop Application');
    assert.ok(r.gates.some(g => g.key === 'serviceType' && g.open), JSON.stringify(r.gates));
    assert.deepStrictEqual([r.stopped, toasts, r.tags && r.tags.done], [undefined, [], ['spec']]);
    await page.goto(base + '/users/x/manage_gigs/new');
    const bad = await Bridge.prototype._gigFill.call(selfOn(driverOn(page), toasts), { gig: { ...gig, serviceType: 'Mobile App' } });
    assert.ok(bad.stopped && bad.stopped.key === 'serviceType' && /Mobile App/.test(bad.stopped.why), JSON.stringify(bad.stopped));
    assert.strictEqual(bad.tags, undefined, 'the tags after it did not run');
    assert.match(toasts[0], /^Gig fill stopped at serviceType: /);
    await page.close();
  });

  if (browser) await test('GS-06', 'in Clear Glass: the page asks for a Service type the gig does not name: the fill stops there, naming its options', async () => {
    const page = await browser.newPage({ viewport: { width: 1000, height: 900 } });
    await page.goto(base + '/users/x/manage_gigs/new');
    const d = driverOn(page); const toasts = [];
    const gig = { title: 'I will spec and architect your project', category: 'Programming & Tech', subcategory: 'AI Development', tags: ['spec'], packages: {} };
    const r = await Bridge.prototype._gigFill.call(selfOn(d, toasts), { gig });
    assert.ok(r.stopped && r.stopped.key === 'serviceType', JSON.stringify(r.stopped) + JSON.stringify(r.notFound));
    assert.match(r.stopped.why, /the page asks for a Service type and the gig has none — its options: Web Application \| Desktop Application \| Automation\. Put one in the gig as serviceType/);
    assert.strictEqual(await page.evaluate(() => [document.getElementById('svc').textContent, !!document.querySelector('.menu')].join('|')), 'SELECT A SERVICE TYPE|false', 'nothing chosen, the menu closed');
    assert.strictEqual(r.tags, undefined);
    assert.match(toasts[0], /^Gig fill stopped at serviceType: the page asks for a Service type/);
    await page.close();
  });

  await test('GS-04', 'Pipelines lists the bundled Fiverr gig once; a failed task\'s event carries its label and error; main toasts it', async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'gs04-'));
    process.env.NEXUS_DATA_ROOT = tmp;
    const { AutomationEngine } = require(path.join(ROOT, 'lib/automation/engine.js'));
    const events = [];
    const A = new AutomationEngine({ busEmit: (t, d) => events.push([t, d]) });
    const R = require(path.join(ROOT, 'lib/automation/routes.js'));
    const macros = new Map();
    const deps = { bundledDir: CG('automation/nodes'), pipelinesDir: path.join(tmp, 'pipelines'), getMacro: async (n) => (macros.has(n) ? { ok: true, macro: macros.get(n) } : { ok: false }), createMacro: async (m) => { macros.set(m.name, m); return { ok: true, macro: m }; } };
    const one = await R.handle(A, { method: 'GET', url: '/automation/pipelines' }, deps);
    assert.deepStrictEqual(one.body.seeded, ['Fiverr gig'], JSON.stringify(one.body).slice(0, 300));
    const fg = one.body.pipelines.find(p => p.name === 'Fiverr gig');
    assert.ok(fg && /not\(ancestor-or-self::a\)/.test(fg.tasks[0].gate.element.xpath) && fg.tasks[0].gate.element.visible === true, JSON.stringify(fg && fg.tasks[0]));
    const two = await R.handle(A, { method: 'GET', url: '/automation/pipelines' }, deps);
    assert.deepStrictEqual([two.body.seeded, two.body.pipelines.filter(p => p.name === 'Fiverr gig').length], [[], 1], 'imported once');
    // a pipeline whose task fails: its event says the task's label and the error
    const P = A.pipelines;
    const c = P.create({ name: 'fails', tasks: [{ id: 'a', label: 'Ask nobody', step: { type: 'delay', config: { ms: 'x' } }, gate: { contains: 'never' } }] });
    assert.ok(c.ok, JSON.stringify(c));
    await P.run(c.pipeline.id, { wait: true });
    const f = events.find(([t, d]) => t === 'automation.pipeline.task' && d.status === 'failed');
    assert.ok(f && f[1].label === 'Ask nobody' && f[1].pipeline === 'fails' && f[1].error, JSON.stringify(events.slice(-3)));
    const main = fs.readFileSync(CG('src/main/index.js'), 'utf8');
    assert.match(main, /automation\.pipeline\.task' && d\.status === 'failed'\) ipcBridge && ipcBridge\._gigToast\(`Pipeline/);
    assert.match(main, /vars: \{ \.\.\.gigVars\(p, ipcBridge\), page:/);
    assert.match(fs.readFileSync(CG('src/ipc/bridge.js'), 'utf8'), /if \(r && r\.error && !d\.quiet\) \(typeof this\._gigToast[^\n]*\(`Macro/);
  });

  if (browser) try { await browser.close(); } catch (_) {}
  srv.close();
  console.log(`\n  ${passed} passed, ${failed} failed\n`); process.exitCode = failed ? 1 : 0;
})();
