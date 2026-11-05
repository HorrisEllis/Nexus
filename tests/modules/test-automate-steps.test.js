'use strict';
/**
 * tests/modules/test-automate-steps.test.js — PA1–PA4 (docs/2026-10-29-pipelines-phasemap.spec, addendum 2026-11-05)
 * James, 2026-11-05: "i want it like automate. like i want the pipeline editor that uses the steps, with gates in between, maybe add
 * conditions for detection of elements, scripts and type scripts, .macro nodes, workflows, autofill"
 *
 *   AS-01  PA1  a .js and a .ts script of his run as steps: input in, last JSON line out; a failing one says its exit code and error; a name
 *               outside his scripts folder is refused; GET /automation/scripts lists them with their first comment line
 *   AS-02  PA2  the autofill step fills through Clear Glass's door (a stand-in here) and its answer is the step's output
 *   AS-03  PA3  "if" on an element reads the gate action once (present / gone), and "if" on a script follows its answer
 *   AS-04  PA4  a gate after a step: open → on; closed + stop → the run fails with what it saw; closed + skip → on, said; closed + retry → the
 *               step runs again; a gate with nothing in it is refused when saved
 *   AS-05  the catalogue draws the new steps (script, autofill, the condition's element and script checks) — the screen needs no new code
 */
require('../../lib/test-sandbox.js').ensure();
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'automate-'));
process.env.NEXUS_DATA_ROOT = tmp;
const ROOT = path.join(__dirname, '..', '..');
const { AutomationEngine } = require(path.join(ROOT, 'lib/automation/engine.js'));
const STEPS = require(path.join(ROOT, 'lib/automation/steps.js'));
const ROUTES = require(path.join(ROOT, 'lib/automation/routes.js'));

let passed = 0, failed = 0;
async function test(id, d, fn) { try { await fn(); console.log(`  ✓ ${id} ${d}`); passed++; } catch (e) { console.error(`  ✗ ${id} ${d}\n    ${(e.stack || e.message).split('\n').slice(0, 5).join('\n    ')}`); failed++; } }

const scriptsDir = path.join(tmp, 'scripts');
fs.mkdirSync(scriptsDir, { recursive: true });
fs.writeFileSync(path.join(scriptsDir, 'double.js'), '// doubles n\nconst i = JSON.parse(process.env.NEXUS_STEP_INPUT); console.log("working"); console.log(JSON.stringify({ n: Number(i.n) * 2 }));\n');
fs.writeFileSync(path.join(scriptsDir, 'shout.ts'), '// shouts its word\nconst i: { word: string } = JSON.parse(process.env.NEXUS_STEP_INPUT as string);\nconst out: string = i.word.toUpperCase();\nconsole.log(JSON.stringify(out));\n');
fs.writeFileSync(path.join(scriptsDir, 'no.js'), 'console.log("no")\n');
fs.writeFileSync(path.join(scriptsDir, 'broken.js'), 'console.error("the list is empty"); process.exit(3);\n');

async function runWf(engine, steps) {
  const { workflow } = engine.create({ name: `t-${Math.random().toString(36).slice(2, 7)}`, status: 'active', steps });
  const r = await engine.run(workflow.id, 'manual');
  const run = engine.getRun(r.runId) || {};
  return { ...run, status: r.ok ? 'ok' : (run.status || 'failed'), result: r };
}

