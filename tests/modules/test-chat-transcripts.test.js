'use strict';
/**
 * tests/modules/test-chat-transcripts.test.js — v0.39.254
 * James: "getting the download manager logging agent chats" … "persistent memory
 * for ai agents". Every provider chat is logged into Clear Glass's downloads index
 * as ONE versioned record per chat.
 *
 * Real code throughout: clear-glass/src/downloads/artifact-chat-index.js in a temp
 * root; guardian's real ncp-handler receiving GUARDIAN_TRANSCRIPT / GUARDIAN_SYNC_RESULT;
 * guardian/lib/chat-transcripts.js recording them and answering its HTTP routes.
 * The bus delivers fn({type, data}) exactly as guardian's SISOStream does (server.js;
 * it cannot be lifted out alone — its emit reaches cockpitBroadcast and the kernel).
 * The userscript side is proven in a real page (Clear Glass's engine): tests/probe/transcript-push-chromium.js
 * (TX-20 runs it). Nothing is written under data/.
 */
const assert = require('assert'), fs = require('fs'), os = require('os'), path = require('path'), { spawnSync } = require('child_process');
require('../../lib/test-sandbox.js').ensure();   // before any store resolves a path (tests/modules/test-test-sandbox.test.js rule)
// TX-30 runs guardian's real completion path: its durable sinks go to a temp dir and Clear Glass's port is closed
// (the downloads post is queued beside them), so nothing reaches the real tree. Set before anything is required.
const _TX_TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'tx-sinks-'));
process.env.GUARDIAN_RESPONSE_NODES_DIR = path.join(_TX_TMP, 'nodes', 'response');
process.env.CLEARGL_IPC_PORT = '1';
process.env.GUARDIAN_JOBS_DIR = path.join(_TX_TMP, 'jobs');   // TX-29 creates real jobs
const ROOT = path.resolve(__dirname, '..', '..');
const IDX = require(path.join(ROOT, 'clear-glass/src/downloads/artifact-chat-index.js'));
const { createChatTranscripts, chatPathOf, matchJobs } = require(path.join(ROOT, 'guardian/lib/chat-transcripts.js'));
const { createNCPMessageHandler } = require(path.join(ROOT, 'guardian/lib/ncp-handler.js'));

let passed = 0, failed = 0, skipped = 0;
function test(id, d, fn) { try { fn(); console.log(`  ✓ ${id} ${d}`); passed++; } catch (e) { console.error(`  ✗ ${id} ${d}\n    ${e.message}`); failed++; } }
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'tx-test-'));
const M = (...pairs) => pairs.map(([role, text]) => ({ role, text }));
const quiet = { log() {}, warn() {} };

function sisoBus() {                      // guardian SISOStream's delivery contract: fn({ type, data })
  const subs = new Map();
  return { on(t, fn) { (subs.get(t) || subs.set(t, []).get(t)).push(fn); }, emit(t, data = {}) { for (const fn of subs.get(t) || []) fn({ type: t, data }); } };
}
function wired(root) {
  const bus = sisoBus(), jobs = new Map(), recorded = [];
  const tx = createChatTranscripts({ bus, jobs, rootFn: () => root, log: quiet });
  tx.attach();
  bus.on('guardian.chat.transcript.recorded', (e) => recorded.push(e.data));
  const handler = createNCPMessageHandler({
    nc: null, ncp: { updateClient() {}, push() {}, handleHeartbeat() {} }, bus,
    jaa: { insert() {}, query: () => [] }, jobs, updateJob: () => null,
    cockpitBroadcast() {}, physQueue: { logConversation() {} }, baseline: { observe() {} }, evLedger: null,
    activeQueues: new Map(), extractCodeBlocks: () => [], extractToolCallsFromDOM: () => [], findActiveSeamCompartment: () => null,
  });
  return { bus, jobs, tx, handler, recorded };
}
const chat = (chatId, messages, extra = {}) => ({ provider: 'chatgpt', chatId, url: `https://chatgpt.com/c/${chatId}`, extractedAt: 1, messages, ...extra });

console.log('\n⬡  chat transcripts — one versioned record per chat\n');

test('TX-01', 'refusals are named: no chat id (home), no messages, no provider', () => {
  const root = tmp();
  assert.strictEqual(IDX.recordChat(root, { provider: 'chatgpt', chatId: 'home', messages: M(['user', 'hi']) }).reason, 'no-chat-id');
  assert.strictEqual(IDX.recordChat(root, { provider: 'chatgpt', chatId: 'a', messages: [{ role: 'user', text: '  ' }] }).reason, 'empty');
  assert.strictEqual(IDX.recordChat(root, { chatId: 'a', messages: M(['user', 'hi']) }).reason, 'no-provider');
  assert.strictEqual(IDX.queryItems(root, {}).length, 0);
});

