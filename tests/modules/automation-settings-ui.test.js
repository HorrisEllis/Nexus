'use strict';
// §SANDBOX — workflows and runs under a throwaway root (lib/test-sandbox.js).
require('../../lib/test-sandbox.js').ensure();
/**
 * tests/modules/automation-settings-ui.test.js — §0.39.265
 *
 * Settings → Automation, for real: the page's own files (renderer/settings/core.js
 * + sections/automation.js) run in jsdom, and every wire call goes through
 * src/automation/routes.js to a real AutomationEngine — the same router the
 * main process uses. So this renders every template, opens the step editor for
 * every step type the catalogue has, adds and edits steps and triggers through
 * the forms, and opens a run's step-by-step record.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..', '..');
const { JSDOM } = require(path.join(ROOT, 'node_modules', 'jsdom'));
const { AutomationEngine, WORKFLOWS_DIR, RUNS_DIR } = require(path.join(ROOT, 'clear-glass/src/mesh/automation-engine.js'));
const ROUTES = require(path.join(ROOT, 'clear-glass/src/automation/routes.js'));
const { TEMPLATES } = require(path.join(ROOT, 'clear-glass/src/automation/templates.js'));
const { CATALOGUE } = require(path.join(ROOT, 'clear-glass/src/automation/steps.js'));

let passed = 0, failed = 0;
async function test(id, desc, fn) {
  try { await fn(); console.log(`  ✓ ${id} ${desc}`); passed++; }
  catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${e.stack}`); failed++; }
}
const tick = (ms = 30) => new Promise(r => setTimeout(r, ms));
for (const d of [WORKFLOWS_DIR, RUNS_DIR]) try { fs.rmSync(d, { recursive: true, force: true }); } catch (_) {}

const engine = new AutomationEngine({});
engine.setHooks({ notifyFn: async () => {}, runMacroFn: async () => ({ ok: true }) });
const calls = [];

const dom = new JSDOM('<!doctype html><html><head></head><body><nav id="rail"></nav><main id="main"></main><div id="toasts"></div></body></html>', { runScripts: 'outside-only', url: 'file:///settings.html' });
const w = dom.window;
w.ClearGlass = {
  mesh: { list: async () => ({ registry: [{ id: 'claude', name: 'Claude' }, { id: 'deepseek', name: 'DeepSeek' }] }) },
  accounts: { list: async () => [{ id: 'acc1', label: 'Work', agentKeys: ['claude'] }] },
  macros: { list: async () => ({ macros: [{ name: 'apply' }] }) },
  window: { list: async () => ({ windows: ['default', 'mesh-claude'] }), closeSettings: () => {} },
  bgTabs: { list: async () => [] },
};
if (!w.AbortSignal.timeout) w.AbortSignal.timeout = () => undefined;
w.navigator.clipboard = { writeText: async () => {} };
w.URL.createObjectURL = () => 'blob:x';
w.fetch = async (url, opts = {}) => {
  const u = new URL(url);
  const method = opts.method || 'GET';
  const body = opts.body ? JSON.parse(opts.body) : {};
  calls.push({ method, path: u.pathname + u.search, body });
  let status = 200, out;
  if (u.pathname === '/agent-mesh/view') out = { nodes: [{ id: 'claude', label: 'Claude', status: 'online' }] };
  else {
    const r = await ROUTES.handle(engine, { method, url: u.pathname + u.search, body, headers: { origin: 'null' } });
    if (!r) { status = 404; out = { ok: false, error: 'not found' }; } else { status = r.status; out = r.body; }
  }
  return { ok: status < 400, status, json: async () => JSON.parse(JSON.stringify(out)) };
};
for (const f of ['clear-glass/renderer/settings/core.js', 'clear-glass/renderer/settings/sections/automation.js']) w.eval(fs.readFileSync(path.join(ROOT, f), 'utf8'));
const errors = [];
w.addEventListener('error', (e) => errors.push(e.message));
w.addEventListener('unhandledrejection', (e) => errors.push(String(e.reason && e.reason.stack || e.reason)));

const $ = (sel, root = w.document) => root.querySelector(sel);
const $$ = (sel, root = w.document) => [...root.querySelectorAll(sel)];
const byText = (text, sel = 'button', root = w.document) => $$(sel, root).find(b => b.textContent.trim() === text);
async function render() { await w.CGS.show('automation'); for (let i = 0; i < 40 && $('#main .loading'); i++) await tick(); await tick(); }
async function waitModal() { for (let i = 0; i < 60 && !$('#scrim .modal'); i++) await tick(); return $('#scrim .modal'); }
const toasts = () => $$('#toasts .toast').map(t => t.textContent);

(async () => {

await test('UI-A1', 'every template becomes a workflow that renders as sentences — no "undefined", no raw JSON', async () => {
  for (const t of TEMPLATES) engine.create({ name: t.name, steps: t.steps, vars: t.vars, description: t.help, status: 'paused' });
  await render();
  const titles = $$('#main .pane.wf h2').map(x => x.textContent);
  for (const t of TEMPLATES) assert.ok(titles.includes(t.name), t.name);
  const texts = $$('#main .step-card .d').map(x => x.textContent);
  assert.ok(texts.length > 30);
  for (const s of texts) { assert.ok(!/undefined|\[object Object\]/.test(s), s); assert.ok(!/^\{/.test(s), s); }
  const jobs = $$('#main .pane.wf').find(p => p.querySelector('h2').textContent === 'Job board watcher');
  assert.match(jobs.querySelector('.when .txt').textContent, /On the schedule “\*\/30 8-20 \* \* 1-5”/);
  assert.ok($$('.step-card', jobs).some(c => /For each item in \{\{steps\.Jobs\.output\}\} — the next 4 steps, only items not seen before/.test(c.textContent)));
  assert.ok($$('.step-card', jobs).some(c => c.style.marginLeft === '22px'), 'loop bodies are indented');
  assert.ok($$('.chip', jobs).some(c => /retry ×1/.test(c.textContent)));
  assert.ok($$('.vars .chip', jobs).some(c => /minScore = 7/.test(c.textContent)));
  const hook = $$('#main .pane.wf').find(p => p.querySelector('h2').textContent === 'Webhook → agent → Slack');
  assert.ok(byText('Copy address', 'button', hook), 'a webhook trigger offers its address');
  assert.deepStrictEqual(errors, []);
});

await test('UI-A2', 'the step editor draws a form for every step type in the catalogue, and switches fields as choices change', async () => {
  const blank = engine.create({ name: 'AAA editor', steps: [{ type: 'trigger', config: {} }], status: 'paused' }).workflow;
  await render();
  const pane = $$('#main .pane.wf').find(p => p.querySelector('h2').textContent === 'AAA editor');
  byText('+ Add a step', 'button', pane).click();
  const m = await waitModal();
  for (const c of CATALOGUE) {
    const card = $(`.type-card[data-t="${c.type}"]`, m);
    assert.ok(card, c.type);
    card.click();
    assert.strictEqual(card.getAttribute('aria-pressed'), 'true');
    const labels = $$('.step-form .field > span:first-child', m).map(x => x.textContent);
    const required = c.fields.filter(f => f.required && !f.when).map(f => f.label);
    for (const r of required) assert.ok(labels.some(l => l.startsWith(r)), `${c.type}: ${r} (${labels.join('|')})`);
  }
  // browser: switching the action swaps URL for Element
  $('.type-card[data-t="browser"]', m).click();
  const act = $('.step-form select', m);
  assert.ok($$('.step-form .field > span:first-child', m).some(l => l.textContent.startsWith('URL')));
  act.value = 'fill'; act.dispatchEvent(new w.Event('change'));
  const labels = $$('.step-form .field > span:first-child', m).map(x => x.textContent);
  assert.ok(labels.some(l => l.startsWith('Element')) && labels.some(l => l.startsWith('Value')) && !labels.some(l => l.startsWith('URL')), labels.join('|'));
  assert.ok(byText('Try this step now', 'button', m), 'browser steps can be tried');
  byText('Cancel', 'button', m).click();
  await tick();
  assert.strictEqual(engine.get(blank.id).steps.length, 1);
  assert.deepStrictEqual(errors, []);
});

await test('UI-A3', 'adding a "Read from the page" step through the form saves its config, output name and retry', async () => {
  const wf = engine.list().find(x => x.name === 'AAA editor');
  const pane = $$('#main .pane.wf').find(p => p.querySelector('h2').textContent === 'AAA editor');
  byText('+ Add a step', 'button', pane).click();
  const m = await waitModal();
  $('.type-card[data-t="extract"]', m).click();
  const mode = $$('.step-form select', m).find(s => [...s.options].some(o => o.value === 'records'));
  mode.value = 'records'; mode.dispatchEvent(new w.Event('change'));
  const sel = $$('.step-form input[type=text]', m).find(i => /job-tile|Price/.test(i.placeholder));
  sel.value = 'article.job';
  $$('.step-form textarea', m).find(t => /title = h2/.test(t.placeholder)).value = 'title = h2\nlink = a@href';
  const name = $$('.step-form input[type=text]', m).find(i => /steps\.<name>/.test(i.placeholder));
  name.value = 'Jobs';
  const adv = $('.step-form details.adv', m); adv.open = true;
  const saveAs = $$('input[type=text]', adv).find(i => /jobs →/.test(i.placeholder)); saveAs.value = 'jobs'; saveAs.dispatchEvent(new w.Event('change'));
  const rc = $('input[type=number]', adv); rc.value = '2'; rc.dispatchEvent(new w.Event('change'));
  byText('Add step', 'button', m).click();
  for (let i = 0; i < 50 && engine.get(wf.id).steps.length < 2; i++) await tick();
  const st = engine.get(wf.id).steps[1];
  assert.strictEqual(st.type, 'extract'); assert.strictEqual(st.label, 'Jobs'); assert.strictEqual(st.saveAs, 'jobs');
  assert.deepStrictEqual(st.retry, { count: 2, delayMs: 2000 });
  assert.deepStrictEqual({ mode: st.config.mode, selector: st.config.selector, fields: st.config.fields, page: st.config.page }, { mode: 'records', selector: 'article.job', fields: { title: 'h2', link: 'a@href' }, page: 'auto' });
  assert.deepStrictEqual(errors, []);
});

await test('UI-A4', 'editing a step keeps its values; the placeholder bar offers earlier steps’ outputs', async () => {
  await render();
  const wf = engine.list().find(x => x.name === 'AAA editor');
  engine.addStep(wf.id, { type: 'notify', config: { title: 'x' } });
  await render();
  const pane = $$('#main .pane.wf').find(p => p.querySelector('h2').textContent === 'AAA editor');
  const cards = $$('.step-card', pane);
  byText('Edit', 'button', cards[1]).click();
  const m = await waitModal();
  assert.ok($$('.ph', m).some(b => b.textContent === '{{steps.Jobs.output}}'), 'an earlier named step is offered');
  const title = $$('.step-form input[type=text]', m)[0];
  assert.strictEqual(title.value, 'x');
  title.dispatchEvent(new w.Event('focus'));
  $$('.ph', m).find(b => b.textContent === '{{steps.Jobs.output}}').click();
  byText('Save step', 'button', m).click();
  for (let i = 0; i < 50 && engine.get(wf.id).steps[2].config.title === 'x'; i++) await tick();
  assert.strictEqual(engine.get(wf.id).steps[2].config.title, 'x{{steps.Jobs.output}}');
  assert.deepStrictEqual(errors, []);
});

await test('UI-A5', 'the trigger editor: cron with a live preview, events with a match, webhook', async () => {
  await render();
  const wf = engine.list().find(x => x.name === 'AAA editor');
  let pane = $$('#main .pane.wf').find(p => p.querySelector('h2').textContent === 'AAA editor');
  byText('Change', 'button', $('.when', pane)).click();
  let m = await waitModal();
  byText('On a cron schedule', 'button', m).click();
  for (let i = 0; i < 40 && !/next:/.test(m.textContent); i++) await tick();
  assert.match(m.textContent, /at 09:00 on weekdays — next:/);
  byText('Weekdays 9:00', 'button', m) && byText('Every 15 min', 'button', m).click();
  for (let i = 0; i < 40 && !/every 15 minutes/.test(m.textContent); i++) await tick();
  byText('Save', 'button', m).click();
  for (let i = 0; i < 50 && !engine.get(wf.id).steps[0].config.cron; i++) await tick();
  assert.strictEqual(engine.get(wf.id).steps[0].config.cron, '*/15 * * * *');
  await render();
  pane = $$('#main .pane.wf').find(p => p.querySelector('h2').textContent === 'AAA editor');
  byText('+ Another trigger', 'button', pane).click();
  m = await waitModal();
  byText('When something happens', 'button', m).click();
  const matchInput = $$('input[type=text]', m).find(i => /upwork/.test(i.placeholder));
  matchInput.value = '*example.com*';
  byText('Save', 'button', m).click();
  for (let i = 0; i < 50 && engine.get(wf.id).steps.filter(s => s.type === 'trigger').length < 2; i++) await tick();
  const trg = engine.get(wf.id).steps.filter(s => s.type === 'trigger');
  assert.strictEqual(trg[0].config.event, 'page.visited', 'a new trigger goes first'); assert.strictEqual(trg[0].config.match, '*example.com*');
  assert.deepStrictEqual(errors, []);
});

