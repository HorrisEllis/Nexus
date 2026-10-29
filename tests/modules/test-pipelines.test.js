'use strict';
/**
 * tests/modules/test-pipelines.test.js — pipelines: tasks in a dependency graph, each one engine step, gated, run as a checklist (0.60.284)
 * James, 2026-10-29: "making a pipeline and workflow feature and include the macros and automation"
 *
 *   PL-01  validate names every problem: duplicate id, missing dependency, a cycle, an unknown step type, a bad gate, bad parallel
 *   PL-02  a → (b, c) → d on a real engine: a macro, two agents (different agents) reading a's output, a step reading both; layers;
 *          the outputs passed on; parallel 2 runs b and c together
 *   PL-03  a closed gate retries, then fails; the tasks after it are blocked, each naming the task that blocked it; onFail continue
 *          lets the rest run; the run is kept
 *   PL-04  the door: create, validate, get with layers, run (wait), the run read back, runs listed, archive (kept, out of the list)
 *   PL-05  the commands: pipeline list | show | run | runs | run-status through Clear Glass's door; the checklist printed
 *   PL-06  in Clear Glass: Settings › Pipelines lists, opens the editor, saves a pipeline with a macro task and an agent task, runs it,
 *          shows the checklist
 */
require('../../lib/test-sandbox.js').ensure();
const fs = require('fs');
const os = require('os');
const path = require('path');
process.env.NEXUS_DATA_ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'pl-test-'));
process.env.NEXUS_AUTOMATION_NS = 'pl-test';
const assert = require('assert');
const http = require('http');
const { pathToFileURL } = require('url');
const ROOT = path.join(__dirname, '..', '..');
const CG = (p) => path.join(ROOT, 'clear-glass', p);