test('TX-02', 'first record is v1; the same messages again write nothing', () => {
  const root = tmp();
  const a = IDX.recordChat(root, { provider: 'chatgpt', chatId: 'a', messages: M(['user', 'q'], ['assistant', 'r']) });
  assert.ok(a.recorded && a.version === 1 && a.indexed, JSON.stringify(a));
  const b = IDX.recordChat(root, { provider: 'chatgpt', chatId: 'a', messages: M(['user', 'q'], ['assistant', 'r']) });
  assert.deepStrictEqual([b.recorded, b.reason, b.id], [false, 'unchanged', a.id]);
  assert.strictEqual(fs.readdirSync(path.join(root, 'responses')).length, 1);
});

test('TX-03', 'a partial or lazily-loaded read (messages already in the latest, in order) never replaces a fuller version', () => {
  const root = tmp();
  IDX.recordChat(root, { provider: 'chatgpt', chatId: 'a', messages: M(['user', 'q1'], ['assistant', 'r1'], ['user', 'q2'], ['assistant', 'r2']) });
  for (const sub of [M(['assistant', 'r2']), M(['user', 'q2'], ['assistant', 'r2']), M(['user', 'q1'], ['assistant', 'r2'])]) {
    assert.strictEqual(IDX.recordChat(root, { provider: 'chatgpt', chatId: 'a', messages: sub }).reason, 'contained-in-latest', JSON.stringify(sub));
  }
  const reordered = IDX.recordChat(root, { provider: 'chatgpt', chatId: 'a', messages: M(['assistant', 'r2'], ['user', 'q1']) });
  assert.ok(reordered.recorded && reordered.version === 2, 'out of order is a different chat state and must be recorded');
});

test('TX-04', 'a changed chat is v2, supersedes v1, and v1 is kept as history', () => {
  const root = tmp();
  const a = IDX.recordChat(root, { provider: 'claude', chatId: 'x', agentId: 'repo-1', messages: M(['user', 'q']) });
  const b = IDX.recordChat(root, { provider: 'claude', chatId: 'x', messages: M(['user', 'q'], ['assistant', 'r']) });
  assert.deepStrictEqual([b.version, b.supersedes], [2, a.id]);
  const vs = IDX.chatVersions(root, 'claude:x');
  assert.deepStrictEqual(vs.map(v => v.version).sort(), [1, 2]);
  assert.strictEqual(IDX.readItem(root, a.id).raw.messages.length, 1, 'v1 file must be untouched');
});

test('TX-05', 'a chat keeps the agent it was filed under when a later read has no agent', () => {
  const root = tmp();
  IDX.recordChat(root, { provider: 'claude', chatId: 'x', agentId: 'repo-1', messages: M(['user', 'q']) });
  const b = IDX.recordChat(root, { provider: 'claude', chatId: 'x', messages: M(['user', 'q'], ['assistant', 'r']) });
  assert.strictEqual(b.agentId, 'repo-1');
  assert.strictEqual(IDX.listChats(root, { agentId: 'repo-1' })[0].version, 2);
});

test('TX-06', 'latest is the highest version even when versions share a millisecond', () => {
  const root = tmp();
  const realNow = Date.now; Date.now = () => 1700000000000;
  try {
    IDX.recordChat(root, { provider: 'chatgpt', chatId: 'a', messages: M(['user', '1']) });
    IDX.recordChat(root, { provider: 'chatgpt', chatId: 'a', messages: M(['user', '1'], ['assistant', '2']) });
    IDX.recordChat(root, { provider: 'chatgpt', chatId: 'a', messages: M(['user', '1'], ['assistant', '2'], ['user', '3']) });
  } finally { Date.now = realNow; }
  assert.strictEqual(IDX.latestTranscript(root, 'chatgpt:a').version, 3);
  const [row] = IDX.listChats(root, {});
  assert.deepStrictEqual([row.version, row.versions], [3, 3]);
  const again = IDX.recordChat(root, { provider: 'chatgpt', chatId: 'a', messages: M(['user', '1'], ['assistant', '2'], ['user', '3']) });
  assert.strictEqual(again.reason, 'unchanged', 'compared against v3, not an arbitrary same-ms row');
});

