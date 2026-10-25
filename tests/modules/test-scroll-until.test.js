'use strict';
// SU-01..SU-08 (0.60.56): the slow scroll step — ErosmancerOS wheel, real arrow keys, or in the page — stops when nothing new loads, says which path ran,
// never quietly uses another, and the "Read one chat slowly" template validates and runs. jsdom behind the same browserFn hook Clear Glass sets (AXIOMS 4.1: no Playwright).
require('../../lib/test-sandbox.js').ensure();
const assert = require('assert'), path = require('path');
const { JSDOM } = require(path.join(__dirname, '..', '..', 'node_modules', 'jsdom'));
const ROOT = path.resolve(__dirname, '..', '..');
const STEPS = require(path.join(ROOT, 'orchestrator/automation/steps.js'));
const TPL = require(path.join(ROOT, 'orchestrator/automation/templates.js'));
const { AutomationEngine, WORKFLOWS_DIR, RUNS_DIR, OUTPUT_DIR } = require(path.join(ROOT, 'orchestrator/automation/engine.js'));
let passed = 0, failed = 0;
async function test(name, fn) { try { await fn(); console.log('  ✓ ' + name); passed++; } catch (e) { console.error('  ✗ ' + name + '\n    ' + (e.stack || e).toString().split('\n').slice(0, 4).join('\n    ')); failed++; } }

// a chat page that loads 10 more messages each time it is scrolled (by wheel, key or scrollBy), up to `total`
function chatBrowser({ total = 45, start = 10, erosAvailable = true } = {}) {
  let win = null; const calls = []; let loaded = start;
  const render = () => { const l = win.document.getElementById('list'); while (l.children.length < loaded) { const d = win.document.createElement('div'); d.setAttribute('data-message-id', String(l.children.length)); l.appendChild(d); } };
  const more = () => { loaded = Math.min(total, loaded + 10); render(); };
  const fn = async ({ page, action, args = {} }) => {
    calls.push({ action, args });
    if (action === 'navigate') { win = new JSDOM('<html><body><div id="list"></div></body></html>', { url: args.url, runScripts: 'outside-only' }).window; render(); return { url: args.url, title: 't' }; }
    if (action === 'pointer') { if (!erosAvailable) return { ok: false, error: 'the ErosmancerOS wire is not started yet' }; more(); return { ok: true, via: 'eros' }; }
    if (action === 'pressKey') { if (args.key === 'ArrowDown' || args.key === 'ArrowUp') more(); return { pressed: args.key }; }
    if (action === 'eval') { const mine = /scrollTop|innerWidth/.test(args.code); const r = win.eval(!mine ? args.code : args.code.replace(/getComputedStyle\(el\)/g, '({ overflowY: "visible" })').replace(/el\.scrollHeight > el\.clientHeight \+ 4/g, 'false')); return { result: r }; }
    return {};
  };
  return { fn, calls, get loaded() { return loaded; }, scrollByHook: () => more };
}
const wf = (cfg) => ({ name: 'scroll test', steps: [{ type: 'trigger', config: {} }, { type: 'browser', label: 'Open', config: { action: 'navigate', page: 'auto', url: 'https://chat.test/c/1' } },
  { type: 'browser', label: 'Scroll', config: { action: 'scroll_until', page: 'auto', countSelector: '[data-message-id]', pauseMs: 100, stableRounds: 2, maxRounds: 30, ...cfg } }] });
async function run(B, w) {
  for (const d of [WORKFLOWS_DIR, RUNS_DIR, OUTPUT_DIR]) try { require('fs').rmSync(d, { recursive: true, force: true }); } catch (_) {}
  const e = new AutomationEngine({}); e.setHooks({ browserFn: B.fn }); const created = e.create(w).workflow; assert.deepStrictEqual(e.validate(created.id).problems, [], 'the workflow must validate'); const r = await e.run(created.id); LAST = { r, e }; return { r, e };
}
let LAST = null;
const out = () => LAST.e.getRun(LAST.r.runId).steps.find(s => s.label === 'Scroll');

