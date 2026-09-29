'use strict';
/**
 * tests/modules/test-economy.test.js — 0.39.281, docs/2026-09-29-provider-economy-phasemap.spec.
 *   EC0 policy · EC1 ledger (real files in a temp data root) · EC2 gate · EC3 tokens · EC4 router
 *   (EC5, EC9 cases are appended as those phases land)
 */
require('../../lib/test-sandbox.js').ensure();
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const ROOT = path.resolve(__dirname, '..', '..');
process.env.NEXUS_DATA_ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'economy-'));
const P = require(path.join(ROOT, 'lib/economy/policy.js'));
const L = require(path.join(ROOT, 'lib/economy/ledger.js'));
const G = require(path.join(ROOT, 'lib/economy/gate.js'));
const T = require(path.join(ROOT, 'lib/economy/tokens.js'));
const R = require(path.join(ROOT, 'lib/economy/router.js'));
let passed = 0, failed = 0;
async function t(id, name, fn) { try { await fn(); passed++; console.log(`  ✓ ${id} ${name}`); } catch (e) { failed++; console.log(`  ✗ ${id} ${name}\n    ${e && e.stack ? e.stack.split('\n').slice(0, 3).join('\n    ') : e}`); } }
function seeded(seed = 7) { let s = seed; return () => { s = (s * 1103515245 + 12345) % 2147483648; return s / 2147483648; }; }

