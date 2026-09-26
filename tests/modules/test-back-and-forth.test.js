'use strict';
// tests/modules/test-back-and-forth.test.js — 0.39.259.
// James, live on 0.39.258: "not great at jobs that persist. only works once. like conversations need back and
// forth, also persistent chaturl". His log, three turns into one repo agent's ChatGPT chat:
//   turn 1  completed from the transcript (192 chars)                       — worked
//   turn 2  "job complete: 58ae1d03 · unknown · 0ch" 1.5 s after submit      — empty, provider unknown
//   turn 3  "job created" … never "dispatched" … copilot timed out at 90 s   — stuck behind turn 2
//
//   BF-0xx  the pool: a userscript completion carries no provider; the slot must still come back
//   BF-1xx  an empty completion is not a reply; the transcript completes the job with the real text
//   BF-2xx  the persistent chat: each agent's chat is remembered and sent with its next job
//   BF-3xx  the page side: the tab carries a job across the load into that chat, and never calls '' stable
require('../../lib/test-sandbox.js').ensure();

const assert = require('assert');
const path = require('path');
const fs = require('fs');
const os = require('os');
const vm = require('vm');
const { EventEmitter } = require('events');

const ROOT = path.join(__dirname, '../..');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'back-and-forth-test-'));
process.env.JAA_DATA_DIR = TMP;
process.env.GUARDIAN_RESPONSE_NODES_DIR = path.join(TMP, 'response-nodes');
process.env.GUARDIAN_EMPTY_REPLY_GRACE_MS = '80';

let passed = 0, failed = 0;
async function test(id, name, fn) {
  try { await fn(); console.log(`  ✓ ${id} ${name}`); passed++; }
  catch (e) { console.log(`  ✗ ${id} ${name}\n    ${e.stack || e.message}`); failed++; }
}
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const quiet = async (fn) => { const w = console.warn, l = console.log; console.warn = () => {}; console.log = () => {}; try { return await fn(); } finally { console.warn = w; console.log = l; } };

const { createNCPMessageHandler } = require(path.join(ROOT, 'guardian/lib/ncp-handler.js'));
const { DispatchPool } = require(path.join(ROOT, 'guardian/lib/dispatch-pool.js'));
const wireRelease = require(path.join(ROOT, 'guardian/lib/dispatch-pool-bridge.js'));
const CT = require(path.join(ROOT, 'guardian/lib/chat-transcripts.js'));

// The real handler, the real pool, the real release bridge, one real bus.
function rig() {
  const bus = new EventEmitter();
  const jobs = new Map();
  const pool = new DispatchPool();
  wireRelease(bus, pool);
  const h = createNCPMessageHandler({
    nc: null, ncp: { updateClient() {}, push() {}, pushTab() { return true; }, handleHeartbeat() {} },
    bus, jaa: { insert() {}, query: () => [] }, jobs,
    updateJob: (id, p) => { const j = jobs.get(id); if (j) Object.assign(j, p); return j; }, cockpitBroadcast() {},
    physQueue: { logConversation() {} }, baseline: { observe() {} }, evLedger: null, activeQueues: new Map(),
    extractCodeBlocks: () => [], extractToolCallsFromDOM: () => [], findActiveSeamCompartment: () => null,
  });
  const dispatched = [];
  const send = (job) => pool.enqueue('chatgpt', { id: job.id, provider: 'chatgpt', payload: job }, (pj) => dispatched.push(pj.id));
  return { bus, jobs, pool, h, dispatched, send };
}
const job = (id, prompt, extra = {}) => ({ id, prompt, provider: 'chatgpt', agentId: 'repo-nexus-id-repo-a78bcc46', status: 'delivered', ts: Date.now(), ...extra });
// Exactly what userscript-chatgpt.js posts: ncpPost adds chatUrl + account, never provider.
const userscriptComplete = (jobId, text, chatUrl) => ({ type: 'GUARDIAN_COMPLETE', jobId, text, chatUrl, account: 'a', requestId: jobId });