await test('UI-A6', 'a run shows in Runs; opening it lists every step with its output; problems are named on the workflow', async () => {
  const wf = engine.create({ name: 'AAB runs', status: 'paused', steps: [{ type: 'set', label: 'Setup', config: { assign: 'n = 3' } }, { type: 'log', config: { message: 'n is {{vars.n}}' } }, { type: 'browser', config: { action: 'navigate' } }] }).workflow;
  engine.updateStep(wf.id, wf.steps[2].id, { enabled: false });
  await engine.run(wf.id);
  await render();
  const pane = $$('#main .pane.wf').find(p => p.querySelector('h2').textContent === 'AAB runs');
  assert.match($('.err-box', pane).textContent, /“URL” is empty/);
  const row = $('.run-row', pane);
  assert.match(row.textContent, /manual/);
  $('button.link', row).click();
  const m = await waitModal();
  const cells = $$('tbody tr', m).map(tr => tr.textContent);
  assert.ok(cells.some(c => /Setup.*\{"n":"3"\}/.test(c)), cells.join('\n'));
  assert.ok(cells.some(c => /n is 3/.test(c)));
  byText('Cancel', 'button', m).click();
  assert.deepStrictEqual(errors, []);
});

await test('UI-A7', 'Run now starts it (without waiting); New workflow from a template starts switched off with the template’s variables', async () => {
  await render();
  let pane = $$('#main .pane.wf').find(p => p.querySelector('h2').textContent === 'AAB runs');
  const before = engine.get(pane ? engine.list().find(x => x.name === 'AAB runs').id : '').runCount;
  byText('Run now', 'button', pane).click();
  for (let i = 0; i < 50 && engine.list().find(x => x.name === 'AAB runs').runCount === before; i++) await tick();
  assert.strictEqual(engine.list().find(x => x.name === 'AAB runs').runCount, before + 1);
  assert.ok(calls.some(c => /\/start$/.test(c.path)));
  byText('New workflow').click();
  const m = await waitModal();
  $('.tpl[data-t="price"]', m).click();
  assert.strictEqual($('input[type=text]', m).value, 'Price / change watcher');
  $('input[type=text]', m).value = 'My price watch';
  byText('Create workflow', 'button', m).click();
  for (let i = 0; i < 50 && !engine.list().some(x => x.name === 'My price watch'); i++) await tick();
  const mine = engine.list().find(x => x.name === 'My price watch');
  assert.ok(mine && mine.vars.selector === '.price' && mine.status === 'paused');
  await tick(100);
  assert.deepStrictEqual(errors, []);
});

