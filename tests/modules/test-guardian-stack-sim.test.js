'use strict';
/**
 * tests/modules/test-guardian-stack-sim.test.js — §HP13–HP22 0.55.2 (docs/2026-10-09-hardening-pass-phasemap.spec).
 * James: "loop simulations of every deep and drecursive test and debug method you can for idearium and the agents.
 * fix the biggest most structural problems you can, bottom up."
 *
 * Each case is a failure found by running guardian, copilot and Idearium with tests/sim/fake-tab.js, proven here
 * against guardian's and lib's real modules (dispatcher, gate-trail, ask, pipeline-routing, model-door, the economy
 * ledger) with only the transport faked.
 */
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

let passed = 0, failed = 0;
async function test(id, desc, fn) {
  try { await fn(); console.log(`  ✓ ${id} ${desc}`); passed++; }
  catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${e.stack}`); failed++; }
}
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function makeBus() {
  const listeners = new Map(), emitted = [];
  return {
    emitted,
    emit: (name, payload) => { emitted.push({ name, payload }); for (const fn of [...(listeners.get(name) || [])]) fn({ type: name, data: payload }); },   // guardian's SISOStream shape
    on: (name, fn) => { if (!listeners.has(name)) listeners.set(name, new Set()); listeners.get(name).add(fn); },
    off: (name, fn) => { listeners.get(name)?.delete(fn); },
  };
}
function makeDispatcher({ pickupMs = 60, completionTimeoutMs = 60000, pushReturns = 1 } = {}) {
  const { createDispatcher } = require('../../guardian/lib/dispatcher.js');
  const jobs = new Map(), bus = makeBus(), pendingQueue = new Map(), pushed = [];
  const updateJob = (id, patch) => { const j = jobs.get(id); if (!j) return null; Object.assign(j, patch); return j; };
  const d = createDispatcher({
    updateJob, bus, pendingQueue, cockpitBroadcast: () => {},
    ncp: { isConnected: () => true, push: () => pushReturns, pushActive: (p, payload) => { pushed.push(payload); return pushReturns; } },
    dispatchToMistral: () => Promise.resolve(), dispatchToDeepseek: () => Promise.resolve(),
    pingTimeoutMs: 10, pickupMs, completionTimeoutMs, getJob: (id) => jobs.get(id),
  });
  return { d, jobs, bus, pendingQueue, pushed, add: (j) => { jobs.set(j.id, { status: 'pending', ...j }); return jobs.get(j.id); } };
}

async function main() {
  const G = require('../../guardian/lib/gate-trail.js');

  await test('GS-01', 'HP13 — a userscript\'s generic "handleJob" gate is put at the gate its error names, not "tab busy"', async () => {
    let t = G.apply([], 'guardian.job.created').trail;
    t = G.apply(t, 'guardian.job.dispatched', {}).trail;
    t = G.apply(t, 'guardian.job.error', { gate: 'handleJob', error: 'handleJob: Input not found — no contenteditable' }).trail;
    const d = G.describe(t, { provider: 'chatgpt' });
    assert.strictEqual(d.gate, 'submit', d.sentence);
    assert.ok(!/still answering another job/.test(d.sentence), d.sentence);
    assert.strictEqual(G.gateOfError('handleJob', 'handleJob: no reply element found — findResponseEl() matched nothing'), 'reply');
    assert.strictEqual(G.gateOfError('tab_busy', ''), 'accept');
  });

  await test('GS-02', 'HP14 — a tab that never touches the job fails at "tab takes the job" within the pickup window; its slot is freed', async () => {
    const { d, add, jobs, bus } = makeDispatcher({ pickupMs: 60 });
    add({ id: 'j-silent', provider: 'chatgpt', command: 'ask', prompt: 'hi' });
    await d._doDispatch(jobs.get('j-silent'));
    assert.strictEqual(jobs.get('j-silent').status, 'delivered');
    await sleep(120);
    const j = jobs.get('j-silent');
    assert.strictEqual(j.status, 'failed');
    assert.ok(/did nothing with it/.test(j.failReason), j.failReason);
    const err = bus.emitted.find(e => e.name === 'guardian.job.error' && e.payload.jobId === 'j-silent');
    assert.ok(err && err.payload.gate === 'pickup', 'a guardian.job.error with gate pickup');
  });

  await test('GS-03', 'HP14 — the tab saying "accepted" clears the pickup watch; the gate trail shows the job taken', async () => {
    const { d, add, jobs, bus } = makeDispatcher({ pickupMs: 60 });
    add({ id: 'j-ok', provider: 'chatgpt', command: 'ask', prompt: 'hi' });
    await d._doDispatch(jobs.get('j-ok'));
    bus.emit('guardian.job.progress', { jobId: 'j-ok', provider: 'chatgpt', stage: 'accepted' });
    await sleep(120);
    assert.strictEqual(jobs.get('j-ok').status, 'delivered');
    let t = G.apply([], 'guardian.job.dispatched', {}).trail;
    t = G.apply(t, 'guardian.job.progress', { stage: 'accepted' }).trail;
    assert.ok(t.some(e => e.gate === 'accept' && e.state === 'passed' && !e.implied));
  });

  await test('GS-04', 'HP15 — an idle-out of a typed job waits for the transcript and is never sent again; an untyped one is requeued', async () => {
    process.env.GUARDIAN_EMPTY_REPLY_GRACE_MS = '50';
    const { d, add, jobs, pushed, bus } = makeDispatcher({ pickupMs: 5000, completionTimeoutMs: 40 });
    add({ id: 'j-typed', provider: 'chatgpt', command: 'ask', prompt: 'hi' });
    await d._doDispatch(jobs.get('j-typed'));
    Object.assign(jobs.get('j-typed'), { status: 'delivered_confirmed', confirmedAt: Date.now() });
    bus.emit('guardian.job.confirmed', { jobId: 'j-typed' });
    await sleep(70);
    assert.strictEqual(jobs.get('j-typed').status, 'awaiting_transcript');
    await sleep(80);
    assert.strictEqual(jobs.get('j-typed').status, 'failed');
    assert.ok(/not sent again/.test(jobs.get('j-typed').failReason));
    assert.strictEqual(pushed.filter(p => p.jobId === 'j-typed').length, 1, 'sent once, never twice');

    const u = makeDispatcher({ pickupMs: 5000, completionTimeoutMs: 40 });
    u.add({ id: 'j-untyped', provider: 'chatgpt', command: 'ask', prompt: 'hi' });
    await u.d._doDispatch(u.jobs.get('j-untyped'));
    await sleep(70);
    assert.strictEqual(u.jobs.get('j-untyped').status, 'queued');
    assert.ok((u.pendingQueue.get('chatgpt') || []).some(j => j.id === 'j-untyped'));
    delete process.env.GUARDIAN_EMPTY_REPLY_GRACE_MS;
  });

  await test('GS-05', 'HP16 — a cancelled job leaves every queue and is never sent, even when its provider reconnects', async () => {
    const { d, add, jobs, pendingQueue, pushed } = makeDispatcher();
    const j = add({ id: 'j-gone', provider: 'chatgpt', command: 'ask', prompt: 'hi', status: 'queued' });
    pendingQueue.set('chatgpt', [j]);
    assert.ok(d.cancel('j-gone', 'nobody waits').ok);
    assert.strictEqual(jobs.get('j-gone').status, 'cancelled');
    assert.ok(!pendingQueue.has('chatgpt'));
    d.dispatchJob(jobs.get('j-gone'));
    assert.strictEqual(await d._doDispatch(jobs.get('j-gone')), false);
    assert.strictEqual(pushed.length, 0);
    assert.strictEqual(d.cancel('j-gone').ok, false, 'a second cancel is a no-op');
  });

  await test('GS-06', 'HP16/HP17 — askSync gives up on a missing tab in the no-tab window, says so, and cancels the job', async () => {
    process.env.GUARDIAN_NO_TAB_MS = '30';
    delete require.cache[require.resolve('../../guardian/ask.js')];
    const { askSync } = require('../../guardian/ask.js');
    const jobs = new Map(), cancelled = [];
    const r = await askSync('hello', { provider: 'chatgpt', agentId: 'repo-x', timeoutMs: 5000 }, {
      createJob: (o) => { const j = { id: 'j-notab', status: 'queued', ...o }; jobs.set(j.id, j); return j; },
      dispatchJob: () => {}, getJob: (id) => jobs.get(id), isProviderConnected: () => false,
      cancelJob: (id, why) => { cancelled.push({ id, why }); jobs.get(id).status = 'cancelled'; return { ok: true }; },
    });
    assert.strictEqual(r.ok, false);
    assert.ok(/not connected — no chatgpt tab open/.test(r.error), r.error);
    assert.ok(!/sign in/.test(r.error), 'never "sign in" — the routing classes read that as a login wall (HP22)');
    assert.strictEqual(cancelled[0] && cancelled[0].id, 'j-notab');
    delete process.env.GUARDIAN_NO_TAB_MS;
  });

  await test('GS-07', 'HP21 — an economy hold longer than the caller will wait is said at once with the limit, and the job cancelled', async () => {
    delete require.cache[require.resolve('../../guardian/ask.js')];
    const { askSync } = require('../../guardian/ask.js');
    const jobs = new Map(), cancelled = [];
    const t0 = Date.now();
    const r = await askSync('hello', { provider: 'chatgpt', agentId: 'repo-x', timeoutMs: 20000 }, {
      createJob: (o) => { const j = { id: 'j-econ', status: 'queued', queueReason: 'economy: chatgpt: 30/30 jobs in the last hour', economyWaitUntil: Date.now() + 300000, ...o }; jobs.set(j.id, j); return j; },
      dispatchJob: () => {}, getJob: (id) => jobs.get(id), isProviderConnected: () => true,
      cancelJob: (id) => { cancelled.push(id); jobs.get(id).status = 'cancelled'; return { ok: true }; },
    });
    assert.ok(Date.now() - t0 < 5000, 'not waited out');
    assert.ok(/economy: chatgpt is at its limit \(chatgpt: 30\/30 jobs in the last hour\)/.test(r.error), r.error);
    assert.deepStrictEqual(cancelled, ['j-econ']);
    let t = G.apply([], 'guardian.job.created').trail;
    t = G.apply(t, 'guardian.economy.wait', { reason: 'chatgpt: 30/30 jobs in the last hour', ms: 300000 }).trail;
    const d = G.describe(t, { provider: 'chatgpt' });
    assert.ok(/economy: chatgpt: 30\/30/.test(d.sentence) && /Settings → economy/.test(d.fix), d.sentence);
  });

  await test('GS-08', 'HP18 — a browser agent with no tab goes behind the ones that have one, said; Ollama is never moved by tabs', async () => {
    const PR = require('../../lib/pipeline-routing.js');
    const D = require('../../lib/model-door.js');
    const tabs = { chatgpt: 'connected', gemini: 'null', ollama: 'null' };
    const t = PR.byTabs([{ base: 'ollama', provider: 'ollama:q' }, { base: 'gemini', provider: 'gemini' }, { base: 'chatgpt', provider: 'chatgpt' }], tabs, r => r.base);
    assert.deepStrictEqual(t.order.map(r => r.provider), ['ollama:q', 'chatgpt', 'gemini']);
    assert.ok(/no gemini tab open/.test(t.moved[0].why));
    assert.deepStrictEqual(PR.byTabs([{ base: 'gemini' }], null, r => r.base).moved, [], 'guardian silent → order unchanged');
    const r = D.route({ kind: 'agent:chat', block: { agent: 'gemini', fallback: ['chatgpt'] } }, { resolve: (b) => (b === 'ollama' ? { backend: 'ollama' } : { backend: 'guardian', agent: b }), tabs });
    const ps = r.route.map(h => h.provider);
    assert.ok(ps.indexOf('chatgpt') < ps.indexOf('gemini'), ps.join(','));
  });

  await test('GS-09', 'HP20 — a routing hop\'s record is learning, not use: it never moves the gap clock or the counts', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-econ-'));
    const prev = process.env.NEXUS_DATA_ROOT; process.env.NEXUS_DATA_ROOT = dir;
    try {
      const L = require('../../lib/economy/ledger.js');
      const PR = require('../../lib/pipeline-routing.js');
      const now = Date.now();
      L.record({ provider: 'chatgpt', jobType: 'chat', jobId: 'real-1', outcome: 'ok', at: now - 60000 });
      PR.recordHop({ provider: 'chatgpt', jobType: 'build:chunk', outcome: 'failed', class: 'unknown' });
      const u = L.usage('chatgpt', Date.now());
      assert.strictEqual(u.lastHour, 1);
      assert.ok(Math.abs(u.lastAt - (now - 60000)) < 5, 'the gap clock reads the real job, not the hop');
      assert.ok(L.records({ provider: 'chatgpt' }).some(r => r.kind === 'route'), 'the hop is still recorded for the learned order');
    } finally { if (prev === undefined) delete process.env.NEXUS_DATA_ROOT; else process.env.NEXUS_DATA_ROOT = prev; }
  });

  await test('GS-10', 'HP22 — "not connected / no tab open" is provider-down even with advice after it; a real login wall is still login', async () => {
    const PR = require('../../lib/pipeline-routing.js');
    assert.strictEqual(PR.classify({ ok: false, error: 'not connected — no chatgpt tab open in guardian for 45 s: open chatgpt in Clear Glass, signed in' }), 'provider-down');
    assert.strictEqual(PR.classify({ ok: false, error: 'waiting at gate 2/8 "provider tab" (gemini): no gemini tab free yet — open the provider in Clear Glass (or your browser with its Guardian userscript), signed in' }), 'provider-down');
    assert.strictEqual(PR.classify({ ok: false, error: 'please log in to continue' }), 'login');
  });

  await test('GS-11', 'HP14 — all five userscripts say "accepted" the moment a job reaches them; the fake tab is kept', async () => {
    for (const p of ['chatgpt', 'claude', 'gemini', 'deepseek', 'perplexity']) {
      const src = fs.readFileSync(path.join(__dirname, '..', '..', 'guardian', `userscript-${p}.js`), 'utf8');
      const c = src.slice(src.indexOf("case 'GUARDIAN_JOB'"));
      assert.ok(/stage:'accepted'/.test(c.slice(0, c.indexOf('handleJob(msg)'))), `${p}: accepted before handleJob`);
    }
    assert.ok(fs.existsSync(path.join(__dirname, '..', 'sim', 'fake-tab.js')));
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}
main();
