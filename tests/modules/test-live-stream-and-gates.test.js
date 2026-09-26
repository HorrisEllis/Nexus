'use strict';
/**
 * tests/modules/test-live-stream-and-gates.test.js — v0.39.256
 * James: "supposed to stream it live as it happens" / "can we make the error
 * specific to the gate? not just a generic error?"
 *
 * Real code: guardian/lib/gate-trail.js (the reducer and its bus attachment),
 * guardian/ask.js askSync with injected deps, guardian's real ncp-handler for the
 * chunk fields, and idearium's Agent tab feed functions (_agentFeedState / In /
 * Html) extracted from idearium/ui/js/app.js and run as written. The userscript's
 * 500 ms streamer runs in a real page (Clear Glass's engine): tests/probe/live-stream-chromium.js (GS-20).
 * Nothing is written to the real tree.
 */
const assert = require('assert'), fs = require('fs'), os = require('os'), path = require('path'), { spawnSync } = require('child_process');
require('../../lib/test-sandbox.js').ensure();
const ROOT = path.resolve(__dirname, '..', '..');
const GT = require(path.join(ROOT, 'guardian/lib/gate-trail.js'));
const { askSync } = require(path.join(ROOT, 'guardian/ask.js'));
const { createNCPMessageHandler } = require(path.join(ROOT, 'guardian/lib/ncp-handler.js'));

let passed = 0, failed = 0, skipped = 0;
const pending = [];
function test(id, d, fn) {
  const run = async () => { try { await fn(); console.log(`  ✓ ${id} ${d}`); passed++; } catch (e) { console.error(`  ✗ ${id} ${d}\n    ${e.message}`); failed++; } };
  pending.push(run);
}
function sisoBus() {
  const subs = new Map(), emitted = [];
  return { emitted, on(t, fn) { (subs.get(t) || subs.set(t, []).get(t)).push(fn); }, emit(t, data = {}) { emitted.push({ type: t, data }); for (const fn of subs.get(t) || []) fn({ type: t, data }); } };
}
const run = (events) => events.reduce((t, [type, data]) => GT.apply(t, type, data, 1000).trail, []);

console.log('\n⬡  live stream + gate-specific errors\n');

test('GS-01', 'the live case (cccaafb0): dispatched, submitted, 4 mutations, then timeout → stopped at gate 7/8 "reply appears", with what to do', () => {
  const trail = run([
    ['guardian.job.created', {}], ['guardian.job.dispatched', {}],
    ['guardian.job.progress', { stage: 'submitted', how: 'button' }],
    ['guardian.job.progress', { stage: 'dom', mutations: 4, anchor: { path: 'div#thread > div.composer-parent.flex' } }],
    ['guardian.job.timeout', { reason: 'no completion', waitedMs: 900000, retry: 1 }],
  ]);
  const d = GT.describe(trail, { provider: 'chatgpt' });
  assert.deepStrictEqual([d.gate, d.index, d.of, d.state], ['reply', 7, 8, 'failed']);
  assert.ok(/stopped at gate 7\/8 "reply appears" \(chatgpt\): no completion after 900s \(retry 1\) — no reply was read — pick the reply with ◎/.test(d.sentence), d.sentence);
  assert.deepStrictEqual(d.passed, ['create', 'tab', 'ping', 'deliver', 'accept', 'submit'], 'a later gate passing implies the earlier ones');
});

