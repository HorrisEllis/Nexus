'use strict';
/**
 * tests/modules/test-stream-fallback.test.js — the stream as a fallback route (0.60.191).
 * Map: docs/2026-09-26-guardian-retry-novelty-and-installs-phasemap.spec (R1, invariant I1 — addendum 2026-10-21).
 * James, 2026-10-21: "im saying to use those as fallback routes. node anchor, dom mutator. I love the way idearium tabs are and way it
 * shows me whats being said from the agents in real time."
 *
 *   SF-01  the DOM mutator's chunks keep the reply so far in the job's .response node as 'partial', with its node anchor; throttled;
 *          never written over a 'complete' node
 *   SF-02  the page stops generating: a quiet stream is marked ended; a stream still moving is not
 *   SF-03  job-retry's answerFirst: a complete node, then the chat transcript, then an ENDED stream — a stream still open never stops
 *          a re-send; synthesize() reports the stream as status 'partial' with its anchor
 *   SF-04  the real NCP handler: GUARDIAN_CHUNK keeps it, the 'dom' pulse with generating:false ends it
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'sf-nodes-'));
process.env.GUARDIAN_RESPONSE_NODES_DIR = DIR;
require('../../lib/test-sandbox.js').ensure();
const assert = require('assert');
const ROOT = path.join(__dirname, '..', '..');
const S = require(path.join(ROOT, 'guardian/lib/response-sink.js'));

let passed = 0, failed = 0;
async function test(id, desc, fn) {
  try { await fn(); console.log(`  ✓ ${id} ${desc}`); passed++; }
  catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${e.stack ? e.stack.split('\n').slice(0, 5).join('\n    ') : e.message}`); failed++; }
}
const ANCHOR = { path: 'div.markdown:nth-of-type(3)', attrs: { 'data-message-author-role': 'assistant' } };

(async () => {
  console.log('\n⬡  the stream as a fallback route\n');
  let t = 1000; const now = () => t;

  await test('SF-01', 'chunks keep the reply so far as a partial .response with its anchor; throttled; never over a complete node', () => {
    assert.ok(S.streamNode('job-a', { full: 'Hello', provider: 'claude', anchor: ANCHOR }, { now }).ok);
    let n = S.readNode('job-a');
    assert.deepStrictEqual([n.status, n.text, n.source, n.anchor.path], ['partial', 'Hello', 'stream', ANCHOR.path]);
    t += 200; assert.ok(S.streamNode('job-a', { full: 'Hello, wor', provider: 'claude', anchor: ANCHOR }, { now }).throttled, 'a burst is not a write each');
    t += 2000; S.streamNode('job-a', { full: 'Hello, world.', provider: 'claude', anchor: ANCHOR }, { now });
    assert.strictEqual(S.readNode('job-a').text, 'Hello, world.');
    S.writeNode({ jobId: 'job-c', provider: 'claude', status: 'complete', text: 'the final answer' });
    t += 2000; const r = S.streamNode('job-c', { full: 'the fin', provider: 'claude' }, { now });
    assert.ok(!r.ok && /complete/.test(r.skipped) && S.readNode('job-c').text === 'the final answer', 'a complete node is never downgraded');
  });

  await test('SF-02', 'the page stops generating: a quiet stream is marked ended; a moving one is not', () => {
    t += 1000; S.streamNode('job-b', { full: 'still typing', provider: 'gemini' }, { now });
    t += 500; assert.strictEqual(S.endStream('job-b', {}, { now }).skipped, 'still streaming');
    t += 3500; assert.ok(S.endStream('job-b', { anchor: ANCHOR }, { now }).ok);
    const n = S.readNode('job-b');
    assert.deepStrictEqual([n.status, n.streamEnded, n.text, n.anchor.path], ['partial', true, 'still typing', ANCHOR.path]);
    assert.strictEqual(S.endStream('job-none', {}, { now }).skipped, 'no open stream');
  });

  await test('SF-03', 'answerFirst: complete node, then transcript, then an ENDED stream; an open stream never stops a re-send', () => {
    const { createJobRetry } = require(path.join(ROOT, 'guardian/lib/job-retry.js'));
    let transcript = null;
    const R = createJobRetry({ jobs: new Map(), updateJob() {}, dispatchJob() {}, complete() {}, readResponse: S.readNode, replyFor: () => transcript, log: { log() {}, warn() {} } });
    assert.deepStrictEqual(R.answerFirst({ id: 'job-b' }), { text: 'still typing', source: 'stream', anchor: ANCHOR });
    transcript = { text: 'from the chat log', chatUrl: 'https://x' };
    assert.strictEqual(R.answerFirst({ id: 'job-b' }).source, 'transcript', 'the finished record first');
    transcript = null;
    assert.strictEqual(R.answerFirst({ id: 'job-a' }), null, 'job-a\'s stream never ended: re-sending stays allowed');
    assert.strictEqual(R.answerFirst({ id: 'job-c' }).source, 'response-node');
    const syn = S.synthesize('job-b', {});
    assert.deepStrictEqual([syn.source, syn.status, syn.streamEnded, syn.anchor.path], ['stream', 'partial', true, ANCHOR.path]);
  });

  await test('SF-04', 'the real NCP handler: GUARDIAN_CHUNK keeps it; the dom pulse with generating:false ends it', async () => {
    const { createNCPMessageHandler } = require(path.join(ROOT, 'guardian/lib/ncp-handler.js'));
    const { EventEmitter } = require('events');
    const jobs = new Map([['job-n', { id: 'job-n', provider: 'chatgpt', status: 'dispatched' }]]);
    const noop = () => {};
    const h = createNCPMessageHandler({ nc: null, ncp: {}, bus: new EventEmitter(), jaa: {}, jobs, updateJob: (id, p) => jobs.set(id, { ...jobs.get(id), ...p }),
      cockpitBroadcast: noop, physQueue: {}, baseline: {}, evLedger: null, activeQueues: new Map(), extractCodeBlocks: () => [], extractToolCallsFromDOM: () => [],
      findActiveSeamCompartment: () => null });
    const handle = typeof h === 'function' ? h : (h.handle || h._handleNCPMessage || h.handleNCPMessage);
    assert.strictEqual(typeof handle, 'function', `handler shape: ${Object.keys(h || {})}`);
    await handle({ type: 'GUARDIAN_CHUNK', jobId: 'job-n', text: 'Plan: one', full: 'Plan: one', anchor: ANCHOR, chatUrl: 'https://chatgpt.com/c/1' });
    let n = S.readNode('job-n');
    assert.deepStrictEqual([n.status, n.text, n.provider, n.anchor.path, n.chatUrl], ['partial', 'Plan: one', 'chatgpt', ANCHOR.path, 'https://chatgpt.com/c/1']);
    await handle({ type: 'GUARDIAN_PROGRESS', jobId: 'job-n', stage: 'dom', generating: false, anchor: ANCHOR });
    assert.ok(!S.readNode('job-n').streamEnded, 'a chunk a moment ago: not ended yet');
    await new Promise(r => setTimeout(r, 3200));
    await handle({ type: 'GUARDIAN_PROGRESS', jobId: 'job-n', stage: 'dom', generating: false, anchor: ANCHOR });
    n = S.readNode('job-n');
    assert.deepStrictEqual([n.status, n.streamEnded], ['partial', true]);
  });

  fs.rmSync(DIR, { recursive: true, force: true });
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
