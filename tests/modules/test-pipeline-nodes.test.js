'use strict';
/**
 * tests/modules/test-pipeline-nodes.test.js — .pipeline node files; the editor picks from Clear Glass and node files; the Fiverr gig as a
 * pipeline; the black chip on dropdowns (PN1–PN4, AF6; 0.60.296)
 * James, 2026-10-30: "should we rebuild the fiverr plugin? can you export the .macro and .automation nodes to the .pipeline node and import into
 * the pipeline section of clearglass? ... when it shows the black autfill chip, can you make that work for drop down also? that way the pipeline
 * feature can choose macros and automation nodes from clearglass and node files. these are meant to be actual persistent files in the backend.
 * all nodes are supposed to be physcial files for each system."
 *
 *   PN-01  a pipeline exports as a .pipeline node with the macros, workflows and nested pipelines it runs; it imports back, each task pointed
 *          at what came in, and runs
 *   PN-02  each pipeline is a .pipeline node file on disk; an old JSON pipeline is rewritten as one and the JSON archived
 *   PN-03  in Clear Glass: the Pipelines editor lists Clear Glass's macros, the workflows and the node files for a task; a node file picked is
 *          imported, and the task names what came in; Export and Import are there
 *   PN-04  the bundled Fiverr gig pipeline parses, validates, names fiverr.com, and imports with its macros and workflow
 *   AF-06  in Clear Glass: a new gig's dropdowns and a pricing table's DELIVERY TIME per package are marked for the chip; clicking the chip on
 *          SELECT A CATEGORY chooses the category, read back
 */
require('../../lib/test-sandbox.js').ensure();
const _log = console.log; console.log = (...a) => { const s = a[0]; if (typeof s === 'string' && s.startsWith('[jaa]')) return; _log(...a); };
const fs = require('fs');
const os = require('os');
const path = require('path');
// the engine keeps its store under NEXUS_DATA_ROOT, read when it is required: a folder of this test's own, never data/
process.env.NEXUS_DATA_ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'pn-data-'));
const assert = require('assert');
const http = require('http');
const ROOT = path.join(__dirname, '..', '..');
const CG = (p) => path.join(ROOT, 'clear-glass', p);

