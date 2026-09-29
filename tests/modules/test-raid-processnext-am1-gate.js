'use strict';
/**
 * tests/modules/test-raid-processnext-am1-gate.js — real, isolated test
 * for the 2026-09-02 fix: processNext() now auto-calls acknowledge()
 * before dispatch, closing the real gap found while explaining how to
 * test the agent mesh — AM1's intent-contract gate existed but nothing
 * in the automatic path (cortex/core/raid/worker.js's own 15s
 * auto-drain) ever called it.
 *
 * §MOCK PATTERN — same real convention as tests/modules/contract-
 * intake-dependency-graph.test.js: a mock jaaDB backing store, injected
 * via require.cache, since contract-intake.js and lib/hat-forge.js both
 * resolve to the same real cortex/memory/jaa-db.js path.
 */
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const _raidInputIsolated5 = fs.mkdtempSync(path.join(os.tmpdir(), 'raid-input-processnext-'));
process.env.RAID_INPUT_DIR = _raidInputIsolated5;
process.on('exit', () => { try { fs.rmSync(_raidInputIsolated5, { recursive: true, force: true }); } catch (_) {} });
let passed = 0, failed = 0;

async function test(id, desc, fn) {
  try { await fn(); console.log(`  ✓ ${id} ${desc}`); passed++; }
  catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${e.message}`); failed++; }
}

let _store = {};
function resetStore() { _store = { raid_contract_queue: [], forged_hats: [] }; }
resetStore();

require.cache[require.resolve('../../cortex/memory/jaa-db')] = {
  id: '../memory/jaa-db', filename: '../memory/jaa-db', loaded: true,
  exports: {
    uid: () => require('crypto').randomUUID(),
    jaaDB: {
      query:  (t, fn, n) => (_store[t] || []).filter(fn).slice(0, n || 999),
      reloadTable: () => {},   // §0.39.282 — lib/hat-forge refreshes before it reads; without it the gate's check threw and failed open
      insert: (t, r) => { (_store[t] = _store[t] || []).push(r); return r; },
      update: (t, id, patch) => {
        const row = (_store[t] || []).find(r => r.uuid === id);
        if (row) Object.assign(row, patch);
        return row;
      },
      delete: (t, id) => { _store[t] = (_store[t] || []).filter(r => r.uuid !== id); },
    },
  },
};

const intake = require('../../cortex/core/raid/contract-intake.js');

// A real, minimal seeded hat: chatgpt may only "build" — same real shape
// hat-forge.js's own forge() would produce, seeded directly since this
// test cares about the gate's behavior, not hat-forge's own forge()
// validation (already covered by tests/modules/test-hat-forge.js).
function seedBuilderHat() {
  _store.forged_hats.push({
    uuid: 'test-hat-builder', id: 'test-hat-builder', name: 'the_builder',
    baseAgent: 'claude', allowedAgents: ['claude', 'chatgpt'],
    allowedIntents: ['build', 'write', 'forge'],
    toolScope: ['read_file'], personaPrompt: 'test persona',
    ts: Date.now(), _forged: true,
  });
}

(async () => {

await test('GATE-001', 'a contract with an allowed agent+intent auto-acknowledges and dispatches normally', async () => {
  resetStore();
  seedBuilderHat();
  const { queueId } = intake.submitBuildPhaseContract({
    name: 'test', does: 'do something real', forAgent: 'chatgpt',
  });
  const rowBefore = intake.listQueue().find(r => r.uuid === queueId);
  assert.strictEqual(rowBefore.stage, intake.STAGE.QUEUED, 'expected the contract to start at QUEUED stage, not pre-acknowledged');

  const result = await intake.processNext(async () => ({ text: 'ack.\n\nSEAM VERDICT: PASS' }));
  assert.strictEqual(result.queueId, queueId);
  assert.strictEqual(result.status, 'pass');

  const rowAfter = intake.listQueue().find(r => r.uuid === queueId);
  // §MCO4 2026-09-13 — this assertion pinned HANDSHAKE_VERIFIED back when
  // that was the last real reachable stage. It no longer is: a contract
  // that genuinely PASSes now really progresses all the way to
  // QC_PENDING (input artifact verified, RAID's own dequeue, processing,
  // a real output artifact written). Checking acknowledgedBy directly is
  // the real, un-stale proof "processNext() auto-acknowledged this
  // contract" — the thing this test actually asserts in its own name —
  // and QC_PENDING is the honest end state for a real PASS today.
  assert.strictEqual(rowAfter.acknowledgedBy, 'raid-processNext-auto', 'expected processNext() to have auto-acknowledged this contract');
  assert.strictEqual(rowAfter.stage, intake.STAGE.QC_PENDING, 'a real PASS now genuinely reaches QC_PENDING, not just HANDSHAKE_VERIFIED');
});

await test('GATE-002', 'a contract with a refused agent+intent is blocked at processNext(), never dispatched', async () => {
  resetStore();
  seedBuilderHat();
  const { queueId } = intake.submitContract(
    { content: 'delete everything' },
    { source: 'test', forAgent: 'chatgpt', intention: 'delete' },
  );

  let executorWasCalled = false;
  const result = await intake.processNext(async () => { executorWasCalled = true; return { text: 'should never run' }; });

  assert.strictEqual(executorWasCalled, false, 'the real executor must never run for a gate-refused contract');
  assert.strictEqual(result.status, 'blocked_at_handshake');
  assert.ok(result.reason.includes('intent contract refused'));

  const row = intake.listQueue().find(r => r.uuid === queueId);
  assert.strictEqual(row.status, intake.STATUS.BLOCKED);
});

await test('GATE-003', 'a contract already acknowledged by an explicit prior call is not re-gated or re-run twice', async () => {
  resetStore();
  seedBuilderHat();
  const { queueId } = intake.submitBuildPhaseContract({
    name: 'test2', does: 'do something else real', forAgent: 'chatgpt',
  });
  const explicitAck = intake.acknowledge(queueId, { system: 'manual-test' });
  assert.strictEqual(explicitAck.ok, true);

  const result = await intake.processNext(async () => ({ text: 'ack.\n\nSEAM VERDICT: PASS' }));
  assert.strictEqual(result.queueId, queueId);
  assert.strictEqual(result.status, 'pass');
});

await test('GATE-004', 'a contract with no forAgent/intention at all (e.g. legacy self-heal/idearium callers) is unaffected', async () => {
  resetStore();
  const { queueId } = intake.submitContract({ content: 'legacy contract, no forAgent' }, { source: 'test' });
  let executorWasCalled = false;
  const result = await intake.processNext(async () => { executorWasCalled = true; return { text: 'ack.\n\nSEAM VERDICT: PASS' }; });
  assert.strictEqual(executorWasCalled, true, 'a contract with no forAgent/intention should dispatch normally, unaffected by AM1');
  assert.strictEqual(result.queueId, queueId);
  assert.strictEqual(result.status, 'pass');
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exitCode = failed ? 1 : 0;
})();
