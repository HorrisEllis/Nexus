'use strict';
/**
 * tests/modules/test-escalation-ladder.test.js — CT6 + CT8 (docs/2026-10-05-code-tab-and-one-router-phasemap.spec), 0.39.352.
 * James: "needs escalating retry logic and fallback routing. like if the 3b fails, switch to the 7b, then the 16b
 *        deepseek, then the agents. have all of this configurable." · "i want to see the agents activity in the code
 *        tab, in real time. like maybe have a little dot blinking next to it"
 *
 *   EL-01  the ladder: derived — the Ollama models smallest first by the size in the name, then the chain's agents;
 *          routing.escalation used exactly as written; the settings are config, not literals
 *   EL-02  climb(): 3b stops on tool errors → 7b fails → an agent answers; each climb recorded from → to; retries on a
 *          rung before climbing; nothing climbs on a reply or with escalate off; every rung tried is said
 *   EL-03  the tool loop: three failed calls in a row stop it (toolErrors, classified tool-errors, no breaker opened);
 *          a success resets the count; each call reported running then ok / failed; a throwing reporter changes nothing
 *   EL-04  copilot's sink posts to loopback only
 *   EL-05  the repo agent sends max_tool_errors and the live sink to copilot, and hands toolErrors back
 *   EL-06  idearium's tool-event route keeps the last calls per repo; a bad event is a 400, an unknown repo a 404
 *   EL-07  the code tools: code_check reads path as paths; code_edit says which key it was sent and does not read
 *   EL-08  the phase build climbs through climb(), records each attempt and climb, and passes the cap
 *   EL-09  GET /api/routing gives the ladder as it reads now; Settings → Routing has the Escalation ladder card, saving
 *          routing.escalate, escalation, escalate_on, retries_per_rung, max_tool_errors
 */
require('../../lib/test-sandbox.js').ensure();
const assert = require('assert');
const fs = require('fs');
const http = require('http');
const path = require('path');
const ROOT = path.join(__dirname, '../..');
const PR = require(path.join(ROOT, 'lib/pipeline-routing.js'));