(async () => {
  console.log('\n  test-economy.test.js');
  await t('EC0-01', 'defaults: ollama local and unlimited; a browser account is subscription with conservative limits; every job type has tiers', () => {
    const d = P.defaults(['ollama', 'chatgpt', 'claude']);
    assert.deepStrictEqual([d.providers.ollama.tier, d.providers.ollama.limits.jobsPerHour], ['local', 0]);
    assert.deepStrictEqual([d.providers.chatgpt.tier, d.providers.chatgpt.limits.jobsPerHour, d.providers.chatgpt.limits.minGapMs, d.providers.chatgpt.onLimit], ['subscription', 30, 15000, 'wait']);
    assert.deepStrictEqual(Object.keys(d.jobTypes).sort(), [...P.JOB_TYPES].sort());
    assert.deepStrictEqual(d.stageTiers, ['local']);
  });
  await t('EC0-02', 'normalize bounds values, resets limits to the new tier\'s defaults on a tier change, and names what it dropped', () => {
    const { policy, dropped } = P.normalize({ providers: { chatgpt: { tier: 'metered', limits: { jobsPerHour: 999999999, minGapMs: 'x' }, quietHours: [23, 7], onLimit: 'fallback:ollama' }, 'BAD NAME': {} },
      jobTypes: { build: { tiers: ['local', 'bogus'] }, dance: {} }, router: { explore: 5 } }, ['chatgpt', 'ollama']);
    const c = policy.providers.chatgpt;
    assert.deepStrictEqual([c.tier, c.limits.jobsPerHour, c.limits.concurrent, c.quietHours, c.onLimit], ['metered', 100000, 4, [23, 7], 'fallback:ollama']);
    assert.deepStrictEqual(policy.jobTypes.build.tiers, ['local']);
    assert.strictEqual(policy.router.explore, 1);
    assert.deepStrictEqual(dropped.sort(), ['jobTypes.dance', 'providers.BAD NAME', 'providers.chatgpt.limits.minGapMs'].sort());
    const m = P.merge(policy, { providers: { chatgpt: { limits: { jobsPerDay: 10 } } } }, ['chatgpt']);
    assert.deepStrictEqual([m.policy.providers.chatgpt.limits.jobsPerDay, m.policy.providers.chatgpt.limits.jobsPerHour], [10, 100000], 'an edit keeps the rest');
  });

  await t('EC1-01', 'the ledger appends one line per job to a dated file; records and usage read it back; in-flight counted', () => {
    const now = Date.now();
    L.begin('chatgpt', 'j1');
    assert.strictEqual(L.usage('chatgpt', now).inFlight, 1);
    const r = L.record({ provider: 'chatgpt', jobType: 'build', jobId: 'j1', tokensIn: 1200, tokensOut: 800, ms: 30000, outcome: 'ok', at: now - 1000 });
    assert.ok(r.ok);
    L.record({ provider: 'chatgpt', jobType: 'build', tokensIn: 50, outcome: 'refused', at: now - 500 });
    L.record({ provider: 'ollama', outcome: 'weird', at: now - 2 * 3600000 });
    const u = L.usage('chatgpt', now);
    assert.deepStrictEqual([u.lastHour, u.lastDay, u.tokensDay, u.inFlight], [1, 1, 2000, 0], 'refused rows are not usage; the finished job left in-flight');
    assert.strictEqual(L.records({ provider: 'ollama' })[0].outcome, 'failed', 'an unknown outcome is recorded as failed, not dropped');
    assert.ok(fs.readdirSync(L.dir()).some(f => /^usage-\d{4}-\d{2}-\d{2}\.jsonl$/.test(f)));
  });

  const pol = P.normalize({ providers: { chatgpt: { limits: { jobsPerHour: 2, jobsPerDay: 3, tokensPerDay: 5000, minGapMs: 10000, concurrent: 1 } }, claude: { onLimit: 'fallback:chatgpt', limits: { jobsPerHour: 1 } }, gemini: { enabled: false, onLimit: 'stop' } },
    jobTypes: { heal: { tiers: ['local'] } } }, ['chatgpt', 'claude', 'gemini', 'ollama']).policy;
  await t('EC2-01', 'the gate: allow, wait (gap, hour, concurrency, quiet hours), stop (day, tokens, disabled, tier), fallback only as configured', () => {
    const now = new Date(2026, 8, 29, 12, 0, 0).getTime();
    const d = (provider, usage, extra = {}) => G.decide({ provider, jobType: extra.jobType || 'build', estTokens: extra.est || 0 }, { policy: extra.policy || pol, usage, now });
    assert.strictEqual(d('chatgpt', {}).verdict, 'allow');
    const gap = d('chatgpt', { lastAt: now - 4000 }); assert.deepStrictEqual([gap.verdict, gap.ms], ['wait', 6000]); assert.match(gap.reason, /6s left of the 10s gap/);
    assert.strictEqual(d('chatgpt', { lastHour: 2 }).verdict, 'wait');
    assert.strictEqual(d('chatgpt', { inFlight: 1 }).verdict, 'wait');
    const day = d('chatgpt', { lastDay: 3 }); assert.deepStrictEqual([day.verdict], ['stop']); assert.match(day.reason, /3\/3 jobs today/);
    assert.strictEqual(d('chatgpt', { tokensDay: 4900 }, { est: 200 }).verdict, 'stop');
    const fb = d('claude', { lastHour: 1 }); assert.deepStrictEqual([fb.verdict, fb.provider], ['fallback', 'chatgpt']); assert.match(fb.reason, /set by you/);
    assert.strictEqual(d('gemini', {}).verdict, 'stop');
    assert.match(d('chatgpt', {}, { jobType: 'heal' }).reason, /heal jobs may not use subscription providers/);
    assert.strictEqual(d('unknown', {}).verdict, 'allow');
    const q = JSON.parse(JSON.stringify(pol)); q.providers.chatgpt.quietHours = [22, 7];
    const night = new Date(2026, 8, 29, 23, 30).getTime();
    const qr = G.decide({ provider: 'chatgpt', jobType: 'build' }, { policy: q, usage: {}, now: night });
    assert.strictEqual(qr.verdict, 'wait'); assert.ok(qr.ms > 7 * 3600000 && qr.ms <= 8 * 3600000, `until 7:00 (${qr.ms})`);
    assert.strictEqual(G.decide({ provider: 'chatgpt', jobType: 'build' }, { policy: q, usage: {}, now }).verdict, 'allow', 'noon is not quiet');
  });

  await t('EC3-01', 'estimate: prose ~ chars/4, code denser; learn: a safe limit below the smallest failure, with its basis and confidence; split under a limit, fences kept whole', () => {
    const prose = 'The quick brown fox jumps over the lazy dog. '.repeat(20);
    const e = T.estimate(prose); assert.ok(e > 150 && e < 320, `prose ${e}`);
    assert.ok(T.estimate('a.b(c[d]);{}') >= 10, 'symbols ~1 each');
    const recs = [...Array.from({ length: 8 }, (_, i) => ({ provider: 'chatgpt', tokensIn: 2000 + i * 1000, outcome: 'ok' })), { provider: 'chatgpt', tokensIn: 14000, outcome: 'truncated' }, { provider: 'chatgpt', tokensIn: 20000, outcome: 'failed' }, { provider: 'claude', tokensIn: 3000, outcome: 'ok' }];
    const l = T.learn(recs);
    assert.deepStrictEqual([l.chatgpt.maxOk, l.chatgpt.minBad, l.chatgpt.safeLimit, l.chatgpt.records, l.chatgpt.confidence], [9000, 14000, 10500, 10, 'medium']);
    assert.match(l.chatgpt.basis, /below the smallest failed input \(14000\)/);
    assert.deepStrictEqual([l.claude.safeLimit, /no failure seen/.test(l.claude.basis)], [null, true]);
    assert.strictEqual(T.series(recs).chatgpt.length, 10);
    const doc = ['intro paragraph words '.repeat(30), '```js\n' + 'const x = 1;\n'.repeat(20) + '```', 'outro words '.repeat(30)].join('\n\n');
    const parts = T.split(doc, 150);
    assert.ok(parts.length >= 2 && parts.every(p => T.estimate(p) <= 150 || !/\n\n/.test(p)));
    assert.ok(parts.some(p => /```js[\s\S]*```/.test(p)), 'the fence stays in one chunk when it fits');
    assert.strictEqual(parts.join('\n\n').replace(/\s+/g, ' ').length, doc.replace(/\s+/g, ' ').length, 'nothing lost');
  });

  await t('EC4-01', 'the router learns: a provider that fails loses to one that works; cost counts; few records explore; only allowed providers; it says why', () => {
    const recs = [];
    for (let i = 0; i < 30; i++) recs.push({ provider: 'chatgpt', jobType: 'build', outcome: i < 27 ? 'ok' : 'failed', ms: 40000 });
    for (let i = 0; i < 30; i++) recs.push({ provider: 'claude', jobType: 'build', outcome: i < 12 ? 'ok' : 'truncated', ms: 40000 });
    const polr = P.defaults(['chatgpt', 'claude', 'ollama']);
    let wins = { chatgpt: 0, claude: 0 };
    const rand = seeded(11);
    for (let i = 0; i < 200; i++) wins[R.choose('build', ['chatgpt', 'claude'], { policy: polr, records: recs, rand }).provider]++;
    assert.ok(wins.chatgpt > 180, JSON.stringify(wins));
    const s = R.scores(recs, polr)['build::claude'];
    assert.deepStrictEqual([s.ok, s.bad, s.records, s.tier], [12, 18, 30, 'subscription']);
    const c = R.choose('build', ['chatgpt', 'claude'], { policy: polr, records: recs, rand: seeded(3), allowed: (p) => p !== 'chatgpt' });
    assert.strictEqual(c.provider, 'claude');
    assert.ok(c.table.find(r => r.provider === 'chatgpt').skipped);
    assert.match(c.why, /build: claude drew/);
    const none = R.choose('build', ['chatgpt'], { policy: polr, records: recs, allowed: () => false });
    assert.strictEqual(none.provider, null);
    // a new provider with no records still gets tried sometimes (exploration)
    let tried = 0; const r2 = seeded(5);
    for (let i = 0; i < 300; i++) if (R.choose('build', ['chatgpt', 'gemini'], { policy: polr, records: recs, rand: r2 }).provider === 'gemini') tried++;
    assert.ok(tried > 5 && tried < 200, `explored ${tried}/300`);
  });

  if (fs.existsSync(path.join(__dirname, 'test-economy.more.js'))) await require('./test-economy.more.js')({ t, ROOT, assert });
  console.log(`\n  ${passed} passed, ${failed} failed\n`);
  process.exit(failed ? 1 : 0);
})().catch(e => { console.log('  ! crashed:', e && e.stack || e); process.exit(1); });