(async () => {
  await test('SU-01 the step is in the catalogue with its fields, and a workflow using it validates', () => {
    const b = STEPS.CATALOGUE.find(c => c.type === 'browser'); assert.ok(b.fields.find(f => f.key === 'action').options.some(o => o.value === 'scroll_until'));
    for (const k of ['via', 'direction', 'stepPx', 'pauseMs', 'countSelector', 'stableRounds', 'maxRounds', 'keysPerRound', 'key']) assert.ok(b.fields.some(f => f.key === k), k);
  });
  await test('SU-02 ErosmancerOS wheel: scrolls slowly until nothing new loads, and says the path', async () => {
    const B = chatBrowser(); const { r } = await run(B, wf({ via: 'erosmancer', direction: 'up' }));
    assert.strictEqual(r.ok, true, JSON.stringify(r).slice(0, 400)); const o = out().output; assert.strictEqual(o.count, 45); assert.strictEqual(o.countBefore, 10); assert.strictEqual(o.reached, 'stable'); assert.strictEqual(o.inputPath, 'erosmancer');
    const wheels = B.calls.filter(c => c.action === 'pointer'); assert.ok(wheels.length >= 4 && wheels.every(c => c.args.via === 'eros' && c.args.do === 'scroll' && c.args.deltaY === -120), 'small, upward wheel steps');
  });
  await test('SU-03 arrow keys: real keystrokes, several per step, ArrowDown going down', async () => {
    const B = chatBrowser(); const { r } = await run(B, wf({ via: 'keys', direction: 'down', keysPerRound: 3 }));
    assert.strictEqual(r.ok, true); assert.strictEqual(out().output.count, 45); const keys = B.calls.filter(c => c.action === 'pressKey'); assert.ok(keys.length >= 12 && keys.every(c => c.args.key === 'ArrowDown'));
  });
  await test('SU-04 a custom key is used as given', async () => { const B = chatBrowser(); await run(B, wf({ via: 'keys', key: 'PageDown', keysPerRound: 1 })); assert.ok(B.calls.filter(c => c.action === 'pressKey').every(c => c.args.key === 'PageDown')); });
  await test('SU-05 ErosmancerOS not running: the step FAILS with the reason, and does not fall back to keys or the page', async () => {
    const B = chatBrowser({ erosAvailable: false }); const { r } = await run(B, wf({ via: 'erosmancer' }));
    assert.strictEqual(r.ok, false); assert.match(JSON.stringify(r), /ErosmancerOS input failed/); assert.ok(!B.calls.some(c => c.action === 'pressKey'));
  });
  await test('SU-06 a page that never changes stops after stableRounds, not maxRounds', async () => {
    const B = chatBrowser({ total: 10, start: 10 }); const { r } = await run(B, wf({ via: 'erosmancer', stableRounds: 3, maxRounds: 50 })); const o = out().output; assert.strictEqual(o.reached, 'stable'); assert.strictEqual(o.rounds, 3);
  });
  await test('SU-07 maxRounds stops a page that keeps growing', async () => {
    const B = chatBrowser({ total: 100000 }); const { r } = await run(B, wf({ via: 'erosmancer', maxRounds: 5 })); const o = out().output; assert.strictEqual(o.reached, 'max'); assert.strictEqual(o.rounds, 5);
  });
  await test('SU-08 press: a real keystroke goes through pressKey; ErosmancerOS press is refused, said', async () => {
    const mk = (input) => ({ name: 'p', steps: [{ type: 'trigger', config: {} }, { type: 'browser', label: 'Open', config: { action: 'navigate', page: 'auto', url: 'https://chat.test/' } }, { type: 'browser', label: 'Press', config: { action: 'press', page: 'auto', key: 'ArrowDown', input } }] });
    let B = chatBrowser(); let { r } = await run(B, mk('native')); assert.strictEqual(r.ok, true); assert.ok(B.calls.some(c => c.action === 'pressKey' && c.args.key === 'ArrowDown'));
    B = chatBrowser(); ({ r } = await run(B, mk('erosmancer'))); assert.strictEqual(r.ok, false); assert.match(JSON.stringify(r), /no key press/);
  });
  await test('SU-09 the "Read one chat slowly" template is a valid workflow and runs end to end', async () => {
    const tpl = TPL.TEMPLATES.find(t => t.id === 'chat-read'); assert.ok(tpl);
    const B = chatBrowser(); for (const d of [WORKFLOWS_DIR, RUNS_DIR, OUTPUT_DIR]) try { require('fs').rmSync(d, { recursive: true, force: true }); } catch (_) {}
    const e = new AutomationEngine({}); e.setHooks({ browserFn: B.fn }); const created = e.create({ name: tpl.name, steps: tpl.steps, vars: { ...tpl.vars, chatUrl: 'https://chat.test/c/1', pauseMs: '100', stableRounds: '2' } }).workflow; assert.deepStrictEqual(e.validate(created.id).problems, []);
    const r = await e.run(created.id); assert.strictEqual(r.ok, true, JSON.stringify(r).slice(0, 500)); const rec = e.getRun(r.runId); assert.ok(rec.steps.some(s => s.label === 'Messages' && s.output === 45), JSON.stringify(rec.steps.map(s => [s.label, s.output])).slice(0, 300));
  });
  console.log(`${passed} passed, ${failed} failed`); process.exit(failed ? 1 : 0);
})();
