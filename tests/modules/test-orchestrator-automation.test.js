'use strict';
require('../../lib/test-sandbox.js').ensure();
/**
 * tests/modules/test-orchestrator-automation.test.js — AE3 (0.60.317).
 * James, 2026-10-30: "need to finish the automation in orchestrator."
 * The orchestrator's automation host wires the engine's agent steps to RAID (the routing decision) → Guardian (the runner),
 * fail-soft, plus the real event bus. Tested with injected Guardian/RAID so it runs headless, no servers.
 *
 *   OA-01  an agent step: RAID decides the provider, Guardian is dispatched that provider with the prompt
 *   OA-02  RAID down (returns null) → the step's own agentKey is the provider
 *   OA-03  askAgent returns the agent's reply text; a down Guardian is a clean { error }, never a throw
 *   OA-04  enqueue (fire-and-forget) returns queued at once and dispatches in the background
 *   OA-05  a task with no agentKey is refused (§1.2)
 *   OA-06  busEmit reaches the injected bus; browser/macro hooks port to Clear Glass with the right path
 *   OA-07  setBus wires the default bus used when no busFn is injected
 */
const assert = require('assert');
const A = require('../../cos/manager/automation-door.js');

let p = 0, f = 0;
const t = (id, d, fn) => Promise.resolve().then(fn).then(() => { console.log(`  ✓ ${id} ${d}`); p++; }).catch(e => { console.error(`  ✗ ${id} ${d}\n    ${e.stack || e.message}`); f++; });

// a fake Guardian that records every dispatch and answers as configured
function fakeGuardian(answer = { ok: true }) { const calls = []; const fn = async (path, body) => { calls.push({ path, body }); return typeof answer === 'function' ? answer(body) : answer; }; fn.calls = calls; return fn; }
const raidPicks = (provider, command) => async () => ({ provider, ...(command ? { command } : {}) });
const raidDown = async () => null;

