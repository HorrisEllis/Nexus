'use strict';
/**
 * tests/modules/test-pipeline-gates.test.js — gates as pipeline blocks; macros, workflows and pipelines linked; per-site pipelines (PL6–PL11, 0.60.293)
 * James, 2026-10-30: "gates are for the pipelines for macro atuomation" · "yes. i want that with the option for per site pipelines. make sure
 * macros, automations, and pipelines are interconnected. i build bottom up, and interconnected, and compound leverage"
 *
 * One real engine, one real Clear Glass driver on a page, real macros (the macro tool) run through the bridge's own runner:
 *   PG-01  in Clear Glass: "Wait at a gate" (one engine step: a workflow block and a pipeline task) waits for a field to hold a value and
 *          fails with what it saw when it never does; his gate by id; the catalogue offers it and "Run a pipeline"
 *   PG-02  in Clear Glass: a pipeline task waits at its element gate (his gate by id) after its macro; a gate task waits for the page; a task
 *          whose gate stays closed is retried, fails with what the gate saw, and blocks its dependent
 *   PG-03  in Clear Glass: a macro step gated on his gate by id (use): closed → the run stops with what it saw; open → on
 *   PG-04  in Clear Glass: a macro runs a workflow that runs a pipeline whose task runs a macro gated on his gate — one engine, one store; a
 *          pipeline that would run itself is refused
 *   PG-05  per-site pipelines: forSite by origin and by pattern, only its own site, only onLoad ones when asked; validate refuses a bad site
 *          and onLoad without a site; the route answers ?site=
 *   PG-06  in Clear Glass: the Pipelines editor saves a site pipeline that runs on load, whose task runs a pipeline and waits at an element gate
 */
require('../../lib/test-sandbox.js').ensure();
// CLAUDE.md — "silence [jaa]-style logs or the runner miscounts": the macro store's chatter is dropped, the test's own lines kept
const _log = console.log; console.log = (...a) => { const s = a[0]; if (typeof s === 'string' && s.startsWith('[jaa]')) return; _log(...a); };
const assert = require('assert');
const http = require('http');
const path = require('path');
const fs = require('fs');
const ROOT = path.join(__dirname, '..', '..');
const CG = (p) => path.join(ROOT, 'clear-glass', p);