test('GS-02', 'while waiting, the reply gate says what the page shows (mutations, the node watched)', () => {
  const d = GT.describe(run([['guardian.job.dispatched', {}], ['guardian.job.progress', { stage: 'dom', mutations: 4, anchor: { path: 'div#thread' } }]]));
  assert.deepStrictEqual([d.gate, d.state], ['reply', 'waiting']);
  assert.ok(/4 mutations, no reply text read yet \(watching div#thread\)/.test(d.sentence), d.sentence);
});

test('GS-03', 'each userscript/dispatcher gate name lands on its gate', () => {
  const at = (gate, error) => GT.describe(run([['guardian.job.dispatched', {}], ['guardian.job.error', { gate, error }]])).gate;
  assert.strictEqual(at('tab_busy', 'still answering job x'), 'accept');
  assert.strictEqual(at('submit', 'send button not found'), 'submit');
  assert.strictEqual(at('watch', 'no reply after 180s'), 'reply');
  assert.strictEqual(GT.describe(run([['guardian.job.queued', { reason: 'ping_gate_failed' }]])).gate, 'ping');
  assert.strictEqual(GT.describe(run([['guardian.job.queued', { reason: 'stale_socket' }]])).gate, 'deliver');
  const noTab = GT.describe(run([['guardian.job.queued', { provider: 'claude' }]]), { provider: 'claude' });
  assert.deepStrictEqual([noTab.gate, noTab.state], ['tab', 'waiting']);
  assert.ok(/no claude tab free yet/.test(noTab.sentence) && /open the provider in Clear Glass/.test(noTab.sentence), noTab.sentence);
  const errNoGate = GT.describe(run([['guardian.job.dispatched', {}], ['guardian.job.progress', { stage: 'submitted' }], ['guardian.job.error', { error: 'boom' }]]));
  assert.deepStrictEqual([errNoGate.gate, errNoGate.detail], ['reply', 'boom'], 'an error with no gate is placed at the gate the job was at');
});

test('GS-04', 'complete (incl. from the transcript) reads complete; the same news twice adds nothing', () => {
  const t = run([['guardian.job.dispatched', {}], ['guardian.job.chunk', { source: 'transcript' }], ['guardian.job.complete', { source: 'transcript' }]]);
  const d = GT.describe(t);
  assert.deepStrictEqual([d.gate, d.state, d.sentence], ['complete', 'passed', 'complete — completed from the chat transcript']);
  const t2 = GT.apply(t, 'guardian.job.chunk', {}, 2000);
  assert.strictEqual(t2.change, null);
  const w = run([['guardian.job.queued', { reason: 'ping_gate_failed' }]]);
  assert.strictEqual(GT.apply(w, 'guardian.job.queued', { reason: 'ping_gate_failed' }).change, null);
});

test('GS-05', 'attach(): SISOStream-shaped bus → job.gates / job.gate kept, guardian.job.gate emitted once per change with agentId', () => {
  const bus = sisoBus(), jobs = new Map();
  jobs.set('j1', { id: 'j1', provider: 'chatgpt', agentId: 'repo-x', ts: 1 });
  GT.attach({ bus, jobs });
  bus.emit('guardian.job.dispatched', { jobId: 'j1' });
  bus.emit('guardian.job.dispatched', { jobId: 'j1' });
  bus.emit('guardian.job.progress', { jobId: 'j1', stage: 'submitted', how: 'button' });
  bus.emit('guardian.job.progress', { jobId: 'nope', stage: 'submitted' });
  const gates = bus.emitted.filter(e => e.type === 'guardian.job.gate').map(e => [e.data.gate, e.data.state, e.data.agentId]);
  assert.deepStrictEqual(gates, [['accept', 'waiting', 'repo-x'], ['reply', 'waiting', 'repo-x']]);
  assert.ok(jobs.get('j1').gates.length >= 6 && jobs.get('j1').gate.gate === 'reply');
});

test('GS-12', 'a requeue puts the job back: delivered, then queued again on a failed ping → waiting at "tab answers", not "tab takes the job"', () => {
  const d = GT.describe(run([['guardian.job.dispatched', {}], ['guardian.job.queued', { reason: 'ping_gate_failed' }]]));
  assert.deepStrictEqual([d.gate, d.state], ['ping', 'waiting']);
  const back = GT.describe(run([['guardian.job.dispatched', {}], ['guardian.job.queued', { reason: 'ping_gate_failed' }], ['guardian.job.progress', { stage: 'submitted' }]]));
  assert.deepStrictEqual([back.gate, back.state], ['reply', 'waiting'], 'moving on again follows the news');
});

const baseDeps = (job) => ({
  createJob: (o) => Object.assign(job, { id: 'job-1', provider: o.provider, status: 'pending' }),
  dispatchJob: () => {}, getJob: () => job, isProviderConnected: () => true,
});
test('GS-06', 'askSync: a job the dispatcher marked failed returns at once, with its gate — not after the whole timeout', async () => {
  const job = {};
  const deps = baseDeps(job);
  deps.dispatchJob = () => { job.status = 'failed'; job.failReason = 'no completion after 2 retries';
    job.gates = run([['guardian.job.dispatched', {}], ['guardian.job.progress', { stage: 'submitted' }], ['guardian.job.error', { error: 'no completion after 2 retries' }]]);
    job.gate = GT.describe(job.gates, { provider: 'chatgpt' }); };
  const t0 = Date.now();
  const r = await askSync('hello there', { provider: 'chatgpt', timeoutMs: 20000 }, deps);
  assert.ok(Date.now() - t0 < 3000, `took ${Date.now() - t0}ms`);
  assert.deepStrictEqual([r.ok, r.gate && r.gate.gate], [false, 'reply']);
  assert.ok(/stopped at gate 7\/8 "reply appears" \(chatgpt\): no completion after 2 retries/.test(r.error), r.error);
});

test('GS-07', 'askSync timeout names the gate it is waiting at (and still says "timed out", which repo-agent keys awaitLate on)', async () => {
  const job = {};
  const deps = baseDeps(job);
  deps.dispatchJob = () => { job.status = 'responding'; job.gates = run([['guardian.job.dispatched', {}], ['guardian.job.progress', { stage: 'dom', mutations: 4 }]]); job.gate = GT.describe(job.gates, { provider: 'chatgpt' }); };
  const r = await askSync('hello there', { provider: 'chatgpt', timeoutMs: 1200 }, deps);
  assert.ok(/^timed out after 1200ms — waiting at gate 7\/8 "reply appears" \(chatgpt\): 4 mutations/.test(r.error), r.error);
  assert.ok(/GET \/status\/job-1/.test(r.error));
});

test('GS-08', 'server.js attaches the trail before transcripts, serves it on /status, and the feed carries gate frames + chunk reset/source', () => {
  const s = fs.readFileSync(path.join(ROOT, 'guardian/server.js'), 'utf8');
  assert.ok(s.includes("require('./lib/gate-trail.js').attach({ bus, jobs });"));
  assert.ok(/gate: job\.gate \|\| null, gates: Array\.isArray\(job\.gates\)/.test(s));
  for (const k of ['reset', 'source', 'state', 'label', 'detail', 'fix']) assert.ok(new RegExp(`_FEED_KEYS = \\[[\\s\\S]*'${k}'`).test(s), `_FEED_KEYS lacks ${k}`);
  assert.ok(/data\.reset \? data\.text\.slice\(-8000\)/.test(s), 'a reset chunk must keep its live end');
});

test('GS-09', 'the real ncp-handler passes a streamed chunk\'s reset/source/generating onto guardian.job.chunk', () => {
  const bus = sisoBus(), jobs = new Map([['j', { id: 'j', status: 'delivered' }]]);
  const h = createNCPMessageHandler({ nc: null, ncp: { updateClient() {}, push() {}, handleHeartbeat() {} }, bus, jaa: { insert() {}, query: () => [] }, jobs,
    updateJob: (id, p) => Object.assign(jobs.get(id), p), cockpitBroadcast() {}, physQueue: { logConversation() {} }, baseline: { observe() {} }, evLedger: null,
    activeQueues: new Map(), extractCodeBlocks: () => [], extractToolCallsFromDOM: () => [], findActiveSeamCompartment: () => null });
  h({ type: 'GUARDIAN_CHUNK', jobId: 'j', provider: 'chatgpt', text: 'Hello', full: 'Hello', reset: true, source: 'transcript', generating: true });
  const c = bus.emitted.find(e => e.type === 'guardian.job.chunk').data;
  assert.deepStrictEqual([c.text, c.reset, c.source, c.generating, jobs.get('j').status], ['Hello', true, 'transcript', true, 'responding']);
});

// The Agent tab's feed, as written in app.js.
function agentFeed() {
  const src = fs.readFileSync(path.join(ROOT, 'idearium/ui/js/app.js'), 'utf8');
  const grab = (name) => { const m = src.match(new RegExp(`^function ${name}\\([\\s\\S]*?\\n\\}\\n`, 'm')); if (!m) throw new Error(`no ${name}`); return m[0]; };
  const consts = src.match(/^const AGENT_FEED = new Map\(\);.*\n^const AGENT_FEED_MAX = \d+;/m)[0];
  return new Function(`const escapeHtml = s => String(s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'})[c]); let CURRENT_API_REPO = null; function _agentFeedPaint() {}
    ${consts}\n${grab('_agentFeedState')}\n${grab('_agentFeedIn')}\n${grab('_agentFeedHtml')}
    return { _agentFeedIn, _agentFeedHtml, _agentFeedState };`)();
}
test('GS-10', 'Agent tab: streamed chunks build the live text (a reset replaces it) without a row each; gate frames are rows, failed in red, and head the feed', () => {
  const F = agentFeed();
  F._agentFeedIn({ repoUuid: 'r', jobId: 'j', event: 'chunk', text: 'Hel', source: 'transcript' });
  F._agentFeedIn({ repoUuid: 'r', jobId: 'j', event: 'chunk', text: 'lo', source: 'transcript' });
  assert.strictEqual(F._agentFeedState('r').text, 'Hello');
  F._agentFeedIn({ repoUuid: 'r', jobId: 'j', event: 'chunk', text: 'Hello, world', reset: true, source: 'transcript' });
  assert.strictEqual(F._agentFeedState('r').text, 'Hello, world');
  assert.strictEqual(F._agentFeedState('r').rows.length, 0, 'no row per 500 ms chunk');
  F._agentFeedIn({ repoUuid: 'r', jobId: 'j', event: 'gate', gate: 'reply', label: 'reply appears', state: 'failed', detail: 'no completion after 900s', fix: 'pick the reply with ◎' });
  const html = F._agentFeedHtml('r');
  assert.ok(/gate reply appears · failed/.test(html) && /no completion after 900s → pick the reply with ◎/.test(html), html);
  assert.ok(/color:var\(--bad,#f87171\)">gate reply appears · failed/.test(html), 'the header shows the failed gate in red');
  assert.strictEqual(F._agentFeedState('r').rows[0].bad, true);
});

test('GS-11', 'every userscript: the job start arms the streamer; the watch marks itself when it streams; versions bumped together', () => {
  const want = { chatgpt: '10.11.0', claude: '10.11.0', gemini: '10.8.2', perplexity: '10.8.2', deepseek: '10.8.2' };
  for (const [p, v] of Object.entries(want)) {
    const s = fs.readFileSync(path.join(ROOT, `guardian/userscript-${p}.js`), 'utf8');
    assert.ok(s.includes('currentJobId = msg.jobId; _txJobStart(msg); handleJob(msg); break;'), `${p}: job start not armed`);
    // 0.39.261 — the watch still marks itself; its FIRST chunk for a job now restates the whole reply
    // with reset (the transcript streamer may have sent part of it already — James saw it tripled).
    assert.ok(s.includes("const _first = typeof _txWatchStreamed === 'undefined' || _txWatchStreamed !== jobId; _txWatchStreamed = jobId; send({ type:'GUARDIAN_CHUNK', jobId, text:_first ? text : delta, full:text, reset:"), `${p}: watch does not mark itself (or does not reset on its first chunk)`);
    assert.ok(/const _TX_STREAM_MS = 500;/.test(s), `${p}: cadence`);
    const esc = v.replace(/\./g, '\\.');
    assert.ok(new RegExp(`// @version\\s+${esc}\\b`).test(s) && new RegExp(`const VERSION\\s*=\\s*'${esc}'`).test(s), `${p}: not ${v}`);
  }
});

(async () => {
  for (const r of pending) await r();
  // 0.39.262 — the probe drives Clear Glass's own engine (clear-glass/src/driver/glass.js), not Playwright
  const probe = spawnSync(process.execPath, [path.join(ROOT, 'tests/probe/live-stream-chromium.js')], { encoding: 'utf8', timeout: 180000 });
  if (probe.status === 3 || probe.error) { console.log(`  - GS-20 SKIPPED (not passed): the 500 ms streamer in a real page — ${probe.error ? probe.error.message : 'no page engine (electron not installed)'}`); skipped++; }
  else {
    try { assert.strictEqual(probe.status, 0, (probe.stdout || '').split('\n').filter(l => /"pass": ?false|summary/.test(l)).join('\n') || probe.stderr); console.log('  ✓ GS-20 the userscript 500 ms streamer in a real page, Clear Glass\'s engine (tests/probe/live-stream-chromium.js)'); passed++; }
    catch (e) { console.error(`  ✗ GS-20 the userscript 500 ms streamer in real Chromium\n    ${e.message}`); failed++; }
  }
  console.log(`\n  ${passed} passed · ${failed} failed${skipped ? ` · ${skipped} skipped` : ''}\n`);
  process.exit(failed ? 1 : 0);
})();
