'use strict';
/**
 * tests/modules/test-economy-guardian.test.js — 0.39.281 EC6. guardian's REAL dispatcher (createDispatcher) with the REAL
 * economy guard (guardian/lib/economy-guard.js) over a policy given in the test and the REAL ledger in a temp data
 * root: wait keeps the job queued with the reason; stop fails it with the reason; fallback moves it to the provider the
 * person configured (and that provider's own limits still apply); every completion / error / timeout / login wall
 * lands in the ledger with an estimated token count.
 */
require('../../lib/test-sandbox.js').ensure();
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { EventEmitter } = require('events');
const ROOT = path.resolve(__dirname, '..', '..');
process.env.NEXUS_DATA_ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'econ-g-'));
const { createDispatcher } = require(path.join(ROOT, 'guardian/lib/dispatcher.js'));
const { createEconomyGuard, jobTypeOf } = require(path.join(ROOT, 'guardian/lib/economy-guard.js'));
const P = require(path.join(ROOT, 'lib/economy/policy.js'));
const L = require(path.join(ROOT, 'lib/economy/ledger.js'));
let passed = 0, failed = 0;
async function t(id, name, fn) { try { await fn(); passed++; console.log(`  ✓ ${id} ${name}`); } catch (e) { failed++; console.log(`  ✗ ${id} ${name}\n    ${e && e.stack ? e.stack.split('\n').slice(0, 3).join('\n    ') : e}`); } }

(async () => {
  console.log('\n  test-economy-guardian.test.js');
  const policy = P.normalize({ providers: {
    chatgpt: { limits: { minGapMs: 60000, jobsPerHour: 0 } },
    claude: { limits: { jobsPerDay: 1 }, onLimit: 'fallback:gemini' },
    gemini: { enabled: false, onLimit: 'stop' },
    deepseek: { limits: { jobsPerDay: 1 }, onLimit: 'stop' } } }, ['chatgpt', 'claude', 'gemini', 'deepseek']).policy;
  const guard = createEconomyGuard({ policy: () => policy });
  const bus = new EventEmitter();
  const jobs = new Map();
  const updateJob = (id, patch) => { const j = jobs.get(id); if (!j) return null; Object.assign(j, patch); return j; };
  const d = createDispatcher({ updateJob, bus, ncp: { push: () => 0, isConnected: () => false, clients: () => [] }, pendingQueue: new Map(), cockpitBroadcast: () => {},
    dispatchToMistral: async () => {}, dispatchToDeepseek: async () => {}, economy: guard });
  const errs = []; bus.on('guardian.job.error', (e) => errs.push(e));
  const waits = []; bus.on('guardian.economy.wait', (e) => waits.push(e));
  const moves = []; bus.on('guardian.economy.fallback', (e) => moves.push(e));
  const job = (id, provider, extra = {}) => { const j = { id, provider, prompt: 'hello world '.repeat(50), status: 'pending', ts: Date.now(), ...extra }; jobs.set(id, j); return j; };

  await t('EC6-01', 'wait: a job inside the gap between jobs stays queued with the reason (not sent)', () => {
    L.record({ provider: 'chatgpt', outcome: 'ok', at: Date.now() - 1000 });
    d.dispatchJob(job('w1', 'chatgpt'));
    assert.strictEqual(jobs.get('w1').status, 'queued');
    assert.match(jobs.get('w1').queueReason, /^economy: chatgpt: \d+s left of the 60s gap/);
    assert.strictEqual(waits[0].jobId, 'w1');
  });
  await t('EC6-02', 'stop: over the day\'s limit → failed with the reason, said on the bus', () => {
    L.record({ provider: 'deepseek', outcome: 'ok', at: Date.now() - 1000 });
    d.dispatchJob(job('s1', 'deepseek'));
    assert.deepStrictEqual([jobs.get('s1').status, /economy: deepseek: 1\/1 jobs today/.test(jobs.get('s1').failReason)], ['failed', true]);
    assert.ok(errs.some(e => e.jobId === 's1' && /economy:/.test(e.error)));
  });
  await t('EC6-03', 'fallback: only as the person configured (claude → gemini), said on the job and bus — and gemini\'s own limits still apply (off → stop)', () => {
    L.record({ provider: 'claude', outcome: 'ok', at: Date.now() - 1000 });
    d.dispatchJob(job('f1', 'claude'));
    const j = jobs.get('f1');
    assert.deepStrictEqual([j.economyFallback.from, j.economyFallback.to], ['claude', 'gemini']);
    assert.match(j.economyFallback.reason, /set by you/);
    assert.strictEqual(moves[0].to, 'gemini');
    assert.deepStrictEqual([j.provider, j.status], ['gemini', 'failed']);
    assert.match(j.failReason, /gemini is switched off/);
  });
  await t('EC6-04', 'the ledger hears completions, errors, timeouts and login walls, with estimated tokens and job type', () => {
    guard.attach(bus, (id) => jobs.get(id));
    const c = job('c1', 'chatgpt', { source: 'idearium-chunk-build', response: 'x '.repeat(100), dispatchedAt: Date.now() - 5000 });
    bus.emit('guardian.job.complete', { jobId: 'c1' });
    job('e1', 'claude'); bus.emit('guardian.job.error', { jobId: 'e1', error: 'claude needs you to sign in' });
    job('t1', 'chatgpt'); bus.emit('guardian.job.timeout', { jobId: 't1', reason: 'no completion' });
    bus.emit('guardian.provider.login_required', { provider: 'chatgpt', text: 'Log in' });
    const rows = L.records({ since: Date.now() - 60000 });
    const ok = rows.find(r => r.jobId === 'c1');
    assert.deepStrictEqual([ok.outcome, ok.jobType, ok.tokenMethod, ok.tokensIn > 100, ok.tokensOut > 50, ok.ms >= 5000], ['ok', 'build', 'estimate-v1', true, true, true]);
    assert.strictEqual(rows.find(r => r.jobId === 'e1').outcome, 'login');
    assert.strictEqual(rows.find(r => r.jobId === 't1').outcome, 'timeout');
    assert.ok(rows.some(r => r.provider === 'chatgpt' && r.outcome === 'login' && !r.jobId));
    assert.deepStrictEqual([jobTypeOf({ wakeDepth: 1 }), jobTypeOf({ source: 'copilot' }), jobTypeOf({ jobType: 'heal' })], ['wake', 'chat', 'heal']);
  });
  await t('EC6-05', 'guardian serves the economy: GET/POST /api/economy, usage, limits, routing (source check: one writer, the guard wired)', () => {
    const s = fs.readFileSync(path.join(ROOT, 'guardian/server.js'), 'utf8');
    for (const r of ["url.pathname === '/api/economy' && method === 'GET'", "url.pathname === '/api/economy' && method === 'POST'", "'/api/economy/usage'", "'/api/economy/limits'", "'/api/economy/routing'"]) assert.ok(s.includes(r), r);
    assert.match(s, /economy: _economyGuard/); assert.match(s, /_economyGuard\.attach\(bus/);
    assert.match(s, /require\('\.\.\/lib\/economy\/store\.js'\)\.save\(/);
  });
  console.log(`\n  ${passed} passed, ${failed} failed\n`);
  process.exit(failed ? 1 : 0);
})().catch(e => { console.log('  ! crashed:', e && e.stack || e); process.exit(1); });
