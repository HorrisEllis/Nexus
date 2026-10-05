'use strict';
// tests/modules/test-composed-prompt.test.js — 0.39.258.
// James: "progress. didn't work a second time." + "not to inject anything into it that i cant edit in the agent settings".
//   CP-0xx  the second job: a transcript completion's chat URL as a folder name no longer aborts GUARDIAN_COMPLETE
//   CP-1xx  the prompt is exactly the editable blocks — no layer adds text
require('../../lib/test-sandbox.js').ensure();

const assert = require('assert');
const path = require('path');
const fs = require('fs');
const os = require('os');

const ROOT = path.join(__dirname, '../..');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'composed-prompt-test-'));
process.env.JAA_DATA_DIR = TMP;
process.env.GUARDIAN_RESPONSE_NODES_DIR = path.join(TMP, 'response-nodes');   // the completion's .response node stays out of the real tree

let passed = 0, failed = 0;
async function test(id, name, fn) {
  try { await fn(); console.log(`  ✓ ${id} ${name}`); passed++; }
  catch (e) { console.log(`  ✗ ${id} ${name}\n    ${e.stack || e.message}`); failed++; }
}

async function main() {
  console.log('\n[1] the second job — completion survives a URL session id');

  await test('CP-001', 'a chat URL becomes one safe folder name (no colon, no separators, no climbing)', () => {
    const { _safeSegment } = require(path.join(ROOT, 'lib/queue.js'));
    const s = _safeSegment('https://chatgpt.com/c/6ab74053-800c-83e8'.slice(0, 40));
    assert.ok(!/[:/\\]/.test(s), s);
    assert.strictEqual(_safeSegment('../../etc').startsWith('.'), false);
    assert.strictEqual(_safeSegment(''), 'unknown');
  });

  await test('CP-002', 'PhysicalQueue.logConversation with the live failing id writes inside logsDir', () => {
    const { createQueue } = require(path.join(ROOT, 'lib/queue.js'));
    const q = createQueue({ baseDir: path.join(TMP, 'q'), logsDir: path.join(TMP, 'q', 'conversations') });
    const logsDir = q.logsDir;
    q.logConversation('https://chatgpt.com/c/6ab74053-800c-83e8', { role: 'assistant', content: 'x' });
    const dirs = fs.readdirSync(logsDir);
    assert.strictEqual(dirs.length, 1, dirs.join(','));
    assert.ok(fs.existsSync(path.join(logsDir, dirs[0], 'conversation.jsonl')));
    assert.strictEqual(q.conversationTail('https://chatgpt.com/c/6ab74053-800c-83e8').length, 1);
  });

  const { createNCPMessageHandler } = require(path.join(ROOT, 'guardian/lib/ncp-handler.js'));
  function handlerWith(logConversation) {
    const jobs = new Map(); const events = [];
    const h = createNCPMessageHandler({
      nc: { _req: async () => ({}) }, ncp: { updateClient() {}, push() {}, handleHeartbeat() {} },
      bus: { emit: (type, data) => events.push({ type, data }) }, jaa: { insert() {}, query: () => [] }, jobs,
      updateJob: (id, p) => Object.assign(jobs.get(id) || {}, p), cockpitBroadcast() {},
      physQueue: { logConversation }, baseline: { observe() {} }, evLedger: null, activeQueues: new Map(),
      extractCodeBlocks: () => [], extractToolCallsFromDOM: () => [], findActiveSeamCompartment: () => null,
    });
    return { h, jobs, events };
  }

  await test('CP-003', 'a transcript completion logs under the chat id (the URL\'s last segment), not the URL', () => {
    let got = null;
    const { h, jobs } = handlerWith((id) => { got = id; });
    jobs.set('j1', { id: 'j1', prompt: 'hello there', status: 'dispatched', provider: 'chatgpt' });
    h({ type: 'GUARDIAN_COMPLETE', jobId: 'j1', provider: 'chatgpt', text: 'hi', chatUrl: 'https://chatgpt.com/c/6ab74053-800c-83e8-8241-b83dbbd3a315', source: 'transcript' });
    assert.ok(got && !got.includes(':') && !got.includes('/'), `session id ${got}`);
    assert.ok(got.startsWith('6ab74053'), got);
  });

  await test('CP-004', 'a conversation-log failure no longer stops guardian.job.complete (the tab is released)', () => {
    const { h, jobs, events } = handlerWith(() => { throw new Error("ENOENT: no such file or directory, mkdir 'https:\\chatgpt.com'"); });
    jobs.set('j2', { id: 'j2', prompt: 'hello there', status: 'dispatched', provider: 'chatgpt' });
    const warn = console.warn; console.warn = () => {};
    try { h({ type: 'GUARDIAN_COMPLETE', jobId: 'j2', provider: 'chatgpt', text: 'hi', chatUrl: 'https://chatgpt.com/c/abc' }); }
    finally { console.warn = warn; }
    assert.strictEqual(jobs.get('j2').status, 'complete');
    assert.ok(events.some(e => e.type === 'guardian.job.complete' || (e.data && e.data.type === 'guardian.job.complete')),
      `no guardian.job.complete among: ${events.map(e => e.type).join(', ')}`);
  });

  console.log('\n[2] the prompt is exactly the editable blocks');
  const PB = require(path.join(ROOT, 'lib/repo-prompt-blocks.js'));

  await test('CP-101', 'defaults render persona, protocols, context and the question — and nothing unnamed', () => {
    const r = PB.render({ persona: 'PERSONA', blocks: PB.DEFAULT_BLOCKS, message: 'hello', context: { kind: 'map', block: '- 77 files' }, backend: 'guardian' });
    // 0.39.266 context-map off by default, 0.39.265 voice; 0.39.279 memory/atlas/directory off → context-tools, wake;
    // 0.39.326 (SB34) context of every kind reaches the model through context-card — a map context included
    assert.deepStrictEqual(r.used, ['persona', 'learn', 'inject', 'tool-syntax', 'tool-guide', 'context-card', 'context-tools', 'wake', 'voice', 'question']);
    // every line of the output is either a block's own text or placeholder data
    const allowed = new Set([...PB.DEFAULT_BLOCKS.flatMap(b => b.text.split('\n')), 'PERSONA', '- 77 files', 'hello', '']);
    for (const line of r.text.split('\n')) assert.ok(allowed.has(line), `unexplained line: ${JSON.stringify(line)}`);
    // "hey nexus" is sent only as the editable 'wake' block's own line (0.39.279), never added outside a block
    assert.ok(!/NEXUS CONTEXT|USER:|You are running as/.test(r.text));
    assert.ok(r.text.split('\n').filter(l => /hey nexus/i.test(l)).every(l => PB.DEFAULT_BLOCKS.find(b => b.id === 'wake').text === l));
    assert.ok(!PB.render({ persona: 'P', blocks: PB.DEFAULT_BLOCKS.map(b => b.id === 'wake' ? { ...b, enabled: false } : b), message: 'm', backend: 'guardian' }).text.includes('hey nexus'));
  });

  await test('CP-102', 'a disabled block is not sent; an edited block is sent exactly as edited', () => {
    const blocks = PB.DEFAULT_BLOCKS.map(b => b.id === 'learn' ? { ...b, enabled: false } : b.id === 'inject' ? { ...b, text: 'MY INJECT RULE' } : b);
    const r = PB.render({ persona: 'P', blocks, message: 'q', backend: 'ollama' });
    assert.ok(!r.text.includes('@learn'));
    assert.ok(r.text.includes('MY INJECT RULE'));
    // 0.39.336 SB36 — tool-syntax is for every tool-loop backend: Ollama's loop runs as a plain generate (no native tools
    // reach the bridge), so the written ```tool block is its only way to call a tool
    assert.ok(r.text.includes('```tool'), 'ollama is told how to call a tool');
    assert.ok(!PB.render({ persona: 'P', blocks, message: 'q', backend: null }).text.includes('```tool'), 'no tool loop, no call syntax');
  });

  await test('CP-103', 'the question is always sent, even with its block off', () => {
    const blocks = PB.DEFAULT_BLOCKS.map(b => ({ ...b, enabled: false }));
    assert.strictEqual(PB.render({ persona: 'P', blocks, message: 'just this' }).text, 'just this');
  });

  await test('CP-104', 'edits persist per repo, unknown ids are refused, reset restores the default', () => {
    const u = 'repo-test-' + Date.now();
    assert.strictEqual(PB.setBlocks(u, [{ id: 'nope', text: 'x' }]).ok, false);
    assert.ok(PB.setBlocks(u, [{ id: 'question', text: 'Q: {message}' }]).ok);
    assert.strictEqual(PB.getBlocks(u).find(b => b.id === 'question').text, 'Q: {message}');
    assert.strictEqual(PB.getBlocks(u).find(b => b.id === 'question').edited, true);
    assert.ok(PB.resetBlocks(u, ['question']).ok);
    assert.strictEqual(PB.getBlocks(u).find(b => b.id === 'question').text, PB.DEFAULT_BLOCKS.find(b => b.id === 'question').text);
  });

  await test('CP-105', 'repo-agent compose() is the blocks render — no identity line, no protocol text outside a block', () => {
    const RA = require(path.join(ROOT, 'lib/repo-agent.js'));
    const blocks = PB.DEFAULT_BLOCKS.map(b => b.id === 'learn' ? { ...b, enabled: false } : b);
    const t = RA.compose({ hat: { personaPrompt: 'P' }, message: 'hi', context: { kind: null, block: '' }, blocks, backend: 'guardian' });
    assert.ok(!t.includes('@learn'), 'disabled learn block leaked');
    assert.strictEqual(t, PB.render({ persona: 'P', blocks, message: 'hi', backend: 'guardian' }).text);
  });

  await test('CP-106', 'repo-context bare mode returns data lines only (headings live in the editable blocks)', () => {
    const RC = require(path.join(ROOT, 'lib/repo-context.js'));
    const g = { files: ['a.js', 'b/c.js'], out: new Map(), inn: new Map(), unresolved: 0 };
    assert.ok(RC.overview(g).includes('## This project'));
    assert.ok(!RC.overview(g, undefined, { bare: true }).includes('##'));
  });

  console.log('\n[3] copilot composed mode — nothing added, follow-ups are tool results only');
  const TR = require(path.join(ROOT, 'copilot/tool-runtime.js'));

  await test('CP-201', 'first round sends the composed prompt as-is ({tools} filled); round two only the templated result', async () => {
    const sent = [];
    let round = 0;
    const dispatch = async (p) => { sent.push(p); round++;
      return round === 1 ? { ok: true, text: '```tool\n{"name": "read_file", "arguments": {"path": "x"}}\n```' } : { ok: true, text: 'final answer' }; };
    const prompt = 'P\n\nAvailable tools: {tools}\n\n───\n\nhello';
    const r = await TR.runViaAgent('chatgpt', dispatch, prompt, { composed: true, resultTemplate: 'RESULT {name}: {result}', toolScope: ['read_file'], maxIterations: 3 });
    assert.strictEqual(r.text, 'final answer');
    assert.strictEqual(sent[0], 'P\n\nAvailable tools: read_file\n\n───\n\nhello');
    assert.ok(sent[1].startsWith('RESULT read_file: '), sent[1].slice(0, 80));
    for (const p of sent) assert.ok(!/USER:|ASSISTANT:|You are the NEXUS co-pilot|YOUR TOOLS|ALWAYS look/.test(p), `copilot text leaked: ${p.slice(0, 120)}`);
  });

  await test('CP-202', 'not composed: the old path is unchanged (system prompt still sent)', async () => {
    const sent = [];
    await TR.runViaAgent('gemini', async (p) => { sent.push(p); return { ok: true, text: 'ok' }; }, 'hello', { maxIterations: 1 });
    assert.ok(sent[0].includes('USER: hello') && sent[0].includes('You are the NEXUS co-pilot'));
  });

  console.log('\n[4] guardian adds nothing to a composed job');

  await test('CP-301', 'wake-hint (mesh) skips a composed job, still hints an ordinary one', () => {
    const { createHintInjector } = require(path.join(ROOT, 'guardian/lib/wake-hint.js'));
    const w = createHintInjector({ env: {} });
    assert.strictEqual(w.apply({ provider: 'chatgpt', agentId: 'a', command: 'ask', prompt: 'x', composed: true }).prompt, 'x');
    assert.notStrictEqual(w.apply({ provider: 'chatgpt', agentId: 'b', command: 'ask', prompt: 'x' }).prompt, 'x');
  });

  await test('CP-302', 'every provider userscript: composed job → no context blob, no tools header, no wake hint', () => {
    for (const p of ['chatgpt', 'claude', 'gemini', 'perplexity', 'deepseek']) {
      const src = fs.readFileSync(path.join(ROOT, 'guardian', `userscript-${p}.js`), 'utf8');
      assert.ok(/const composed = !!\(hat && \(hat\.personaInPrompt \|\| hat\.composed\)\);\s*\n\s*if \(!hatHdr && !composed\) \{/.test(src), `${p}: context not gated`);
      assert.ok(src.includes("const toolsHdr = composed ? '' : _buildToolsHeader(scopedTools);"), `${p}: tools header not gated`);
      assert.ok(src.includes('if (!injectText(finalText, { composed }))'), `${p}: composed not passed to injectText`);
      assert.ok(src.includes('if (NEXUS && !opts.composed) text = NEXUS.decorate(text);'), `${p}: hint not gated`);
    }
  });

  await test('CP-303', 'a repo job\'s hat is marked personaInPrompt (what the userscripts gate on)', () => {
    const src = fs.readFileSync(path.join(ROOT, 'guardian/lib/jobs.js'), 'utf8');
    assert.ok(/source: 'repo', personaInPrompt: true/.test(src));
  });

  console.log('\n[5] the "copilot" position and the where-does-this-go question follow the same rule');

  await test('CP-401', 'copilot resolves its default to a backend (auto → ollama, named → guardian agent)', () => {
    const src = fs.readFileSync(path.join(ROOT, 'copilot/server.js'), 'utf8');
    const m = src.match(/function resolveDefaultBackend\(provider\) \{[\s\S]*?\n\}/);
    assert.ok(m, 'resolveDefaultBackend not found');
    const f = new Function(`${m[0]}; return resolveDefaultBackend;`)();
    assert.deepStrictEqual([f('auto').backend, f('ollama').backend, f('guardian').backend, f('chatgpt').backend, f('chatgpt').agent],
      ['ollama', 'ollama', 'guardian', 'guardian', 'chatgpt']);
    assert.ok(/p === '\/api\/prompt\/resolve'/.test(src), 'route missing');
  });

  // A fake copilot on a free port: /api/prompt/resolve answers per `resolveReply`, /api/prompt records the body.
  const http = require('http');
  const bodies = []; let resolveReply = { ok: true, provider: 'auto', backend: 'ollama', agent: null };
  const srv = await new Promise(res => { const s = http.createServer((q, r) => { let d = ''; q.on('data', c => d += c); q.on('end', () => {
    r.writeHead(200, { 'Content-Type': 'application/json' });
    if (q.url === '/api/prompt/resolve') return r.end(JSON.stringify(resolveReply));
    if (q.url === '/api/prompt') { let b = {}; try { b = JSON.parse(d); } catch (_) {} bodies.push(b); return r.end(JSON.stringify({ ok: true, text: 'answer', provider_used: b.backend })); }
    r.end('{}'); }); }); s.listen(0, '127.0.0.1', () => res(s)); });
  process.env.COPILOT_URL = `http://127.0.0.1:${srv.address().port}`;
  delete require.cache[require.resolve(path.join(ROOT, 'lib/repo-agent.js'))];
  const RA2 = require(path.join(ROOT, 'lib/repo-agent.js'));
  const RH = require(path.join(ROOT, 'lib/repo-hat.js'));
  const repo = { uuid: 'cp-auto-' + Date.now(), name: 'CP auto', compartmentId: 'cos.test.cp' };
  const forged = RH.ensureRepoHat({ repo, repoDir: null });

  await test('CP-402', 'copilot position: the composed prompt goes to the resolved backend, composed, never through the plain path', async () => {
    assert.ok(forged.ok, JSON.stringify(forged.errors));
    RA2.setProvider(repo.uuid, 'auto'); bodies.length = 0;
    const out = await RA2.dispatch({ repo, repoDir: null, message: 'hello', noContext: true });
    assert.strictEqual(bodies.length, 1);
    const b = bodies[0];
    assert.strictEqual(b.backend, 'ollama', 'must name the backend (the plain path injects)');
    assert.ok(b.tools && b.tools.composed === true, 'must be composed');
    assert.ok(b.prompt.includes('```tool'), 'ollama is told how to call a tool (0.39.336 SB36: it has no native tools)');
    assert.deepStrictEqual(out.viaCopilot && out.viaCopilot.backend, 'ollama');
  });

  await test('CP-403', 'copilot position: if copilot cannot say, nothing is sent (no fallback to an injecting path)', async () => {
    resolveReply = { ok: false, error: 'down' }; bodies.length = 0;
    const out = await RA2.dispatch({ repo, repoDir: null, message: 'hello', noContext: true });
    resolveReply = { ok: true, provider: 'auto', backend: 'ollama', agent: null };
    assert.strictEqual(out.ok, false);
    assert.ok(/nothing was sent/.test(out.error), out.error);
    assert.strictEqual(bodies.length, 0);
  });
  srv.close();

  await test('CP-404', '"where does this code go?" is the editable block: edited text used, off = not asked, empty lines dropped', () => {
    const RI = require(path.join(ROOT, 'lib/repo-inject.js'));
    const q = { code: 'x=1', syntax: 'js', symbols: [], candidates: ['a.js'], question: 'do it' };
    const def = RI.resolvePrompt(q);
    assert.ok(def.includes('Which repo-relative file does it belong in?') && def.includes('- a.js') && !def.includes('It defines'), def);
    const edited = PB.DEFAULT_BLOCKS.map(b => b.id === 'inject-resolve' ? { ...b, text: 'PATH FOR: {code}' } : b);
    assert.strictEqual(RI.resolvePrompt(q, edited), 'PATH FOR: x=1');
    assert.strictEqual(RI.resolvePrompt(q, PB.DEFAULT_BLOCKS.map(b => b.id === 'inject-resolve' ? { ...b, enabled: false } : b)), null);
    assert.ok(!PB.render({ persona: 'P', blocks: PB.DEFAULT_BLOCKS, message: 'm' }).text.includes('belong in'), 'resolve block leaked into the main prompt');
  });

  await test('CP-405', 'the side question sends only that block — no persona, no compose() wrap', () => {
    const src = fs.readFileSync(path.join(ROOT, 'lib/repo-agent.js'), 'utf8');
    assert.ok(/const ask = RI\.resolvePrompt\(\{ \.\.\.q, question: message \}, require\('\.\/repo-prompt-blocks\.js'\)\.getBlocks\(repo\.uuid\)\);/.test(src));
    assert.ok(/prompt: ask,/.test(src) && !/prompt: compose\(\{ hat, message: RI\.resolvePrompt/.test(src));
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (_) {}
  process.exit(failed ? 1 : 0);
}

main();
