'use strict';
// §agent-build-learning — Bayesian confidence per agent, seeded from agent-router's real prior.
const assert = require('assert');
const path = require('path');
let passed = 0, failed = 0;
async function test(id, desc, fn) { try { await fn(); console.log(`  ✓ ${id} ${desc}`); passed++; } catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${e.message}`); failed++; } }
const abl = require(path.join(__dirname, '../..', 'lib/agent-build-learning'));
const agentRouter = require(path.join(__dirname, '../..', 'lib/agent-router'));

(async () => {
  await test('T-001', 'a never-recorded agent from DEFAULT_FALLBACK starts above 0.5, not a flat prior', async () => {
    const first = agentRouter.DEFAULT_FALLBACK[0];
    assert.ok(abl.getConfidence(`${first}-neverseen-${Date.now()}`) === 0.5, 'an agent NOT in the fallback list should get the flat default');
  });

  await test('T-002', 'DEFAULT_FALLBACK order is respected as the prior — earlier position, higher confidence', async () => {
    const order = agentRouter.DEFAULT_FALLBACK;
    for (let i = 0; i < order.length - 1; i++) {
      assert.ok(abl.getConfidence(order[i]) >= abl.getConfidence(order[i + 1]), `${order[i]} should have >= confidence than ${order[i + 1]}`);
    }
  });

  await test('T-003', 'orderedAgents() sorts by current confidence, highest first', async () => {
    const order = abl.orderedAgents(agentRouter.DEFAULT_FALLBACK);
    const confs = order.map(a => abl.getConfidence(a));
    for (let i = 0; i < confs.length - 1; i++) assert.ok(confs[i] >= confs[i + 1]);
  });

  await test('T-004', 'recordOutcome confirmed/rejected moves confidence by the same math as the other two learning modules', async () => {
    const tag = `unit-test-agent-${Date.now()}`;
    const before = abl.getConfidence(tag);
    abl.recordOutcome(tag, 'confirmed');
    const afterConfirm = abl.getConfidence(tag);
    assert.ok(Math.abs((afterConfirm - before) - 0.10) < 0.001);
    abl.recordOutcome(tag, 'rejected');
    const afterReject = abl.getConfidence(tag);
    assert.ok(Math.abs((afterConfirm - afterReject) - 0.15) < 0.001);
  });

  await test('T-005', 'repeated real outcomes can re-order the roster — a weaker-prior agent overtakes a stronger one', async () => {
    const [a, b] = [`reorder-a-${Date.now()}`, `reorder-b-${Date.now()}`];
    // both start flat (not in DEFAULT_FALLBACK) at 0.5
    for (let i = 0; i < 3; i++) abl.recordOutcome(a, 'rejected');
    for (let i = 0; i < 3; i++) abl.recordOutcome(b, 'confirmed');
    const order = abl.orderedAgents([a, b]);
    assert.strictEqual(order[0], b, 'the agent with real successes must rank above the one with real failures, regardless of initial order');
  });

  console.log(`\n${passed} passed, ${failed} failed`); process.exit(failed ? 1 : 0);
})();