test('TX-07', 'listChats: one row per chat; q recalls a chat by its own text (case-insensitive)', () => {
  const root = tmp();
  IDX.recordChat(root, { provider: 'chatgpt', chatId: 'a', messages: M(['user', 'the Port Map is guardian 7820']) });
  IDX.recordChat(root, { provider: 'chatgpt', chatId: 'a', messages: M(['user', 'the Port Map is guardian 7820'], ['assistant', 'noted']) });
  IDX.recordChat(root, { provider: 'claude', chatId: 'b', messages: M(['user', 'unrelated']) });
  assert.strictEqual(IDX.listChats(root, {}).length, 2);
  const hit = IDX.listChats(root, { q: 'port map' });
  assert.deepStrictEqual(hit.map(r => [r.chat_key, r.versions]), [['chatgpt:a', 2]]);
  assert.strictEqual(IDX.listChats(root, { q: 'nothing like this' }).length, 0);
});

test('TX-08', 'collapseVersions leaves replies and artifacts alone and collapses only transcripts', () => {
  const root = tmp();
  IDX.recordResponse(root, { kind: 'chat', provider: 'chatgpt', raw: { jobId: 'j1', response: 'r' } });
  IDX.recordChat(root, { provider: 'chatgpt', chatId: 'a', messages: M(['user', '1']) });
  IDX.recordChat(root, { provider: 'chatgpt', chatId: 'a', messages: M(['user', '1'], ['assistant', '2']) });
  const rows = IDX.collapseVersions(IDX.queryItems(root, { limit: 1000 }));
  assert.deepStrictEqual(rows.map(r => r.kind).sort(), ['chat', 'transcript']);
});

test('TX-09', 'the index rebuilt from responses/ alone keeps chat_key, version and hash', () => {
  const root = tmp();
  IDX.recordChat(root, { provider: 'chatgpt', chatId: 'a', messages: M(['user', '1']) });
  IDX.recordChat(root, { provider: 'chatgpt', chatId: 'a', messages: M(['user', '1'], ['assistant', '2']) });
  IDX.rebuildIndexFromResponses(root);
  const rows = IDX.chatVersions(root, 'chatgpt:a');
  assert.deepStrictEqual(rows.map(r => r.version).sort(), [1, 2]);
  assert.ok(rows.every(r => /^sha256:/.test(r.transcript_hash) && r.chat_key === 'chatgpt:a'));
});

test('TX-10', 'job replies are unchanged: recordResponse still refuses any kind but chat/artifact', () => {
  const root = tmp();
  assert.throws(() => IDX.recordResponse(root, { kind: 'transcript', raw: {} }), /kind must be 'chat' or 'artifact'/);
  const r = IDX.recordResponse(root, { kind: 'chat', provider: 'claude', raw: { jobId: 'j', agentId: 'repo-9', response: 'x' } });
  assert.deepStrictEqual([r.jobId, r.agentId, r.indexed], ['j', 'repo-9', true]);
  assert.strictEqual(IDX.findResponseByJobId(root, 'j').id, r.id);
});

test('TX-11', 'GUARDIAN_TRANSCRIPT through the real ncp-handler is recorded, with the tab\'s agent stamp', () => {
  const root = tmp(); const { handler, recorded } = wired(root);
  handler({ type: 'GUARDIAN_TRANSCRIPT', provider: 'chatgpt', tabId: 'repo-7', agentId: 'repo-7', chat: chat('WEB:abc', M(['user', 'q'], ['assistant', 'r'])) });
  assert.strictEqual(recorded.length, 1);
  assert.deepStrictEqual([recorded[0].chatKey, recorded[0].version, recorded[0].agentId, recorded[0].source], ['chatgpt:WEB:abc', 1, 'repo-7', 'push']);
  handler({ type: 'GUARDIAN_TRANSCRIPT', provider: 'chatgpt', tabId: 'repo-7', agentId: 'repo-7', chat: chat('WEB:abc', M(['user', 'q'], ['assistant', 'r'])) });
  assert.strictEqual(recorded.length, 1, 'a repeated push must not write a version');
});

test('TX-12', 'GUARDIAN_SYNC_RESULT (every /sync pull) is recorded too; a failed sync is not', () => {
  const root = tmp(); const { handler, recorded, tx } = wired(root);
  handler({ type: 'GUARDIAN_SYNC_RESULT', provider: 'claude', tabId: 't', syncId: 's', chat: { ...chat('c1', M(['user', 'q'])), provider: 'claude' }, error: null });
  handler({ type: 'GUARDIAN_SYNC_RESULT', provider: 'claude', tabId: 't', syncId: 's2', chat: null, error: 'no DOM' });
  assert.deepStrictEqual(recorded.map(r => [r.chatKey, r.source]), [['claude:c1', 'sync']]);
  assert.strictEqual(tx.stats.failed, 0);
});

