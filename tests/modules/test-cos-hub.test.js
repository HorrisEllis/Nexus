'use strict';
// run-all: timeout 120000
require('../../lib/test-sandbox.js').ensure();
/**
 * tests/modules/test-cos-hub.test.js — OC8a, 0.60.446. Map: docs/2026-11-01-orchestration-console-phasemap.spec OC8 (OC8a), AE_D4 · Spec:
 * docs/orchestration-console.spec MOD-OC-HUB, MOD-OC-HUB-PAGE.
 * James, 2026-11-08: "queues, contracts, dag, it should all be there, waiting to be wired in." · "yes, pick the structural solution."
 *   HB-01 a slot is wired only when its owner answered just now (stand-in Cortex, Idearium, Clear Glass on their own addresses)
 *   HB-02 an owner down is said (down, with the reason); a route the owner refuses is said (refused, with the status); never wired
 *   HB-03 the slots with no route yet are waiting and name the phase that wires them; COS's own slots answer in process
 *   HB-07 AE5: the Automation tab — a pipeline listed, run live to done, exported as a .pipeline, imported back; the supervisor's rules kept
 *   HB-08 PC8 slice b: Pause holds a run (the running step finishes), Continue finishes it; a failed run's Retry and "from here", retried to done
 *   HB-04 GET /api/cos/hub through the manager; the Hub page in Clear Glass through the real cockpit shows each slot and its state
 */
const assert = require('assert'), fs = require('fs'), os = require('os'), path = require('path'), http = require('http'), net = require('net');
const ROOT = path.join(__dirname, '..', '..');
if (!process.env.GLASS_CHROMIUM) { const c = '/opt/pw-browsers/chromium-1243/chrome-linux64/chrome'; if (fs.existsSync(c) && !fs.existsSync(path.join(ROOT, 'node_modules/electron'))) process.env.GLASS_CHROMIUM = c; }
let passed = 0, failed = 0;
async function test(id, d, fn) { try { await fn(); console.log(`  ✓ ${id} ${d}`); passed++; } catch (e) { console.error(`  ✗ ${id} ${d}\n    ${(e.stack || e.message).split('\n').slice(0, 4).join('\n    ')}`); failed++; } }
const freePort = () => new Promise(r => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => r(p)); }); });
const req = (port, method, p, body) => new Promise((res) => { const data = body === undefined ? null : Buffer.from(JSON.stringify(body)); const q = http.request({ host: '127.0.0.1', port, path: p, method, headers: data ? { 'Content-Type': 'application/json', 'Content-Length': data.length } : {} }, (x) => { let t = ''; x.on('data', c => t += c); x.on('end', () => res({ status: x.statusCode, body: JSON.parse(t || '{}') })); }); if (data) q.write(data); q.end(); });
const stand = async (answers) => { const hits = []; const s = http.createServer((q, r) => { hits.push(`${q.method} ${q.url}`); const code = answers[q.url.split('?')[0]] || 404; r.statusCode = code; r.end('{}'); });
  await new Promise(r => s.listen(0, '127.0.0.1', r)); return { s, hits, url: `http://127.0.0.1:${s.address().port}/health` }; };