let passed = 0, failed = 0;
async function test(id, desc, fn) {
  try { await fn(); console.log(`  ✓ ${id} ${desc}`); passed++; }
  catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${e.stack ? e.stack.split('\n').slice(0, 4).join('\n    ') : e.message}`); failed++; }
}
const quiet = async (fn) => { const l = console.log, w = console.warn; console.log = () => {}; console.warn = () => {}; try { return await fn(); } finally { console.log = l; console.warn = w; } };
const listen = (fn) => new Promise((res) => { const s = http.createServer((q, r) => { let b = ''; q.on('data', d => b += d); q.on('end', () => { r.setHeader('content-type', 'application/json'); const o = fn(q, b ? JSON.parse(b) : {}); r.statusCode = o.status || 200; r.end(JSON.stringify(o.body || {})); }); }); s.listen(0, '127.0.0.1', () => res(s)); });

(async () => {
  await test('EL-01', 'the ladder: smallest Ollama model first, then the agents; a written one exactly; settings in config', () => {
    const p = PR.policyFrom({ ollama_models: 'deepseek-coder-v2:16b,qwen2.5-coder:7b,qwen2.5-coder:3b,llama3.2:latest', chain: 'ollama,claude,chatgpt' });
    assert.deepStrictEqual(PR.ladder(p).rungs.map(r => r.provider), ['ollama:qwen2.5-coder:3b', 'ollama:qwen2.5-coder:7b', 'ollama:deepseek-coder-v2:16b', 'ollama:llama3.2:latest', 'claude', 'chatgpt']);
    assert.deepStrictEqual([PR.sizeOf('qwen2.5-coder:7b'), PR.sizeOf('deepseek-coder-v2:16b'), PR.sizeOf('llama3.2:latest'), PR.sizeOf('phi3:3.8b')], [7, 16, null, 3.8]);
    // 0.39.355 PB1: the derived ladder leaves off models under routing.min_build_b (3) — tiny:1b only with the floor at 0
    assert.deepStrictEqual(PR.ladder(PR.policyFrom({ chain: 'ollama,gemini' }), { installed: ['big:13b', 'tiny:1b'] }).rungs.map(r => r.provider), ['ollama:big:13b', 'gemini'], 'installed models when none are listed, above the floor');
    assert.deepStrictEqual(PR.ladder(PR.policyFrom({ chain: 'ollama,gemini', min_build_b: 0 }), { installed: ['big:13b', 'tiny:1b'] }).rungs.map(r => r.provider), ['ollama:tiny:1b', 'ollama:big:13b', 'gemini'], 'installed models when none are listed');
    const w = PR.ladder(PR.policyFrom({ escalation: 'ollama:a:7b > claude > ollama:b:1b', ollama_models: 'x:3b' }));
    assert.deepStrictEqual(w.rungs.map(r => r.provider), ['ollama:a:7b', 'claude', 'ollama:b:1b']); assert.strictEqual(w.from, 'routing.escalation');
    assert.deepStrictEqual(w.rungs[0], { provider: 'ollama:a:7b', base: 'ollama', model: 'a:7b' });
    const core = require(path.join(ROOT, 'idearium/lib/config-core.cjs'));
    assert.strictEqual(core.resolve('routing.escalate').def.default, true);
    assert.strictEqual(core.resolve('routing.escalate_on').def.default, 'failed,blocked,incomplete,tool-errors');
    assert.strictEqual(core.resolve('routing.max_tool_errors').def.default, 3);
    assert.strictEqual(core.resolve('routing.retries_per_rung').def.default, 1);
    assert.strictEqual(core.resolve('routing.escalation').def.type, 'string');
  });

  await test('EL-02', 'climb(): 3b tool errors → 7b fails → the agent answers; retries; no climb on a reply or when off; exhausted said', async () => {
    const rungs = PR.ladder(PR.policyFrom({ escalation: 'ollama:q:3b > ollama:q:7b > ollama:d:16b > claude' })).rungs;
    const plan = { 'ollama:q:3b': { state: 'failed', trigger: 'tool-errors' }, 'ollama:q:7b': { state: 'failed' }, 'ollama:d:16b': { state: 'incomplete' }, claude: { state: 'replied' } };
    const log = [];
    const out = await PR.climb({ rungs, policy: PR.policyFrom({}), attempt: async (rg, i, t) => ({ ...plan[rg.provider], who: rg.provider, t }),
      onOutcome: async (o, d) => log.push([o.who, d.next ? `${d.next.how}→${d.next.rung.provider}` : (d.exhausted ? 'exhausted' : 'done')]) });
    assert.strictEqual(out.who, 'claude'); assert.strictEqual(out.index, 3); assert.strictEqual(out.exhausted, false);
    assert.deepStrictEqual(log, [['ollama:q:3b', 'escalating→ollama:q:7b'], ['ollama:q:7b', 'escalating→ollama:d:16b'], ['ollama:d:16b', 'escalating→claude'], ['claude', 'done']]);
    const tries = [];
    await PR.climb({ rungs: rungs.slice(0, 2), policy: PR.policyFrom({ retries_per_rung: 2 }), attempt: async (rg, i, t) => { tries.push(`${rg.provider}#${t}`); return { state: 'failed' }; } });
    assert.deepStrictEqual(tries, ['ollama:q:3b#1', 'ollama:q:3b#2', 'ollama:q:7b#1', 'ollama:q:7b#2'], 'retries on a rung before climbing');
    let n = 0; const r1 = await PR.climb({ rungs, policy: PR.policyFrom({}), attempt: async () => { n++; return { state: 'replied' }; } });
    assert.deepStrictEqual([n, r1.index], [1, 0], 'a reply never climbs');
    n = 0; await PR.climb({ rungs, policy: PR.policyFrom({ escalate: false }), attempt: async () => { n++; return { state: 'failed' }; } });
    assert.strictEqual(n, 1, 'escalate off: one attempt');
    n = 0; await PR.climb({ rungs, policy: PR.policyFrom({ escalate_on: 'failed' }), attempt: async () => { n++; return { state: 'incomplete' }; } });
    assert.strictEqual(n, 1, 'incomplete climbs only when escalate_on names it');
    const ex = await PR.climb({ rungs: rungs.slice(0, 2), policy: PR.policyFrom({}), attempt: async () => ({ state: 'blocked' }) });
    assert.deepStrictEqual([ex.exhausted, ex.index], [true, 1], 'every rung tried is said');
    const none = await PR.climb({ rungs: [], policy: PR.policyFrom({}), attempt: async (rg, i) => ({ state: 'failed', rg, i }) });
    assert.deepStrictEqual([none.rg, none.i, none.exhausted], [null, -1, false], 'no ladder: one attempt with the call\'s own agent');
  });

  await test('EL-03', 'the tool loop: three failures in a row stop it (no breaker); a success resets; each call reported', async () => {
    const AT = require(path.join(ROOT, 'lib/agent-tools/index.js'));
    AT.registerTool({ name: 'test.flaky', description: 'x', parameters: { type: 'object', properties: {} }, execute: async (a) => (a.ok ? { ok: true } : { error: 'edits is required' }) });
    const seq = [false, false, true, false, false, false, false];
    let k = 0;
    const model = async () => ({ text: '', toolCalls: [{ name: 'test.flaky', arguments: { ok: seq[k++], path: 'src/a.js' } }] });
    const events = [];
    const loop = await AT.runToolLoop(model, 'sys', 'go', { maxIterations: 12, maxToolErrors: 3, onToolCall: (e) => { events.push(`${e.state}`); if (events.length === 2) throw new Error('reporter broke'); } });
    assert.strictEqual(loop.failed, true); assert.strictEqual(loop.toolErrors, true);
    assert.strictEqual(loop.toolCallLog.length, 6, 'two failures, a success (resets), then three failures');
    assert.ok(/3 tool calls failed in a row \(last: test\.flaky — edits is required\)/.test(loop.error), loop.error);
    assert.deepStrictEqual(events, ['running', 'failed', 'running', 'failed', 'running', 'ok', 'running', 'failed', 'running', 'failed', 'running', 'failed']);
    assert.strictEqual(PR.classify({ ok: false, error: loop.error }), 'tool-errors');
    assert.strictEqual(PR.classify({ ok: false, error: 'x', toolErrors: true }), 'tool-errors');
    PR.breaker.reset();
    for (let i = 0; i < 5; i++) PR.breaker.failure('ollama:q:3b', 'tool-errors');
    assert.strictEqual(PR.breaker.state('ollama:q:3b').open, false, 'the provider is up — no breaker');
    k = 0; const nocap = await AT.runToolLoop(async () => (k++ < 4 ? { text: '', toolCalls: [{ name: 'test.flaky', arguments: {} }] } : { text: 'done' }), 's', 'u', { maxIterations: 10 });
    assert.strictEqual(nocap.failed, undefined, 'no cap given: the loop runs as before');
  });

  await test('EL-04', 'copilot\'s sink posts to loopback only', () => {
    const T = require(path.join(ROOT, 'copilot/tool-runtime.js'));
    assert.strictEqual(T.toolEventSink('http://example.com/x'), null);
    assert.strictEqual(T.toolEventSink('https://127.0.0.1/x'), null);
    assert.strictEqual(T.toolEventSink('not a url'), null);
    const got = [];
    const f = T.toolEventSink('http://127.0.0.1:4800/api/repos/r1/agent/tool-event', { session: 's1', repoUuid: 'r1' }, (u, d) => got.push([u.pathname, JSON.parse(d)]));
    f({ state: 'failed', name: 'idearium.code_edit.tool', arguments: { path: 'a.js' }, iteration: 2, error: 'edits is required' });
    assert.strictEqual(got[0][0], '/api/repos/r1/agent/tool-event');
    assert.deepStrictEqual([got[0][1].session, got[0][1].state, got[0][1].name, got[0][1].args, got[0][1].error], ['s1', 'failed', 'idearium.code_edit.tool', '{"path":"a.js"}', 'edits is required']);
  });

  // ── through idearium and the repo agent, against a stand-in copilot ──
  const prompts = [];
  const copilot = await listen((q, body) => {
    if (q.url === '/api/route') return { body: { ok: false, error: 'no route in this test' } };
    if (q.url === '/api/route/outcome') return { body: { ok: true } };
    if (q.url === '/api/prompt') { prompts.push(body); return body.model === 'q:3b' ? { status: 502, body: { ok: false, error: '3 tool calls failed in a row (last: x — y) — not equipped for this, stopped', toolErrors: true } } : { body: { ok: true, text: 'done' } }; }
    return { status: 404 };
  });
  process.env.COPILOT_URL = `http://127.0.0.1:${copilot.address().port}`;
  process.env.NEXUS_VERSIONIUM_URL = 'http://127.0.0.1:9';
  const api = await quiet(() => import(path.join(ROOT, 'idearium/api/index.js')));
  delete require.cache[require.resolve(path.join(ROOT, 'lib/repo-agent.js'))];
  const RA = require(path.join(ROOT, 'lib/repo-agent.js'));
  const L = api.getRepoLayer();
  let made = null;
  for (let i = 0; i < 20; i++) {
    made = await quiet(async () => L.ingest({ name: `el-${Date.now()}`, source: 'test', compartmentId: 'c-el', files: [{ path: 'src/a.js', content: 'module.exports = 1;\n' }] }));
    if (!(made && made.error && /no spec-engine/.test(made.error))) break;
    await new Promise(x => setTimeout(x, 250));
  }
  const u = made.repo.uuid;

  await test('EL-05', 'the repo agent sends the cap and the live sink, and hands toolErrors back', async () => {
    RA.setToolEventSink('http://127.0.0.1:4800/');
    const fs2 = require('fs'), os = require('os');
    const dir = fs2.mkdtempSync(path.join(os.tmpdir(), 'el05-'));
    const r = await quiet(() => RA.dispatch({ repo: made.repo, repoDir: dir, message: 'build it', backend: 'ollama', model: 'q:3b', maxToolErrors: 3, noContext: true }));
    const sent = prompts[prompts.length - 1];
    assert.strictEqual(sent.tools.maxToolErrors, 3);
    assert.strictEqual(sent.tools.progressUrl, `http://127.0.0.1:4800/api/repos/${encodeURIComponent(u)}/agent/tool-event`);
    assert.strictEqual(r.ok, false); assert.strictEqual(r.toolErrors, true);
    RA.setToolEventSink(null);
    await quiet(() => RA.dispatch({ repo: made.repo, repoDir: dir, message: 'again', backend: 'ollama', model: 'q:7b', noContext: true }));
    const s2 = prompts[prompts.length - 1];
    assert.ok(!('progressUrl' in s2.tools) && !('maxToolErrors' in s2.tools), 'no sink, no cap: neither sent');
  });

  await test('EL-06', 'idearium keeps the last tool calls per repo; a bad event is a 400, an unknown repo a 404', async () => {
    const post = (b) => api._route('POST', `/api/repos/${u}/agent/tool-event`, b);
    assert.strictEqual((await post({ session: 'phrun-1', name: 'idearium.code_read.tool', state: 'running', args: '{"path":"src/a.js"}', iteration: 1 })).status, 200);
    await post({ session: 'phrun-1', name: 'idearium.code_read.tool', state: 'ok', args: '{"path":"src/a.js"}', iteration: 1 });
    const g = await api._route('GET', `/api/repos/${u}/agent/tool-events`);
    assert.deepStrictEqual(g.json.events.map(e => [e.state, e.name, e.session]), [['running', 'idearium.code_read.tool', 'phrun-1'], ['ok', 'idearium.code_read.tool', 'phrun-1']]);
    assert.strictEqual((await post({ name: 'x', state: 'weird' })).status, 400);
    assert.strictEqual((await api._route('POST', '/api/repos/nope-el/agent/tool-event', { name: 'x', state: 'ok' })).status, 404);
  });
  copilot.close();

  await test('EL-07', 'code_check reads path as paths; code_edit says which key it does not read', async () => {
    const seen = [];
    const idearium = await listen((q, body) => { seen.push([q.url, body]); return { body: { ok: true, passed: true } }; });
    process.env.IDEARIUM_PORT = String(idearium.address().port);
    const C = require(path.join(ROOT, 'lib/agent-tools/tools/idearium/code.js'));
    await C.code_check.execute({ path: 'docs/x.spec', repoUuid: 'r1' }, {});
    idearium.close(); delete process.env.IDEARIUM_PORT;
    assert.ok(seen.length, 'the check reached idearium');
    assert.deepStrictEqual(seen[0][1].paths, ['docs/x.spec']);
    const e = await C.code_edit.execute({ path: 'docs/x.spec', changes: [[716, 761], ['a', 'b']], repoUuid: 'r1' }, {});
    assert.ok(/you sent "changes", which code_edit does not read/.test(e.error), e.error);
    assert.ok(/startLine/.test(e.error), 'the line form is shown too');
  });

  await test('EL-08', 'the phase build climbs through climb(), records each attempt and climb, and passes the cap', () => {
    const src = fs.readFileSync(path.join(ROOT, 'idearium/api/index.js'), 'utf8');
    const pb = src.slice(src.indexOf('async function _phaseBuild('), src.indexOf('async function _provePhase('));
    assert.ok(/PRt\.climb\(\{ rungs, policy, attempt, onOutcome \}\)/.test(pb), 'climb() walks the ladder');
    assert.ok(/PRt\.ladder\(policy, \{ installed \}\)/.test(pb) && /if \(!backend && !agent && !provider && policy\.escalate\)/.test(pb), 'the ladder only when the call names no agent');
    assert.ok(/maxToolErrors: policy\.maxToolErrors/.test(pb), 'the cap reaches the agent');
    assert.ok(/state: next\.how, [^]*from: rung\.provider, to: next\.rung\.provider/.test(pb), 'a climb is a row: from, to');
    assert.ok(/ladderExhausted: true/.test(pb), 'every rung tried is said');
  });

  await test('EL-09', 'GET /api/routing gives the ladder; Settings has the Escalation ladder card for every key', async () => {
    const { setConfig } = await import(path.join(ROOT, 'idearium/lib/config.js'));
    await quiet(async () => { setConfig('routing.ollama_models', 'deepseek-coder-v2:16b,qwen2.5-coder:3b,qwen2.5-coder:7b'); setConfig('routing.chain', 'ollama,claude'); setConfig('routing.escalation', ''); });
    const r = await quiet(() => api._route('GET', '/api/routing'));
    assert.strictEqual(r.status, 200, JSON.stringify(r.json).slice(0, 200));
    assert.deepStrictEqual(r.json.ladder.rungs, ['ollama:qwen2.5-coder:3b', 'ollama:qwen2.5-coder:7b', 'ollama:deepseek-coder-v2:16b', 'claude']);
    assert.deepStrictEqual(r.json.escalateOn, ['failed', 'blocked', 'incomplete', 'tool-errors']);
    await quiet(async () => setConfig('routing.escalation', 'claude > ollama:qwen2.5-coder:7b'));
    assert.deepStrictEqual((await quiet(() => api._route('GET', '/api/routing'))).json.ladder.rungs, ['claude', 'ollama:qwen2.5-coder:7b'], 'a written ladder, exactly');
    const st = fs.readFileSync(path.join(ROOT, 'idearium/ui/settings.html'), 'utf8');
    assert.ok(/Escalation ladder/.test(st) && /data-rt="escalate"/.test(st) && /data-rt="escalation"/.test(st) && /data-rt-esc=/.test(st) && /num\('retries_per_rung'/.test(st) && /num\('max_tool_errors'/.test(st));
    assert.ok(/rtSet\('escalate_on', \[\.\.\.on\]\.join\(','\)\)/.test(st));
  });

  console.log(`\n  ${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