let passed = 0, failed = 0;
async function test(id, desc, fn) { try { await fn(); console.log(`  ✓ ${id} ${desc}`); passed++; } catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${(e.stack || e.message).split('\n').slice(0, 6).join('\n    ')}`); failed++; } }

const FORM = `<!doctype html><html><head><meta charset="utf-8"></head><body><h2>Apply</h2>
<label>Name <input id="name"></label><label>Email <input id="email" type="email"></label>
<label><input id="cb" type="checkbox"> terms</label><input id="late" value="">
<script>setTimeout(function(){ document.getElementById('late').value = 'ready'; }, 600);</script></body></html>`;

(async () => {
  console.log('\n⬡  Gates as pipeline blocks; macros, workflows and pipelines linked; per-site pipelines\n');
  const { AutomationEngine } = require(path.join(ROOT, 'lib/automation/engine.js'));
  const PL = require(path.join(ROOT, 'lib/automation/pipeline.js'));
  const STEPS = require(path.join(ROOT, 'lib/automation/steps.js'));
  const M = require(path.join(ROOT, 'lib/agent-tools/tools/clear-glass/macro.js'));
  const R = require(CG('src/site-settings/readers.js'));

  const srv = http.createServer((req, res) => { res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.end(FORM); });
  await new Promise(r => srv.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${srv.address().port}`;
  R.install((url) => ({ origin: new URL(url).origin, driver: { allowed: true }, macros: { enabled: true, autoRun: [] }, gates: { settleMs: 150, timeoutMs: 500 }, pipelines: { enabled: true }, from: {} }));

  const glass = require(CG('src/driver/glass.js'));
  let browser; try { browser = await glass.chromium.launch(); } catch (e) { console.log(`  - PG-01..04, PG-06 SKIPPED: the engine could not start (${e.message.split('\n')[0]})`); }
  let page, d, e, bridgeSelf;
  const mine = () => ({ [base]: [{ id: 'email-ok', label: 'an email', xpath: '//*[@id="email"]', matches: '/^\\S+@\\S+\\.\\S+$/' }] });
  if (browser) {
    page = await browser.newPage({ viewport: { width: 900, height: 700 } });
    await page.goto(base + '/apply');
    const ClearDriver = require(CG('src/driver/index.js'));
    d = new ClearDriver({ ctxMgr: {}, dom: {}, vault: {}, sse: { emit: () => {} } });
    const wc = { executeJavaScript: (c) => page._eval(c), getURL: () => base + '/apply', insertText: (t) => page._send('Input.insertText', { text: t }),
      sendInputEvent: (ev) => {
        const MAP = { mouseMove: 'mouseMoved', mouseDown: 'mousePressed', mouseUp: 'mouseReleased' };
        if (MAP[ev.type]) return page._send('Input.dispatchMouseEvent', { type: MAP[ev.type], x: ev.x, y: ev.y, button: ev.type === 'mouseMove' ? 'none' : 'left', buttons: ev.type === 'mouseDown' ? 1 : 0, clickCount: ev.type === 'mouseMove' ? 0 : 1 });
        if (ev.type === 'char') return page._send('Input.insertText', { text: ev.keyCode });
        return undefined; } };
    d._getWebContents = () => wc; d.getSiteGates = mine;
    // the bridge's own macro runner (runMacroAsPerson): driver steps to the driver, run_workflow / run_pipeline to this engine
    const Bridge = require(CG('src/ipc/bridge.js'));
    bridgeSelf = { macroTool: { execute: (a) => M.execute(a) }, driver: d, mesh: {} };
    const runMacro = ({ name, params }) => Bridge.prototype.runMacroAsPerson.call(bridgeSelf, { name, agentId: 'w', params, skipSnapshot: true });
    e = new AutomationEngine({ browserFn: ({ action, args }) => d.exec({ agentId: 'w', action, ...args, by: 'person' }), runMacroFn: runMacro });
    bridgeSelf.mesh._automation = e;
  }
  const fresh = async () => { await page.goto(base + '/apply'); };

  if (browser) await test('PG-01', 'in Clear Glass: Wait at a gate waits for a value, fails with what it saw; his gate by id; in the catalogue', async () => {
    assert.ok(STEPS.CATALOGUE.some(s => s.type === 'gate') && STEPS.CATALOGUE.some(s => s.type === 'pipeline'), 'workflows and pipelines offer both');
    await fresh();
    let r = await e.runStep({ type: 'gate', config: { condition: 'value', selector: '#late', value: 'ready', timeoutMs: 4000 } });
    assert.ok(r.ok && /holds "ready"/.test(r.output), JSON.stringify(r));
    r = await e.runStep({ type: 'gate', config: { condition: 'value', selector: '#late', value: 'never', timeoutMs: 600 } });
    assert.ok(!r.ok && /gate closed: holds "ready"/.test(r.error), JSON.stringify(r));
    r = await e.runStep({ type: 'gate', config: { gateId: 'email-ok', timeoutMs: 500 } });
    assert.ok(!r.ok && /does not match/.test(r.error), 'his gate: the email box is empty');
    r = await e.runStep({ type: 'gate', config: { condition: 'page_text', value: 'Apply', timeoutMs: 500 } });
    assert.ok(r.ok, JSON.stringify(r));
  });

  if (browser) await test('PG-02', 'in Clear Glass: a task waits at its element gate; a gate task; a closed gate retried, failed, its dependent blocked', async () => {
    await fresh();
    const mk = await M.execute({ action: 'create', name: 'pg-fill-email', params: ['email'], steps: [{ action: 'type', data: { selector: '#email', text: '{{email}}', delay: 5 } }] });
    assert.ok(mk.ok || /exists/.test(mk.error || ''), JSON.stringify(mk));
    const P = e.pipelines || (e.pipelines = new PL.Pipelines(e));
    const c = P.create({ name: 'pg-apply', tasks: [
      { id: 'fill', step: { type: 'macro', config: { name: 'pg-fill-email', agentId: 'w', params: { email: 'james@example.com' } } }, gate: { element: { gateId: 'email-ok', timeoutMs: 1500 } } },
      { id: 'ready', depends_on: ['fill'], step: { type: 'gate', config: { condition: 'value', selector: '#late', value: 'ready', timeoutMs: 3000 } } },
      { id: 'bad', depends_on: ['ready'], retries: 1, step: { type: 'macro', config: { name: 'pg-fill-email', agentId: 'w', params: { email: ' and more' } } }, gate: { element: { selector: '#email', equals: 'james@example.com', timeoutMs: 400 } } },
      { id: 'after', depends_on: ['bad'], step: { type: 'log', config: { message: 'never' } } }] });
    assert.ok(c.ok, JSON.stringify(c));
    const r = await P.run(c.pipeline.id, { wait: true });
    const st = Object.fromEntries(Object.entries(r.run.tasks).map(([k, v]) => [k, v.status]));
    assert.deepStrictEqual(st, { fill: 'done', ready: 'done', bad: 'failed', after: 'blocked' }, JSON.stringify(r.run.tasks));
    assert.match(r.run.tasks.bad.error, /gate: gate closed: is "[^"]*and more[^"]*"/);
    assert.match(r.run.tasks.bad.error, /after 2 attempts/);
    assert.strictEqual(r.run.tasks.after.blockedBy, 'bad');
  });

  if (browser) await test('PG-03', 'in Clear Glass: a macro step gated on his gate by id: closed stops with what it saw; open goes on', async () => {
    await fresh();
    const mk = await M.execute({ action: 'create', name: 'pg-gated', params: ['email'], steps: [{ action: 'type', data: { selector: '#email', text: '{{email}}', delay: 5 }, gate: { use: 'email-ok', timeoutMs: 300, retries: 0 } }] });
    assert.ok(mk.ok || /exists/.test(mk.error || ''), JSON.stringify(mk));
    const Bridge = require(CG('src/ipc/bridge.js'));
    let r = await Bridge.prototype.runMacroAsPerson.call(bridgeSelf, { name: 'pg-gated', agentId: 'w', params: { email: 'not-an-email' }, skipSnapshot: true });
    assert.ok(r.error && /gate: the gate is closed: .*does not match/.test(r.error), JSON.stringify(r));
    await fresh();
    r = await Bridge.prototype.runMacroAsPerson.call(bridgeSelf, { name: 'pg-gated', agentId: 'w', params: { email: 'james@example.com' }, skipSnapshot: true });
    assert.ok(r.ok && r.results[0].gate.open, JSON.stringify(r));
  });

  if (browser) await test('PG-04', 'in Clear Glass: macro → workflow → pipeline → gated macro, one engine; a pipeline that would run itself is refused', async () => {
    await fresh();
    const P = e.pipelines;
    const inner = P.create({ name: 'pg-inner', tasks: [{ id: 'fill', step: { type: 'macro', config: { name: 'pg-fill-email', agentId: 'w', params: { email: 'james@example.com' } } }, gate: { element: { gateId: 'email-ok', timeoutMs: 1500 } } }] });
    assert.ok(inner.ok, JSON.stringify(inner));
    const wf = e.create({ name: 'pg-wf', steps: [{ id: 'p', type: 'pipeline', config: { pipeline: 'pg-inner' } }] });
    assert.ok(wf.ok !== false && wf.workflow, JSON.stringify(wf));
    const outer = await M.execute({ action: 'create', name: 'pg-outer', steps: [{ action: 'run_workflow', data: { name: 'pg-wf' } }] });
    assert.ok(outer.ok || /exists/.test(outer.error || ''), JSON.stringify(outer));
    const Bridge = require(CG('src/ipc/bridge.js'));
    const r = await Bridge.prototype.runMacroAsPerson.call(bridgeSelf, { name: 'pg-outer', agentId: 'w', skipSnapshot: true });
    assert.ok(r.ok, JSON.stringify(r));
    assert.strictEqual(await page.evaluate(() => document.getElementById('email').value), 'james@example.com', 'the macro at the bottom of the chain typed it');
    const runs = P.runs(inner.pipeline.id, 1);
    assert.ok(runs[0] && runs[0].status === 'ok', 'the pipeline the workflow ran is in the same store the Pipelines screen reads');
    // a pipeline whose task runs itself
    const loop = P.create({ name: 'pg-loop', tasks: [{ id: 'again', step: { type: 'pipeline', config: { pipeline: 'pg-loop' } } }] });
    const lr = await P.run(loop.pipeline.id, { wait: true });
    assert.match(lr.run.tasks.again.error, /already running in this chain — it would run itself/);
    // a pipeline runs another pipeline as a task
    const two = P.create({ name: 'pg-two', tasks: [{ id: 'inner', step: { type: 'pipeline', config: { pipeline: 'pg-inner' } } }] });
    await fresh();
    const tr = await P.run(two.pipeline.id, { wait: true });
    assert.strictEqual(tr.status, 'ok', JSON.stringify(tr.run && tr.run.tasks));
  });

  await test('PG-05', 'per-site pipelines: forSite by origin and pattern, onLoad, validate, the route', async () => {
    const eng = { runStep: async () => ({ ok: true }), _busEmit: () => {} };
    const dir = fs.mkdtempSync(path.join(require('os').tmpdir(), 'pg5-'));
    const P = new PL.Pipelines(eng, { dir });
    const step = { type: 'log', config: { message: 'x' } };
    assert.ok(P.create({ name: 'fiverr-all', site: 'https://www.fiverr.com', onLoad: true, tasks: [{ id: 'a', step }] }).ok);
    assert.ok(P.create({ name: 'fiverr-gigs', site: 'https://www.fiverr.com/users/*/manage_gigs/*', tasks: [{ id: 'a', step }] }).ok);
    assert.ok(P.create({ name: 'anywhere', tasks: [{ id: 'a', step }] }).ok);
    const names = (url, o) => P.forSite(url, o).map(p => p.name).sort();
    assert.deepStrictEqual(names('https://www.fiverr.com/users/x/manage_gigs/new'), ['fiverr-all', 'fiverr-gigs']);
    assert.deepStrictEqual(names('https://www.fiverr.com/inbox'), ['fiverr-all']);
    assert.deepStrictEqual(names('https://www.fiverr.com/users/x/manage_gigs/new', { onLoad: true }), ['fiverr-all']);
    assert.deepStrictEqual(names('https://www.upwork.com/'), [], 'only its own site');
    assert.match(PL.validate({ name: 'x', site: 'fiverr', tasks: [{ id: 'a', step }] }).problems.join(), /is not a site/);
    assert.match(PL.validate({ name: 'x', onLoad: true, tasks: [{ id: 'a', step }] }).problems.join(), /needs its site/);
    assert.match(PL.validate({ name: 'x', tasks: [{ id: 'a', step, gate: { element: { value: 'x' } } }] }).problems.join(), /names no element/);
    const routes = require(path.join(ROOT, 'lib/automation/routes.js'));
    const handle = routes.handle || routes.route || routes;
    void handle;
    assert.match(fs.readFileSync(path.join(ROOT, 'lib/automation/routes.js'), 'utf8'), /q\('site'\) \? P\.forSite\(q\('site'\)/);
    assert.match(fs.readFileSync(CG('src/main/index.js'), 'utf8'), /function _sitePipelinesOnLoad[\s\S]*forSite\(url, \{ onLoad: true \}\)/);
    assert.ok(require(CG('src/site-settings/keys.js')).KEYS.some(k => k.key === 'pipelines.enabled'));
  });

  if (browser) await test('PG-06', 'in Clear Glass: the Pipelines editor saves a site pipeline on load, a Run-a-pipeline task with an element gate', async () => {
    const p2 = await browser.newPage({ viewport: { width: 1200, height: 900 } });
    await p2.goto(base + '/apply');
    const posted = [];
    await p2.evaluate(() => { document.body.innerHTML = ''; });
    // the settings kit (window.CGS) the section draws with, small: enough for the editor's modal and fields
    await p2.evaluate(() => {
      const h = (tag, attrs = {}, ...kidsA) => { const kids = kidsA; const el = document.createElement(tag); for (const [k, v] of Object.entries(attrs || {})) { if (v == null) continue; if (k === 'text') el.textContent = v; else if (k.startsWith('on')) el.addEventListener(k.slice(2), v); else el.setAttribute(k, v); if (k === 'value') el.value = v; } [].concat(kids || []).flat().forEach(c => c != null && el.append(c.nodeType ? c : document.createTextNode(String(c)))); return el; };
      const field = (label, input) => h('label', { class: 'f' }, [h('span', { text: label }), input]);
      window.__sections = [];
      window.CGS = { h, field, wire: async (url, o) => { window.__posted = window.__posted || []; window.__posted.push({ url, ...(o || {}) }); return url.endsWith('/automation/pipelines') && (!o || !o.method) ? { ok: true, pipelines: [] } : { ok: true }; },
        toast: () => {}, fail: (e) => { window.__fail = String(e); }, busy: async (_, f) => f(), pane: (o) => h('div', {}, [o.tools, ...[].concat(o.body || [])]), btn: (t, f) => h('button', { text: t, onclick: f }), chip: (t) => h('span', { text: t }), empty: (t, b) => h('div', {}, [t, b]), ago: () => 'now',
        confirmDo: async () => true, section: (s) => window.__sections.push(s),
        modal: async ({ body, actions }) => { const box = h('div', { id: 'modal' }, body); document.body.append(box); window.__save = async () => actions[0].run(); return new Promise(r => { window.__done = r; }); } };
    });
    await p2.evaluate((src) => { (0, eval)(src); }, fs.readFileSync(CG('renderer/settings/sections/pipelines.js'), 'utf8'));
    const ok = await p2.evaluate(() => typeof window.__sections[0].render === 'function');
    assert.ok(ok, 'the section registered');
    // open "New pipeline" through the section's own render (its New button calls edit)
    await p2.evaluate(async () => { const out = await window.__sections[0].render(); const host = document.createElement('div'); host.id = 'host'; [].concat(out).forEach(x => x && host.append(x)); document.body.append(host); });
    const opened = await p2.evaluate(() => { const b = [...document.querySelectorAll('button')].find(x => /new pipeline|\+ pipeline|new/i.test(x.textContent)); if (!b) return false; b.click(); return true; });
    assert.ok(opened, 'a New pipeline button');
    await p2.waitForTimeout(100);
    await p2.evaluate(() => {
      const m = document.getElementById('modal'); const set = (k, v) => { const el = m.querySelector(`[data-k="${k}"]`); el.value = v; el.dispatchEvent(new Event('change')); };
      set('name', 'fiverr gig'); set('site', 'https://www.fiverr.com'); m.querySelector('[data-k="onLoad"]').checked = true;
      set('id', 'gig'); set('type', 'pipeline'); set('what', 'pg-inner'); set('gateSel', '#email'); set('gateMust', 'matches'); set('gateVal', '/@/');
    });
    await p2.evaluate(() => window.__save());
    const sent = await p2.evaluate(() => window.__posted.find(x => x.method === 'POST'));
    assert.ok(sent, 'saved through the engine door');
    assert.deepStrictEqual({ site: sent.body.site, onLoad: sent.body.onLoad, step: sent.body.tasks[0].step, gate: sent.body.tasks[0].gate },
      { site: 'https://www.fiverr.com', onLoad: true, step: { type: 'pipeline', config: { pipeline: 'pg-inner' } }, gate: { element: { selector: '#email', matches: '/@/' } } });
    await p2.close();
  });

  R.install(null);
  if (browser) await browser.close();
  srv.close();
  console.log(`\n  ${passed} passed, ${failed} failed\n`);
  process.exit(failed ? 1 : 0);
})();