test('TX-13', 'a shared tab\'s chat is filed under the agent whose job ran in it (guardian.job.progress chatUrl)', () => {
  const root = tmp(); const { handler, bus, jobs, recorded } = wired(root);
  jobs.set('job-1', { id: 'job-1', agentId: 'repo-nexus-id-repo-0473b4ed', provider: 'chatgpt' });
  bus.emit('guardian.job.progress', { jobId: 'job-1', stage: 'dom', chatUrl: 'https://chatgpt.com/c/WEB:b4b1d92a-9efa' });
  handler({ type: 'GUARDIAN_TRANSCRIPT', provider: 'chatgpt', tabId: 'random-tab', agentId: null, chat: chat('WEB:b4b1d92a-9efa', M(['user', 'q'])) });
  handler({ type: 'GUARDIAN_TRANSCRIPT', provider: 'chatgpt', tabId: 'random-tab', agentId: null, chat: chat('WEB:other', M(['user', 'mine'])) });
  assert.deepStrictEqual(recorded.map(r => r.agentId), ['repo-nexus-id-repo-0473b4ed', null]);
});

test('TX-14', 'chatPathOf: a job\'s chatUrl and the transcript\'s url reduce to the same key (query, hash, trailing slash, %3A)', () => {
  assert.strictEqual(chatPathOf('https://chatgpt.com/c/WEB:x?model=4#a'), chatPathOf('https://chatgpt.com/c/WEB%3Ax/'));
  assert.strictEqual(chatPathOf('not a url'), null);
});

test('TX-15', 'record() never throws: an index failure is reported and counted', () => {
  const tx = createChatTranscripts({ rootFn: () => { throw new Error('no compartment'); }, log: quiet });
  const r = tx.record({ provider: 'chatgpt', chat: chat('a', M(['user', 'q'])) });
  assert.deepStrictEqual([r.recorded, r.reason, r.error, tx.stats.failed], [false, 'failed', 'no compartment', 1]);
});

function call(tx, pathname) {
  let out = null; const url = new URL(`http://x${pathname}`);
  const handled = tx.route('GET', url, {}, (res, status, body) => { out = { status, body }; });
  return { handled, ...out };
}
test('TX-16', 'GET /api/chats, /api/chats/versions, /api/chats/item/:id answer from the index (recall side)', () => {
  const root = tmp(); const { handler, tx } = wired(root);
  handler({ type: 'GUARDIAN_TRANSCRIPT', provider: 'chatgpt', tabId: 'repo-7', agentId: 'repo-7', chat: chat('WEB:a', M(['user', 'the release rule is spec, atlas, versionium'])) });
  handler({ type: 'GUARDIAN_TRANSCRIPT', provider: 'chatgpt', tabId: 'repo-7', agentId: 'repo-7', chat: chat('WEB:a', M(['user', 'the release rule is spec, atlas, versionium'], ['assistant', 'ok'])) });
  const list = call(tx, '/api/chats?agentId=repo-7&q=release%20rule');
  assert.deepStrictEqual([list.status, list.body.chats.length, list.body.chats[0].versions], [200, 1, 2]);
  const vs = call(tx, '/api/chats/versions?key=chatgpt:WEB:a');
  assert.strictEqual(vs.body.versions.length, 2);
  const it = call(tx, `/api/chats/item/${list.body.chats[0].id}`);
  assert.deepStrictEqual([it.status, it.body.item.raw.messages.length], [200, 2]);
  assert.strictEqual(call(tx, '/api/chats/item/..%2F..%2Fetc').status, 400);
  assert.strictEqual(call(tx, '/api/chats/versions').status, 400);
  assert.strictEqual(call(tx, '/api/chats/item/nope').status, 404);
  assert.strictEqual(call(tx, '/api/other').handled, false);
});