let passed = 0, failed = 0;
async function test(id, desc, fn) { try { await fn(); console.log(`  ✓ ${id} ${desc}`); passed++; } catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${(e.stack || e.message).split('\n').slice(0, 6).join('\n    ')}`); failed++; } }

(async () => {
  console.log('\n⬡  Pipelines: tasks in a dependency graph, each one automation, run as a checklist\n');
  const PL = require(path.join(ROOT, 'lib/automation/pipeline.js'));
  const S = require(path.join(ROOT, 'lib/automation/steps.js'));
  const { AutomationEngine } = require(path.join(ROOT, 'lib/automation/engine.js'));
  const v = (p) => PL.validate(p, { stepTypes: S.byType, validateStep: (st) => S.validateStep(st) });
  const agent = (key, prompt) => ({ type: 'agent', config: { agentKey: key, prompt, await: true } });
  const macro = (name) => ({ type: 'macro', config: { name } });

  await test('PL-01', 'validate names every problem', async () => {
    assert.ok(v({ name: 'x', tasks: [{ id: 'a', step: macro('m') }] }).ok);
    const bad = v({ name: '', settings: { parallel: 9 }, tasks: [{ id: 'a', step: macro('m') }, { id: 'a', step: macro('m') }, { id: 'b', step: { type: 'teleport' }, depends_on: ['zz'] },
      { id: 'c', step: macro('m'), gate: { colour: 1, matches: '(' } }, { id: '9x', step: macro('m') }] }).problems.join(' | ');
    for (const re of [/needs a name/, /"a" is used twice/, /unknown step type "teleport"/, /depends on "zz", which is not a task here/, /unknown gate key "colour"/, /pattern is invalid/, /an id is a letter/, /parallel is 1 to 4/])
      assert.match(bad, re);
    assert.match(v({ name: 'x', tasks: [{ id: 'a', step: macro('m'), depends_on: ['c'] }, { id: 'b', step: macro('m'), depends_on: ['a'] }, { id: 'c', step: macro('m'), depends_on: ['b'] }] }).problems[0], /a cycle: a → c → b → a|a cycle/);
    assert.match(v({ name: 'x', tasks: [{ id: 'a', step: { type: 'macro', config: {} } }] }).problems.join(' '), /task 1 \(a\): Run a macro: “Macro” is empty/, 'the step\'s own validation runs');
  });

  // a real engine with stand-in hooks: a macro answers its name; an agent answers who it is and what it was asked
  let inFlight = 0, maxInFlight = 0; const asked = []; let flaky = 0;
  const A = new AutomationEngine({
    runMacroFn: async ({ name }) => { if (name === 'flaky') { flaky++; return { ok: true, said: flaky < 3 ? 'not yet' : 'READY' }; } return { ok: true, macro: name, filled: 3 }; },
    askAgentFn: async ({ agentKey, prompt }) => { inFlight++; maxInFlight = Math.max(maxInFlight, inFlight); asked.push([agentKey, prompt]); await new Promise(r => setTimeout(r, 60)); inFlight--; return { text: `${agentKey}: ${prompt}` }; },
  });
  const P = new PL.Pipelines(A);

  await test('PL-02', 'a → (b, c) → d: a macro, two agents reading its output, a step reading both; parallel 2', async () => {
    const c = P.create({ name: 'Gig day', vars: { gig: 'AI agents' }, settings: { parallel: 2 }, tasks: [
      { id: 'fill', label: 'Fill the gig', step: macro('Fiverr gig - fill') },
      { id: 'title', label: 'A title', depends_on: ['fill'], step: agent('claude', 'title for {{vars.gig}} after {{tasks.fill.output.filled}} fields') },
      { id: 'tags', label: 'Tags', depends_on: ['fill'], step: agent('ollama', 'tags for {{vars.gig}}') },
      { id: 'check', label: 'Check both', depends_on: ['title', 'tags'], step: agent('chatgpt', '{{tasks.title.output}} | {{tasks.tags.output}}'), gate: { contains: 'claude:' } } ] });
    assert.ok(c.ok, JSON.stringify(c));
    assert.deepStrictEqual(PL.layers(c.pipeline), [['fill'], ['title', 'tags'], ['check']]);
    const r = await P.run(c.pipeline.id);
    assert.ok(r.ok && r.status === 'ok', JSON.stringify(r).slice(0, 500));
    assert.deepStrictEqual(Object.values(r.run.tasks).map(t => t.status), ['done', 'done', 'done', 'done']);
    assert.deepStrictEqual(asked.slice(0, 2).map(x => x[0]).sort(), ['claude', 'ollama'], 'different agents');
    assert.ok(asked.some(([k, pr]) => k === 'claude' && pr === 'title for AI agents after 3 fields'), JSON.stringify(asked));
    assert.strictEqual(asked[2][1], 'claude: title for AI agents after 3 fields | ollama: tags for AI agents', 'd reads b and c');
    assert.strictEqual(maxInFlight, 2, 'b and c ran together');
    assert.deepStrictEqual(r.run.tasks.fill.output, { ok: true, macro: 'Fiverr gig - fill', filled: 3 });
  });

  await test('PL-03', 'a closed gate retries then fails; after it blocked (named); onFail continue; the run kept', async () => {
    flaky = 0;
    const c = P.create({ name: 'Wait for it', tasks: [
      { id: 'wait', step: macro('flaky'), gate: { contains: 'READY' }, retries: 1 },
      { id: 'next', depends_on: ['wait'], step: macro('m') }, { id: 'after', depends_on: ['next'], step: macro('m') }, { id: 'free', step: macro('m') } ] });
    let r = await P.run(c.pipeline.id);
    assert.strictEqual(r.status, 'failed');
    assert.deepStrictEqual([r.run.tasks.wait.status, r.run.tasks.wait.attempts], ['failed', 2]);
    assert.match(r.run.tasks.wait.error, /gate: the output does not contain "READY" \(after 2 attempts\)/);
    assert.deepStrictEqual([r.run.tasks.next.status, r.run.tasks.next.blockedBy, r.run.tasks.after.status, r.run.tasks.after.blockedBy], ['blocked', 'wait', 'blocked', 'wait']);
    flaky = 0;
    const u = P.update(c.pipeline.id, { tasks: c.pipeline.tasks.map(t => (t.id === 'wait' ? { ...t, retries: 2 } : t)) });
    r = await P.run(u.pipeline.id);
    assert.ok(r.ok, 'with 3 attempts the gate opens: ' + JSON.stringify(r.run.tasks.wait));
    const d = P.create({ name: 'Keep going', tasks: [{ id: 'bad', step: macro('flaky'), gate: { equals: 'never' }, onFail: 'continue' }, { id: 'other', step: macro('m') }, { id: 'dep', depends_on: ['bad'], step: macro('m') }] });
    r = await P.run(d.pipeline.id);
    assert.deepStrictEqual(['bad', 'other', 'dep'].map(k => r.run.tasks[k].status), ['failed', 'done', 'blocked']);
    assert.ok(P.runs(c.pipeline.id).length === 2 && P.getRun(r.runId).status === 'failed', 'runs kept');
  });

  await test('PL-04', 'the door: create, validate, get with layers, run, the run read back, archive', async () => {
    const R = require(path.join(ROOT, 'lib/automation/routes.js'));
    const call = (method, url, body) => R.handle(A, { method, url, body: body || {} }, {});
    const body = { name: 'Door', tasks: [{ id: 'a', step: macro('m') }, { id: 'b', depends_on: ['a'], step: agent('deepseek', 'hi {{tasks.a.output.macro}}') }] };
    const vd = await call('POST', '/automation/pipelines/validate', body);
    assert.deepStrictEqual([vd.body.ok, vd.body.problems, vd.body.layers], [true, [], [['a'], ['b']]]);
    const bad = await call('POST', '/automation/pipelines', { name: 'x', tasks: [] });
    assert.strictEqual(bad.status, 400);
    const c = await call('POST', '/automation/pipelines', body);
    const id = c.body.pipeline.id;
    assert.deepStrictEqual((await call('GET', `/automation/pipelines/${id}`)).body.layers, [['a'], ['b']]);
    const run = await call('POST', `/automation/pipelines/${id}/run?wait=1`);
    assert.ok(run.status === 200 && run.body.status === 'ok', JSON.stringify(run.body).slice(0, 300));
    assert.strictEqual((await call('GET', `/automation/pipeline-runs/${run.body.runId}`)).body.run.tasks.b.output, 'deepseek: hi m');
    assert.strictEqual((await call('GET', `/automation/pipeline-runs?pipelineId=${id}`)).body.runs.length, 1);
    const started = await call('POST', `/automation/pipelines/${id}/run`);
    assert.strictEqual(started.body.status, 'running', 'without wait it answers at once');
    await new Promise(r => setTimeout(r, 300));
    await call('POST', `/automation/pipelines/${id}/archive`);
    assert.ok(!(await call('GET', '/automation/pipelines')).body.pipelines.some(p => p.id === id), 'out of the list');
    assert.ok((await call('GET', '/automation/pipelines?archived=1')).body.pipelines.some(p => p.id === id && p.archived), 'kept');
    assert.strictEqual((await call('GET', '/automation/pipelines/nope')).status, 404);
  });

  await test('PL-05', 'the commands: through Clear Glass\'s door; the checklist printed', async () => {
    const { SPEC } = await import(pathToFileURL(path.join(ROOT, 'idearium/cli/route-commands.js')).href);
    const row = (k) => SPEC.find(r => r.key === k);
    assert.deepStrictEqual(row('pipeline.list').req({ args: [], flags: {} }), { system: 'clear-glass', method: 'GET', path: '/automation/pipelines' });
    assert.deepStrictEqual(row('pipeline.run').req({ args: ['p1'], flags: { wait: true } }), { system: 'clear-glass', method: 'POST', path: '/automation/pipelines/p1/run?wait=1', body: {}, timeoutMs: 30 * 60000 });
    assert.strictEqual(row('pipeline.run-status').req({ args: ['r1'], flags: {} }).path, '/automation/pipeline-runs/r1');
    assert.strictEqual(row('pipeline.runs').req({ args: ['p1'], flags: {} }).path, '/automation/pipeline-runs?pipelineId=p1');
    const lines = []; const h = { c: new Proxy({}, { get: () => (s) => s }), header: (s) => lines.push(s) }; const log = console.log; console.log = (s) => lines.push(String(s));
    try { row('pipeline.run-status').print({ run: { pipelineName: 'X', status: 'failed', order: [['a'], ['b']], tasks: { a: { label: 'A', status: 'failed', attempts: 2, error: 'gate: no' }, b: { label: 'B', status: 'blocked', blockedBy: 'a' } } } }, { args: [] }, h); }
    finally { console.log = log; }
    const out = lines.join('\n');
    assert.match(out, /✗ A .*gate: no/); assert.match(out, /⊘ B .*blocked by a/);
  });

  // PL-06: Settings › Pipelines in Clear Glass, against this engine's door served over HTTP (the wire port)
  const R = require(path.join(ROOT, 'lib/automation/routes.js'));
  const srv = http.createServer((req, res) => { let b = ''; req.on('data', c => { b += c; }); req.on('end', async () => {
    res.setHeader('Access-Control-Allow-Origin', '*'); res.setHeader('Access-Control-Allow-Headers', 'Content-Type'); res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT');
    if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }
    let body = {}; try { body = b ? JSON.parse(b) : {}; } catch (_) {}
    const r = await R.handle(A, { method: req.method, url: req.url, body, headers: {} }, {});
    if (!r) { res.writeHead(404); return res.end('{}'); }
    res.writeHead(r.status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(r.body)); }); });
  await new Promise(r => srv.listen(0, '127.0.0.1', r));
  const port = srv.address().port;
  const glass = require(CG('src/driver/glass.js'));
  let browser; try { browser = await glass.chromium.launch(); } catch (e) { console.log(`  - PL-06 SKIPPED: the engine could not start (${e.message.split('\n')[0]})`); }
  if (browser) await test('PL-06', 'in Clear Glass: Settings › Pipelines — list, editor, save a macro task and an agent task, run, the checklist', async () => {
    const { initScript } = require(CG('src/driver/cg-stub.js'));
    const errors = [];
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } }); page.on('pageerror', e => errors.push(e.message));
    await page.addInitScript(initScript({ answers: { 'options.get': {}, 'accounts.list': [] } }));
    await page.addInitScript(`window.ClearGlass.accounts.portal = new Proxy({}, { get: (_, k) => async () => (/list|providers/.test(k) ? [] : {}) }); window.__CG_WIRE_PORT = ${port};`);
    await page.goto(pathToFileURL(CG('renderer/settings.html')).href + '#pipelines');
    await page.waitForSelector('[data-pipeline]', { timeout: 8000 });
    assert.ok(await page.evaluate(() => /Gig day/.test(document.querySelector('main').textContent)), 'lists the pipelines');
    await page.evaluate(() => [...document.querySelectorAll('button')].find(b => b.textContent === 'New pipeline').click());
    await page.waitForSelector('.modal .pl-task');
    await page.fill('.modal input[data-k="name"]', 'From the screen');
    await page.fill('.modal .pl-task[data-i="0"] input[data-k="id"]', 'fill');
    await page.selectOption('.modal .pl-task[data-i="0"] select[data-k="type"]', 'macro');
    await page.fill('.modal .pl-task[data-i="0"] input[data-k="what"]', 'Fiverr gig - fill');
    await page.evaluate(() => [...document.querySelectorAll('.modal button')].find(b => b.textContent === '+ Task').click());
    await page.fill('.modal .pl-task[data-i="1"] input[data-k="id"]', 'ask');
    await page.selectOption('.modal .pl-task[data-i="1"] select[data-k="type"]', 'agent');
    await page.fill('.modal .pl-task[data-i="1"] input[data-k="what"]', 'claude');
    await page.fill('.modal .pl-task[data-i="1"] textarea[data-k="prompt"]', 'done? {{tasks.fill.output.filled}}');
    await page.fill('.modal .pl-task[data-i="1"] input[data-k="deps"]', 'fill');
    await page.fill('.modal .pl-task[data-i="1"] input[data-k="contains"]', 'claude');
    await page.evaluate(() => [...document.querySelectorAll('.modal button')].find(b => b.textContent === 'Save').click());
    await page.waitForFunction(() => /From the screen/.test(document.querySelector('main').textContent), null, { timeout: 5000 });
    const saved = P.list().find(p => p.name === 'From the screen');
    assert.ok(saved, 'saved through the door');
    assert.deepStrictEqual(saved.tasks.map(t => [t.id, t.step.type, t.depends_on]), [['fill', 'macro', []], ['ask', 'agent', ['fill']]]);
    assert.deepStrictEqual(saved.tasks[1].gate, { contains: 'claude' });
    await page.evaluate((id) => [...document.querySelectorAll(`[data-pipeline="${id}"] button`)].find(b => b.textContent === 'Run').click(), saved.id);
    await page.waitForFunction((id) => { const el = document.querySelector(`[data-pipeline="${id}"] .pl-check`); return el && /✓ ask/.test(el.textContent); }, saved.id, { timeout: 8000 });
    const check = await page.evaluate((id) => document.querySelector(`[data-pipeline="${id}"] .pl-check`).textContent, saved.id);
    assert.match(check, /✓ fill/); assert.match(check, /✓ ask/);
    if (process.env.PL_SHOT) await page.screenshot({ path: process.env.PL_SHOT });
    assert.deepStrictEqual(errors, []);
    await page.close();
  });

  if (browser) try { await browser.close(); } catch (_) {}
  srv.close();
  console.log(`\n  ${passed} passed, ${failed} failed\n`); process.exitCode = failed ? 1 : 0;
})();