(async () => {
  console.log('\n⬡  Automate: scripts, autofill, conditions, a gate after every step (PA1–PA4)\n');
  // a stand-in page: the gate action answers from this table, so every path is exercised without a browser
  const pageHas = new Set(['#apply']);
  let gateCalls = 0, openAfter = 0;
  const browserFn = async ({ action, args }) => {
    if (action !== 'gate') return { ok: true };
    gateCalls++;
    const g = args.gate || {};
    if (args.id === 'opens-late') return { open: gateCalls > openAfter, saw: gateCalls > openAfter ? 'it opened' : 'not yet' };
    const sel = g.selector;
    if (g.gone === false) return { open: pageHas.has(sel), saw: pageHas.has(sel) ? `${sel} is there` : `${sel} is not on the page` };
    if (g.gone === true) return { open: !pageHas.has(sel), saw: pageHas.has(sel) ? `${sel} is still there` : `${sel} is gone` };
    if (g.visible) return { open: pageHas.has(sel), saw: pageHas.has(sel) ? 'visible' : 'not found' };
    return { open: false, saw: 'never' };
  };
  const filled = [];
  const engine = new AutomationEngine({ browserFn, scriptsDir, autofillFn: async (b) => { filled.push(b); return { filled: [{ cgId: 'e1', fieldType: 'email' }, { cgId: 'n1', fieldType: 'name' }], skipped: [] }; } });

  await test('AS-01', 'his .js and .ts scripts run as steps; a failure says why; outside the folder is refused; the list', async () => {
    const r = await engine.runStep({ type: 'script', config: { script: 'double.js', input: { n: 21 } } });
    assert.deepStrictEqual(r.output, { n: 42 }, JSON.stringify(r));
    const t = await engine.runStep({ type: 'script', config: { script: 'shout.ts', input: { word: 'nexus' } } });
    if (t.ok === false && /tsx|esbuild/.test(t.error || '')) console.log(`    (the .ts part: ${t.error})`);
    else assert.strictEqual(t.output, 'NEXUS', JSON.stringify(t));
    const b = await engine.runStep({ type: 'script', config: { script: 'broken.js' } });
    assert.ok(b.ok === false && /exited with 3: the list is empty/.test(b.error), JSON.stringify(b));
    const out = await engine.runStep({ type: 'script', config: { script: '../../etc/passwd.js' } });
    assert.ok(out.ok === false && /outside your scripts folder/.test(out.error), JSON.stringify(out));
    const l = await ROUTES.handle(engine, { method: 'GET', url: '/automation/scripts' });
    const body = l.body || l.json || l;
    const names = (body.scripts || []).map(s => s.name);
    assert.deepStrictEqual(names, ['broken.js', 'double.js', 'no.js', 'shout.ts'], JSON.stringify(body).slice(0, 300));
    assert.strictEqual(body.scripts.find(s => s.name === 'double.js').description, 'doubles n');
  });

  await test('AS-02', 'the autofill step fills through Clear Glass\'s door', async () => {
    const r = await engine.runStep({ type: 'autofill', config: { page: 'default', minConfidence: 'high' } });
    assert.ok(r.ok !== false, JSON.stringify(r));
    assert.deepStrictEqual([filled[0].agentId, filled[0].minConfidence], ['default', 'high']);
    assert.strictEqual(r.output.filled.length, 2);
  });

  await test('AS-03', '"if" on an element on the page, and on a script\'s answer', async () => {
    const run = await runWf(engine, [
      { type: 'condition', config: { test: 'element', element: 'present', selector: '#apply', onTrue: 'next', onFalse: 'stop' }, label: 'apply there' },
      { type: 'condition', config: { test: 'element', element: 'present', selector: '#missing', onTrue: 'next', onFalse: 'next' }, label: 'missing' },
      { type: 'condition', config: { test: 'script', script: 'no.js', onTrue: 'next', onFalse: 'next' }, label: 'script says no' },
      { type: 'log', config: { message: 'reached the end' }, label: 'end' },
    ]);
    const st = (l) => run.steps.find(s => s.label === l);
    assert.strictEqual(st('apply there').output, true, JSON.stringify(run.steps));
    assert.strictEqual(st('missing').output, false);
    assert.strictEqual(st('script says no').output, false);
    assert.strictEqual(st('end').status, 'ok');
    assert.ok(STEPS.validateStep({ type: 'condition', config: { test: 'element', element: 'present' } }).some(p => /name the element/.test(p)), 'an element check with no element is refused');
  });

  await test('AS-04', 'a gate after a step: open, stop, skip, retry; an empty gate refused', async () => {
    const ok = await runWf(engine, [{ type: 'log', config: { message: 'a' }, label: 'a', after: { condition: 'visible', selector: '#apply', timeoutMs: 300, delay: { kind: 'range', min: 5, max: 20 } } }]);
    assert.strictEqual(ok.status, 'ok', JSON.stringify(ok).slice(0, 400));
    const stop = await runWf(engine, [{ type: 'log', config: { message: 'b' }, label: 'b', retry: { count: 2, delayMs: 10 }, after: { condition: 'visible', selector: '#nope', timeoutMs: 200 } }, { type: 'log', config: { message: 'not reached' }, label: 'c' }]);
    assert.notStrictEqual(stop.status, 'ok');
    assert.ok(stop.steps.filter(s => s.label === 'b').length === 1, 'stop is not retried');
    assert.ok(JSON.stringify(stop).includes('the gate after it stayed closed: not found'), JSON.stringify(stop).slice(0, 500));
    assert.ok(!stop.steps.some(s => s.label === 'c'));
    const skip = await runWf(engine, [{ type: 'log', config: { message: 'd' }, label: 'd', after: { condition: 'visible', selector: '#nope', timeoutMs: 200, onClosed: 'skip' } }, { type: 'log', config: { message: 'e' }, label: 'e' }]);
    assert.strictEqual(skip.status, 'ok'); assert.ok(skip.steps.some(s => s.label === 'e' && s.status === 'ok'));
    gateCalls = 0; openAfter = 2;   // the first attempt reads it twice (now, and after 400 ms), both closed
    const retry = await runWf(engine, [{ type: 'log', config: { message: 'f' }, label: 'f', retry: { count: 2, delayMs: 10 }, after: { gateId: 'opens-late', timeoutMs: 100, onClosed: 'retry' } }]);
    assert.strictEqual(retry.status, 'ok', JSON.stringify(retry).slice(0, 500));
    assert.strictEqual(retry.steps.filter(s => s.label === 'f').length, 2, 'ran again, then the gate opened');
    assert.ok(STEPS.validateStep({ type: 'log', config: { message: 'x' }, after: {} }).some(p => /neither a gate nor a delay/.test(p)));
    assert.ok(STEPS.validateStep({ type: 'log', config: { message: 'x' }, after: { condition: 'visible', onClosed: 'maybe' } }).length === 2);
  });

  await test('AS-05', 'the catalogue draws the new steps; the screen reads them', () => {
    const t = STEPS.byType;
    assert.ok(t.get('script') && t.get('autofill'));
    const cond = t.get('condition').fields.map(f => f.key);
    for (const k of ['test', 'element', 'selector', 'script']) assert.ok(cond.includes(k), k);
    const ui = fs.readFileSync(path.join(ROOT, 'clear-glass/renderer/settings/sections/automation.js'), 'utf8');
    assert.match(ui, /Gate after this step/); assert.match(ui, /case 'script': \{ const sc = ctx\.scripts/); assert.match(ui, /wire\('\/automation\/scripts'\)/);
  });

  console.log(`\n  ${passed} passed, ${failed} failed\n`); process.exitCode = failed ? 1 : 0;
  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (_) {}
})();