let passed = 0, failed = 0;
async function test(id, desc, fn) { try { await fn(); console.log(`  ✓ ${id} ${desc}`); passed++; } catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${(e.stack || e.message).split('\n').slice(0, 6).join('\n    ')}`); failed++; } }

(async () => {
  console.log('\n⬡  .pipeline nodes, the editor picker, the Fiverr pipeline, the chip on dropdowns\n');
  const N = require(path.join(ROOT, 'lib/automation-nodes.js'));
  const PL = require(path.join(ROOT, 'lib/automation/pipeline.js'));
  const { AutomationEngine } = require(path.join(ROOT, 'lib/automation/engine.js'));
  assert.ok(require(path.join(ROOT, 'lib/automation/engine.js')).WORKFLOWS_DIR.startsWith(process.env.NEXUS_DATA_ROOT), 'the engine is on this test\'s folder');

  const macros = new Map();
  const getMacro = async (n) => (macros.has(n) ? { ok: true, macro: macros.get(n) } : { ok: false });
  const createMacro = async (m) => { macros.set(m.name, { uuid: `m-${m.name}`, ...m }); return { ok: true }; };
  const ran = [];
  const e = new AutomationEngine({ runMacroFn: async ({ name, params }) => { ran.push([name, params]); return { ok: true }; } });

  await test('PN-01', 'export with what it runs bundled; import back pointed at what came in; it runs', async () => {
    await createMacro({ name: 'pn fill email', steps: [{ action: 'type', data: { selector: '#email', text: '{{email}}' } }], params: ['email'] });
    const wf = e.create({ name: 'pn wf', steps: [{ id: 'm', type: 'macro', config: { name: 'pn fill email', params: { email: 'a@b.co' } } }] });
    assert.ok(wf.workflow, JSON.stringify(wf));
    const P = e.pipelines || (e.pipelines = new PL.Pipelines(e));
    const inner = P.create({ name: 'pn inner', tasks: [{ id: 'w', step: { type: 'workflow', config: { workflow: 'pn wf' } } }] });
    const outer = P.create({ name: 'pn outer', site: 'https://www.upwork.com', tasks: [
      { id: 'm', step: { type: 'macro', config: { name: 'pn fill email', params: { email: 'x@y.co' } } } },
      { id: 'p', depends_on: ['m'], step: { type: 'pipeline', config: { pipeline: 'pn inner' } } }] });
    assert.ok(inner.ok && outer.ok, JSON.stringify([inner, outer]));
    const n = await N.pipelineNode(e, outer.pipeline.id, { getMacro });
    assert.ok(n.ok && n.filename === 'pn-outer.pipeline' && !n.missing.length, JSON.stringify(n.missing));
    const doc = N.parse(n.text);
    assert.strictEqual(doc.type, 'pipeline');
    assert.deepStrictEqual([doc.payload.requires.macros.map(m => m.name), doc.payload.requires.workflows.map(w => w.name), doc.payload.requires.pipelines.map(x => x.name)],
      [['pn fill email'], ['pn wf'], ['pn inner']]);
    assert.strictEqual(doc.payload.site, 'https://www.upwork.com');
    // the library lists it beside .macro and .workflow
    const lib = fs.mkdtempSync(path.join(os.tmpdir(), 'pn-lib-'));
    N.saveNode(lib, n);
    assert.deepStrictEqual(N.listNodes(lib).map(x => [x.type, x.file]), [['pipeline', 'pn-outer.pipeline']]);
    // import: the same macro and workflow are reused; the pipeline comes in beside the original, named so
    const r = await N.importNode(e, n.text, { getMacro, createMacro });
    assert.ok(r.ok && r.type === 'pipeline' && r.pipeline.name === 'pn outer (imported)', JSON.stringify(r).slice(0, 400));
    assert.ok(r.macros[0].reused && r.workflows[0].reused && r.pipelines[0].reused, JSON.stringify(r));
    const run = await P.run(r.pipeline.id, { wait: true });
    assert.strictEqual(run.status, 'ok', JSON.stringify(run.run && run.run.tasks));
    assert.deepStrictEqual(ran.map(x => x[0]), ['pn fill email', 'pn fill email'], 'the macro task, then the inner pipeline\'s workflow ran it');
  });

  await test('PN-02', 'each pipeline a .pipeline node file; an old JSON pipeline rewritten and archived', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pn-store-'));
    const P = new PL.Pipelines({ runStep: async () => ({ ok: true }), _busEmit() {} }, { dir });
    const c = P.create({ name: 'on disk', tasks: [{ id: 't', step: { type: 'log', config: { message: 'x' } } }] });
    const file = path.join(dir, `${c.pipeline.id}.pipeline`);
    assert.ok(fs.existsSync(file), fs.readdirSync(dir).join(','));
    const doc = N.parse(fs.readFileSync(file, 'utf8'));
    assert.deepStrictEqual([doc.type, doc.payload.name], ['pipeline', 'on disk']);
    fs.writeFileSync(path.join(dir, 'old.json'), JSON.stringify({ id: 'old', name: 'from before', settings: { parallel: 1 }, tasks: [{ id: 't', step: { type: 'log', config: {} } }] }));
    assert.deepStrictEqual(P.list().map(p => p.name).sort(), ['from before', 'on disk']);
    assert.ok(fs.existsSync(path.join(dir, 'old.pipeline')) && fs.existsSync(path.join(dir, '_archive', 'old.json')) && !fs.existsSync(path.join(dir, 'old.json')), 'rewritten, the JSON kept in _archive');
    assert.ok(P.update(c.pipeline.id, { description: 'changed' }).ok);
    assert.strictEqual(N.parse(fs.readFileSync(file, 'utf8')).payload.description, 'changed', 'an update rewrites the node file');
  });

  await test('PN-04', 'the bundled Fiverr gig pipeline parses, validates, names fiverr.com, and imports with its macros and workflow', async () => {
    const text = fs.readFileSync(CG('automation/nodes/fiverr-gig.pipeline'), 'utf8');
    const doc = N.parse(text);
    assert.deepStrictEqual([doc.type, doc.payload.name, doc.payload.site], ['pipeline', 'Fiverr gig', 'https://www.fiverr.com']);
    assert.deepStrictEqual(doc.payload.tasks.map(t => [t.id, t.step.type]), [['overview', 'macro'], ['on-pricing', 'gate'], ['pricing', 'workflow']]);
    assert.deepStrictEqual(PL.validate(doc.payload).problems, []);
    assert.deepStrictEqual(doc.payload.requires.macros.map(m => m.name).sort(), ['Fiverr gig - choose category', 'Fiverr gig - choose delivery']);
    assert.ok(!/\(imported\)/.test(text), 'every name as Clear Glass ships it');
    const r = await N.importNode(e, text, { getMacro, createMacro });
    assert.ok(r.ok && r.pipeline.site === 'https://www.fiverr.com' && !r.pipeline.onLoad, JSON.stringify(r).slice(0, 300));
    assert.ok(macros.has('Fiverr gig - choose category') && e.find('Fiverr gig - Scope & Pricing (steps)'), 'its macros and workflow came in with it');
    assert.ok(fs.existsSync(path.join(ROOT, 'scripts/build-fiverr-pipeline.js')), 'rebuilt by its script after its nodes are edited');
  });

  const NEWGIG = `<!doctype html><html><head><meta charset="utf-8"><style>body{font:14px sans-serif;margin:30px}.dd{border:1px solid #888;padding:10px;width:260px;cursor:pointer;margin:6px 0}
.menu{position:absolute;background:#fff;border:1px solid #888;width:260px}.menu div{padding:6px} table td{padding:8px 20px}</style></head><body>
<h3>Category</h3><div class="dd" id="cat" tabindex="0">SELECT A CATEGORY</div><div class="dd" id="sub" tabindex="0">SELECT A SUBCATEGORY</div>
<table><tr><td></td><td>BASIC</td><td>STANDARD</td></tr><tr><td>Delivery</td><td><div class="dd" id="d1" tabindex="0">DELIVERY TIME</div></td><td><div class="dd" id="d2" tabindex="0">DELIVERY TIME</div></td></tr></table>
<script>var menu=null;function close(){if(menu){menu.remove();menu=null;}}
function open(dd,opts){close();menu=document.createElement('div');menu.className='menu';var r=dd.getBoundingClientRect();menu.style.left=r.left+'px';menu.style.top=(r.bottom+scrollY)+'px';
opts.forEach(function(t){var o=document.createElement('div');o.textContent=t;o.onclick=function(){dd.textContent=t;close();};menu.appendChild(o);});document.body.appendChild(menu);}
document.getElementById('cat').onclick=function(){open(this,['Programming & Tech','Writing & Translation']);};</script></body></html>`;
  const srv = http.createServer((req, res) => { res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.end(req.url === '/blank' ? '<!doctype html><html><head><meta charset="utf-8"></head><body></body></html>' : NEWGIG); });
  await new Promise(r => srv.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${srv.address().port}`;
  const glass = require(CG('src/driver/glass.js'));
  let browser; try { browser = await glass.chromium.launch(); } catch (err) { console.log(`  - PN-03, AF-06 SKIPPED: the engine could not start (${err.message.split('\n')[0]})`); }

  if (browser) await test('AF-06', 'in Clear Glass: dropdowns marked for the chip (category, subcategory, delivery per package); the chip chooses the category', async () => {
    const page = await browser.newPage({ viewport: { width: 1000, height: 800 } });
    await page.goto(base + '/gig');
    const SG = require(CG('src/autofill/suggest.js'));
    const marks = await page.evaluate(SG.dropdownScript());
    assert.deepStrictEqual(marks.map(m => m.key).sort(), ['basic.delivery', 'category', 'standard.delivery', 'subcategory']);
    assert.strictEqual(await page.evaluate(() => document.getElementById('d2').getAttribute('data-cg-dd')), 'standard.delivery');
    // the chip's click: the element the chip is under (its DOM-mesh id) → the driver chooses in it
    await page.evaluate(() => { document.getElementById('cat').__cgId = 'cg-9'; });
    const ClearDriver = require(CG('src/driver/index.js'));
    const d = new ClearDriver({ ctxMgr: {}, dom: {}, vault: {}, sse: { emit: () => {} } });
    const MAP = { mouseMove: 'mouseMoved', mouseDown: 'mousePressed', mouseUp: 'mouseReleased' };
    d._getWebContents = () => ({ executeJavaScript: (c) => page._eval(c), getURL: () => base + '/gig', isDestroyed: () => false, insertText: (t) => page._send('Input.insertText', { text: t }),
      sendInputEvent: (ev) => { if (MAP[ev.type]) return page._send('Input.dispatchMouseEvent', { type: MAP[ev.type], x: ev.x, y: ev.y, button: ev.type === 'mouseMove' ? 'none' : 'left', buttons: ev.type === 'mouseDown' ? 1 : 0, clickCount: ev.type === 'mouseMove' ? 0 : 1 }); return undefined; } });
    const fast = { openWait: [40, 60], pickWait: [20, 30], settleWait: [60, 80], optionsWaitMs: 1500, spotlight: false };
    const Bridge = require(CG('src/ipc/bridge.js'));
    const self = { dom: {}, driver: { exec: (a) => d.exec({ ...a, ...(a.action === 'choose' ? fast : {}) }) }, _chipLog: () => {} };
    const r = await Bridge.prototype._autofillFillOne.call(self, { agentId: 'w', cgId: 'cg-9', value: 'Programming & Tech' });
    assert.ok(r.ok && /Programming & Tech/.test(r.chose), JSON.stringify(r));
    assert.strictEqual(await page.evaluate(() => document.getElementById('cat').textContent), 'Programming & Tech');
    // the reporter says what a dropdown shows, so a chosen one loses its chip
    assert.match(fs.readFileSync(CG('src/autofill/suggest.js'), 'utf8'), /\[data-cg-dd\]/);
    await page.close();
  });

  if (browser) await test('PN-03', 'in Clear Glass: the editor lists macros, workflows, node files; a node file picked is imported; Export and Import', async () => {
    const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
    await page.goto(base + '/blank');
    await page.evaluate(() => {
      const h = (tag, attrs = {}, ...kids) => { const el = document.createElement(tag); for (const [k, v] of Object.entries(attrs || {})) { if (v == null) continue; if (k === 'text') el.textContent = v; else if (k.startsWith('on')) el.addEventListener(k.slice(2), v); else el.setAttribute(k, v); if (k === 'value') el.value = v; } kids.flat(Infinity).forEach(c => c != null && el.append(c.nodeType ? c : document.createTextNode(String(c)))); return el; };
      window.__calls = [];
      window.cg = { macros: { list: async () => ({ macros: [{ name: 'Fiverr gig - choose category' }] }) } };
      window.__sections = [];
      window.CGS = { h, field: (l, i) => h('label', {}, h('span', { text: l }), i),
        wire: async (url, o = {}) => { window.__calls.push({ url, method: o.method || 'GET' });
          if (url === '/automation/workflows') return { ok: true, workflows: [{ name: 'Fiverr gig - Scope & Pricing (steps)' }] };
          if (url === '/automation/pipelines') return { ok: true, pipelines: [{ id: 'p1', name: 'Fiverr gig', tasks: [{ id: 'overview', depends_on: [] }], site: 'https://www.fiverr.com' }] };
          if (url === '/automation/nodes') return { ok: true, nodes: [{ file: 'apply-form.macro', type: 'macro', name: 'apply form', summary: '3 browser steps' }, { file: 'fiverr-gig.pipeline', type: 'pipeline', name: 'Fiverr gig' }] };
          if (/\/automation\/nodes\/apply-form\.macro\/import/.test(url)) return { ok: true, type: 'macro', macro: { name: 'apply form' } };
          if (/pipeline-runs/.test(url)) return { ok: true, runs: [] };
          if (/\/node\/save$/.test(url)) return { ok: true, file: 'fiverr-gig.pipeline', missing: [] };
          return { ok: true }; },
        toast: (t) => { window.__toast = t; }, fail: (e) => { window.__fail = String(e); }, busy: async (_, f) => f(), pane: (o) => h('div', {}, o.tools, o.body), btn: (t, f) => h('button', { text: t, onclick: f }),
        chip: (t) => h('span', { text: t }), empty: (t, b) => h('div', {}, t, b), ago: () => 'now', confirmDo: async () => true, section: (s) => window.__sections.push(s),
        modal: async ({ body, actions }) => { const box = h('div', { id: 'modal' }, body); document.body.append(box); window.__save = () => actions[0].run(); return new Promise(r => { window.__done = r; }); } };
    });
    await page.evaluate((src) => { (0, eval)(src); }, fs.readFileSync(CG('renderer/settings/sections/pipelines.js'), 'utf8'));
    await page.evaluate(async () => { const out = await window.__sections[0].render({ rerender: () => {} }); const host = document.createElement('div'); host.id = 'host'; [].concat(out).forEach(x => x && host.append(x)); document.body.append(host); });
    const buttons = await page.evaluate(() => [...document.querySelectorAll('#host button')].map(b => b.textContent));
    assert.ok(buttons.includes('Import') && buttons.includes('Export') && buttons.includes('New pipeline'), buttons.join(','));
    await page.evaluate(() => [...document.querySelectorAll('#host button')].find(b => b.textContent === 'Export').click());
    await page.waitForTimeout(50);
    assert.ok(await page.evaluate(() => window.__calls.some(c => c.url === '/automation/pipelines/p1/node/save' && c.method === 'POST')), 'Export saves the node file');
    await page.evaluate(() => [...document.querySelectorAll('#host button')].find(b => b.textContent === 'New pipeline').click());
    await page.waitForTimeout(150);
    const lists = await page.evaluate(() => Object.fromEntries([...document.querySelectorAll('#modal datalist')].map(dl => [dl.id, [...dl.options].map(o => o.value)])));
    assert.deepStrictEqual(lists['pl-src-macro'], ['Fiverr gig - choose category', '📄 apply-form.macro']);
    assert.deepStrictEqual(lists['pl-src-workflow'], ['Fiverr gig - Scope & Pricing (steps)']);
    assert.deepStrictEqual(lists['pl-src-pipeline'], ['Fiverr gig', '📄 fiverr-gig.pipeline']);
    assert.strictEqual(await page.evaluate(() => document.querySelector('#modal [data-k="what"]').getAttribute('list')), 'pl-src-macro');
    await page.evaluate(() => { const w = document.querySelector('#modal [data-k="what"]'); w.value = '📄 apply-form.macro'; w.dispatchEvent(new Event('change')); });
    await page.waitForTimeout(100);
    assert.strictEqual(await page.evaluate(() => document.querySelector('#modal [data-k="what"]').value), 'apply form', 'the node file was imported and the task names it');
    assert.ok(await page.evaluate(() => window.__calls.some(c => c.url === '/automation/nodes/apply-form.macro/import')));
    await page.close();
  });

  if (browser) await browser.close();
  srv.close();
  console.log(`\n  ${passed} passed, ${failed} failed\n`);
  process.exit(failed ? 1 : 0);
})();
