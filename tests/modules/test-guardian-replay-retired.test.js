'use strict';
/**
 * tests/modules/test-guardian-replay-retired.test.js — v0.39.237
 * The userscripts' IndexedDB "replay on connect" is retired. It re-sent every
 * window's pending records from an IndexedDB store shared by the whole origin,
 * and guardian's GUARDIAN_REPLAY case marked the named job complete with no
 * response. These tests run guardian's REAL ncp-handler: a replay naming a
 * live job must change nothing about it, and no shipped userscript may send one.
 */
const assert = require('assert'), fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..', '..');
const { createNCPMessageHandler } = require(path.join(ROOT, 'guardian/lib/ncp-handler.js'));
let passed = 0, failed = 0;
function test(id, d, fn) { try { fn(); console.log(`  \u2713 ${id} ${d}`); passed++; } catch (e) { console.error(`  \u2717 ${id} ${d}\n    ${e.message}`); failed++; } }

function makeHandler() {
  const jobs = new Map(), events = [], updates = [];
  const handler = createNCPMessageHandler({
    nc: null, ncp: { updateClient() {}, push() {}, handleHeartbeat() {} },
    bus: { emit: (type, data) => events.push({ type, data }) },
    jaa: { insert() {}, query: () => [] }, jobs,
    updateJob: (id, patch) => { updates.push({ id, patch }); const j = jobs.get(id); if (j) Object.assign(j, patch); return j; },
    cockpitBroadcast() {}, physQueue: { logConversation() {} }, baseline: { observe() {} }, evLedger: null,
    activeQueues: new Map(), extractCodeBlocks: () => [], extractToolCallsFromDOM: () => [], findActiveSeamCompartment: () => null,
  });
  return { handler, jobs, events, updates };
}

console.log('\n\u2B21  GUARDIAN_REPLAY retired\n');
for (const [id, msg] of [
  ['RR-01', { type: 'GUARDIAN_REPLAY', jobId: 'job-live', provider: 'chatgpt' }],
  ['RR-02', { type: 'GUARDIAN_REPLAY', uuid: 'job-live', status: 'pending', provider: 'chatgpt' }],   // the shape the userscript actually sent
]) {
  test(id, `a replay naming a live job (${msg.jobId ? 'jobId' : 'uuid'}) leaves it untouched and emits no completion`, () => {
    const { handler, jobs, events, updates } = makeHandler();
    jobs.set('job-live', { id: 'job-live', status: 'delivered', provider: 'chatgpt' });
    handler(msg);
    assert.strictEqual(jobs.get('job-live').status, 'delivered', `status changed to ${jobs.get('job-live').status}`);
    assert.ok(!events.some(e => e.type === 'guardian.job.complete'), 'guardian.job.complete emitted for a job that never returned');
    assert.strictEqual(updates.length, 0, 'the job was updated');
  });
}
test('RR-03', 'no shipped userscript sends GUARDIAN_REPLAY or still defines the replay', () => {
  const dir = path.join(ROOT, 'guardian');
  const scripts = fs.readdirSync(dir).filter(f => /^userscript-.*\.js$|\.user\.js$/.test(f));
  assert.ok(scripts.length >= 6, `only ${scripts.length} userscripts found`);
  const bad = scripts.filter(f => { const s = fs.readFileSync(path.join(dir, f), 'utf8'); return /GUARDIAN_REPLAY|replayPending/.test(s); });
  assert.deepStrictEqual(bad, []);
});
console.log(`\n  ${passed} passed \u00B7 ${failed} failed\n`);
process.exit(failed ? 1 : 0);
