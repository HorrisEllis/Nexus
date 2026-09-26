'use strict';
/**
 * Guardian mesh-first dispatch ladder + agent registry (docs/2026-09-19-guardian-mesh-first-dispatch-phasemap.spec).
 * Pure Node: the Clear Glass mesh, picker and NCP are fakes, so this proves the DECISION logic, not Electron.
 */
const assert = require('assert');
const fs = require('fs'), os = require('os'), path = require('path');
const { createAgentRegistry } = require('../../guardian/lib/agent-registry');
const { createLadder } = require('../../guardian/lib/dispatch-ladder');
let passed = 0, failed = 0;
async function test(id, desc, fn) { try { await fn(); console.log(`   ${id} ${desc}`); passed++; } catch (e) { console.error(`   ${id} ${desc}\n    ${e.stack}`); failed++; } }

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'ladder-'));
function harness({ sends = [], diagnose = null, mode = 'mesh-first', clock = { t: 1000 }, dir = tmp(), threshold = 3 } = {}) {
  const calls = { send: [], diagnose: [], picker: [] };
  const queue = [...sends];
  const mesh = {
    send: async (a) => { calls.send.push(a); const n = queue.shift(); if (n instanceof Error) throw n; return n || { ok: true, sent: true, text: 'hi' }; },
    diagnose: async (a) => { calls.diagnose.push(a); return diagnose ? diagnose(a) : { ok: false }; },
  };
  const picker = { request: async (a) => { calls.picker.push(a); } };
  const registry = createAgentRegistry({ dir, now: () => clock.t });
  const ladder = createLadder({ registry, mesh, picker, mode: () => mode, now: () => clock.t, breakerThreshold: threshold, breakerMs: 60000 });
  return { ladder, registry, calls, dir, clock };
}
const job = (o = {}) => ({ id: 'j1', provider: 'claude', prompt: 'hello', ...o });

