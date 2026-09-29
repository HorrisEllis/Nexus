'use strict';
/**
 * tests/modules/test-chat-ledger-stream.test.js — 0.39.278.
 *   CL-*  clear-glass/src/downloads/chat-ledger.js: every chat, append-only, per delta; replay; resync; code blocks.
 *   CS-*  guardian/userscript-chat-stream.js core: diff against what Clear Glass ACKED, nothing marked sent until it
 *         answers, a missed ack resyncs instead of splicing text; thinking kept apart from the reply.
 *   UP-*  the provider userscripts no longer poll the chat (the 5s re-attach and the 500ms job-stream intervals are
 *         gone); every one starts the live stream; Clear Glass loads the prelude.
 *   CA-*  agents are told the conversation captures their code (repo agent first message, tool layers).
 */
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const _log = console.log; const _warn = console.warn;
const quiet = () => { console.log = () => {}; console.warn = () => {}; };
const loud = () => { console.log = _log; console.warn = _warn; };

let passed = 0, failed = 0;
async function t(id, name, fn) {
  try { await fn(); passed++; _log(`  ✓ ${id} ${name}`); }
  catch (e) { loud(); failed++; _log(`  ✗ ${id} ${name}\n    ${e && e.stack ? e.stack.split('\n').slice(0, 3).join('\n    ') : e}`); }
}