(async () => {

await t('OA-01', 'RAID decides the provider; Guardian gets it with the prompt', async () => {
  const g = fakeGuardian({ ok: true, jobId: 'j1' });
  const r = await A._dispatchAgent({ agentKey: 'coder', prompt: 'write a test' }, { guardianFn: g, raidDecideFn: raidPicks('ollama', 'code') });
  assert.strictEqual(g.calls.length, 1);
  assert.strictEqual(g.calls[0].path, '/command');
  assert.strictEqual(g.calls[0].body.provider, 'ollama', 'RAID’s provider');
  assert.strictEqual(g.calls[0].body.command, 'code');
  assert.strictEqual(g.calls[0].body.prompt, 'write a test');
  assert.ok(r.ok);
});

await t('OA-02', 'RAID down → the step’s own agentKey is the provider', async () => {
  const g = fakeGuardian({ ok: true });
  await A._dispatchAgent({ agentKey: 'chatgpt', prompt: 'hi' }, { guardianFn: g, raidDecideFn: raidDown });
  assert.strictEqual(g.calls[0].body.provider, 'chatgpt');
  assert.strictEqual(g.calls[0].body.command, 'chat', 'default command');
});

await t('OA-03', 'askAgent returns the reply; a down Guardian is a clean error, no throw', async () => {
  const hooks = A.buildHooks({ guardianFn: fakeGuardian({ ok: true, reply: 'done' }), raidDecideFn: raidPicks('ollama') });
  const ok = await hooks.askAgentFn({ agentKey: 'coder', prompt: 'x' });
  assert.strictEqual(ok.text, 'done');
  const down = A.buildHooks({ guardianFn: fakeGuardian({ ok: false, error: 'agent steps need Guardian running' }), raidDecideFn: raidPicks('ollama') });
  const r = await down.askAgentFn({ agentKey: 'coder', prompt: 'x' });
  assert.strictEqual(r.text, '');
  assert.ok(/Guardian/.test(r.error), 'the reason, not a throw');
});

await t('OA-04', 'enqueue returns queued at once and dispatches in the background', async () => {
  const g = fakeGuardian({ ok: true });
  const hooks = A.buildHooks({ guardianFn: g, raidDecideFn: raidPicks('ollama') });
  const r = hooks.enqueueFn({ agentKey: 'coder', prompt: 'bg' });
  assert.strictEqual(r.queued, true);          // returns immediately, synchronously
  await new Promise(res => setTimeout(res, 20)); // let the background dispatch run
  assert.strictEqual(g.calls.length, 1, 'dispatched in the background');
  assert.strictEqual(g.calls[0].body.provider, 'ollama');
});

await t('OA-05', 'a task with no agentKey is refused', async () => {
  const r = await A._dispatchAgent({ prompt: 'no key' }, { guardianFn: fakeGuardian(), raidDecideFn: raidDown });
  assert.strictEqual(r.ok, false);
  assert.ok(/agentKey/.test(r.error));
});

await t('OA-06', 'busEmit reaches the injected bus; browser/macro port to Clear Glass', async () => {
  const events = []; const cgCalls = [];
  const cgFn = async (path, body) => { cgCalls.push({ path, body }); return { ok: true }; };
  const hooks = A.buildHooks({ guardianFn: fakeGuardian(), raidDecideFn: raidDown, cgFn, busFn: (type, data) => events.push({ type, data }) });
  hooks.busEmit('automation.run.start', { id: 'w1' });
  assert.deepStrictEqual(events, [{ type: 'automation.run.start', data: { id: 'w1' } }]);
  await hooks.browserFn({ action: 'click' });
  assert.strictEqual(cgCalls[0].path, '/automation/driver');
  await hooks.runMacroFn({ name: 'm' });
  assert.strictEqual(cgCalls[1].path, '/automation/macro-run');
});

await t('OA-07', 'setBus wires the default bus', async () => {
  const seen = []; A.setBus((type, data) => seen.push(type));
  const hooks = A.buildHooks({ guardianFn: fakeGuardian(), raidDecideFn: raidDown });   // no busFn → uses the one set by setBus
  hooks.busEmit('automation.log', { msg: 'hi' });
  assert.deepStrictEqual(seen, ['automation.log']);
  A.setBus(null);
});

// PC2 (docs/2026-11-08-pipeline-canvas-phasemap.spec) — James, 2026-11-08: "A .framework shouldn't just be a document describing what to do. It
// should be an executable, composable procedure with defined inputs, outputs, contracts and execution behavior."
await t('OA-08', 'a procedure is a step: it runs through Idearium\'s route, waits on its confirm, refuses a loop and the depth limit across kinds', async () => {
  const { AutomationEngine } = require('../../lib/automation/engine.js');
  const calls = [];
  const idFn = async (path, body) => { calls.push({ path, body }); if (/hold/.test(path)) return { ok: false, waiting: true, run: { results: [{ confirm: 'send the gig', waiting: true }] } };
    return { ok: true, run: { ok: true, results: [{ tool: 'grep', ok: true }, { tool: 'read', ok: true }] } }; };
  const E = new AutomationEngine(A.buildHooks({ guardianFn: fakeGuardian(), raidDecideFn: raidDown, idFn }));
  const step = (procedure, extra = {}) => ({ type: 'procedure', config: { procedure, ...extra } });
  const run = async (steps, vars) => { const w = E.create({ name: 'pc2-' + Math.random(), status: 'active', steps: [{ type: 'trigger', config: { kind: 'manual' } }, ...steps] }).workflow; return E.run(w.id, 'manual', vars ? { vars } : {}); };
  const ok = await run([step('audit')]);
  assert.strictEqual(ok.ok, true, JSON.stringify(ok));
  assert.strictEqual(calls[0].path, '/api/procedures/audit/run'); assert.deepStrictEqual(calls[0].body.chain, ['procedure:audit']); assert.strictEqual(calls[0].body.yes, false);
  const held = await run([step('hold')]);
  assert.strictEqual(held.ok, false); assert.match(held.error, /waits for your yes at: send the gig/);
  const loop = await run([step('audit')], { __pipelineChain: ['pipeline:x', 'procedure:audit'] });
  assert.strictEqual(loop.ok, false); assert.match(loop.error, /already running in this chain/);
  const deep = await run([step('audit')], { __pipelineChain: ['a', 'b', 'c', 'd', 'e'] });
  assert.strictEqual(deep.ok, false); assert.match(deep.error, /at most 5 deep/);
  const none = new AutomationEngine({});
  const w = none.create({ name: 'pc2-noport', status: 'active', steps: [{ type: 'trigger', config: { kind: 'manual' } }, step('audit')] }).workflow;
  const noport = await none.run(w.id); assert.strictEqual(noport.ok, false); assert.match(noport.error, /need Idearium/);
});

// 2026-11-08 — James: "API for anything. Agnostic remeber. Nexus systems, APIs from web services. Etc. http sockets etc"
await t('OA-09', 'one api step reaches http, ws, tcp and nexus://<system> (its address from the host), and names every failure', async () => {
  const http = require('http'), net = require('net'), { WebSocketServer } = require('ws');
  const listen = (srv) => new Promise(r => srv.listen(0, '127.0.0.1', () => r(srv.address().port)));
  const web = http.createServer((q, r) => { let b = ''; q.on('data', c => b += c); q.on('end', () => { r.setHeader('Content-Type', 'application/json'); r.end(JSON.stringify({ path: q.url, method: q.method, got: b })); }); });
  const wp = await listen(web);
  const wsHttp = http.createServer(); const wss = new WebSocketServer({ server: wsHttp }); wss.on('connection', (c) => c.on('message', (m) => { c.send(JSON.stringify({ echo: String(m) })); c.send('second'); }));
  const sp = await listen(wsHttp);
  const silentHttp = http.createServer(); const silent = new WebSocketServer({ server: silentHttp }); const qp = await listen(silentHttp);
  const tcp = net.createServer((c) => c.on('data', (d) => { c.end('echo:' + d); })); const tp = await listen(tcp);
  const { AutomationEngine } = require('../../lib/automation/engine.js');
  const E = new AutomationEngine({ resolveSystemFn: (name) => (name === 'idearium' ? `http://127.0.0.1:${wp}` : null) });
  const one = async (config) => { const w = E.create({ name: 'oa09-' + Math.random(), status: 'active', steps: [{ type: 'trigger', config: { kind: 'manual' } }, { type: 'api', config }] }).workflow;
    const r = await E.run(w.id); const run = r.run || {}; const steps = run.steps || run.results || []; return { r, out: (steps.find && steps.find(x => x.type === 'api') || {}).output, vars: r.vars }; };
  const h = await E._apiStep({ url: `http://127.0.0.1:${wp}/x`, method: 'POST', body: { a: 1 } });
  assert.strictEqual(h.output.body.path, '/x'); assert.strictEqual(h.output.body.method, 'POST');
  const n = await E._apiStep({ url: 'nexus://idearium/api/phases/next' });
  assert.strictEqual(n.output.body.path, '/api/phases/next', 'nexus:// resolved by the host');
  await assert.rejects(E._apiStep({ url: 'nexus://nowhere/x' }), /no address for that system/);
  const w = await E._apiStep({ url: `ws://127.0.0.1:${sp}`, body: 'hello', expect: 2 });
  assert.deepStrictEqual(w.output.messages, [{ echo: 'hello' }, 'second']);
  await assert.rejects(E._apiStep({ url: `ws://127.0.0.1:${qp}`, body: 'x', timeoutMs: 300 }), /no reply within 300 ms/);
  const c = await E._apiStep({ url: `tcp://127.0.0.1:${tp}`, body: 'ping' });
  assert.strictEqual(c.output.data, 'echo:ping');
  await assert.rejects(E._apiStep({ url: 'ftp://x' }), /takes http\(s\):\/\/, ws\(s\):\/\/, tcp/);
  const whole = await one({ url: `nexus://idearium/run-in-a-workflow` }); assert.strictEqual(whole.r.ok, true, JSON.stringify(whole.r).slice(0, 300));
  web.close(); wss.close(); wsHttp.close(); silent.close(); silentHttp.close(); tcp.close();
});

  console.log(`\n  ${p} passed, ${f} failed`);
  process.exitCode = f ? 1 : 0;
})();
