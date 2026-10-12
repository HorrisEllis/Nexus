'use strict';
/**
 * tests/modules/test-copilot-claude-code.test.js — 0.59.14. James: "Can you build the capability? Like first I thought of
 * using you as copilot, then you would have full range of the system." Claude Code as a co-pilot backend: on this machine,
 * in the Nexus folder, reading everything, writing nothing itself; one session per pane conversation. A stand-in `claude`
 * (spawnImpl) — never the real one.
 */
const assert = require('assert');
const path = require('path');
const http = require('http');
const { EventEmitter } = require('events');
const ROOT = path.join(__dirname, '..', '..');
const CC = require(path.join(ROOT, 'lib/claude-code-backend.js'));
let passed = 0, failed = 0;
async function test(id, d, fn) { try { await fn(); console.log(`  ✓ ${id} ${d}`); passed++; } catch (e) { console.error(`  ✗ ${id} ${d}\n    ${e.stack}`); failed++; } }

/** a stand-in claude: answers each run from `reply(args, stdin)` → { code, out, err } */
function fakeClaude(reply, calls) {
  return (bin, args, opts) => {
    const c = new EventEmitter(); c.stdout = new EventEmitter(); c.stderr = new EventEmitter();
    let input = '';
    c.stdin = { end: (s) => { input = String(s || ''); calls.push({ bin, args, cwd: opts.cwd, input });
      const r = reply(args, input); setImmediate(() => { if (r.out) c.stdout.emit('data', r.out); if (r.err) c.stderr.emit('data', r.err); c.emit('close', r.code || 0); }); } };
    c.kill = () => {};
    return c;
  };
}
const ok = (text, sid) => ({ out: JSON.stringify({ type: 'result', subtype: 'success', result: text, session_id: sid, num_turns: 2, total_cost_usd: 0.01 }) });

(async () => {
  await test('CC-01', 'a co-pilot turn reads (Read, Glob, Grep, every Nexus tool) and writes nothing itself', () => {
    const a = CC.askArgsFor({ mcpFile: '/tmp/m.json' });
    for (const t of ['Read', 'Glob', 'Grep', 'mcp__nexus']) assert.ok(a.includes(t), t);
    for (const t of ['Edit', 'Write', 'MultiEdit', 'Bash', 'acceptEdits']) assert.ok(!a.includes(t), `${t} must not be allowed`);
    assert.ok(!a.includes('--no-session-persistence'), 'the conversation is kept');
    assert.deepStrictEqual(CC.askArgsFor({ sessionId: 's1' }).slice(-2), ['--resume', 's1']);
    assert.match(CC.ASK_PREAMBLE, /never write files yourself/i);
    assert.match(CC.ASK_PREAMBLE, /repo ask/);
  });

  await test('CC-02', 'the first turn carries the preamble, in the Nexus folder; the next resumes the session with only the message', async () => {
    const calls = [];
    const spawnImpl = fakeClaude((args) => ok(args.includes('--resume') ? 'second' : 'first', 'sess-1'), calls);
    const r1 = await CC.ask({ prompt: 'what is broken?', spawnImpl });
    assert.ok(r1.ok && r1.text === 'first' && r1.sessionId === 'sess-1', JSON.stringify(r1));
    assert.strictEqual(calls[0].cwd, ROOT);
    assert.ok(calls[0].input.startsWith(CC.ASK_PREAMBLE) && calls[0].input.endsWith('what is broken?'));
    const r2 = await CC.ask({ prompt: 'fix it', sessionId: r1.sessionId, spawnImpl });
    assert.strictEqual(r2.text, 'second');
    assert.strictEqual(calls[1].input, 'fix it');
    assert.ok(calls[1].args.includes('--resume'));
  });

  await test('CC-03', 'a session that is gone starts a fresh one; claude missing says how to fix it', async () => {
    const calls = [];
    const spawnImpl = fakeClaude((args) => args.includes('--resume') ? { code: 1, err: 'No conversation found with session ID: old' , out: JSON.stringify({ subtype: 'error_during_execution', is_error: true, result: '' }) } : ok('fresh', 'sess-2'), calls);
    const r = await CC.ask({ prompt: 'hi', sessionId: 'old', spawnImpl });
    assert.ok(r.ok && r.sessionId === 'sess-2' && calls.length === 2, JSON.stringify(r));
    const missing = await CC.ask({ prompt: 'hi', spawnImpl: () => { const c = new EventEmitter(); c.stdout = new EventEmitter(); c.stderr = new EventEmitter(); c.stdin = { end: () => setImmediate(() => { const e = new Error('nope'); e.code = 'ENOENT'; c.emit('error', e); }) }; c.kill = () => {}; return c; } });
    assert.ok(!missing.ok && /not installed on this machine/.test(missing.error), JSON.stringify(missing));
  });

  await test('CC-04', 'the pane: backend claude-code answers through Claude Code — no other model is asked; one session per conversation, /new starts another', async () => {
    const prompts = [];
    const cop = await new Promise(res => { const s = http.createServer((q, rs) => { prompts.push(1); rs.end('{"text":"model"}'); }); s.listen(0, '127.0.0.1', () => res(s)); });
    const CoPilotBridge = require(path.join(ROOT, 'clear-glass/src/copilot/bridge.js'));
    const b = new CoPilotBridge({ sse: { emit: () => {} }, apiSettings: { get: () => ({ copilotRemember: false, copilotNexusAsk: false }), copilotDirectUrl: (p) => `http://127.0.0.1:${cop.address().port}${p}`, guardianDirectUrl: (p) => `http://127.0.0.1:1${p}`, ollamaDirectUrl: (p) => `http://127.0.0.1:1${p}` } });
    const asks = [];
    b._claudeCode = { ask: async (o) => { asks.push(o); return { ok: true, text: `answer ${asks.length}`, sessionId: o.sessionId || `s-${asks.length}` }; } };
    const r1 = await b.send({ message: 'how is nexus?', agentId: 'w9', backend: 'claude-code', noDom: true });
    assert.strictEqual(r1.text, 'answer 1');
    assert.strictEqual(r1.route.backend, 'claude-code');
    await b.send({ message: 'and the census?', agentId: 'w9', backend: 'claude-code', noDom: true });
    assert.strictEqual(asks[1].sessionId, 's-1', 'the same conversation resumes');
    require(path.join(ROOT, 'clear-glass/src/copilot/chat-store.js')).startNew('w9');
    await b.send({ message: 'new topic', agentId: 'w9', backend: 'claude-code', noDom: true });
    assert.strictEqual(asks[2].sessionId, null, '/new → a fresh Claude session');
    assert.strictEqual(prompts.length, 0, 'no other model was asked');
    cop.close();
  });

  console.log(`\n${passed} passed, ${failed} failed`); process.exit(failed ? 1 : 0);
})();
