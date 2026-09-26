'use strict';
// P1 — copilot tool-runtime (docs/copilot-omniscience-phasemap.spec). Proves the
// sovereign agent-tools loop runs with copilot's injected callModel: the model
// can request a tool mid-turn, it executes for real, and the loop feeds the
// result back. Also pins that memory (P2) and stream (P3) context inject without
// breaking the P1 contract.
const assert = require('assert');
const path = require('path');
let passed = 0, failed = 0;
async function test(id, desc, fn) {
  try { await fn(); console.log(`  ✓ ${id} ${desc}`); passed++; }
  catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${e.message}`); failed++; }
}

const ROOT = path.join(__dirname, '../..');
const rt = require(path.join(ROOT, 'copilot/tool-runtime.js'));

(async () => {
  await test('T-001', 'copilot has the full tool set loaded (all 10)', () => {
    assert.ok(rt.toolCount() >= 10, `expected >=10 tools, got ${rt.toolCount()}`);
  });

  await test('T-002', 'GATE: a request needing a file reads it via the read_file tool mid-turn', async () => {
    let turn = 0;
    const dispatch = async () => ({});
    const pollJob = async () => {
      turn++;
      if (turn === 1) return { text: 'reading', toolCalls: [{ id: 'c1', name: 'read_file', arguments: JSON.stringify({ path: 'lib/version.js' }) }] };
      return { text: 'done', toolCalls: null };
    };
    const r = await rt.run({ userPrompt: 'what version?', dispatch, pollJob });
    assert.strictEqual(r.toolCallLog[0].name, 'read_file');
    assert.ok(r.toolCallLog[0].result, 'read_file must produce a real result, not a stub');
    assert.strictEqual(r.iterations, 2, 'one tool turn + one answer turn');
  });

  await test('T-003', 'a no-tool response returns immediately as the final answer', async () => {
    const dispatch = async () => ({});
    const pollJob = async () => ({ text: 'direct answer', toolCalls: null });
    const r = await rt.run({ userPrompt: 'hi', dispatch, pollJob });
    assert.strictEqual(r.text, 'direct answer');
    assert.strictEqual(r.iterations, 1);
  });

  await test('T-004', 'tool_calls are extracted from ollama/OpenAI shapes (string args parsed)', () => {
    const calls = rt._extractToolCalls({ tool_calls: [{ function: { name: 'diagnose', arguments: '{"target":"cortex"}' } }] });
    assert.strictEqual(calls[0].name, 'diagnose');
    assert.deepStrictEqual(calls[0].arguments, { target: 'cortex' });
  });

  await test('T-005', 'P2 memory + P3 stream inject into the system prompt without breaking P1', async () => {
    let capturedSystem = null;
    const dispatch = async (convo, sys) => { capturedSystem = sys; return {}; };
    const pollJob = async () => ({ text: 'ok', toolCalls: null });
    await rt.run({ userPrompt: 'x', dispatch, pollJob, memory: 'USER prefers terse answers', streamDigest: 'guardian finished a job' });
    assert.ok(/prefers terse answers/.test(capturedSystem), 'memory must be in the system prompt');
    assert.ok(/guardian finished a job/.test(capturedSystem), 'live stream must be in the system prompt');
  });

  await test('T-006', 'run() requires dispatch and pollJob (fails loud, §1.2)', async () => {
    await assert.rejects(async () => rt.run({ userPrompt: 'x' }), /dispatch and pollJob are required/);
  });

  await test('T-007', 'P2 GATE: a fact persisted this session reads back via buildUserContext (survives restart, cortex-backed)', () => {
    const um = require(path.join(ROOT, 'copilot/lib/user-model'));
    const { jaaDB } = require(path.join(ROOT, 'cortex/memory/jaa-db'));
    um.init(jaaDB);
    const marker = `p2-test-marker-${Date.now()}`;
    um.observe(`remembers ${marker}`, 'test', { via: 'p2-test' }, 0.9);
    // buildUserContext reads from the SAME cortex store a fresh boot would load —
    // this is the cross-session recall the phasemap gates on.
    const memory = um.buildUserContext();
    assert.ok(memory.includes(marker), 'a persisted fact must appear in the injected memory digest');
  });

  await test('T-008', 'P2: user-model exposes the reader+writers the endpoint uses', () => {
    const um = require(path.join(ROOT, 'copilot/lib/user-model'));
    for (const fn of ['buildUserContext', 'recordIntent', 'observe']) {
      assert.strictEqual(typeof um[fn], 'function', `user-model must export ${fn}`);
    }
  });

  await test('T-009', 'P3: normalizeStream turns live events into injectable readable text', () => {
    const { normalizeStream } = require(path.join(ROOT, 'copilot/stream-digest'));
    const events = [
      { type: 'cortex.gap.found', system: 'cortex', payload: {}, ts: Date.now() - 3000 },
      { type: 'guardian.job.complete', system: 'guardian', payload: {}, ts: Date.now() },
    ];
    const digest = normalizeStream(events, 30);
    assert.ok(digest && digest.length > 5, 'digest must be non-empty readable text');
    assert.ok(/guardian/i.test(digest), 'digest must reflect real events');
  });

  // §FIXED 2026-09-13 — James: "i type mdawp in tv ui floating menu cli
  // and it pastes a mountain." then, correctly: "i bet you its the
  // agent model." Real cause: runViaAgent()'s own systemPrompt already
  // bakes in lib/agent-tools/tool-guide.js's full per-tool "how and
  // when to use" prose; makeNcpCallModel()'s callModel() then
  // re-described every tool a SECOND time via the old _toolInstructions.
  await test('T-010', 'runViaAgent does not duplicate the tool guide — no tool description appears twice in one real dispatched prompt', async () => {
    let capturedPrompt = null;
    const dispatchToAgent = async (prompt) => { capturedPrompt = prompt; return { ok: true, text: 'ok' }; };
    await rt.runViaAgent('chatgpt', dispatchToAgent, 'mdawp', {});
    assert.ok(capturedPrompt, 'a real prompt must have been captured');
    // Pick a real tool whose description is long/distinctive enough that
    // an accidental second copy would be unambiguous, not a coincidental
    // substring hit.
    const marker = 'blind\\[\\] comes FIRST in the reply';
    const hits = (capturedPrompt.match(new RegExp(marker, 'g')) || []).length;
    assert.strictEqual(hits, 1, `query_movement's own distinctive edge-case text must appear exactly once in the real dispatched prompt, found ${hits}`);
  });

  await test('T-011', 'a second real dispatch to the SAME still-fresh provider skips the full tool guide/context entirely', async () => {
    const prompts = [];
    const dispatchToAgent = async (prompt) => { prompts.push(prompt); return { ok: true, text: 'ok' }; };
    await rt.runViaAgent('claude', dispatchToAgent, 'first real turn', {});
    await rt.runViaAgent('claude', dispatchToAgent, 'second real turn, moments later', {});
    assert.ok(prompts[0].length > 1000, 'the first real turn to a provider must carry the full context — nothing to be "already primed" from yet');
    assert.ok(prompts[1].length < prompts[0].length / 5, `the second real turn to the SAME still-fresh provider must be dramatically shorter than the first (got ${prompts[1].length} vs ${prompts[0].length})`);
    assert.ok(/second real turn/.test(prompts[1]), 'the short prompt must still carry the actual new real user turn');
  });

  await test('T-012', 'a different provider is NOT treated as already primed by another provider\'s recent turn', async () => {
    const prompts = [];
    const dispatchToAgent = async (prompt) => { prompts.push(prompt); return { ok: true, text: 'ok' }; };
    await rt.runViaAgent('gemini', dispatchToAgent, 'priming gemini', {});
    await rt.runViaAgent('perplexity', dispatchToAgent, 'a genuinely different, never-primed provider', {});
    assert.ok(prompts[1].length > 1000, 'a provider that has never been dispatched to before must get the real, full context, regardless of another provider\'s recent activity');
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
