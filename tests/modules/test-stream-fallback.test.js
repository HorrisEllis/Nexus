'use strict';
/**
 * tests/modules/test-stream-fallback.test.js — the stream as a fallback route, read from Clear Glass's download manager (0.60.192).
 * Map: docs/2026-09-26-guardian-retry-novelty-and-installs-phasemap.spec (R1, invariant I1 — addenda 2026-10-21).
 * James, 2026-10-21: "im saying to use those as fallback routes. node anchor, dom mutator." · "look in clearglass download manager".
 * His 0.39.278 chat ledger (clear-glass/src/downloads/chat-ledger.js) already keeps every chat as the page's DOM mutator streams it; 0.60.191
 * built a second copy of that stream in guardian's .response nodes, and 0.60.192 removed it to read his.
 *
 *   SF-01  lib/chat-ledger-client reaches Clear Glass's IPC port (7702, where the ledger routes are), not 7701 (its SSE port —
 *          where lib/work-journal.js pointed, so its reads failed outside the tests); chat()/list() read a REAL ledger through the
 *          route paths the bridge serves; unreachable → null, absent → false
 *   SF-02  chat-transcripts ledgerReplyFor: the job's prompt matched to its turn in the ledger, its reply returned — only once the page
 *          stopped generating; a chat still generating, or a prompt in no chat, gives null
 *   SF-03  the dispatcher: a typed job that idled out (a dead tab) completes from the chat ledger when answerFirst finds nothing; a
 *          re-send asks the ledger first; never typed twice
 *   SF-04  0.60.191's copy is gone: guardian keeps no second stream; the reads go through the route, never Clear Glass's code
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const LEDGER_ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'sf-ledger-'));
process.env.CG_LEDGER_ROOT = LEDGER_ROOT;
require('../../lib/test-sandbox.js').ensure();
const assert = require('assert');
const ROOT = path.join(__dirname, '..', '..');

let passed = 0, failed = 0;
async function test(id, desc, fn) {
  try { await fn(); console.log(`  ✓ ${id} ${desc}`); passed++; }
  catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${e.stack ? e.stack.split('\n').slice(0, 5).join('\n    ') : e.message}`); failed++; }
}
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const PROMPT = 'Write the storage module for the shop, with tests';

(async () => {
  console.log('\n⬡  the stream as a fallback route — read from the download manager\n');
  // Clear Glass's own ledger module writes the ledgers; a server answers on the bridge's two route paths with its readers
  const LED = require(path.join(ROOT, 'clear-glass/src/downloads/chat-ledger.js'));
  const srv = http.createServer((req, res) => {
    const u = new URL(req.url, 'http://x');
    const send = (code, body) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(body)); };
    if (u.pathname === '/cli/downloads/ledgers') return send(200, { ok: true, ledgers: LED.listLedgers({ provider: u.searchParams.get('provider') || undefined, agentId: u.searchParams.get('agentId') || undefined, limit: u.searchParams.get('limit') }).map(({ file, ...x }) => x) });
    const m = u.pathname.match(/^\/cli\/downloads\/ledgers\/(.+)$/);
    if (m) { const c = LED.readChat({ chatKey: decodeURIComponent(m[1]) }); return c ? send(200, { ok: true, chat: c }) : send(404, { ok: false }); }
    send(404, {});
  });
  await new Promise(r => srv.listen(0, '127.0.0.1', r));
  const C = require(path.join(ROOT, 'lib/chat-ledger-client.js'));

  await test('SF-01', 'the client reaches the IPC port (7702), reads a real ledger through the bridge\'s routes; unreachable → null, absent → false', async () => {
    const saved = { ...process.env }; delete process.env.CLEAR_GLASS_URL; delete process.env.CLEARGL_IPC_PORT; delete process.env.CLEAR_GLASS_PORT;
    assert.strictEqual(C.url(), 'http://127.0.0.1:7702');
    process.env.CLEAR_GLASS_URL = saved.CLEAR_GLASS_URL;
    const WJ = require(path.join(ROOT, 'lib/work-journal.js'));
    assert.ok(!/7701/.test(fs.readFileSync(path.join(ROOT, 'lib/work-journal.js'), 'utf8').match(/function _cgUrl\(\)[^\n]*/)[0]), 'work-journal no longer aims at the SSE port');
    assert.ok(WJ);
    process.env.CLEAR_GLASS_URL = 'http://127.0.0.1:9';
    assert.strictEqual(await C.chat('chatgpt:x', { timeoutMs: 500 }), null, 'not reachable → null');
    process.env.CLEAR_GLASS_URL = `http://127.0.0.1:${srv.address().port}`;
    assert.ok(LED.applyDelta({ provider: 'chatgpt', chatId: 'c1', url: 'https://chatgpt.com/c/c1', agentId: 'repo-shop', generating: false, settled: true,
      turns: [{ i: 0, role: 'user', text: PROMPT }, { i: 1, role: 'assistant', text: 'Here is lib/storage.js and its test.' }] }).ok);
    assert.strictEqual(await C.chat('chatgpt:nope'), false, 'reachable, absent → false');
    const c = await C.chat('chatgpt:c1');
    assert.deepStrictEqual([c.turns.length, c.turns[1].text, c.generating], [2, 'Here is lib/storage.js and its test.', false]);
    assert.deepStrictEqual((await C.list({ provider: 'chatgpt' })).map(r => r.chatKey), ['chatgpt:c1']);
  });

  const CT = require(path.join(ROOT, 'guardian/lib/chat-transcripts.js'));
  const { EventEmitter } = require('events');
  const ct = CT.createChatTranscripts({ bus: new EventEmitter(), jobs: new Map(), ncp: {}, root: () => LEDGER_ROOT });

  await test('SF-02', 'ledgerReplyFor: the job\'s turn in the ledger, its reply — only once the page stopped generating', async () => {
    const job = { id: 'j1', provider: 'chatgpt', agentId: 'repo-shop', prompt: PROMPT };
    assert.deepStrictEqual(await ct.ledgerReplyFor(job), { text: 'Here is lib/storage.js and its test.', chatUrl: 'https://chatgpt.com/c/c1', chatKey: 'chatgpt:c1', source: 'chat-ledger' });
    LED.applyDelta({ provider: 'gemini', chatId: 'g1', generating: true, settled: false, turns: [{ i: 0, role: 'user', text: PROMPT }, { i: 1, role: 'assistant', text: 'Here is lib/sto' }] });
    assert.strictEqual(await ct.ledgerReplyFor({ ...job, provider: 'gemini', agentId: null }), null, 'still generating: not an answer');
    assert.strictEqual(await ct.ledgerReplyFor({ ...job, prompt: 'a prompt no chat holds, long enough' }), null);
  });

  await test('SF-03', 'the dispatcher: a dead tab\'s job completes from the chat ledger; a re-send asks it first; never typed twice', async () => {
    process.env.GUARDIAN_EMPTY_REPLY_GRACE_MS = '50';
    const { createDispatcher } = require(path.join(ROOT, 'guardian/lib/dispatcher.js'));
    const jobs = new Map(), pushed = [], done = [];
    const bus = new EventEmitter();
    const updateJob = (id, p) => { const j = jobs.get(id); if (!j) return null; Object.assign(j, p); return j; };
    const d = createDispatcher({ updateJob, bus, pendingQueue: new Map(), cockpitBroadcast: () => {},
      ncp: { isConnected: () => true, push: () => 1, pushActive: (p, payload) => { pushed.push(payload); return 1; } },
      dispatchToMistral: () => Promise.resolve(), dispatchToDeepseek: () => Promise.resolve(),
      pingTimeoutMs: 10, pickupMs: 5000, completionTimeoutMs: 40, getJob: (id) => jobs.get(id),
      answerFirst: () => null, answerFromLedger: (j) => ct.ledgerReplyFor(j),
      completeWith: (j, text, chatUrl, source) => { done.push({ id: j.id, text, source }); jobs.get(j.id).status = 'complete'; } });
    jobs.set('j-dead', { id: 'j-dead', provider: 'chatgpt', agentId: 'repo-shop', command: 'ask', prompt: PROMPT, status: 'pending' });
    await d._doDispatch(jobs.get('j-dead'));
    Object.assign(jobs.get('j-dead'), { status: 'delivered_confirmed', confirmedAt: Date.now() });
    await sleep(70);
    assert.strictEqual(jobs.get('j-dead').status, 'awaiting_transcript');
    await sleep(150);
    assert.deepStrictEqual(done, [{ id: 'j-dead', text: 'Here is lib/storage.js and its test.', source: 'chat-ledger' }]);
    assert.strictEqual(pushed.filter(p => p.jobId === 'j-dead').length, 1, 'typed once');
    jobs.set('j-again', { id: 'j-again', provider: 'chatgpt', agentId: 'repo-shop', command: 'ask', prompt: PROMPT, status: 'pending', attempts: [{ kind: 'no-reply' }] });
    await d._doDispatch(jobs.get('j-again'));
    assert.strictEqual(done[1] && done[1].source, 'chat-ledger', 'a re-send found its answer in the ledger');
    assert.strictEqual(pushed.filter(p => p.jobId === 'j-again').length, 0, 'never typed');
    delete process.env.GUARDIAN_EMPTY_REPLY_GRACE_MS;
  });

  await test('SF-04', '0.60.191\'s copy is gone; guardian reads the ledger through the route, never Clear Glass\'s code', () => {
    const S = require(path.join(ROOT, 'guardian/lib/response-sink.js'));
    assert.strictEqual(S.streamNode, undefined); assert.strictEqual(S.endStream, undefined);
    const ncp = fs.readFileSync(path.join(ROOT, 'guardian/lib/ncp-handler.js'), 'utf8');
    assert.ok(!/streamNode|endStream/.test(ncp), 'no second stream kept');
    const src = fs.readFileSync(path.join(ROOT, 'guardian/lib/chat-transcripts.js'), 'utf8');
    assert.ok(!/require\([^)]*chat-ledger\.js/.test(src) && /lib\/chat-ledger-client\.js/.test(src), 'through the route');
    const srvSrc = fs.readFileSync(path.join(ROOT, 'guardian/server.js'), 'utf8');
    assert.ok(/answerFromLedger: \(job\) => \(_chatTranscriptsRef \? _chatTranscriptsRef\.ledgerReplyFor\(job\)/.test(srvSrc), 'wired in guardian');
  });

  srv.close(); fs.rmSync(LEDGER_ROOT, { recursive: true, force: true });
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
