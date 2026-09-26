'use strict';
// §chunk-build-orchestrator — try all agents, skip infra failures, exhaustion reports a real gap.
const assert = require('assert');
const path = require('path');
let passed = 0, failed = 0;
async function test(id, desc, fn) { try { await fn(); console.log(`  ✓ ${id} ${desc}`); passed++; } catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${e.message}`); failed++; } }
const orchestrator = require(path.join(__dirname, '../..', 'lib/chunk-build-orchestrator'));
const gapField = require(path.join(__dirname, '../..', 'lib/gap-field'));

function stubLearning(order) {
  const conf = {};
  order.forEach((a, i) => { conf[a] = 0.9 - i * 0.1; });
  return {
    orderedAgents: () => order.slice().sort((a, b) => conf[b] - conf[a]),
    getConfidence: (a) => conf[a] != null ? conf[a] : 0.5,
    recordOutcome: (agent, outcome) => { conf[agent] = outcome === 'confirmed' ? Math.min(1, conf[agent] + 0.1) : Math.max(0.05, conf[agent] - 0.15); },
  };
}

(async () => {
  await test('T-001', 'the FIRST agent succeeding stops immediately — later agents never tried', async () => {
    const tried = [];
    const pipeline = { runPipeline: async ({ provider }) => { tried.push(provider); return { ok: true, stage: 'complete' }; } };
    const r = await orchestrator.buildWithFallback({ specPath: 'x.spec', chunkId: 'T001' }, { agents: ['a', 'b', 'c'], learning: stubLearning(['a', 'b', 'c']), pipeline });
    assert.strictEqual(r.ok, true);
    assert.strictEqual(r.agent, 'a');
    assert.deepStrictEqual(tried, ['a'], 'must not try b or c once a succeeds');
  });

  await test('T-002', 'a real failure on agent A moves to agent B, which then succeeds', async () => {
    const pipeline = { runPipeline: async ({ provider }) => provider === 'a' ? { ok: false, stage: 'sandbox', error: 'test failed: assertion mismatch' } : { ok: true, stage: 'complete' } };
    const r = await orchestrator.buildWithFallback({ specPath: 'x.spec', chunkId: 'T002' }, { agents: ['a', 'b'], learning: stubLearning(['a', 'b']), pipeline });
    assert.strictEqual(r.ok, true);
    assert.strictEqual(r.agent, 'b');
    assert.ok(r.attempts.some(a => a.agent === 'a' && a.outcome === 'failed'));
  });

  await test('T-003', 'a timeout (infra failure) is retried on the SAME agent, not counted as a real failure', async () => {
    let calls = 0;
    const pipeline = { runPipeline: async ({ provider }) => { calls++; if (provider === 'a' && calls === 1) return { ok: false, stage: 'build', error: 'ETIMEDOUT connecting to provider' }; return { ok: true, stage: 'complete' }; } };
    const r = await orchestrator.buildWithFallback({ specPath: 'x.spec', chunkId: 'T003' }, { agents: ['a', 'b'], learning: stubLearning(['a', 'b']), pipeline, maxInfraRetries: 1 });
    assert.strictEqual(r.ok, true);
    assert.strictEqual(r.agent, 'a', 'the SAME agent should retry and succeed after a transient timeout, not skip to b');
    assert.ok(r.attempts.some(a => a.outcome === 'infra-retry'));
  });

  await test('T-004', 'ALL agents genuinely failing exhausts the roster and reports a real gap', async () => {
    const pipeline = { runPipeline: async () => ({ ok: false, stage: 'sandbox', error: 'output does not match spec' }) };
    const before = gapField.openGaps({ domain: 'system' }).filter(g => g.type === 'chunk-build.exhausted').length;
    const r = await orchestrator.buildWithFallback({ specPath: 'x.spec', chunkId: 'T004' }, { agents: ['a', 'b', 'c'], learning: stubLearning(['a', 'b', 'c']), pipeline });
    assert.strictEqual(r.ok, false);
    assert.strictEqual(r.exhausted, true);
    assert.strictEqual(r.attempts.filter(a => a.outcome === 'failed').length, 3, 'all three agents must have genuinely been tried');
    const after = gapField.openGaps({ domain: 'system' }).filter(g => g.type === 'chunk-build.exhausted').length;
    assert.ok(after > before, 'exhaustion must produce a real gap-field report');
  });

  await test('T-005', 'an infra-unreachable agent is skipped, not counted as a real failure, and does not block reaching a working agent', async () => {
    const pipeline = { runPipeline: async ({ provider }) => provider === 'a' ? { ok: false, stage: 'build', error: 'ECONNREFUSED' } : { ok: true, stage: 'complete' } };
    const r = await orchestrator.buildWithFallback({ specPath: 'x.spec', chunkId: 'T005' }, { agents: ['a', 'b'], learning: stubLearning(['a', 'b']), pipeline, maxInfraRetries: 0 });
    assert.strictEqual(r.ok, true);
    assert.strictEqual(r.agent, 'b');
    assert.ok(r.attempts.some(a => a.outcome === 'infra-skip'));
    assert.strictEqual(r.attempts.filter(a => a.outcome === 'failed').length, 0, 'an infra skip must never be recorded as a real failure');
  });

  await test('T-006', 'a real success records confirmed outcome (Bayesian confidence rises for the winning agent)', async () => {
    const learning = stubLearning(['a', 'b']);
    const before = learning.getConfidence('a');
    const pipeline = { runPipeline: async () => ({ ok: true, stage: 'complete' }) };
    await orchestrator.buildWithFallback({ specPath: 'x.spec', chunkId: 'T006' }, { agents: ['a', 'b'], learning, pipeline });
    assert.ok(learning.getConfidence('a') > before, 'a real success must raise that agent\'s confidence');
  });

  await test('T-007', '_isInfraFailure correctly classifies common infra error shapes', async () => {
    assert.strictEqual(orchestrator._isInfraFailure('build', 'ETIMEDOUT'), true);
    assert.strictEqual(orchestrator._isInfraFailure('build', 'rate limit exceeded'), true);
    assert.strictEqual(orchestrator._isInfraFailure('build', '503 Service Unavailable'), true);
    assert.strictEqual(orchestrator._isInfraFailure('build', 'output does not match expected type'), false, 'a content failure must NOT be misclassified as infra');
    assert.strictEqual(orchestrator._isInfraFailure('sandbox', 'ETIMEDOUT'), false, 'infra classification only applies at the build stage — a sandbox-stage timeout means real code ran and hung, not "never reached"');
  });

  console.log(`\n${passed} passed, ${failed} failed`); process.exit(failed ? 1 : 0);
})();
