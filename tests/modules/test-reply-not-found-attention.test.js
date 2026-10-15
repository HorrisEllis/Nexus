'use strict';
/**
 * tests/modules/test-reply-not-found-attention.test.js — 0.60.47: a reply that cannot be found opens the agent's window.
 * guardian/lib/job-retry.js onError (pick-reply) · guardian/server.js wiring.
 * James (2026-10-15): "Claude's reply not found … it should have poped up with the claude window but didint." His log:
 * "job 119a854e — needs-you (claude's page changed: the reply could not be found on it — pick the reply …)" and no
 * "[attention] claude" after it.
 *
 *   RA-01  a reply that cannot be found (and is in no transcript or .response): the person is asked — attention with
 *          the provider, reason 'map', the job, the agent — and the job says so, as before
 *   RA-02  an answer that already exists is used instead: nobody is bothered
 *   RA-03  wired: Guardian hands job-retry its provider-attention raise
 */
require('../../lib/test-sandbox.js').ensure();
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '../..');
const { createJobRetry } = require(path.join(ROOT, 'guardian/lib/job-retry.js'));

let passed = 0, failed = 0;
function test(id, desc, fn) { try { fn(); console.log(`  ✓ ${id} ${desc}`); passed++; } catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${e.stack.split('\n').slice(0, 5).join('\n    ')}`); failed++; } }
const harness = ({ reply = null } = {}) => {
  const jobs = new Map([['j1', { id: 'j1', provider: 'claude', agentId: 'repo-x', status: 'dispatched', attempts: [] }]]);
  const asked = [], done = [];
  const R = createJobRetry({ jobs, updateJob: (id, p) => { jobs.set(id, { ...jobs.get(id), ...p }); return jobs.get(id); }, bus: { emit() {} },
    dispatchJob() {}, complete: (job, text) => done.push(text), replyFor: () => reply, log: { log() {}, warn() {} },
    attention: (rec) => { asked.push(rec); return Promise.resolve({ sent: true }); }, setTimer: () => 0 });
  return { R, jobs, asked, done };
};

console.log('\ntest-reply-not-found-attention — a reply that cannot be found opens the window (0.60.47)');
test('RA-01', 'the reply cannot be found: the agent\'s window is asked for, and the job says so', () => {
  const { R, jobs, asked } = harness();
  const r = R.onError('j1', { gate: 'reply', error: 'no reply element after 16s', provider: 'claude' });
  assert.strictEqual(r.kind, 'pick-reply');
  assert.strictEqual(asked.length, 1, 'asked once');
  assert.deepStrictEqual([asked[0].provider, asked[0].reason, asked[0].jobId, asked[0].agentId, asked[0].stage], ['claude', 'map', 'j1', 'repo-x', 'reply_not_found']);
  assert.match(jobs.get('j1').needsYou, /pick the reply/);
});
test('RA-02', 'an answer that already exists is used: nobody is bothered', () => {
  const { R, asked, done } = harness({ reply: { text: 'the answer', chatUrl: 'https://claude.ai/chat/1' } });
  const r = R.onError('j1', { gate: 'reply', error: 'no reply element after 16s', provider: 'claude' });
  assert.ok(r.handled && r.answered); assert.strictEqual(asked.length, 0); assert.deepStrictEqual(done, ['the answer']);
});
test('RA-03', 'wired: Guardian hands job-retry its attention raise', () => {
  const s = fs.readFileSync(path.join(ROOT, 'guardian/server.js'), 'utf8');
  assert.ok(s.includes("attention: (rec) => _providerAttention().raise(rec),"));
});
console.log(`\n  ${passed} passed, ${failed} failed`);
process.exitCode = failed ? 1 : 0;