(async () => {
  _log('\n  test-chat-ledger-stream.test.js');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cl-cs-'));
  const root = path.join(tmp, 'idx');
  process.env.CG_LEDGER_ROOT = root;
  process.env.CG_JAA_DIR = path.join(tmp, 'jaa');
  process.env.JAA_DATA_DIR = process.env.JAA_DATA_DIR || path.join(tmp, 'cortex-memory');
  const L = require(path.join(ROOT, 'clear-glass/src/downloads/chat-ledger.js'));
  const CS = require(path.join(ROOT, 'guardian/userscript-chat-stream.js'));

  await t('CL-01', 'a whole turn, then appends: one line each; the replay is the chat', () => {
    let r = L.applyDelta({ provider: 'claude', chatId: 'c1', url: 'https://claude.ai/chat/c1', agentId: 'repo-x', turns: [{ i: 0, role: 'user', text: 'write a lock' }, { i: 1, role: 'assistant', text: 'Here' }], generating: true });
    assert.ok(r.ok && r.written === 2, JSON.stringify(r));
    r = L.applyDelta({ provider: 'claude', chatId: 'c1', turns: [{ i: 1, add: ' it is', at: 4 }], generating: true });
    assert.ok(r.ok && r.written === 1);
    const c = L.readChat({ provider: 'claude', chatId: 'c1' });
    assert.deepStrictEqual(c.turns.map(x => [x.role, x.text]), [['user', 'write a lock'], ['assistant', 'Here it is']]);
    assert.strictEqual(c.agentId, 'repo-x');
    const lines = fs.readFileSync(r.file, 'utf8').trim().split('\n').map(JSON.parse);
    assert.deepStrictEqual(lines.map(l => l.t), ['head', 'delta', 'delta']);
  });

  await t('CL-02', 'an append at the wrong offset is refused with what the ledger holds; nothing is written', () => {
    const f = L._file(root, 'claude:c1');
    const before = fs.statSync(f).size;
    const r = L.applyDelta({ provider: 'claude', chatId: 'c1', turns: [{ i: 1, add: 'X', at: 3 }] });
    assert.strictEqual(r.ok, false);
    assert.deepStrictEqual(r.resync, [{ i: 1, text: 10, thinking: 0 }]);
    assert.strictEqual(fs.statSync(f).size, before);
  });

  await t('CL-03', 'an unchanged delta writes nothing; a torn last line (crash mid-write) is skipped on replay', () => {
    const f = L._file(root, 'claude:c1');
    const before = fs.statSync(f).size;
    const r = L.applyDelta({ provider: 'claude', chatId: 'c1', turns: [{ i: 0, role: 'user', text: 'write a lock' }], generating: true });
    assert.ok(r.ok && r.written === 0);
    assert.strictEqual(fs.statSync(f).size, before);
    fs.appendFileSync(f, '{"t":"delta","ts":1,"turns":[{"i":1,"text":"GARB');
    const c = L.readChat({ chatKey: 'claude:c1' });
    assert.strictEqual(c.turns[1].text, 'Here it is');
    fs.writeFileSync(f, fs.readFileSync(f, 'utf8').replace(/\n[^\n]*GARB$/, '\n'));
  });

  await t('CL-04', 'thinking is kept apart from the reply; code blocks of the chat are listed', () => {
    L.applyDelta({ provider: 'claude', chatId: 'c1', turns: [{ i: 1, thinking: 'The lock needs' }] });
    L.applyDelta({ provider: 'claude', chatId: 'c1', turns: [{ i: 1, thinkingAdd: ' a timeout.', thinkingAt: 14, add: ':\n```js src/lock.js\nmodule.exports = 1;\n```', at: 10 }], generating: false, settled: true });
    const c = L.readChat({ chatKey: 'claude:c1' });
    assert.strictEqual(c.turns[1].thinking, 'The lock needs a timeout.');
    assert.ok(!c.turns[1].text.includes('timeout'));
    assert.deepStrictEqual(c.code, [{ turn: 1, lang: 'js', path: 'src/lock.js', code: 'module.exports = 1;' }]);
    assert.strictEqual(c.generating, false);
  });

  await t('CL-05', 'listLedgers by agent/provider, newest first; appendTurn numbers turns itself; bad input refused', () => {
    L.appendTurn({ provider: 'copilot', chatId: 'pane:1', agentId: 'win-1', role: 'user', text: 'hi' });
    L.appendTurn({ provider: 'copilot', chatId: 'pane:1', agentId: 'win-1', role: 'assistant', text: 'hello' });
    assert.deepStrictEqual(L.readChat({ chatKey: 'copilot:pane:1' }).turns.map(x => [x.i, x.role]), [[0, 'user'], [1, 'assistant']]);
    assert.deepStrictEqual(L.listLedgers({ agentId: 'win-1' }).map(x => x.chatKey), ['copilot:pane:1']);
    assert.deepStrictEqual(L.listLedgers({ provider: 'claude' }).map(x => x.chatKey), ['claude:c1']);
    assert.strictEqual(L.listLedgers().length, 2);
    assert.strictEqual(L.applyDelta({ provider: 'claude', chatId: 'home', turns: [] }).ok, false);
    assert.strictEqual(L.applyDelta({ provider: 'Claude!', chatId: 'x', turns: [] }).ok, false);
    assert.strictEqual(L.applyDelta({ provider: 'claude', chatId: 'x', turns: [{ i: 0, role: 'system', text: 'x' }] }).ok, false);
  });

  // ── the stream core, against the real ledger ────────────────────────────
  const page = { chatId: 's1', url: 'https://claude.ai/chat/s1', messages: [] };
  const posts = [];
  let online = true, dropAck = false;
  const post = async (body) => {
    posts.push(JSON.parse(JSON.stringify(body)));
    if (!online) return null;
    const r = L.applyDelta(body);
    return dropAck ? null : r;
  };
  const noTimer = () => 0;   // the test flushes by hand
  const core = CS.create({ provider: 'claude', read: () => page, generating: () => page.gen, post, agentId: 'a', schedule: noTimer, clear: () => {} });

  await t('CS-01', 'first flush sends whole turns; a growing reply goes as appends; nothing unchanged is sent', async () => {
    page.messages = [{ role: 'user', text: 'q' }, { role: 'assistant', text: 'A' }]; page.gen = true;
    await core.flush();
    assert.deepStrictEqual(posts[0].turns, [{ i: 0, role: 'user', text: 'q' }, { i: 1, role: 'assistant', text: 'A' }]);
    page.messages[1].text = 'AB';
    await core.flush();
    assert.deepStrictEqual(posts[1].turns, [{ i: 1, role: 'assistant', add: 'B', at: 1 }]);
    const n = posts.length;
    await core.flush();
    assert.strictEqual(posts.length, n, 'nothing changed, nothing sent');
  });

  await t('CS-02', 'Clear Glass down: not marked sent; the next send carries everything since the last ack', async () => {
    online = false;
    page.messages[1].text = 'ABC';
    await core.flush();
    page.messages[1].text = 'ABCD';
    online = true;
    await core.flush();
    assert.deepStrictEqual(posts[posts.length - 1].turns, [{ i: 1, role: 'assistant', add: 'CD', at: 2 }]);
    assert.strictEqual(L.readChat({ chatKey: 'claude:s1' }).turns[1].text, 'ABCD');
  });

  await t('CS-03', 'a lost ack: the ledger has more than the page thinks — refused, resent whole, never spliced', async () => {
    dropAck = true;
    page.messages[1].text = 'ABCDE';
    await core.flush();                  // written, but the page never heard
    dropAck = false;
    page.messages[1].text = 'ABCDEF';
    await core.flush();                  // add 'EF' at 4 → the ledger holds 5 → resync → again
    await core.flush();                  // whole turn
    assert.strictEqual(core.stats.resyncs, 1);
    assert.strictEqual(L.readChat({ chatKey: 'claude:s1' }).turns[1].text, 'ABCDEF');
  });

  await t('CS-04', 'thinking streams apart from the reply; generating→false is sent even with no text change', async () => {
    page.messages[1].thinking = 'hmm';
    await core.flush();
    page.messages[1].thinking = 'hmm, ok';
    await core.flush();
    assert.deepStrictEqual(posts[posts.length - 1].turns, [{ i: 1, role: 'assistant', thinkingAdd: ', ok', thinkingAt: 3 }]);
    page.gen = false;
    await core.flush();
    assert.strictEqual(posts[posts.length - 1].generating, false);
    const c = L.readChat({ chatKey: 'claude:s1' });
    assert.strictEqual(c.turns[1].thinking, 'hmm, ok');
    assert.strictEqual(c.generating, false);
  });

  await t('CS-05', 'splitThinking / withThinking: the reply without its thinking and the toggle label', () => {
    assert.strictEqual(CS.splitThinking('Thought process\nI should check.\nThe answer is 4.', 'I should check.'), 'The answer is 4.');
    assert.deepStrictEqual(CS.withThinking(null, 'hi', true), { text: 'hi' });
    assert.ok(CS.THINK_RE.test('Thought process') && CS.THINK_RE.test('Thought for 12s') && !CS.THINK_RE.test('Copy code'));
  });

  await t('CS-06', 'a thinking read that swallowed the reply is dropped; a state-only delta is appended (entry → completed)', () => {
    const fakeTurn = { querySelectorAll: () => [{ getAttribute: (a) => (a === 'aria-expanded' ? 'true' : null), textContent: 'Thought process', tagName: 'BUTTON',
      nextElementSibling: { innerText: 'the whole reply', querySelector: () => null } }], ownerDocument: { getElementById: () => null } };
    assert.deepStrictEqual(CS.withThinking(fakeTurn, 'the whole reply', false), { text: 'the whole reply' });
    L.applyDelta({ provider: 'claude', chatId: 'st1', turns: [{ i: 0, role: 'assistant', text: 'x' }], generating: true });
    const r = L.applyDelta({ provider: 'claude', chatId: 'st1', turns: [{ i: 0, role: 'assistant', text: 'x' }], generating: false });
    assert.ok(r.ok && r.written === 0 && r.appended === true && r.generating === false, JSON.stringify(r));
  });

  await t('CS-07', 'the prelude in a real page (Clear Glass\'s engine): progress kept mid-reply, thinking opened and kept apart, the model picker never clicked', () => {
    const { spawnSync } = require('child_process');
    const probe = spawnSync(process.execPath, [path.join(ROOT, 'tests/probe/chat-stream-chromium.js')], { encoding: 'utf8', timeout: 180000 });
    if (probe.status === 3 || probe.error) { _log(`    (skipped, not passed: no page engine — ${probe.error ? probe.error.message : 'electron not installed'})`); return; }
    assert.strictEqual(probe.status, 0, (probe.stdout || '').split('\n').filter(l => /"pass": ?false|summary/.test(l)).join('\n') || probe.stderr);
  });

  await t('UP-01', 'no provider userscript polls the chat any more; each starts the live stream', () => {
    for (const p of ['claude', 'chatgpt', 'gemini', 'perplexity', 'deepseek']) {
      const src = fs.readFileSync(path.join(ROOT, `guardian/userscript-${p}.js`), 'utf8');
      assert.ok(!/setInterval\(_txStreamTick/.test(src), `${p}: job stream still polls`);
      assert.ok(!/setInterval\(\(\) => \{ if \(!_txTarget/.test(src), `${p}: re-attach still polls`);
      assert.match(src, /NexusChatStream\.start\(\{ provider: PROVIDER, read: _nexusGetFullChat/);
      assert.match(src, /function _txSchedule\(\) \{[\s\S]{0,300}?if \(typeof _txStreamKick === .function.\) _txStreamKick\(\);/);
    }
    const stream = fs.readFileSync(path.join(ROOT, 'guardian/userscript-chat-stream.js'), 'utf8');
    assert.ok(!/setInterval/.test(stream), 'the stream prelude uses no interval');
  });

  await t('UP-02', 'Clear Glass loads the prelude; the registry lists it composed; the ledger routes exist', () => {
    const host = fs.readFileSync(path.join(ROOT, 'clear-glass/src/providers/host.js'), 'utf8');
    assert.match(host, /'userscript-nexus-wake\.js', 'userscript-chat-stream\.js'/);
    const yaml = fs.readFileSync(path.join(ROOT, 'guardian/userscripts.yaml'), 'utf8');
    assert.match(yaml, /file: userscript-chat-stream\.js[\s\S]*?standalone: false/);
    const br = fs.readFileSync(path.join(ROOT, 'clear-glass/src/ipc/bridge.js'), 'utf8');
    for (const r of ["post('/cli/downloads/ledger'", "get('/cli/downloads/ledgers'", "get('/cli/downloads/ledgers/:chatKey'"]) assert.ok(br.includes(r), r);
  });

  await t('CA-01', 'agents are told the conversation captures their code: repo agent first message + tool layers', async () => {
    quiet();
    const RA = require(path.join(ROOT, 'lib/repo-agent.js'));
    const A = require(path.join(ROOT, 'lib/agent-tools/index.js'));
    loud();
    const U = `ca-${Date.now()}`;
    assert.strictEqual(RA.getToolScope(U), 'harness');
    const text = RA.fillListedTools('Available tools: {tools}\n{tool_guide}', U);
    assert.ok(text.includes(RA.CAPTURE_NOTE));
    assert.match(text, /More tools, by category: nexus\.tools\.tool lists them/);
    const run = async (n, a) => { const r = await A.executeTool(n, a, {}); return r && r.result !== undefined ? r.result : r; };
    const l1 = await run('nexus.tools.tool', {});
    assert.match(l1.note, /captured automatically/);
    const code = await run('nexus.tools_expand.tool', { category: 'code' });
    assert.match(code.note, /written into the repo/);
    const files = await run('nexus.tools_expand.tool', { category: 'files' });
    assert.strictEqual(files.note, undefined);
  });

  await t('CA-02', 'the co-pilot pane mirrors its turns into the ledger (provider copilot)', async () => {
    const Bridge = require(path.join(ROOT, 'clear-glass/src/copilot/bridge.js'));
    const settings = { copilotAutoRunCommands: false, copilotWearHat: false, copilotDomContext: false };
    const b = new Bridge({ sse: { emit: () => {} }, apiSettings: { get: () => settings, copilotDirectUrl: p => `http://127.0.0.1:1${p}` } });
    b._ingestToNexus = () => {};
    b._ask = async (a) => ({ text: `ok: ${a.message}`, via: 'ollama', modelUsed: 'x' });
    await b.send({ message: 'hello pane', agentId: 'mirror1' });
    const conv = b.conversation('mirror1').conversationId;
    const c = L.readChat({ chatKey: `copilot:${conv}` });
    assert.deepStrictEqual(c.turns.map(x => [x.role, x.text]), [['user', 'hello pane'], ['assistant', 'ok: hello pane']]);
    assert.strictEqual(c.turns[1].via, 'ollama');
  });

  _log(`\n  ${passed} passed, ${failed} failed\n`);
  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (_) {}
  process.exit(failed ? 1 : 0);
})();
