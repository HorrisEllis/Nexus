'use strict';
/** Wake wiring for the mesh path: agent hint injection, agent-initiated wake loop, wake replies pinned to the userscript tab the agent spoke in (2026-09-19). Only the AGENT ever says "hey nexus". */
const assert = require('assert');
const fs = require('fs'), os = require('os'), path = require('path'), http = require('http'), vm = require('vm');
const { HINT, DEFAULT_MODES, hintMode, createHintInjector } = require('../../guardian/lib/wake-hint');
const { createWakeLoop, createCopilotAsk, extractWake } = require('../../guardian/lib/wake-loop');
const { createLadder } = require('../../guardian/lib/dispatch-ladder');
const { createAgentRegistry } = require('../../guardian/lib/agent-registry');
const { startWakeRelay } = require('../../clear-glass/src/copilot/wake-relay');
let passed = 0, failed = 0;
async function test(id, desc, fn) { try { await fn(); console.log(`   ${id} ${desc}`); passed++; } catch (e) { console.error(`   ${id} ${desc}\n    ${e.stack}`); failed++; } }
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const read = (p) => fs.readFileSync(path.join(__dirname, '../..', p), 'utf8');

(async () => {
  await test('WK-001', 'the hint text and per-provider modes are byte-identical to the userscript (one definition, two runtimes)', () => {
    const us = read('guardian/userscript-nexus-wake.js');
    assert.strictEqual(vm.runInNewContext(us.match(/const HINT = ([\s\S]*?);\n/)[1]), HINT);
    assert.strictEqual(JSON.stringify(vm.runInNewContext('(' + us.match(/const HINT_MODE_DEFAULTS = (\{[\s\S]*?\});/)[1] + ')')), JSON.stringify(DEFAULT_MODES));
  });

  await test('WK-002', 'modes: claude off; chatgpt once (per agent tab, only after commit); always; env override; wake replies and empty prompts never get it', () => {
    const inj = createHintInjector({ env: {} });
    assert.strictEqual(inj.apply({ provider: 'claude', agentId: 'a', prompt: 'p' }).injected, false);
    const a = inj.apply({ provider: 'chatgpt', agentId: 'mesh-chatgpt-work', prompt: 'do it' });
    assert.ok(a.injected && a.prompt === 'do it\n\n' + HINT);
    assert.ok(inj.apply({ provider: 'chatgpt', agentId: 'mesh-chatgpt-work', prompt: 'again' }).injected, 'not spent until committed');
    inj.commit(a.key);
    assert.strictEqual(inj.apply({ provider: 'chatgpt', agentId: 'mesh-chatgpt-work', prompt: 'again' }).injected, false);
    assert.ok(inj.apply({ provider: 'chatgpt', agentId: 'mesh-chatgpt-personal', prompt: 'x' }).injected, 'a different account/tab is a different conversation');
    assert.strictEqual(inj.apply({ provider: 'gemini', agentId: 'g', command: 'wake-reply', prompt: 'x' }).injected, false);
    assert.strictEqual(inj.apply({ provider: 'gemini', agentId: 'g', prompt: '   ' }).injected, false);
    assert.strictEqual(hintMode('claude', { GUARDIAN_WAKE_HINT_CLAUDE: 'always' }), 'always');
    assert.strictEqual(hintMode('grok', {}), 'once');
    const always = createHintInjector({ env: { GUARDIAN_WAKE_HINT_GEMINI: 'always' } });
    always.commit(always.apply({ provider: 'gemini', agentId: 'g', prompt: 'p' }).key);
    assert.ok(always.apply({ provider: 'gemini', agentId: 'g', prompt: 'p2' }).injected);
  });

  // ── ladder integration ──
  const job = (o = {}) => ({ id: 'j1', provider: 'chatgpt', prompt: 'refactor the repo', command: 'ask', ...o });
  function lad(sends, env = {}) {
    const calls = [], q = [...sends];
    const mesh = { send: async (a) => { calls.push(a); return q.shift() || { ok: true, sent: true, text: 'ok' }; }, diagnose: async () => ({ ok: true, repaired: true, selectors: { input: '#x' } }) };
    const registry = createAgentRegistry({ dir: fs.mkdtempSync(path.join(os.tmpdir(), 'wk-')) });
    return { calls, ladder: createLadder({ registry, mesh, mode: () => 'mesh-first', wakeHint: createHintInjector({ env }) }) };
  }
  await test('WK-003', 'the hint is added to the prompt SENT to the mesh, exactly once, and the stored job prompt is untouched', async () => {
    const h = lad([{ ok: false, sent: false, stage: 'input_not_found' }, { ok: true, sent: true, text: 'ok' }]);
    const j = job(); const r = await h.ladder.attempt(j);
    assert.strictEqual(r.kind, 'complete'); assert.strictEqual(j.prompt, 'refactor the repo');
    assert.strictEqual(h.calls.length, 2, 'send, repair, retry');
    for (const c of h.calls) assert.strictEqual(c.prompt, 'refactor the repo\n\n' + HINT, 'repair retry must not add it twice');
    assert.deepStrictEqual(r.trail[0].wakeHint, { injected: true, mode: 'once' });
  });
  await test('WK-004', 'a mesh pre-flight failure (nothing sent) does NOT use up the hint: the next job still gets it; a possibly-sent one does', async () => {
    const h = lad([{ ok: false, sent: false, stage: 'no_webview' }, { ok: true, sent: true, text: 'a' }, { ok: true, sent: true, text: 'b' }]);
    await h.ladder.attempt(job({ id: 'a' })); await h.ladder.attempt(job({ id: 'b' })); await h.ladder.attempt(job({ id: 'c' }));
    assert.ok(h.calls[1].prompt.includes(HINT), 'second job still carries the hint after a pre-flight failure');
    assert.ok(!h.calls[2].prompt.includes(HINT), 'spent once actually sent');
  });
  await test('WK-005', 'claude jobs are sent as typed (mode off); a wake-reply job is never hinted', async () => {
    const h = lad([]); await h.ladder.attempt(job({ provider: 'claude' }));
    assert.strictEqual(h.calls[0].prompt, 'refactor the repo');
    const h2 = lad([]); await h2.ladder.attempt(job({ command: 'wake-reply' })); assert.strictEqual(h2.calls[0].prompt, 'refactor the repo');
  });

  // ── wake extraction ──
  await test('WK-010', 'extractWake: only a line that STARTS with the wake phrase counts; prose, fenced code and quotes are ignored', () => {
    assert.strictEqual(extractWake('Working on it.\n\nhey nexus, what gaps are open in guardian?'), 'what gaps are open in guardian?');
    assert.strictEqual(extractWake('Hey NEXUS: list failing tests\nand skip the slow ones\n\nthanks'), 'list failing tests\nand skip the slow ones');
    assert.strictEqual(extractWake('I could say hey nexus, do x but that is not a request'), null);
    assert.strictEqual(extractWake('Example:\n```\nhey nexus, run everything\n```\ndone'), null);
    assert.strictEqual(extractWake('> hey nexus, quoted from the docs'), null);
    assert.strictEqual(extractWake('hey nexus,'), null);
    assert.strictEqual(extractWake('okay nexus, first\n\nhey nexus, second'), 'first');
  });

  // ── wake loop ──
  function loop(jobs, { ans = { ok: true, text: 'live data' }, maxDepth = 3 } = {}) {
    const created = [], dispatched = [], events = [], asked = [];
    const wl = createWakeLoop({ askCopilot: async (a, o) => { asked.push([a, o]); return typeof ans === 'function' ? ans() : ans; },
      createJob: (o) => { const j = { id: 'reply-' + (created.length + 1), ...o }; created.push(j); jobs[j.id] = j; return j; }, dispatchJob: (j) => dispatched.push(j.id),
      getJob: (id) => jobs[id], bus: { emit: (e, d) => events.push([e, d]) }, maxDepth });
    return { wl, created, dispatched, events, asked };
  }
  const meshJob = (o = {}) => ({ id: 'm1', provider: 'chatgpt', transport: 'mesh', command: 'ask', agentId: 'mesh-chatgpt-work', accountId: 'work', responseText: 'thinking\n\nhey nexus, is the build green?', wakeDepth: 0, ...o });

  await test('WK-011', 'a mesh answer that asks NEXUS is answered: copilot asked, a wake-reply job created for the SAME agent/account, dispatched', async () => {
    const jobs = { m1: meshJob() }; const h = loop(jobs);
    const r = await h.wl.handleComplete({ jobId: 'm1' });
    assert.strictEqual(r.replied, 'reply-1'); assert.strictEqual(h.asked[0][0], 'is the build green?'); assert.strictEqual(h.asked[0][1].sessionId, 'wake-mesh-chatgpt-work');
    const c = h.created[0];
    assert.deepStrictEqual([c.command, c.provider, c.prompt, c.source, c.agentId, c.accountId, c.wakeDepth], ['wake-reply', 'chatgpt', '[NEXUS] answer to your "hey nexus, is the build green?"\n\nlive data', 'copilot', 'mesh-chatgpt-work', 'work', 1]);
    assert.strictEqual(c.transport, null, 'a mesh wake is answered through the mesh again');
    assert.deepStrictEqual(h.dispatched, ['reply-1']); assert.ok(h.events.some(e => e[0] === 'guardian.wake.replied'));
  });
  await test('WK-012', '0.39.252 — userscript-delivered (ncp / unpinned) jobs ARE answered here, once, pinned back to that userscript tab; the page no longer answers (James: "is supposed to be injected into the chat like a job")', async () => {
    const h = loop({ m1: meshJob({ transport: 'ncp' }), m2: meshJob({ id: 'm2', transport: null }) });
    const r1 = await h.wl.handleComplete({ jobId: 'm1' }), r2 = await h.wl.handleComplete({ jobId: 'm2' });
    assert.ok(r1.replied && r2.replied, JSON.stringify([r1, r2]));
    assert.strictEqual(h.asked.length, 2);
    assert.deepStrictEqual(h.created.map(c => [c.command, c.transport, c.agentId, c.accountId]), [['wake-reply', 'ncp', 'mesh-chatgpt-work', 'work'], ['wake-reply', 'ncp', 'mesh-chatgpt-work', 'work']]);
    assert.strictEqual((await h.wl.handleComplete({ jobId: 'm1' })).skipped, 'already_handled');
  });
  await test('WK-017', '0.39.252 — the wake is read from the COMPLETED reply: the whole request reaches copilot, and the agent is told what the answer answers', async () => {
    const full = "hey nexus, what's the current state of the dangling-hook failures, including the open gaps and any recent test results?";
    const h = loop({ j: meshJob({ id: 'j', transport: 'ncp', responseText: full }) });
    await h.wl.handleComplete({ jobId: 'j' });
    assert.strictEqual(h.asked[0][0], full.replace(/^hey nexus,\s*/i, ''));
    assert.ok(h.created[0].prompt.startsWith('[NEXUS] answer to your "hey nexus, what\'s the current state of the dangling-hook failures'), h.created[0].prompt.slice(0, 120));
  });
  await test('WK-018', '0.39.252 — Clear Glass\'s wake-relay leaves an AGENT wake (role assistant, as cortex emits it) to this loop: no copilot call, no guardian job — it used to answer the streaming fragment a second time', async () => {
    const calls = { copilot: 0, guardian: 0 }, logs = [];
    const mk = (fn) => new Promise((res) => { const s = http.createServer(fn); s.listen(0, '127.0.0.1', () => res(s)); });
    const cortex = await mk((q, r) => { r.writeHead(200, { 'Content-Type': 'text/event-stream' }); r.write(`data: ${JSON.stringify({ type: 'nexus.wake.detected', agent: 'chatgpt', role: 'assistant', account: 'work', request: 'w' })}\n\n`); });
    const copilot = await mk((q, r) => { calls.copilot++; r.writeHead(200); r.end(JSON.stringify({ text: 'Hello! How can I assist you today?' })); });
    const guardian = await mk((q, r) => { calls.guardian++; r.writeHead(200); r.end(JSON.stringify({ ok: true, jobId: 'J9' })); });
    const relay = startWakeRelay({ injectAnswer: async () => { calls.overlay = (calls.overlay || 0) + 1; return { ok: true }; } },
      { cortexPort: cortex.address().port, copilotPort: copilot.address().port, guardianPort: guardian.address().port, log: (m) => logs.push(m) });
    for (let i = 0; i < 40 && !logs.some(l => /left to guardian/.test(l)); i++) await sleep(30);
    await sleep(200);
    relay.stop(); [cortex, copilot, guardian].forEach(s => s.close());
    assert.ok(logs.some(l => /agent wake from chatgpt left to guardian's wake-loop/.test(l)), 'the relay must say where the agent wake went: ' + JSON.stringify(logs));
    assert.deepStrictEqual([calls.copilot, calls.guardian, calls.overlay || 0], [0, 0, 0]);
  });
  await test('WK-013', 'LOOP GUARD: an agent that keeps asking is stopped at the depth cap, with an event, and copilot is not called again', async () => {
    const jobs = { m1: meshJob() }; const h = loop(jobs, { maxDepth: 3 });
    let cur = 'm1', depths = [];
    for (let i = 0; i < 6; i++) {
      const r = await h.wl.handleComplete({ jobId: cur });
      if (!r.replied) { depths.push(r.refused || r.skipped); break; }
      const next = jobs[r.replied]; Object.assign(next, { transport: 'mesh', command: 'wake-reply', responseText: 'again\n\nhey nexus, one more?' }); cur = r.replied;
    }
    assert.strictEqual(h.created.length, 3); assert.deepStrictEqual(depths, ['max_depth']); assert.strictEqual(h.asked.length, 3);
    assert.ok(h.events.some(e => e[0] === 'guardian.wake.refused' && e[1].reason === 'max_depth'));
  });
  await test('WK-014', 'copilot failing never resends anything: no job is created, a failure event is emitted', async () => {
    const h = loop({ m1: meshJob() }, { ans: { ok: false, error: 'copilot timeout' } });
    const r = await h.wl.handleComplete({ jobId: 'm1' });
    assert.strictEqual(r.failed, 'copilot timeout'); assert.strictEqual(h.created.length, 0); assert.strictEqual(h.dispatched.length, 0);
    assert.ok(h.events.some(e => e[0] === 'guardian.wake.failed'));
  });
  await test('WK-015', 'idempotent per jobId: a duplicate completion event answers once', async () => {
    const h = loop({ m1: meshJob() });
    await Promise.all([h.wl.handleComplete({ jobId: 'm1' }), h.wl.handleComplete({ jobId: 'm1' })]);
    assert.strictEqual(h.created.length, 1);
  });

  await test('WK-016', 'the copilot client posts to /api/prompt/tools (what the userscript uses, not lifeline) and a 300 KB unicode answer survives', async () => {
    let got;
    const srv = http.createServer((q, r) => { let b = ''; q.setEncoding('utf8'); q.on('data', c => b += c); q.on('end', () => { got = { url: q.url, body: JSON.parse(b) }; r.writeHead(200, { 'Content-Type': 'application/json' }); r.end(JSON.stringify({ ok: true, text: '日本語🚀'.repeat(50000) })); }); });
    await new Promise(r => srv.listen(0, '127.0.0.1', r));
    const ask = createCopilotAsk({ url: `http://127.0.0.1:${srv.address().port}`, timeoutMs: 5000 });
    const r = await ask('q ünï', { sessionId: 's1' });
    assert.strictEqual(got.url, '/api/prompt/tools'); assert.strictEqual(got.body.prompt, 'q ünï'); assert.strictEqual(got.body.channel, 'wake');
    assert.strictEqual(r.text, '日本語🚀'.repeat(50000)); srv.close();
    assert.strictEqual((await createCopilotAsk({ url: 'http://127.0.0.1:1', timeoutMs: 500 })('x')).ok, false);
  });

  // ── the real wake relay against fake cortex / copilot / guardian ──
  await test('WK-020', 'a NON-agent wake (no role — not the assistant\'s own reply; agent wakes are WK-018) is still answered by the relay via copilot, as a guardian job PINNED to that userscript tab (transport ncp) with the account', async () => {
    const seen = {};
    const mk = (fn) => new Promise((res) => { const s = http.createServer(fn); s.listen(0, '127.0.0.1', () => res(s)); });
    const cortex = await mk((q, r) => { r.writeHead(200, { 'Content-Type': 'text/event-stream' }); r.write(`data: ${JSON.stringify({ type: 'nexus.wake.detected', agent: 'chatgpt', account: 'work', agentId: 'mesh-chatgpt-work', request: 'status?' })}\n\n`); });
    const copilot = await mk((q, r) => { let b = ''; q.on('data', c => b += c); q.on('end', () => { seen.copilot = JSON.parse(b); r.writeHead(200); r.end(JSON.stringify({ text: 'all green' })); }); });
    const guardian = await mk((q, r) => { let b = ''; q.setEncoding('utf8'); q.on('data', c => b += c); q.on('end', () => { seen.guardian = { url: q.url, body: JSON.parse(b) }; r.writeHead(200); r.end(JSON.stringify({ ok: true, jobId: 'J9', status: 'pending' })); }); });
    const relay = startWakeRelay({ injectAnswer: async () => ({ ok: true }) }, { cortexPort: cortex.address().port, copilotPort: copilot.address().port, guardianPort: guardian.address().port });
    for (let i = 0; i < 100 && !seen.guardian; i++) await sleep(30);
    relay.stop(); [cortex, copilot, guardian].forEach(s => s.close());
    assert.ok(seen.guardian, 'relay never created a guardian job');
    assert.strictEqual(seen.guardian.url, '/command');
    assert.deepStrictEqual([seen.guardian.body.command, seen.guardian.body.prompt, seen.guardian.body.source, seen.guardian.body.transport, seen.guardian.body.accountId, seen.guardian.body.agentId], ['wake-reply', 'all green', 'copilot', 'ncp', 'work', 'mesh-chatgpt-work']);
    assert.strictEqual(seen.copilot.request.payload.prompt, 'status?');
  });

  await test('WK-030', 'plumbing: createJob carries identity/pin/depth; /command passes them (only ncp may be pinned by a caller); server wires both pieces', () => {
    const jobs = read('guardian/lib/jobs.js'), server = read('guardian/server.js');
    assert.ok(/createJob\(\{[^}]*accountId, agentId, transport, wakeDepth/.test(jobs) && /accountId: accountId \|\| null, agentId: agentId \|\| null, transport: transport \|\| null, wakeDepth: wakeDepth \|\| 0/.test(jobs));
    assert.ok(/transport: body\.transport === 'ncp' \? 'ncp' : undefined/.test(server), 'a caller must not be able to pin arbitrary transports');
    assert.ok(/wakeHint: require\('\.\/lib\/wake-hint'\)\.createHintInjector\(\)/.test(server));
    assert.ok(/bus\.on\('guardian\.job\.complete'[\s\S]{0,120}_wakeLoop\.handleComplete/.test(server));
  });

  // ── 0.39.279 — a wake in a chat no job owns, answered from the settled transcript ──
  const chatOf = (msgs, o = {}) => ({ chatId: 'c1', url: 'https://claude.ai/chat/c1', settled: true, generating: false, messages: msgs, ...o });
  const T = { jobGraceMs: 0 };
  await test('WK-040', '0.39.279 — an agent\'s "hey nexus" in a chat with no job is answered as a wake-reply job typed into THAT chat', async () => {
    const h = loop({});
    const r = await h.wl.handleTranscript({ provider: 'claude', tabId: 't1', agentId: 'repo-x', chat: chatOf([{ role: 'user', text: 'fix the lock' }, { role: 'assistant', text: 'Checking.\n\nhey nexus, is the build green?' }]) }, T);
    assert.strictEqual(r.replied, 'reply-1', JSON.stringify(r));
    const c = h.created[0];
    assert.deepStrictEqual([c.command, c.provider, c.transport, c.agentId, c.chatUrl, c.wakeDepth, c.join], ['wake-reply', 'claude', 'ncp', 'repo-x', 'https://claude.ai/chat/c1', 1, false]);
    assert.ok(c.prompt.startsWith('[NEXUS] answer to your "hey nexus, is the build green?"'));
    assert.deepStrictEqual(h.dispatched, ['reply-1']);
    assert.ok(h.events.some(e => e[0] === 'guardian.wake.replied' && e[1].via === 'transcript'));
  });
  await test('WK-041', '0.39.279 — not while the reply streams; not James\'s own turn; not a turn without a wake; once per turn', async () => {
    const h = loop({});
    const w = [{ role: 'assistant', text: 'hey nexus, status?' }];
    assert.strictEqual((await h.wl.handleTranscript({ provider: 'claude', chat: chatOf(w, { generating: true }) }, T)).skipped, 'not_settled');
    assert.strictEqual((await h.wl.handleTranscript({ provider: 'claude', chat: chatOf(w, { settled: false }) }, T)).skipped, 'not_settled');
    assert.strictEqual((await h.wl.handleTranscript({ provider: 'claude', chat: chatOf([{ role: 'user', text: 'hey nexus, status?' }]) }, T)).skipped, 'last_turn_not_the_agent');
    assert.strictEqual((await h.wl.handleTranscript({ provider: 'claude', chat: chatOf([{ role: 'assistant', text: 'nexus is fine' }]) }, T)).skipped, 'no_wake');
    assert.ok((await h.wl.handleTranscript({ provider: 'claude', chat: chatOf(w) }, T)).replied);
    assert.strictEqual((await h.wl.handleTranscript({ provider: 'claude', chat: chatOf(w) }, T)).skipped, 'already_handled');
    assert.strictEqual(h.asked.length, 1);
  });
  await test('WK-042', '0.39.279 — the same wake seen by both paths is answered once: a job\'s reply is left to the job path', async () => {
    const jobs = { m1: meshJob({ provider: 'claude', transport: 'ncp', responseText: 'Checking.\n\nhey nexus, is the build green?' }) };
    const h = loop(jobs);
    await h.wl.handleComplete({ jobId: 'm1' });
    const r = await h.wl.handleTranscript({ provider: 'claude', chat: chatOf([{ role: 'assistant', text: 'Checking.\n\nhey nexus, is the build green?' }]) }, { jobGraceMs: 0, listJobs: () => Object.values(jobs) });
    assert.strictEqual(r.skipped, 'job_path');
    // the other order: the transcript answered first, then the job completes with the same wake
    const h2 = loop({ m9: meshJob({ id: 'm9', provider: 'gemini', transport: 'ncp', responseText: 'hey nexus, which tests fail?' }) });
    assert.ok((await h2.wl.handleTranscript({ provider: 'gemini', chat: chatOf([{ role: 'assistant', text: 'hey nexus, which tests fail?' }]) }, T)).replied);
    assert.strictEqual((await h2.wl.handleComplete({ jobId: 'm9' })).skipped, 'answered_from_transcript');
    assert.strictEqual(h2.asked.length, 1);
  });
  await test('WK-043', '0.39.279 — loop guard on the transcript path: depth is the run of [NEXUS] answers the agent was just sent', async () => {
    const h = loop({}, { maxDepth: 2 });
    const nx = (q) => ({ role: 'user', text: `[NEXUS] answer to your "hey nexus, ${q}"\n\nx` });
    const msgs = [{ role: 'assistant', text: 'hey nexus, a?' }, nx('a?'), { role: 'assistant', text: 'hey nexus, b?' }, nx('b?'), { role: 'assistant', text: 'hey nexus, c?' }];
    const r = await h.wl.handleTranscript({ provider: 'claude', chat: chatOf(msgs) }, T);
    assert.strictEqual(r.refused, 'max_depth'); assert.strictEqual(h.asked.length, 0);
    const r2 = await h.wl.handleTranscript({ provider: 'claude', chat: chatOf(msgs.slice(2)) }, T);
    assert.strictEqual(r2.replied && h.created[0].wakeDepth, 2);
  });
  await test('WK-044', '0.39.279 — plumbing: createJob keeps chatUrl, the dispatcher types a job into the chat it names, server listens to transcripts', () => {
    const jobsSrc = read('guardian/lib/jobs.js');
    assert.ok(/hatInPrompt = null, chatUrl = null \}\)/.test(jobsSrc) && /chatUrl: chatUrl \|\| null,/.test(jobsSrc));
    const disp = read('guardian/lib/dispatcher.js');
    assert.ok(/if \(job\.chatUrl && process\.env\.GUARDIAN_RESUME_CHAT !== '0'\)/.test(disp) && /resumableChatUrl\(job\.provider, job\.chatUrl\)/.test(disp));
    const server = read('guardian/server.js');
    assert.ok(/bus\.on\('guardian\.ncp\.transcript'[\s\S]{0,160}_wakeLoop\.handleTranscript/.test(server));
  });

  console.log(`\n   ${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
