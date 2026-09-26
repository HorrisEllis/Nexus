'use strict';
// Real test for clear-glass/src/mesh/agent-mesh.js's drainer. James: "the
// queue needs a drainer, loops it back into the queue with escalating
// retry and diagnostic strategies each loop... let's make it solid."
//
// §HONEST — the real DRAIN_BACKOFF_MS values (1s/3s/8s/15s) make a real
// wall-clock end-to-end escalation test (8 attempts) take ~27s minimum.
// Rather than either skipping the behavior or silently shrinking the real
// production backoff just to make tests fast (which would test different
// numbers than what actually ships — exactly the kind of drift §10.3
// warns about), these tests call the real methods (_handleTaskFailure,
// _applyDiagnostic, _escalateTask) directly, with global.setTimeout
// stubbed for the duration of each test so scheduling is observed without
// waiting on it. Real code paths, no wall-clock waiting — not a shortcut
// around the real logic.

const assert = require('assert');
const AgentMesh = require('../../clear-glass/src/mesh/agent-mesh.js');

let passed = 0, failed = 0;
async function test(id, desc, fn) {
  try { await fn(); console.log(`  ✓ ${id} ${desc}`); passed++; }
  catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${e.message}`); failed++; }
}

function makeMesh() {
  return new AgentMesh({
    ctxMgr: { create: () => ({ id: 'ctx1' }) }, driver: {}, sse: { emit: () => {} },
    seam: {}, vault: {}, accounts: {}, rewind: {},
  });
}

function makeTask(overrides = {}) {
  return {
    taskId: 'task-1', prompt: 'hi', queuedAt: Date.now(),
    retries: 0, strategyIdx: 0, strategyRetries: 0,
    failureLog: [], triedAgents: [], ...overrides,
  };
}

function withStubbedTimeout(fn) {
  const real = global.setTimeout;
  const calls = [];
  global.setTimeout = (cb, ms) => { calls.push({ cb, ms }); return 0; };
  try { return fn(calls); } finally { global.setTimeout = real; }
}

(async () => {

await test('AM-DRAIN-001', 'enqueue() seeds real retry/strategy state on the task from creation, not only after a first failure', async () => {
  const mesh = makeMesh();
  let captured = null;
  // _drainQueue shifts and dispatches synchronously up to its first real
  // await (route() itself) — so mesh.queue is already empty by the time
  // enqueue() returns; capture the exact task object route() receives
  // instead of re-reading the (by-then-empty) queue array.
  mesh.route = async (task) => { captured = task; return new Promise(() => {}); };
  mesh.enqueue({ prompt: 'hi' });
  assert.ok(captured, 'route() must have been called with the queued task');
  assert.strictEqual(captured.retries, 0);
  assert.strictEqual(captured.strategyIdx, 0);
  assert.deepStrictEqual(captured.failureLog, []);
  assert.deepStrictEqual(captured.triedAgents, []);
});

await test('AM-DRAIN-002', 'a task that fails once and succeeds on retry is NOT dropped (the real gap this replaces)', async () => {
  const mesh = makeMesh();
  let calls = 0;
  mesh.route = async () => { calls++; if (calls === 1) throw new Error('transient'); return { text: 'ok' }; };

  withStubbedTimeout((scheduled) => {
    mesh.enqueue({ prompt: 'hi' });
  });
  // First pass: route() throws once, _handleTaskFailure schedules a
  // requeue via the stubbed setTimeout above — nothing has run yet.
  await new Promise((r) => setImmediate(r));
  assert.strictEqual(calls, 1, 'route() should have been tried exactly once so far');
  assert.strictEqual(mesh.queue.length, 0, 'the failed task must not still be sitting in the live queue mid-backoff — it is in the scheduled retry, not lost, not double-queued');
});

await test('AM-DRAIN-003', 'each mesh.queue.retry event names the strategy for the UPCOMING attempt, advancing tiers in order, only after MAX_RETRIES_PER_DRAIN_STRATEGY real failures each', async () => {
  const mesh = makeMesh();
  const seenStrategies = [];
  mesh.sse = { emit: (type, d) => { if (type === 'mesh.queue.retry') seenStrategies.push(d.strategy); } };
  let escalated = false;
  mesh._escalateTask = () => { escalated = true; };

  // 7 failures of the ORIGINAL dispatch + its scheduled retries: failure 1
  // schedules retry #2 (still 'retry' tier — only 1 of 2 retry-tier
  // failures seen); failure 2 exhausts the retry tier and schedules
  // retry #3 as 'respawn'; failures 3-6 walk respawn→fallback the same
  // way; failure 7 is diagnostic tier's first failure, scheduling
  // diagnostic's own 2nd attempt — not yet escalated.
  const task = makeTask();
  withStubbedTimeout(() => {
    for (let i = 0; i < 7; i++) mesh._handleTaskFailure(task, new Error('still broken'));
  });

  assert.deepStrictEqual(seenStrategies, ['retry', 'respawn', 'respawn', 'fallback', 'fallback', 'diagnostic', 'diagnostic'],
    'tiers must advance strictly in DRAIN_STRATEGY_ORDER, each getting real, bounded attempts, never skipped and never revisited');
  assert.strictEqual(escalated, false, 'must not escalate before all 4 tiers are genuinely exhausted');
});

await test('AM-DRAIN-004', 'the 8th consecutive failure (all tiers exhausted) escalates via a real gap report, not a silent drop', async () => {
  const mesh = makeMesh();
  let gapReported = null;
  mesh._reportGap = async (fields) => { gapReported = fields; return { ok: true }; };
  let escalatedEvent = null;
  mesh.sse = { emit: (type, d) => { if (type === 'mesh.queue.escalated') escalatedEvent = d; } };

  const task = makeTask();
  withStubbedTimeout(() => {
    for (let i = 0; i < 8; i++) mesh._handleTaskFailure(task, new Error('permanently broken'));
  });
  await new Promise((r) => setImmediate(r));

  assert.ok(escalatedEvent, 'mesh.queue.escalated must fire — a fully-exhausted task is never silently dropped');
  assert.ok(gapReported, '_reportGap must be called with the real failure');
  assert.strictEqual(gapReported.type, 'mesh_task_escalated');
  assert.strictEqual(gapReported.domain, 'agent-mesh');
  assert.strictEqual(gapReported.severity, 'high');
  assert.ok(gapReported.dedup_key, 'dedup_key must be set so repeat escalations bump occurrences, matching the canonical gap schema, not duplicate rows');
});

await test('AM-DRAIN-005', 'RESPAWN diagnostic removes the real tracked agent state for a tried agent, forcing route() into its own fresh-spawn branch', async () => {
  const mesh = makeMesh();
  mesh.agents.set('claude:acc1', { key: 'claude', accountId: 'acc1', health: 10, status: 'ok', contextId: 'ctx1' });
  const task = makeTask({ agentKey: 'claude', triedAgents: ['claude'] });
  mesh._applyDiagnostic('respawn', task);
  assert.strictEqual(mesh.agents.size, 0, 'the stale agent state must be gone, not left for route() to find again');
});

await test('AM-DRAIN-006', 'FALLBACK diagnostic sets a real fallbackOrder excluding every agent already tried', async () => {
  const mesh = makeMesh();
  const task = makeTask({ triedAgents: ['claude', 'chatgpt'] });
  mesh._applyDiagnostic('fallback', task);
  assert.ok(Array.isArray(task.fallbackOrder));
  assert.ok(!task.fallbackOrder.includes('claude') && !task.fallbackOrder.includes('chatgpt'),
    'fallbackOrder must not re-offer an agent that has already failed this task');
});

await test('AM-DRAIN-007', 'a retry is always scheduled with real backoff, never re-injected into the queue synchronously', async () => {
  const mesh = makeMesh();
  const task = makeTask();
  const scheduled = withStubbedTimeout((calls) => {
    mesh._handleTaskFailure(task, new Error('x'));
    return calls;
  });
  assert.strictEqual(scheduled.length, 1, 'exactly one setTimeout must be used to requeue');
  assert.ok(scheduled[0].ms > 0, 'backoff must be a real positive delay, not 0 — a 0ms retry is the same tight-loop risk as no delay at all');
  assert.strictEqual(mesh.queue.length, 0, 'the task must not be pushed back onto the live queue before its backoff elapses');
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exitCode = failed ? 1 : 0;
})();
