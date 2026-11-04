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
const A = require('../../orchestrator/automation/index.js');

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

  console.log(`\n  ${p} passed, ${f} failed`);
  process.exitCode = f ? 1 : 0;
})();