(async () => {
  console.log('\n⇢  COS the hub (OC8a)\n');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cos-hub-'));
  const cortex = await stand({ '/api/raid/health': 200, '/api/raid/queue': 200 });
  const idearium = await stand({ '/api/automation': 200 });   // /api/phases/next not served: refused
  const dead = await freePort();
  const { createSupervisor } = require(path.join(ROOT, 'cos/manager/supervisor.js'));
  const decl = (name, healthUrl) => ({ name, system: name, cmd: process.execPath, args: ['-e', ''], healthUrl });
  const sup = createSupervisor({ root: dir, ledgerFile: path.join(dir, 'ledger.jsonl'), log: () => {}, declarations: [
    decl('cortex', cortex.url), decl('idearium', idearium.url), decl('clear-glass', `http://127.0.0.1:${dead}/health`)] });
  const H = require(path.join(ROOT, 'cos/manager/hub.js'));
  const hub = H.createHub(sup, { timeoutMs: 1500 });
  const r = await hub.read(); const by = Object.fromEntries(r.slots.map(s => [s.id, s]));

  await test('HB-01', 'wired only when the owner answered just now', () => {
    for (const id of ['raid', 'contracts', 'automation']) assert.strictEqual(by[id].state, 'wired', `${id}: ${JSON.stringify(by[id])}`);
    assert.ok(cortex.hits.includes('GET /api/raid/health') && cortex.hits.some(h => h.startsWith('GET /api/raid/queue')), cortex.hits.join());
    assert.ok(idearium.hits.includes('GET /api/automation'));
  });
  await test('HB-02', 'an owner down is said; a refused route is said; neither is wired', () => {
    assert.strictEqual(by.pipelines.state, 'down'); assert.match(by.pipelines.why, /clear-glass did not answer: ECONNREFUSED/);
    assert.strictEqual(by.dag.state, 'refused'); assert.match(by.dag.why, /answered 404/);
    assert.strictEqual(r.down, 2);
  });
  await test('HB-03', 'waiting slots name their phase; COS\'s own slots answer', () => {
    for (const [id, ph] of [['agents', 'OC4b'], ['dag-per-input', 'RQ14'], ['context', 'RQ7'], ['gaps', 'RQ8'], ['hypotheses', 'RQ16'], ['experiments', 'RQ15']]) {
      assert.strictEqual(by[id].state, 'waiting', id); assert.ok(by[id].why.includes(ph), by[id].why); }
    assert.strictEqual(by.tasks.state, 'wired'); assert.strictEqual(by.queues.state, 'wired');
    assert.strictEqual(r.slots.length, H.SLOTS.length); assert.strictEqual(r.wired + r.waiting + r.down, r.slots.length);
  });
  const mgr = await require(path.join(ROOT, 'cos/manager/server.js')).listen(sup, 0, { root: dir }); const mp = mgr.address().port;
  const cp = await freePort();
  const cockpit = require(path.join(ROOT, 'cos/ui/serve.js')).createServer({ port: cp, manager: `http://127.0.0.1:${mp}` });
  await new Promise(x => cockpit.listen(cp, '127.0.0.1', x));
  await test('HB-04', 'the route; the Hub page in Clear Glass through the real cockpit', async () => {
    const g = await req(mp, 'GET', '/api/cos/hub'); assert.strictEqual(g.status, 200); assert.strictEqual(g.body.slots.length, H.SLOTS.length);
    assert.strictEqual(g.body.slots.find(s => s.id === 'raid').state, 'wired');
    const viaCockpit = await req(cp, 'GET', '/api/cos/hub'); assert.strictEqual(viaCockpit.status, 200, 'the cockpit forwards it (in the contract)');
    const glass = require(path.join(ROOT, 'clear-glass/src/driver/glass.js'));
    let browser; try { browser = await glass.chromium.launch(); } catch (e) { console.log(`  - HB-04 page part SKIPPED: the engine could not start (${e.message.split('\n')[0]})`); return; }
    try {
      const page = await browser.newPage({ viewport: { width: 1100, height: 900 } });
      await page.goto(`http://127.0.0.1:${cp}/hub/index.html`);
      let rows = []; for (let k = 0; k < 60 && rows.length < H.SLOTS.length; k++) { await new Promise(x => setTimeout(x, 200)); rows = await page.evaluate(() => [...document.querySelectorAll('.hub-row')].map(e => [e.dataset.slot, e.dataset.state])); }
      if (process.env.HB_SHOTS) await page.screenshot({ path: path.join(process.env.HB_SHOTS, 'cos-hub.png'), fullPage: true });
      const m = Object.fromEntries(rows); assert.strictEqual(rows.length, H.SLOTS.length, JSON.stringify(rows));
      assert.strictEqual(m.raid, 'wired'); assert.strictEqual(m.pipelines, 'down'); assert.strictEqual(m.experiments, 'waiting');
      assert.match(await page.evaluate(() => document.getElementById('hub-sum').textContent), /wired · \d+ waiting · \d+ down/);
    } finally { await browser.close(); }
  });
  // AE6 slice a (2026-11-08) — James: "Have cos be the orchastrator complelelt." · "orchastrator as the engine, which need to be cos now."
  await test('HB-05', 'COS runs the automation engine: its route answers, the engine slot is wired, the orchestrator\'s old door forwards to it', async () => {
    const wf = await req(mp, 'GET', '/api/cos/automation/workflows'); assert.strictEqual(wf.status, 200, JSON.stringify(wf.body)); assert.ok(Array.isArray(wf.body.workflows));
    const cat = await req(mp, 'GET', '/api/cos/automation/catalogue'); assert.strictEqual(cat.status, 200); assert.ok(cat.body.catalogue);
    const none = await req(mp, 'GET', '/api/cos/automation/nothing-here'); assert.strictEqual(none.status, 404, 'an unknown route is said, not pretended');
    const g = await req(mp, 'GET', '/api/cos/hub'); assert.strictEqual(g.body.slots.find(s => s.id === 'engine').state, 'wired');
    process.env.COS_MANAGER_PORT = String(mp);
    delete require.cache[require.resolve(path.join(ROOT, 'orchestrator/automation/index.js'))];
    const fwd = require(path.join(ROOT, 'orchestrator/automation/index.js'));
    const via = await fwd.handle({ method: 'GET', url: '/automation/workflows' }); assert.strictEqual(via.status, 200); assert.ok(Array.isArray(via.body.workflows));
    process.env.COS_MANAGER_PORT = String(await freePort()); delete require.cache[require.resolve(path.join(ROOT, 'orchestrator/automation/index.js'))];
    const down = await require(path.join(ROOT, 'orchestrator/automation/index.js')).handle({ method: 'GET', url: '/automation/workflows' });
    assert.strictEqual(down.status, 503); assert.match(down.body.error, /COS did not answer/);
  });
  // AE7 (2026-11-08) — James: "Then an api that eravos can use for the step. So needs full cli commands, events, nodes."
  await test('HB-06', 'ERAVOS\'s way in: the command line, one step by route, the engine\'s events on COS\'s stream, the contract that says it', async () => {
    const cli = async (line) => (await req(mp, 'POST', '/api/cos/cli', { line, by: 'test' })).body;
    const wfs = await cli('automation workflows'); assert.ok(wfs.ok, JSON.stringify(wfs));
    const cat = await cli('automation catalogue'); assert.ok(cat.ok && cat.lines.some(l => /procedure/.test(l)), 'the procedure step is a box kind');
    const step = await req(mp, 'POST', '/api/cos/automation/step', { step: { type: 'log', config: { message: 'from an ERAVOS box' } } });
    assert.strictEqual(step.status, 200, JSON.stringify(step.body));
    const seen = []; const http = require('http');
    const sse = http.get({ host: '127.0.0.1', port: mp, path: '/api/cos/events' }, (r) => { r.setEncoding('utf8'); r.on('data', (c) => { for (const m of c.matchAll(/event: (automation\.[a-z.]+)/g)) seen.push(m[1]); }); });
    await new Promise(x => setTimeout(x, 300));
    const made = await req(mp, 'POST', '/api/cos/automation/workflows', { name: 'hb06', status: 'active', steps: [{ type: 'trigger', config: { kind: 'manual' } }, { type: 'log', config: { message: 'hi' } }] });
    assert.ok(made.body.workflow, JSON.stringify(made.body));
    const ran = await cli(`automation run ${made.body.workflow.id}`); assert.ok(ran.ok, JSON.stringify(ran));
    for (let k = 0; k < 30 && !seen.includes('automation.run.complete'); k++) await new Promise(x => setTimeout(x, 100));
    sse.destroy();
    assert.ok(seen.includes('automation.run.start') && seen.includes('automation.run.complete'), `events seen: ${seen.join(', ')}`);
    const c = (await req(mp, 'GET', '/api/cos/contract')).body;
    const con = c.contract || c; assert.ok(con.for_eravos && con.for_eravos.run_one_step && con.automation_events.events.includes('automation.run.complete'), 'the contract says how ERAVOS uses it');
  });
  // AE5 (0.60.461) — James, 2026-11-08: "just need the automation engine fully built and in the automation tab" · "has to be real .pipeline files.
  // it must be exportable and importable."
  await test('HB-07', 'the Automation tab: a pipeline listed, run live to done, exported as its real .pipeline, imported back; Supervision kept', async () => {
    const mk = await req(mp, 'POST', '/api/cos/automation/pipelines', { name: 'AE5 proof', tasks: [
      { id: 'one', label: 'Say one', depends_on: [], step: { type: 'log', config: { message: 'one' } } },
      { id: 'two', label: 'Say two', depends_on: ['one'], step: { type: 'log', config: { message: 'two' } } }] });
    const pid = (mk.body.pipeline || mk.body).id; assert.ok(pid, JSON.stringify(mk.body));
    const node = await req(cp, 'GET', `/api/cos/automation/pipelines/${pid}/node`); assert.strictEqual(node.status, 200, JSON.stringify(node.body));
    assert.match(node.body.text, /type: pipeline/, 'a real .pipeline node file'); assert.match(node.body.filename, /\.pipeline$/);
    // backend first (his, 2026-11-08: "ui is only ever supposed to use the cli and api routes … always backend first, with commands, events"):
    // everything the page does is a COS command too
    const cl = async (line) => { const b = (await req(mp, 'POST', '/api/cos/cli', { line, by: 'person' })).body; return (b.lines || b.out || []).join('\n') + (b.error ? ' ERROR ' + b.error : ''); };
    assert.match(await cl('automation pipelines'), /AE5 proof/, 'the command lists it');
    assert.match(await cl(`automation pipeline-run ${pid}`), /running .*run /, 'the command runs it');
    let rl = ''; for (let k = 0; k < 40 && !/^ok|^done/m.test(rl); k++) { await new Promise(r => setTimeout(r, 100)); rl = await cl(`automation runs ${pid}`); }
    assert.match(rl, /^(ok|done)\s+\S+\s+2\/2/m, 'the run, by command: ' + rl);
    const pf = path.join(dir, 'proof.pipeline'); assert.match(await cl(`automation pipeline-export ${pid} ${pf}`), /wrote .*\.pipeline/); assert.match(fs.readFileSync(pf, 'utf8'), /type: pipeline/);
    assert.match(await cl(`automation import ${pf}`), /imported .*as pipeline/, 'the exported file imports back by command');
    const contract = JSON.parse(fs.readFileSync(path.join(ROOT, 'cos/manager/contract.json'), 'utf8'));
    for (const e of ['automation.pipeline.start', 'automation.pipeline.task', 'automation.pipeline.done']) assert.ok(contract.automation_events.events.includes(e), e + ' declared');
    const glass = require(path.join(ROOT, 'clear-glass/src/driver/glass.js'));
    let browser; try { browser = await glass.chromium.launch(); } catch (e) { console.log(`  - HB-07 page part SKIPPED: the engine could not start (${e.message.split('\n')[0]})`); return; }
    try {
      const page = await browser.newPage({ viewport: { width: 1280, height: 860 } });
      await page.goto(`http://127.0.0.1:${cp}/automation/index.html`);
      const until = async (fn, ms = 10000) => { const t = Date.now() + ms; while (Date.now() < t) { const v = await page.evaluate(fn); if (v) return v; await new Promise(r => setTimeout(r, 150)); } return null; };
      assert.ok(await until(() => !!document.querySelector('[data-pipeline]')), 'pipelines listed');
      await page.evaluate((id) => document.querySelector(`[data-pipeline="${id}"]`).click(), pid);
      assert.ok(await until(() => document.querySelectorAll('.ae-step').length === 2), 'its steps shown, in its own words');
      await page.evaluate(() => document.querySelector('[data-act="run"]').click());
      const done = await until(() => [...document.querySelectorAll('.ae-step')].every(e => e.dataset.state === 'done') && document.querySelectorAll('.ae-step').length === 2, 15000);
      if (process.env.HB_SHOTS) await page.screenshot({ path: path.join(process.env.HB_SHOTS, 'cos-automation.png'), fullPage: true });
      assert.ok(done, 'the run shown live to done: ' + await page.evaluate(() => [...document.querySelectorAll('.ae-step')].map(e => e.dataset.state).join(',')));
      // PC8 slice a (2026-11-10, his "each step can be used as a progress status, with an indicator or bar"): a third run, then the page shows
      // each step's bar against its baseline, and the baseline over three runs (a sigma from three)
      assert.match(await cl(`automation pipeline-run ${pid}`), /running .*run /);
      let rl3 = ''; for (let k = 0; k < 60; k++) { await new Promise(r => setTimeout(r, 100)); rl3 = await cl(`automation runs ${pid}`); if ((rl3.match(/^(ok|done)\s/mg) || []).length >= 3) break; }
      await page.evaluate((id) => document.querySelector(`[data-pipeline="${id}"]`).click(), pid);
      const shown = await until(() => { const b = [...document.querySelectorAll('.ae-step .ae-base')].map(e => e.textContent); return document.querySelectorAll('.ae-step .ae-bar').length === 2 && b.length === 2 && b.every(t => /over 3 runs/.test(t)) ? b.join(' | ') : null; }, 10000);
      if (process.env.HB_SHOTS) await page.screenshot({ path: path.join(process.env.HB_SHOTS, 'cos-automation-baseline.png'), fullPage: true });
      assert.ok(shown, 'each step a bar and its baseline over 3 runs: ' + await page.evaluate(() => document.getElementById('ae-p-body').textContent.slice(0, 400)));
      const before = (await req(cp, 'GET', '/api/cos/automation/pipelines')).body.pipelines.length;
      const imp = await page.evaluate(async (text) => { const r = await fetch('/api/cos/automation/import', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text, by: 'person', allowDuplicate: true }) }); return { status: r.status, body: await r.json() }; }, node.body.text);
      assert.ok(imp.status < 300 && imp.body.ok !== false, 'the exported .pipeline imports back: ' + JSON.stringify(imp.body).slice(0, 200));
      assert.ok((await req(cp, 'GET', '/api/cos/automation/pipelines')).body.pipelines.length >= before + 1, 'another pipeline from the file');
      await page.evaluate(() => document.querySelector('[data-tab="supervision"]').click());
      assert.ok(await until(() => document.querySelectorAll('#form .rule').length > 3 && !document.querySelector('[data-pane="supervision"]').hidden), 'the supervisor\'s rules are still here');
    } finally { await browser.close(); }
  });
  await test('HB-08', 'PC8 slice b in Clear Glass: Pause holds a run and Continue finishes it; a failed run shows Retry and "from here"; Retry runs it to done', async () => {
    let fixed = false, slow = true;
    const flaky = http.createServer((q, r) => { r.setHeader('content-type', 'application/json'); const go = () => { if (!fixed) { r.statusCode = 500; return r.end('{"ok":false}'); } r.end('{"ok":true}'); }; if (slow && q.url === '/slow') return setTimeout(() => { r.end('{"ok":true}'); }, 1200); go(); });
    await new Promise(x => flaky.listen(0, '127.0.0.1', x)); const fp = flaky.address().port;
    const mk = (name, tasks) => req(mp, 'POST', '/api/cos/automation/pipelines', { name, tasks, by: 'person' }).then(r => (r.body.pipeline || r.body).id);
    const SET = (v) => ({ type: 'set', config: { assign: { v } } });
    const held = await mk('PC8b hold', [{ id: 'one', label: 'Slow one', step: { type: 'api', config: { url: `http://127.0.0.1:${fp}/slow`, method: 'GET' } } }, { id: 'two', label: 'Then two', depends_on: ['one'], step: SET('b') }]);
    const flak = await mk('PC8b retry', [{ id: 'a', label: 'Set a', step: SET('a') }, { id: 'b', label: 'Call it', depends_on: ['a'], step: { type: 'api', config: { url: `http://127.0.0.1:${fp}/x`, method: 'GET' } } }]);
    const glass = require(path.join(ROOT, 'clear-glass/src/driver/glass.js'));
    let browser; try { browser = await glass.chromium.launch(); } catch (e) { flaky.close(); console.log(`  - HB-08 SKIPPED: the engine could not start (${e.message.split('\n')[0]})`); return; }
    try {
      const page = await browser.newPage({ viewport: { width: 1280, height: 860 } });
      await page.goto(`http://127.0.0.1:${cp}/automation/index.html`);
      const until = async (fn, arg, ms = 12000) => { const t = Date.now() + ms; while (Date.now() < t) { const v = await page.evaluate(fn, arg); if (v) return v; await new Promise(r => setTimeout(r, 120)); } return null; };
      await until((id) => !!document.querySelector(`[data-pipeline="${id}"]`), held);
      await page.evaluate((id) => document.querySelector(`[data-pipeline="${id}"]`).click(), held);
      await until(() => document.querySelectorAll('.ae-step').length === 2);
      await page.evaluate(() => document.querySelector('[data-act="run"]').click());
      assert.ok(await until(() => !!document.querySelector('[data-act="pause"]')), 'Pause while it runs');
      await page.evaluate(() => document.querySelector('[data-act="pause"]').click());
      assert.ok(await until(() => !!document.querySelector('[data-act="continue"]') && document.querySelector('[data-step="one"]').dataset.state === 'done' && document.querySelector('[data-step="two"]').dataset.state === 'waiting'), 'paused: the slow step finished, the next did not start');
      if (process.env.HB_SHOTS) await page.screenshot({ path: path.join(process.env.HB_SHOTS, 'cos-automation-paused.png'), fullPage: true });
      await page.evaluate(() => document.querySelector('[data-act="continue"]').click());
      assert.ok(await until(() => document.querySelector('[data-step="two"]').dataset.state === 'done'), 'continued to done');
      await page.evaluate((id) => document.querySelector(`[data-pipeline="${id}"]`).click(), flak);
      await until(() => document.querySelectorAll('.ae-step').length === 2 && !!document.querySelector('[data-step="b"]'));
      await page.evaluate(() => document.querySelector('[data-act="run"]').click());
      assert.ok(await until(() => !!document.querySelector('[data-act="retry"]') && document.querySelectorAll('.ae-from').length === 2), 'failed: Retry and a "from here" on each step');
      if (process.env.HB_SHOTS) await page.screenshot({ path: path.join(process.env.HB_SHOTS, 'cos-automation-retry.png'), fullPage: true });
      fixed = true;
      await page.evaluate(() => document.querySelector('[data-act="retry"]').click());
      assert.ok(await until(() => /a already met, not run again/.test(document.getElementById('ae-msg').textContent)), 'said what was met: ' + await page.evaluate(() => document.getElementById('ae-msg').textContent));
      assert.ok(await until(() => [...document.querySelectorAll('.ae-step')].every(e => e.dataset.state === 'done')), 'retried to done');
    } finally { await browser.close(); flaky.close(); }
  });
  cockpit.close(); mgr.close(); cortex.s.close(); idearium.s.close(); sup.shutdown({ by: 'test' }); fs.rmSync(dir, { recursive: true, force: true });
  console.log(`\n  ${passed} passed, ${failed} failed\n`); process.exit(failed ? 1 : 0);
})();