async function main() {
  console.log('\n[1] the pool — "only works once"');

  await test('BF-001', 'a userscript completion (no provider field) announces the job\'s own provider', () => quiet(() => {
    const { bus, jobs, h } = rig();
    const seen = [];
    bus.on('guardian.job.complete', (d) => seen.push(d));
    jobs.set('j1', job('j1', 'hello there, agent'));
    h(userscriptComplete('j1', 'Hello, James.', 'https://chatgpt.com/c/6ab749cb-2214-83e8-a67c-36db42dfd5e2'));
    assert.strictEqual(seen.length, 1);
    assert.strictEqual(seen[0].provider, 'chatgpt');
  }));

  await test('BF-002', 'the live sequence: turn 2 completes from the tab, turn 3 is dispatched (was: never)', () => quiet(async () => {
    const { jobs, h, dispatched, send } = rig();
    jobs.set('t2', job('t2', 'give me some code to test.'));
    jobs.set('t3', job('t3', 'okay just write some.', { status: 'pending' }));
    send(jobs.get('t2')); send(jobs.get('t3'));
    assert.deepStrictEqual(dispatched, ['t2'], 'cap 1: turn 3 waits for turn 2');
    h(userscriptComplete('t2', 'Here is some code.', 'https://chatgpt.com/c/6ab749cb-2214-83e8-a67c-36db42dfd5e2'));
    await sleep(5);
    assert.deepStrictEqual(dispatched, ['t2', 't3'], 'turn 2\'s slot came back and turn 3 went out');
  }));

  await test('BF-003', 'the bridge frees a slot for a completion or error that names no provider (pool.providerOf)', () => {
    const bus = new EventEmitter(); const pool = new DispatchPool(); wireRelease(bus, pool);
    pool.enqueue('chatgpt', { id: 'a' }, () => {});
    assert.strictEqual(pool.providerOf('a'), 'chatgpt');
    bus.emit('guardian.job.complete', { jobId: 'a' });
    assert.strictEqual(pool.available('chatgpt'), 1);
    pool.enqueue('claude', { id: 'b' }, () => {});
    bus.emit('guardian.job.error', { jobId: 'b', error: 'x' });
    assert.strictEqual(pool.available('claude'), 1);
    assert.strictEqual(pool.providerOf('nope'), null);
    bus.emit('guardian.job.complete', { jobId: 'nope' });            // holds no slot: a no-op, not a throw
  });

  console.log('\n[2] an empty completion is not a reply');

  await test('BF-101', 'an empty GUARDIAN_COMPLETE from a tab is withheld: no completion, the job waits for the transcript', () => quiet(() => {
    const { bus, jobs, h } = rig();
    const done = []; bus.on('guardian.job.complete', d => done.push(d));
    const prog = []; bus.on('guardian.job.progress', d => prog.push(d));
    jobs.set('t2', job('t2', 'give me some code to test.'));
    h(userscriptComplete('t2', '', 'https://chatgpt.com/c/6ab749cb-2214-83e8-a67c-36db42dfd5e2'));
    assert.strictEqual(done.length, 0);
    assert.strictEqual(jobs.get('t2').status, 'awaiting_transcript');
    assert.ok(prog.some(p => p.stage === 'empty-reply-withheld'));
  }));

  await test('BF-102', 'end to end: empty from the tab, then the settled transcript completes it with the real reply and frees the slot', () => quiet(async () => {
    const { bus, jobs, h, pool, dispatched, send } = rig();
    const tx = CT.createChatTranscripts({
      bus, jobs, ncp: { pushTab() { return true; }, push() {} }, rootFn: () => TMP,
      index: { recordChat: () => ({ recorded: false, reason: 'unchanged' }), listChats: () => [] },
      complete: (j, text, chatUrl) => h({ type: 'GUARDIAN_COMPLETE', jobId: j.id, provider: j.provider, text, chatUrl, source: 'transcript' }),
      log: { log() {}, warn() {} },
    });
    const done = []; bus.on('guardian.job.complete', d => done.push(d));
    jobs.set('t2', job('t2', 'give me some code to test.'));
    jobs.set('t3', job('t3', 'okay just write some.', { status: 'pending' }));
    send(jobs.get('t2')); send(jobs.get('t3'));
    h(userscriptComplete('t2', '', 'https://chatgpt.com/c/6ab749cb-2214-83e8-a67c-36db42dfd5e2'));
    assert.strictEqual(pool.available('chatgpt'), 0, 'withheld: the slot is still turn 2\'s');
    tx.record({ provider: 'chatgpt', tabId: 'tab', source: 'push', chat: {
      provider: 'chatgpt', chatId: '6ab749cb-2214-83e8-a67c-36db42dfd5e2', url: 'https://chatgpt.com/c/6ab749cb-2214-83e8-a67c-36db42dfd5e2',
      settled: true, generating: false,
      messages: [
        { role: 'user', text: 'hello' }, { role: 'assistant', text: 'Hello, James.' },
        { role: 'user', text: 'give me some code to test.' }, { role: 'assistant', text: 'function add(a, b) { return a + b; }' },
      ] } });
    assert.strictEqual(jobs.get('t2').status, 'complete');
    assert.strictEqual(jobs.get('t2').responseText, 'function add(a, b) { return a + b; }');
    assert.strictEqual(done.length, 1);
    await sleep(5);
    assert.deepStrictEqual(dispatched, ['t2', 't3']);
  }));

  await test('BF-103', 'no transcript ever carries it: the job fails loudly after the grace window and the slot comes back', () => quiet(async () => {
    const { bus, jobs, h, pool, send } = rig();
    const errs = []; bus.on('guardian.job.error', d => errs.push(d));
    jobs.set('t2', job('t2', 'give me some code to test.'));
    send(jobs.get('t2'));
    h(userscriptComplete('t2', '   ', 'https://chatgpt.com/c/x'));
    await sleep(150);
    assert.strictEqual(jobs.get('t2').status, 'error');
    assert.strictEqual(errs.length, 1);
    assert.strictEqual(errs[0].gate, 'empty_reply');
    assert.strictEqual(pool.available('chatgpt'), 1);
  }));

  await test('BF-104', 'a transcript completion is never withheld (it is the path that fills the reply)', () => quiet(() => {
    const { jobs, h } = rig();
    jobs.set('t', job('t', 'q'));
    h({ type: 'GUARDIAN_COMPLETE', jobId: 't', provider: 'chatgpt', text: 'answer', source: 'transcript' });
    assert.strictEqual(jobs.get('t').status, 'complete');
  }));

  console.log('\n[3] the persistent chat URL');

  await test('BF-201', 'only a real, permanent chat is resumable', () => {
    const r = CT.resumableChatUrl;
    assert.strictEqual(r('chatgpt', 'https://chatgpt.com/c/6ab749cb-2214-83e8-a67c-36db42dfd5e2'), 'https://chatgpt.com/c/6ab749cb-2214-83e8-a67c-36db42dfd5e2');
    assert.strictEqual(r('chatgpt', 'https://chatgpt.com/c/WEB:ef9dba31-4d80-4c40-a259-f6c8e5500547'), null, 'the temporary id ChatGPT shows first');
    assert.strictEqual(r('chatgpt', 'https://chatgpt.com/'), null);
    assert.strictEqual(r('chatgpt', 'https://evil.example/c/abc'), null);
    assert.strictEqual(r('claude', 'https://claude.ai/chat/0b1c2d3e-aaaa-bbbb-cccc-111122223333'), 'https://claude.ai/chat/0b1c2d3e-aaaa-bbbb-cccc-111122223333');
    assert.strictEqual(r('claude', 'https://claude.ai/new'), null);
    assert.strictEqual(r('gemini', 'https://gemini.google.com/app/abc'), null, 'unverified URL shapes are not resumed');
  });

  await test('BF-202', 'chatFor: learned from the job\'s progress, from its transcript, and read back from the index after a restart', () => {
    const jobs = new Map(); const bus = new EventEmitter();
    const t1 = job('t1', 'hello there, agent');
    jobs.set('t1', t1);
    const rows = [{ id: 'rec1' }];
    const index = {
      recordChat: () => ({ recorded: false, reason: 'unchanged' }),
      listChats: (root, q) => (q.agentId === t1.agentId && q.provider === 'chatgpt' ? rows : []),
      readItem: () => ({ raw: { url: 'https://chatgpt.com/c/6ab749cb-2214-83e8-a67c-36db42dfd5e2' } }),
    };
    const a = CT.createChatTranscripts({ bus, jobs, rootFn: () => TMP, index, log: { log() {}, warn() {} } });
    a.attach();
    // the progress event during the job: first the temporary id (ignored), then the real one
    bus.emit('guardian.job.progress', { jobId: 't1', chatUrl: 'https://chatgpt.com/c/WEB:ef9dba31' });
    bus.emit('guardian.job.progress', { jobId: 't1', chatUrl: 'https://chatgpt.com/c/6ab74bc2-ee8c-83e8-9450-5e86e004e029' });
    assert.strictEqual(a.chatFor(job('next', 'x')), 'https://chatgpt.com/c/6ab74bc2-ee8c-83e8-9450-5e86e004e029');
    // a fresh process (reboot): nothing in memory, the downloads index still knows the chat
    const b = CT.createChatTranscripts({ bus: new EventEmitter(), jobs: new Map(), rootFn: () => TMP, index, log: { log() {}, warn() {} } });
    assert.strictEqual(b.chatFor(job('next', 'x')), 'https://chatgpt.com/c/6ab749cb-2214-83e8-a67c-36db42dfd5e2');
    // a job with no agent, or a provider whose URLs are not verified, has no chat to resume
    assert.strictEqual(b.chatFor(job('n', 'x', { agentId: null })), null);
    assert.strictEqual(b.chatFor(job('n', 'x', { provider: 'gemini' })), null);
  });

  await test('BF-203', 'the dispatcher sends resumeChatUrl with the job (GUARDIAN_RESUME_CHAT=0 turns it off)', () => quiet(async () => {
    const { createDispatcher } = require(path.join(ROOT, 'guardian/lib/dispatcher.js'));
    const bus = new EventEmitter();
    const sent = [];
    const ncp = { isConnected: () => true, push: () => 1, pushActive: (p, payload) => { sent.push(payload); return 1; } };
    const d = createDispatcher({ updateJob: (id, p) => p, bus, ncp, pendingQueue: new Map(), cockpitBroadcast() {},
      dispatchToMistral: async () => {}, dispatchToDeepseek: async () => {}, pingTimeoutMs: 5, completionTimeoutMs: 60000,
      chatFor: (j) => (j.agentId ? 'https://chatgpt.com/c/6ab749cb-2214-83e8-a67c-36db42dfd5e2' : null) });
    await d._doDispatch(job('d1', 'q'));
    assert.strictEqual(sent[0].resumeChatUrl, 'https://chatgpt.com/c/6ab749cb-2214-83e8-a67c-36db42dfd5e2');
    process.env.GUARDIAN_RESUME_CHAT = '0';
    try { await d._doDispatch(job('d2', 'q')); } finally { delete process.env.GUARDIAN_RESUME_CHAT; }
    assert.strictEqual(sent[1].resumeChatUrl, null);
  }));

  await test('BF-204', 'a tab reloading into the job\'s chat is not "disconnected mid-flight" (no requeue, no double send)', () => quiet(async () => {
    const { createDispatcher } = require(path.join(ROOT, 'guardian/lib/dispatcher.js'));
    const bus = new EventEmitter();
    const pendingQueue = new Map();
    const timeouts = []; bus.on('guardian.job.timeout', d => timeouts.push(d));
    const ncp = { isConnected: () => true, push: () => 1, pushActive: () => 1 };
    const d = createDispatcher({ updateJob: (id, p) => p, bus, ncp, pendingQueue, cockpitBroadcast() {},
      dispatchToMistral: async () => {}, dispatchToDeepseek: async () => {}, pingTimeoutMs: 5, completionTimeoutMs: 60000 });
    const resuming = job('r1', 'q', { resumingChatAt: Date.now() });
    const plain = job('r2', 'q');
    await d._doDispatch(resuming); await d._doDispatch(plain);
    bus.emit('guardian.provider.disconnected', { provider: 'chatgpt' });
    assert.deepStrictEqual(timeouts.map(t => t.jobId), ['r2'], 'only the job whose tab really went away is requeued');
    assert.deepStrictEqual((pendingQueue.get('chatgpt') || []).map(j => j.id), ['r2']);
  }));

  await test('BF-205', 'the tab\'s resuming-chat report marks the job; its next report clears the mark', () => quiet(() => {
    const { jobs, h } = rig();
    jobs.set('p', job('p', 'q'));
    h({ type: 'GUARDIAN_PROGRESS', jobId: 'p', stage: 'resuming-chat', how: 'https://chatgpt.com/c/abc' });
    assert.ok(jobs.get('p').resumingChatAt > 0);
    assert.strictEqual(jobs.get('p').resumeChatUrl, 'https://chatgpt.com/c/abc');
    h({ type: 'GUARDIAN_PROGRESS', jobId: 'p', stage: 'resumed-chat', how: 'https://chatgpt.com/c/abc' });
    assert.strictEqual(jobs.get('p').resumingChatAt, null);
  }));

  console.log('\n[4] the page side (the userscripts\' own code, run against a fake page)');

  // The resume helpers are cut from the real userscript source and run in a vm with a fake page.
  function pageFor(provider, href) {
    const src = fs.readFileSync(path.join(ROOT, `guardian/userscript-${provider}.js`), 'utf8');
    const a = src.indexOf('const _RESUME_KEY'), b = src.indexOf('function _handleServerMessage');
    assert.ok(a > 0 && b > a, 'resume helpers not found in the userscript');
    const store = new Map(); const posts = []; const assigned = []; const ran = [];
    const u = new URL(href);
    const ctx = {
      PROVIDER: provider, URL, JSON, Date, String,
      location: { href: u.href, host: u.host, pathname: u.pathname, assign: (x) => assigned.push(x) },
      sessionStorage: { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) },
      document: { querySelector: (s) => (/contenteditable|textarea/.test(s) ? {} : null) },
      setTimeout: (fn) => { fn(); return 0; },
      send: (m) => posts.push(m), _log() {}, getAccount: () => 'acct',
      _nexusGetFullChat: () => ({ messages: [{ role: 'user', text: 'hello' }, { role: 'assistant', text: 'Hello, James.' }] }),
      jobActive: false, currentJobId: null,
      _txJobStart() {}, handleJob: (m) => ran.push(m.jobId),
    };
    vm.createContext(ctx);
    vm.runInContext(src.slice(a, b) + '\nthis.open = _nexusOpenJobChat; this.resume = _nexusResumeCarriedJob;', ctx);
    return { ctx, store, posts, assigned, ran };
  }

  for (const [provider, home, chat] of [
    ['chatgpt', 'https://chatgpt.com/', 'https://chatgpt.com/c/6ab749cb-2214-83e8-a67c-36db42dfd5e2'],
    ['claude', 'https://claude.ai/new', 'https://claude.ai/chat/0b1c2d3e-aaaa-bbbb-cccc-111122223333'],
  ]) {
    await test(`BF-301-${provider}`, 'elsewhere: the job is carried, guardian is told, the tab opens the chat — and runs it there after the load', () => {
      const before = pageFor(provider, home);
      const msg = { type: 'GUARDIAN_JOB', jobId: 'job-3', prompt: 'okay just write some.', resumeChatUrl: chat };
      assert.strictEqual(before.ctx.open(msg), true);
      assert.deepStrictEqual(before.assigned, [chat]);
      assert.strictEqual(before.posts[0].stage, 'resuming-chat');
      assert.deepStrictEqual(before.ran, [], 'not typed into the wrong chat');
      // the load: same sessionStorage, the page is now the chat
      const after = pageFor(provider, chat);
      for (const [k, v] of before.store) after.store.set(k, v);
      after.ctx.resume();
      assert.deepStrictEqual(after.ran, ['job-3']);
      assert.strictEqual(after.posts[0].stage, 'resumed-chat');
      after.ctx.resume();                                   // a reconnect's second READY does not run it twice
      assert.deepStrictEqual(after.ran, ['job-3']);
      assert.strictEqual(after.store.size, 0, 'the carried job is used once');
    });

    await test(`BF-302-${provider}`, 'already in the chat, or no chat to resume: the job runs here, no reload', () => {
      const p = pageFor(provider, chat);
      assert.strictEqual(p.ctx.open({ jobId: 'j', resumeChatUrl: chat }), false);
      assert.strictEqual(p.ctx.open({ jobId: 'j', resumeChatUrl: null }), false);
      assert.strictEqual(p.ctx.open({ jobId: 'j', resumeChatUrl: 'https://elsewhere.example/c/abc' }), false);
      assert.deepStrictEqual(p.assigned, []);
    });
  }

  await test('BF-303', 'a stale carried job (> 2 min) is dropped, not run into whatever chat is open', () => {
    const p = pageFor('chatgpt', 'https://chatgpt.com/c/abc');
    p.store.set('nexus_resume_job_chatgpt', JSON.stringify({ msg: { jobId: 'old' }, path: '/c/abc', ts: Date.now() - 180000 }));
    p.ctx.resume();
    assert.deepStrictEqual(p.ran, []);
  });

  await test('BF-304', 'every userscript refuses to call an empty turn a stable reply', () => {
    for (const prov of ['chatgpt', 'claude', 'deepseek', 'gemini', 'perplexity']) {
      const src = fs.readFileSync(path.join(ROOT, `guardian/userscript-${prov}.js`), 'utf8');
      assert.ok(src.includes('if (text && text === lastText && !_isGenerating())'), prov);
      assert.ok(!/if \(text === lastText && !_isGenerating\(\)\)/.test(src), `${prov} still has the unguarded check`);
    }
  });

  console.log(`\n  ${passed} passed · ${failed} failed\n`);
  try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (_) {}
  process.exit(failed ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