(async () => {
  await test('LAD-001', 'registry: seeded from the mesh (7 agents, all with input/send/resp selectors)', () => {
    const r = createAgentRegistry({ dir: tmp() });
    assert.strictEqual(r.list().length, 7);
    for (const a of r.list()) for (const k of ['input', 'send', 'resp']) assert.ok(a.selectors[k], `${a.id}.${k}`);
    assert.strictEqual(r.get('claude').selectors.input, 'div[contenteditable="true"]');
  });

  await test('LAD-002', 'registry: a repair persists to disk with history, survives a reload, only known keys accepted', () => {
    const dir = tmp(); const r = createAgentRegistry({ dir });
    const res = r.recordRepair('chatgpt', { input: '#new-input', bogus: 'x', send: '' }, { source: 'archaeology', evidence: { why: 'drift' } });
    assert.ok(res.changed); assert.strictEqual(res.selectors.input, '#new-input');
    const r2 = createAgentRegistry({ dir });
    assert.strictEqual(r2.get('chatgpt').selectors.input, '#new-input');
    assert.strictEqual(r2.get('chatgpt').selectors.send, 'button[data-testid="send-button"]', 'untouched keys keep the seed value');
    assert.strictEqual(r2.get('chatgpt').selectorHistory[0].from.input, '#prompt-textarea', 'previous value kept for revert');
    assert.strictEqual(r2.recordRepair('chatgpt', { input: '#new-input' }).changed, false, 'no-op repair changes nothing');
  });

  await test('LAD-003', 'registry accounts: first is default; explicit unknown account fails loudly (never a silent substitute)', () => {
    const r = createAgentRegistry({ dir: tmp() });
    assert.strictEqual(r.resolveAccount('claude'), null, 'no accounts => the default profile');
    r.addAccount('claude', { id: 'work' }); r.addAccount('claude', { id: 'personal' });
    assert.strictEqual(r.resolveAccount('claude'), 'work');
    r.addAccount('claude', { id: 'personal', makeDefault: true });
    assert.strictEqual(r.resolveAccount('claude'), 'personal');
    assert.strictEqual(r.resolveAccount('claude', 'work'), 'work');
    assert.throws(() => r.resolveAccount('claude', 'nope'), /unknown_account/);
  });

  await test('LAD-010', 'mesh success completes the job and records health', async () => {
    const h = harness({ sends: [{ ok: true, sent: true, text: 'answer', chatUrl: 'https://claude.ai/c/1' }] });
    const r = await h.ladder.attempt(job());
    assert.strictEqual(r.kind, 'complete'); assert.strictEqual(r.text, 'answer');
    assert.strictEqual(h.registry.get('claude').health.ok, 1);
    assert.strictEqual(h.calls.send[0].agentId, 'mesh-claude-default', 'deterministic agentId per provider+account');
  });

  await test('LAD-011', 'deterministic agentId follows the account (same account => same agent/tab/partition)', async () => {
    const h = harness({ sends: [{ ok: true, sent: true, text: 'a' }, { ok: true, sent: true, text: 'b' }] });
    h.registry.addAccount('claude', { id: 'work' });
    await h.ladder.attempt(job()); await h.ladder.attempt(job({ id: 'j2' }));
    assert.deepStrictEqual(h.calls.send.map(c => c.agentId), ['mesh-claude-work', 'mesh-claude-work']);
    assert.ok(h.calls.send.every(c => c.accountId === 'work'));
  });

  await test('LAD-020', 'policy ncp-only (today\'s behaviour): the mesh is never touched', async () => {
    const h = harness({ mode: 'ncp-only' });
    assert.strictEqual((await h.ladder.attempt(job())).kind, 'ncp');
    assert.strictEqual(h.calls.send.length, 0);
  });

  await test('LAD-021', 'LOOP GUARD: mesh-originated and NCP-pinned jobs never go to the mesh', async () => {
    const h = harness();
    assert.strictEqual((await h.ladder.attempt(job({ source: 'mesh' }))).reason, 'loop_guard');
    assert.strictEqual((await h.ladder.attempt(job({ transport: 'ncp' }))).reason, 'loop_guard');
    assert.strictEqual(h.calls.send.length, 0);
  });

  await test('LAD-022', 'guardian is the source of truth: an agent not in its registry is not mesh-capable', async () => {
    const h = harness();
    const r = await h.ladder.attempt(job({ provider: 'ollama' }));
    assert.strictEqual(r.kind, 'ncp'); assert.strictEqual(r.reason, 'agent_not_in_registry');
  });

  await test('LAD-030', 'NO DUPLICATE PROMPT: sent:true without a response goes to the USER, never NCP, mesh called once', async () => {
    const h = harness({ sends: [{ ok: false, sent: true, stage: 'no_response' }] });
    const r = await h.ladder.attempt(job());
    assert.strictEqual(r.kind, 'user'); assert.strictEqual(r.reason, 'sent_no_response');
    assert.strictEqual(h.calls.send.length, 1); assert.ok(/do not resend/i.test(r.note));
  });

  await test('LAD-040', 'selector drift: diagnose (archaeology/DOM mapping) -> repair persisted -> retry with the NEW selectors -> complete', async () => {
    const h = harness({
      sends: [{ ok: false, sent: false, stage: 'input_not_found' }, { ok: true, sent: true, text: 'fixed' }],
      diagnose: () => ({ ok: true, repaired: true, selectors: { input: '#found-by-mapping' }, evidence: { candidates: 3 } }),
    });
    const r = await h.ladder.attempt(job());
    assert.strictEqual(r.kind, 'complete'); assert.strictEqual(h.calls.diagnose.length, 1);
    assert.strictEqual(h.calls.send[1].selectors.input, '#found-by-mapping', 'the retry must use the repaired selector');
    assert.strictEqual(createAgentRegistry({ dir: h.dir }).get('claude').selectors.input, '#found-by-mapping', 'and it persists for every later job');
    assert.deepStrictEqual(r.trail.map(t => t.tier), ['mesh', 'repair', 'mesh-retry']);
  });

  await test('LAD-041', 'repair is attempted at most once per job; if the retry still fails it falls back to the userscript', async () => {
    const h = harness({
      sends: [{ ok: false, sent: false, stage: 'send_not_found' }, { ok: false, sent: false, stage: 'send_not_found' }],
      diagnose: () => ({ ok: true, repaired: true, selectors: { send: '#x' } }),
    });
    const r = await h.ladder.attempt(job());
    assert.strictEqual(r.kind, 'ncp'); assert.strictEqual(h.calls.diagnose.length, 1); assert.strictEqual(h.calls.send.length, 2);
  });

  await test('LAD-042', 'diagnose could not repair => userscript fallback (no second mesh attempt)', async () => {
    const h = harness({ sends: [{ ok: false, sent: false, stage: 'response_not_found' }], diagnose: () => ({ ok: true, repaired: false }) });
    const r = await h.ladder.attempt(job());
    assert.strictEqual(r.kind, 'ncp'); assert.strictEqual(h.calls.send.length, 1);
  });

  await test('LAD-050', 'login/captcha are not DOM problems: straight to the user, no repair attempt, no NCP', async () => {
    for (const stage of ['no_login', 'captcha']) {
      const h = harness({ sends: [{ ok: false, sent: false, stage }] });
      const r = await h.ladder.attempt(job());
      assert.strictEqual(r.kind, 'user'); assert.strictEqual(r.reason, stage); assert.strictEqual(h.calls.diagnose.length, 0);
    }
  });

  await test('LAD-060', 'infrastructure failure (no webview) falls back to the userscript; a throwing mesh is treated the same', async () => {
    const h = harness({ sends: [{ ok: false, sent: false, stage: 'no_webview' }, new Error('ECONNREFUSED')] });
    assert.strictEqual((await h.ladder.attempt(job())).kind, 'ncp');
    const r = await h.ladder.attempt(job({ id: 'j2' }));
    assert.strictEqual(r.kind, 'ncp'); assert.strictEqual(r.stage, 'mesh_unreachable');
  });

  await test('LAD-061', 'circuit breaker: 3 consecutive infra failures open it (mesh skipped), and it closes after the window', async () => {
    const h = harness({ sends: Array(3).fill({ ok: false, sent: false, stage: 'mesh_unreachable' }), threshold: 3 });
    for (let i = 0; i < 3; i++) await h.ladder.attempt(job({ id: 'j' + i }));
    const before = h.calls.send.length;
    const r = await h.ladder.attempt(job({ id: 'jx' }));
    assert.strictEqual(r.reason, 'mesh_circuit_open'); assert.strictEqual(h.calls.send.length, before, 'mesh must not be called while open');
    h.clock.t += 61000;
    await h.ladder.attempt(job({ id: 'jy' }));
    assert.strictEqual(h.calls.send.length, before + 1, 'closes after the window');
  });

  await test('LAD-062', 'selector-drift failures do NOT trip the breaker (the mesh itself is healthy)', async () => {
    const h = harness({ sends: Array(6).fill({ ok: false, sent: false, stage: 'input_not_found' }), threshold: 2 });
    for (let i = 0; i < 3; i++) await h.ladder.attempt(job({ id: 'j' + i }));
    assert.strictEqual(h.ladder.breakerOpen(), false);
  });

  await test('LAD-070', 'unknown explicit account fails the job loudly instead of using another identity', async () => {
    const h = harness();
    const r = await h.ladder.attempt(job({ accountId: 'ghost' }));
    assert.strictEqual(r.kind, 'failed'); assert.strictEqual(r.reason, 'unknown_account'); assert.strictEqual(h.calls.send.length, 0);
  });

  await test('LAD-080', 'last rung: escalateToUser asks the guardian picker; a missing picker fails honestly', async () => {
    const h = harness();
    const r = await h.ladder.escalateToUser(job(), 'ncp_exhausted', { note: 'x' });
    assert.strictEqual(r.kind, 'user'); assert.strictEqual(h.calls.picker[0].reason, 'ncp_exhausted');
    const bad = createLadder({ registry: h.registry, mesh: {}, picker: { request: async () => { throw new Error('no picker'); } } });
    assert.strictEqual((await bad.escalateToUser(job(), 'x')).kind, 'failed');
  });

  console.log(`\n   ${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