await test('UI-A8', '⋯ → Save to library puts a .workflow in the Library pane; Import there brings it back (switched off); Import accepts pasted node text', async () => {
  const { NODES_DIR } = require(path.join(ROOT, 'clear-glass/src/mesh/automation-engine.js'));
  try { fs.rmSync(NODES_DIR, { recursive: true, force: true }); } catch (_) {}
  const wf = engine.create({ name: 'AAC nodes', status: 'paused', steps: [{ type: 'log', config: { message: 'node' } }] }).workflow;
  await render();
  let pane = $$('#main .pane.wf').find(p => p.querySelector('h2').textContent === 'AAC nodes');
  $('button[aria-label="More for AAC nodes"]', pane).click();
  let m = await waitModal();
  byText('Save to library', 'button', m).click();
  for (let i = 0; i < 60 && !$$('#main .pane').some(p => /Library/.test(p.querySelector('h2') && p.querySelector('h2').textContent) && /aac-nodes\.workflow/.test(p.textContent)); i++) await tick();
  const lib = $$('#main .pane').find(p => p.querySelector('h2') && p.querySelector('h2').textContent === 'Library');
  assert.ok(lib && /aac-nodes\.workflow/.test(lib.textContent) && /\.workflow/.test($('.chip', lib).textContent), lib && lib.textContent);
  assert.ok(toasts().some(t => /Saved aac-nodes\.workflow in the library/.test(t)));
  engine.remove(wf.id);
  byText('Import', 'button', lib).click();
  for (let i = 0; i < 60 && !engine.list().some(w => w.name === 'AAC nodes'); i++) await tick();
  const back = engine.list().find(w => w.name === 'AAC nodes');
  assert.ok(back && back.status === 'paused' && back.steps[0].config.message === 'node');
  const text = (await require(path.join(ROOT, 'clear-glass/src/automation/nodes.js')).workflowNode(engine, back.id)).text.replace(/AAC nodes/g, 'AAD pasted');
  await render();
  byText('Import').click();
  m = await waitModal();
  if (!/Import a workflow or macro/.test(m.textContent)) throw new Error('modal: ' + m.querySelector('h2').textContent);
  $('textarea', m).value = text;
  byText('Import', 'button', m).click();
  for (let i = 0; i < 60 && !engine.list().some(w => w.name === 'AAD pasted'); i++) await tick();
  assert.ok(engine.list().some(w => w.name === 'AAD pasted'));
  for (let i = 0; i < 60 && !toasts().some(t => /AAD pasted/.test(t)); i++) await tick();
  assert.ok(toasts().some(t => /Imported “AAD pasted” \(switched off\)/.test(t)), toasts().join(' | '));
  try { fs.rmSync(NODES_DIR, { recursive: true, force: true }); } catch (_) {}
  assert.deepStrictEqual(errors, []);
});

console.log(`\n${passed} passed, ${failed} failed`);
for (const d of [WORKFLOWS_DIR, RUNS_DIR]) try { fs.rmSync(d, { recursive: true, force: true }); } catch (_) {}
process.exitCode = failed ? 1 : 0;
setTimeout(() => process.exit(process.exitCode), 200);
})();
