'use strict';
const assert = require('assert');
const { buildFeedback, postFeedback } = require('../../guardian/lib/raid-feedback');
let p = 0, f = 0;
const t = (id, d, fn) => { try { fn(); console.log(`   ${id} ${d}`); p++; } catch (e) { console.error(`   ${id} ${d}\n    ${e.stack}`); f++; } };

t('RFB-001', 'carries BOTH shapes: cortex\'s {agent,outcome} and guardian\'s original {provider,ok,ms,cluster}', () => {
  const b = buildFeedback({ provider: 'claude', ok: true, ms: 1200 });
  assert.strictEqual(b.agent, 'claude'); assert.strictEqual(b.outcome, 'success');
  assert.strictEqual(b.provider, 'claude'); assert.strictEqual(b.ok, true); assert.strictEqual(b.ms, 1200); assert.strictEqual(b.cluster, 'seam');
});
t('RFB-002', 'failure vs needs_user are distinct: a login wall must not read as the agent failing', () => {
  assert.strictEqual(buildFeedback({ provider: 'claude', ok: false }).outcome, 'failure');
  const u = buildFeedback({ provider: 'claude', ok: false, needsUser: true });
  assert.strictEqual(u.outcome, 'needs_user'); assert.strictEqual(u.ok, false);
});
t('RFB-003', 'jobs the ladder never touched are reported as the userscript transport; ladder jobs carry transport/tier/stage/account', () => {
  assert.strictEqual(buildFeedback({ provider: 'gemini', ok: true, job: { id: 'j' } }).transport, 'ncp');
  const b = buildFeedback({ provider: 'claude', ok: true, job: { id: 'j2', transport: 'mesh', agentId: 'mesh-claude-work', accountId: 'work',
    transportTrail: [{ tier: 'mesh', stage: 'input_not_found' }, { tier: 'repair' }, { tier: 'mesh-retry', stage: null }] } });
  assert.deepStrictEqual([b.transport, b.tier, b.agentId, b.accountId, b.jobId], ['mesh', 'mesh-retry', 'mesh-claude-work', 'work', 'j2']);
});
t('RFB-004', 'fail-open: an unreachable cortex or a throwing request never throws into guardian', () => {
  postFeedback({ agent: 'x' }, { port: 1, timeoutMs: 50 });                       // nothing listening
  postFeedback({ agent: 'x' }, { request: () => { throw new Error('boom'); } });   // request itself explodes
});
t('RFB-005', 'posts to NEXUS_PORT, not a hardcoded 3748', () => {
  let seen; postFeedback({ a: 1 }, { port: 4242, request: (o) => { seen = o; return { on() {}, write() {}, end() {} }; } });
  assert.strictEqual(seen.port, 4242); assert.strictEqual(seen.path, '/api/raid/feedback');
});
console.log(`\n   ${p} passed, ${f} failed`); process.exit(f ? 1 : 0);