test('TX-17', 'guardian/server.js wires it: created with the real bus + jobs, attached, route before /sync', () => {
  const s = fs.readFileSync(path.join(ROOT, 'guardian/server.js'), 'utf8');
  assert.ok(/createChatTranscripts\(\{ bus, jobs, ncp,/.test(s) && /_chatTranscripts\.attach\(\)/.test(s), 'not created/attached');
  const r = s.indexOf('_chatTranscripts.route(method, url, res, pRes)'), sy = s.indexOf("url.pathname==='/sync'");
  assert.ok(r > 0 && r < sy, 'route not wired before /sync');
});

test('TX-18', 'every provider userscript pushes GUARDIAN_TRANSCRIPT and stamps agentId on sync results; versions bumped together', () => {
  const want = { chatgpt: '10.12.0', claude: '10.12.0', gemini: '10.10.0', perplexity: '10.9.0', deepseek: '10.10.0' };   // 0.39.278 — bumped together (mutation-driven stream); 0.39.279 — gemini/deepseek full readers
  for (const [p, v] of Object.entries(want)) {
    const s = fs.readFileSync(path.join(ROOT, `guardian/userscript-${p}.js`), 'utf8');
    assert.ok(/type: 'GUARDIAN_TRANSCRIPT'/.test(s), `${p}: no transcript push`);
    assert.ok(/type: 'GUARDIAN_SYNC_RESULT', syncId: msg\.syncId, provider: PROVIDER, tabId: MY_TAB, agentId: NEXUS_AGENT_ID/.test(s), `${p}: sync result without agentId`);
    const esc = v.replace(/\./g, '\\.');
    assert.ok(new RegExp(`// @version\\s+${esc}\\b`).test(s), `${p}: @version is not ${v}`);
    assert.ok(new RegExp(`const VERSION\\s*=\\s*'${esc}'`).test(s), `${p}: VERSION is not ${v}`);
  }
});

test('TX-19', 'chatgpt chatId() keeps the WEB: prefix (every chat used to read as "WEB")', () => {
  const s = fs.readFileSync(path.join(ROOT, 'guardian/userscript-chatgpt.js'), 'utf8');
  const src = s.match(/^function chatId\(\) \{[\s\S]*?\n\}\n/m)[0];
  for (const [p, want] of [['/c/WEB:b4b1d92a-9efa-4f95', 'WEB:b4b1d92a-9efa-4f95'], ['/c/6710-abc', '6710-abc'], ['/', 'home'], ['/c/WEB%3Ax', 'WEB:x']]) {
    const got = new Function('location', `${src}; return chatId();`)({ pathname: p });
    assert.strictEqual(got, want, `${p} -> ${got}`);
  }
});

// ── 0.39.255 — a chat is its job's: attribution by prompt, completion from the transcript, the repo hat ──
const PROMPT = 'You are the project agent for "ERAVOS v3-17 catalog".\nYou exist for this one project and nothing else.\n\n───\n\nhello';
const TYPED = 'You have real tools available. To use one, reply with EXACTLY this syntax on its own line: [[TOOL: tool_name {"param": "value"}]]\n\n' +
  '[the_builder] You build, bottom-up.\n\n' + PROMPT.replace(/\n/g, '\n ') + '\n\n(agent hint: you may start a line with "hey nexus,")';

function withJob(root, { status = 'delivered', agentId = 'repo-nexus-id-repo-af2180cf', completer, ncpLog } = {}) {
  const bus = sisoBus(), jobs = new Map(), calls = [], order = [];
  jobs.set('cccaafb0-6fff', { id: 'cccaafb0-6fff', provider: 'chatgpt', prompt: PROMPT, agentId, status, ts: Date.now() - 20000 });
  const ncp = { pushTab: (p, t, m) => { order.push(['pushTab', t, m.type, m.jobId]); return true; }, push: (p, m) => { order.push(['push', m.type]); return 1; } };
  const tx = createChatTranscripts({ bus, jobs, ncp, rootFn: () => root, log: quiet,
    complete: completer || ((job, text, url) => { order.push(['complete', job.id]); calls.push({ job: job.id, text, url }); job.status = 'complete'; }) });
  tx.attach();
  return { bus, jobs, tx, calls, order };
}
const liveChat = (extra = {}) => ({ provider: 'chatgpt', chatId: '6ab7275b-926c-83e8-8e35-9f1aa9441ac9', url: 'https://chatgpt.com/c/6ab7275b-926c-83e8-8e35-9f1aa9441ac9',
  messages: M(['user', TYPED], ['assistant', 'Hello — ready to work on the ERAVOS v3-17 catalog.']), settled: true, generating: false, ...extra });

test('TX-21', 'matchJobs: the prompt is found inside the typed turn (tools preamble + hat line before, hint after, whitespace changed)', () => {
  const [m] = matchJobs(liveChat().messages, [{ id: 'j', prompt: PROMPT, ts: 1 }]);
  assert.ok(m && m.index === 0 && /ready to work/.test(m.reply), JSON.stringify(m));
  assert.strictEqual(matchJobs(liveChat().messages, [{ id: 'j', prompt: 'hi', ts: 1 }]).length, 0, 'a too-short prompt is not evidence');
  assert.strictEqual(matchJobs(M(['user', 'something else'], ['assistant', 'x']), [{ id: 'j', prompt: PROMPT, ts: 1 }]).length, 0);
  const twice = M(['user', 'please refactor the kernel'], ['assistant', 'first'], ['user', 'please refactor the kernel'], ['assistant', 'second']);
  const ms = matchJobs(twice, [{ id: 'old', prompt: 'please refactor the kernel', ts: 1 }, { id: 'new', prompt: 'please refactor the kernel', ts: 2 }]);
  assert.deepStrictEqual(ms.map(x => [x.job.id, x.reply]).sort(), [['new', 'second'], ['old', 'first']]);
  const unanswered = matchJobs(M(['user', PROMPT]), [{ id: 'j', prompt: PROMPT, ts: 1 }]);
  assert.strictEqual(unanswered[0].reply, null, 'no reply turn yet');
});

test('TX-22', 'the live case: no tab stamp, job URL /c/WEB:<tmp> ≠ transcript URL /c/<real> — the chat is still filed under the job\'s agent', () => {
  const root = tmp(); const { bus, tx } = withJob(root, { status: 'complete' });
  bus.emit('guardian.job.progress', { jobId: 'cccaafb0-6fff', stage: 'dom', chatUrl: 'https://chatgpt.com/c/WEB:c5f7a5cc-9f87-4e1c-9ddb-86e835dfc1c9' });
  const r = tx.record({ provider: 'chatgpt', tabId: 'shared', agentId: null, chat: liveChat() });
  assert.deepStrictEqual([r.recorded, r.agentId], [true, 'repo-nexus-id-repo-af2180cf']);
});

test('TX-23', 'a settled, not-generating transcript completes its job: the tab is told first (GUARDIAN_JOB_DONE), then the one completion path', () => {
  const root = tmp(); const { tx, calls, order, jobs } = withJob(root);
  tx.record({ provider: 'chatgpt', tabId: 'tab-7', chat: liveChat() });
  assert.deepStrictEqual(calls.map(c => [c.job, c.text, c.url]), [['cccaafb0-6fff', 'Hello — ready to work on the ERAVOS v3-17 catalog.', 'https://chatgpt.com/c/6ab7275b-926c-83e8-8e35-9f1aa9441ac9']]);
  assert.deepStrictEqual(order, [['pushTab', 'tab-7', 'GUARDIAN_JOB_DONE', 'cccaafb0-6fff'], ['complete', 'cccaafb0-6fff']]);
  tx.record({ provider: 'chatgpt', tabId: 'tab-7', chat: liveChat() });
  assert.strictEqual(calls.length, 1, 'a completed job is never completed twice');
  assert.strictEqual(tx.stats.completed, 1);
  assert.strictEqual(jobs.get('cccaafb0-6fff').status, 'complete');
});

test('TX-24', 'not taken while unsettled (max-wait push) or generating; taken on the next settled, quiet read', () => {
  const root = tmp(); const { tx, calls } = withJob(root);
  tx.record({ provider: 'chatgpt', tabId: 't', chat: liveChat({ settled: false }) });
  tx.record({ provider: 'chatgpt', tabId: 't', chat: liveChat({ generating: true }) });
  assert.strictEqual(calls.length, 0);
  assert.deepStrictEqual(tx.stats.withheld, { unsettled: 1, generating: 1 });
  tx.record({ provider: 'chatgpt', tabId: 't', chat: liveChat() });
  assert.strictEqual(calls.length, 1);
});

test('TX-25', 'no reply turn yet, another provider\'s job, or a job older than the window: nothing completes', () => {
  const root = tmp();
  const a = withJob(root); a.tx.record({ provider: 'chatgpt', tabId: 't', chat: liveChat({ messages: M(['user', TYPED]) }) });
  assert.strictEqual(a.calls.length, 0, 'no reply');
  const b = withJob(tmp()); b.tx.record({ provider: 'claude', tabId: 't', chat: { ...liveChat(), provider: 'claude' } });
  assert.strictEqual(b.calls.length, 0, 'other provider');
  const c = withJob(tmp()); c.jobs.get('cccaafb0-6fff').ts = Date.now() - 7 * 3600e3; c.tx.record({ provider: 'chatgpt', tabId: 't', chat: liveChat() });
  assert.strictEqual(c.calls.length, 0, 'outside the 6 h window');
});

test('TX-26', 'a job whose tab later reports an error keeps its completion (real ncp-handler); an unfinished job still errors', () => {
  const { handler, jobs } = wired(tmp()); const events = [];
  const bus2 = sisoBus(); bus2.on('guardian.job.error', e => events.push(e.data));
  const h2 = createNCPMessageHandler({ nc: null, ncp: { updateClient() {}, push() {}, handleHeartbeat() {} }, bus: bus2, jaa: { insert() {}, query: () => [] }, jobs,
    updateJob: (id, patch) => Object.assign(jobs.get(id), patch), cockpitBroadcast() {}, physQueue: { logConversation() {} }, baseline: { observe() {} }, evLedger: null,
    activeQueues: new Map(), extractCodeBlocks: () => [], extractToolCallsFromDOM: () => [], findActiveSeamCompartment: () => null });
  void handler;
  jobs.set('done', { id: 'done', status: 'complete', responseText: 'the answer' });
  jobs.set('open', { id: 'open', status: 'delivered' });
  h2({ type: 'GUARDIAN_ERROR', jobId: 'done', provider: 'chatgpt', gate: 'no_reply', error: 'no reply after 180s' });
  h2({ type: 'GUARDIAN_ERROR', jobId: 'open', provider: 'chatgpt', gate: 'no_reply', error: 'no reply after 180s' });
  assert.deepStrictEqual([jobs.get('done').status, jobs.get('done').responseText, jobs.get('open').status], ['complete', 'the answer', 'error']);
  assert.deepStrictEqual(events.map(e => e.jobId), ['open']);
});

test('TX-27', 'server.js completes through _handleNCPMessage GUARDIAN_COMPLETE (the one completion path) and passes ncp', () => {
  const s = fs.readFileSync(path.join(ROOT, 'guardian/server.js'), 'utf8');
  assert.ok(/createChatTranscripts\(\{ bus, jobs, ncp,\s*\n\s*complete: \(job, text, chatUrl\) => _handleNCPMessage\(\{ type: 'GUARDIAN_COMPLETE', jobId: job\.id, provider: job\.provider, text, chatUrl/.test(s));
});

test('TX-28', 'every userscript: GUARDIAN_JOB_DONE stops only its own job\'s watch; pushes carry settled + generating', () => {
  for (const p of ['chatgpt', 'claude', 'gemini', 'perplexity', 'deepseek']) {
    const s = fs.readFileSync(path.join(ROOT, `guardian/userscript-${p}.js`), 'utf8');
    assert.ok(/case 'GUARDIAN_JOB_DONE':\s*\n\s*if \(currentJobId && currentJobId === msg\.jobId\) \{ stopWatch\(\);/.test(s), `${p}: no JOB_DONE handler`);
    assert.ok(/chat\.settled = !forced;/.test(s) && /chat\.generating = !!_isGenerating\(\)/.test(s), `${p}: push lacks settled/generating`);
  }
});

test('TX-29', 'a repo job wears its repo hat (no second persona); any other job still gets a suggested hat', () => {
  const { createJobStore } = require(path.join(ROOT, 'guardian/lib/jobs.js'));
  const store = createJobStore ? createJobStore() : null;
  const hatFn = store ? store._repoJobHat : null;
  assert.ok(hatFn, 'jobs.js exposes _repoJobHat');
  const h = hatFn('repo-nexus-id-repo-af2180cf');
  assert.strictEqual(h.name, require(path.join(ROOT, 'lib/repo-hat.js')).hatNameFor('nexus-id-repo-af2180cf'));
  assert.deepStrictEqual([h.name.startsWith('repo_'), h.personaPrompt, h.source], [true, '', 'repo']);
  assert.strictEqual(hatFn('default'), undefined, 'a non-repo agent falls through to the suggested hat');
  assert.strictEqual(hatFn(null), undefined);
  const us = fs.readFileSync(path.join(ROOT, 'guardian/userscript-chatgpt.js'), 'utf8');
  const hdr = new Function(`${us.match(/^function _buildHatHeader\(hat\) \{[\s\S]*?\n\}\n/m)[0]}; return _buildHatHeader;`)();
  assert.strictEqual(hdr(h), '', 'the userscript adds no hat line for a repo job — its persona is already in the prompt');
  assert.ok(/^\[the_builder\] /.test(hdr({ name: 'the_builder', personaPrompt: 'You build.' })), 'a suggested hat still gets its line');
});

test('TX-31', 'createJob (real, jobs in a temp dir): a repo agent\'s job is created wearing its repo hat, never the_builder', () => {
  const store = require(path.join(ROOT, 'guardian/lib/jobs.js')).createJobStore();
  const buildy = 'You are the project agent for "ERAVOS". Build the organism factory, bottom-up, and implement the kernel.';
  const repoJob = store.createJob({ command: 'ask', provider: 'chatgpt', prompt: buildy, agentId: 'repo-nexus-id-repo-af2180cf' });
  assert.deepStrictEqual([repoJob.hat && repoJob.hat.name.startsWith('repo_'), repoJob.hat && repoJob.hat.personaPrompt], [true, '']);
  const plain = store.createJob({ command: 'ask', provider: 'chatgpt', prompt: buildy });
  assert.ok(!plain.hat || !plain.hat.name.startsWith('repo_'), 'a non-repo job must not get a repo hat');
  assert.ok(fs.existsSync(path.join(process.env.GUARDIAN_JOBS_DIR, `${repoJob.id}.job`)), 'written to the temp jobs dir');
});

test('TX-30', 'end to end: the transcript completes the job through the REAL handler, and the Agent tab\'s findLate finds the reply for the repo', () => {
  const jobs = new Map(), bus = sisoBus(), completes = [];
  bus.on('guardian.job.complete', e => completes.push(e.data));
  const handler = createNCPMessageHandler({
    nc: null, ncp: { updateClient() {}, push() {}, handleHeartbeat() {} }, bus,
    jaa: { insert() {}, query: () => [] }, jobs,
    updateJob: (id, patch) => { const j = jobs.get(id); if (j) Object.assign(j, patch); return j; },
    cockpitBroadcast() {}, physQueue: { logConversation() {} }, baseline: { observe() {} }, evLedger: null,
    activeQueues: new Map(), extractCodeBlocks: () => [], extractToolCallsFromDOM: () => [], findActiveSeamCompartment: () => null,
  });
  const job = { id: 'cccaafb0-6fff-49be-bc15-a99617320ca7', provider: 'chatgpt', command: 'ask', prompt: PROMPT, agentId: 'repo-nexus-id-repo-af2180cf', status: 'delivered', ts: Date.now() - 20000 };
  jobs.set(job.id, job);
  const tabMsgs = [];
  const tx = createChatTranscripts({ bus, jobs, rootFn: () => tmp(), log: quiet,
    ncp: { pushTab: (p, t, m) => { tabMsgs.push(m.type); return true; } },
    complete: (j, text, chatUrl) => handler({ type: 'GUARDIAN_COMPLETE', jobId: j.id, provider: j.provider, text, chatUrl, source: 'transcript' }) });
  const since = Date.now() - 1000;
  tx.record({ provider: 'chatgpt', tabId: 'tab-7', chat: liveChat() });
  assert.deepStrictEqual([job.status, job.responseText, tabMsgs], ['complete', 'Hello — ready to work on the ERAVOS v3-17 catalog.', ['GUARDIAN_JOB_DONE']]);
  assert.ok(completes.some(c => c.jobId === job.id), 'guardian.job.complete not emitted');
  const late = require(path.join(ROOT, 'lib/repo-agent.js')).findLate({ repo: { uuid: 'nexus-id-repo-af2180cf' }, since, jobId: job.id, root: IDX.defaultRoot() });
  assert.deepStrictEqual([late.found, late.jobId, late.text], [true, job.id, 'Hello — ready to work on the ERAVOS v3-17 catalog.'], JSON.stringify(late));
});

// 0.39.263 — the probe drives Clear Glass's own engine (clear-glass/src/driver/glass.js), not Playwright
const probe = spawnSync(process.execPath, [path.join(ROOT, 'tests/probe/transcript-push-chromium.js')], { encoding: 'utf8', timeout: 180000 });
if (probe.status === 3 || probe.error) { console.log(`  - TX-20 SKIPPED (not passed): the userscript push in a real page — ${probe.error ? probe.error.message : 'no page engine (electron not installed)'}`); skipped++; }
else test('TX-20', 'the userscript §TRANSCRIPT block in a real page, Clear Glass\'s engine (tests/probe/transcript-push-chromium.js)', () => {
  assert.strictEqual(probe.status, 0, (probe.stdout || '').split('\n').filter(l => /"pass": ?false|summary/.test(l)).join('\n') || probe.stderr);
});

console.log(`\n  ${passed} passed · ${failed} failed${skipped ? ` · ${skipped} skipped` : ''}\n`);
process.exit(failed ? 1 : 0);
