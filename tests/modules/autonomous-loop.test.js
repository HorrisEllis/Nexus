'use strict';
/**
 * tests/modules/autonomous-loop.test.js — Phase 13 Autonomous Loop Suite
 * UUID: test-autonomous-loop-v1-0000-4300-0000-000000000001
 *
 * Covers: loop_contract validation (Goal/Budget/Boundary/Exit hard-required),
 * budget enforcement (timeMs/maxSteps/costCeiling), the sigma halt+rewind
 * path (real check, against a table this suite simulates having no
 * producer for, and one with a real reading), the scoped gap-status fix
 * (status:'pending' explicit, not createLoop()'s 'open' default), step
 * outcomes (resolved/human_required/timeout/blocked), and exit_condition
 * evaluation (steps/stable/manual).
 *
 * Fast polling: AUTONOMOUS_STEP_POLL_MS/AUTONOMOUS_STEP_TIMEOUT_MS are set
 * via env *before* requiring the module (they're read once at module load).
 */

process.env.AUTONOMOUS_STEP_POLL_MS = '15';
process.env.AUTONOMOUS_STEP_TIMEOUT_MS = '120';

const assert = require('assert');
let passed = 0, failed = 0;

async function test(id, desc, fn) {
  try { await fn(); console.log(`  ✓ ${id} ${desc}`); passed++; }
  catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${e.message}`); failed++; }
}

// ── Mock JAA ──────────────────────────────────────────────────────────────────
let _store = {};
let _onGapInserted = null; // test-controlled simulated gap-loop responder
function resetStore() { _store = { gaps: [], event_log: [], autonomous_runs: [], sigma_records: [] }; _onGapInserted = null; }
resetStore();

require.cache[require.resolve('../../cortex/memory/jaa-db')] = {
  id: '../memory/jaa-db', filename: '../memory/jaa-db', loaded: true,
  exports: {
    jaaDB: {
      query:  (t, fn, n) => (_store[t] || []).filter(fn).slice(0, n || 999),
      insert: (t, r) => {
        (_store[t] = _store[t] || []).push(r);
        if (t === 'gaps' && _onGapInserted) _onGapInserted(r);
        return r;
      },
      update: (t, id, patch) => { const row = (_store[t] || []).find(r => r.uuid === id); if (row) Object.assign(row, patch); },
    },
    uid: () => require('crypto').randomUUID(),
  },
};

// ── Mock intent-classifier ───────────────────────────────────────────────────
let _verbOverride = 'build';
require.cache[require.resolve('../../lib/intent-classifier')] = {
  id: '../../lib/intent-classifier', filename: '../../lib/intent-classifier', loaded: true,
  exports: {
    classify: (req) => ({
      intent: {
        uuid: 'intent-' + Math.random().toString(36).slice(2, 8),
        domain: 'test', verb: _verbOverride, raw: req.text,
        risk_level: 'LLM_LOCAL', confidence: 0.9, source: 'AUTONOMOUS_LOOP',
        runId: req.runId, step: req.step,
      },
      lowConfidence: false,
    }),
    freeze: (intent) => ({ ...intent, _frozen: true }),
  },
};

// ── Mock case-library ────────────────────────────────────────────────────────
let _caseLibraryResult = { tier: 'cold', confidence: null, workingMemorySeed: null, blocked: false, signature: 'test:build' };
require.cache[require.resolve('../../lib/case-library')] = {
  id: '../../lib/case-library', filename: '../../lib/case-library', loaded: true,
  exports: { query: () => _caseLibraryResult },
};

// ── Mock open-loop-taxonomy — real LOOP_TYPES check, fake-but-faithful createLoop ──
require.cache[require.resolve('../../lib/open-loop-taxonomy')] = {
  id: '../../lib/open-loop-taxonomy', filename: '../../lib/open-loop-taxonomy', loaded: true,
  exports: {
    createLoop: (opts) => ({
      type: opts.loop_type, loop_type: opts.loop_type, status: 'open', // real default — caller must override
      path: opts.path, body: opts.body, evidence: opts.evidence,
      closure_condition: opts.closure_condition, source: opts.source, causedBy: opts.causedBy,
      createdAt: Date.now(),
    }),
  },
};

// ── Mock compartment-engine — faithful to the real contract: executor throw
// -> status FAIL + _executionError; executor return -> status PASS + result ──
require.cache[require.resolve('../../lib/compartment-engine')] = {
  id: '../../lib/compartment-engine', filename: '../../lib/compartment-engine', loaded: true,
  exports: {
    spawn: async ({ intent, workingMemorySeed }) => ({
      id: 'cmp-' + Math.random().toString(36).slice(2, 8),
      intent_uuid: intent.uuid, working_memory: workingMemorySeed,
      status: 'RUNNING', result: null, trace_log: [],
    }),
    execute: async (compartment, executor) => {
      try {
        const result = await executor(compartment.working_memory, {});
        compartment.result = result;
        compartment.status = 'PASS';
      } catch (e) {
        compartment._executionError = e.message;
        compartment.status = 'FAIL';
      }
      return compartment;
    },
  },
};

// ── Mock snapshot ─────────────────────────────────────────────────────────────
let _rollbacks = [];
require.cache[require.resolve('../../cortex/snapshot')] = {
  id: '../../cortex/snapshot', filename: '../../cortex/snapshot', loaded: true,
  exports: {
    create: async (opts) => ({ snapId: 'snap-' + Math.random().toString(36).slice(2, 8) }),
    rollback: async (snapId, opts) => { _rollbacks.push({ snapId, opts }); },
  },
};

// ── Mock nexus-bus ────────────────────────────────────────────────────────────
require.cache[require.resolve('../../nexus-bus')] = {
  id: '../../nexus-bus', filename: '../../nexus-bus', loaded: true,
  exports: { emit: () => {} },
};

const al = require('../../orchestrator/lib/autonomous-loop');

function reset() {
  resetStore();
  _verbOverride = 'build';
  _caseLibraryResult = { tier: 'cold', confidence: null, workingMemorySeed: null, blocked: false, signature: 'test:build' };
  _rollbacks = [];
}

// Default responder: resolve every inserted gap immediately as 'resolved'.
function resolveGapsImmediately() {
  _onGapInserted = (gap) => { gap.status = 'resolved'; };
}
function escalateGapsToHuman() {
  _onGapInserted = (gap) => { gap.status = 'human_required'; gap.resolveReason = 'test escalation'; };
}
function neverResolveGaps() {
  _onGapInserted = null; // status stays 'pending' forever -> _awaitGapTerminal times out
}

const VALID = {
  goal: 'build the thing',
  budget: { maxSteps: 3 },
  boundary: { description: 'no writes outside /tmp' },
  exit_condition: { type: 'manual' },
};

(async () => {

// ── §A: loop_contract validation ────────────────────────────────────────────────
await test('T-001', 'missing goal -> throws', async () => {
  await assert.rejects(al.startRun({ ...VALID, goal: null }), /Goal required/);
});

await test('T-002', 'missing budget -> throws', async () => {
  await assert.rejects(al.startRun({ ...VALID, budget: null }), /Budget required/);
});

await test('T-003', 'budget with no real ceiling field -> throws', async () => {
  await assert.rejects(al.startRun({ ...VALID, budget: {} }), /Budget required/);
});

await test('T-004', 'missing boundary description -> throws', async () => {
  await assert.rejects(al.startRun({ ...VALID, boundary: {} }), /Boundary required/);
});

await test('T-005', 'missing exit_condition -> throws', async () => {
  await assert.rejects(al.startRun({ ...VALID, exit_condition: null }), /Exit condition required/);
});

await test('T-006', 'unsupported exit_condition.type -> throws, names the real reason', async () => {
  await assert.rejects(
    al.startRun({ ...VALID, exit_condition: { type: 'health_score_stable' } }),
    /Unsupported exit_condition.type/
  );
});

// ── §B: budget enforcement ──────────────────────────────────────────────────────
await test('T-007', 'maxSteps budget stops the run at exactly that many steps', async () => {
  reset(); resolveGapsImmediately();
  const run = await al.startRun({ ...VALID, budget: { maxSteps: 2 }, exit_condition: { type: 'manual' } });
  assert.strictEqual(run.status, 'BUDGET_EXHAUSTED');
  assert.strictEqual(run.stepCount, 2);
});

await test('T-008', 'timeMs:0 stops the run before any step executes', async () => {
  reset(); resolveGapsImmediately();
  const run = await al.startRun({ ...VALID, budget: { timeMs: 0 }, exit_condition: { type: 'manual' } });
  assert.strictEqual(run.status, 'BUDGET_EXHAUSTED');
  assert.strictEqual(run.stepCount, 0);
});

await test('T-009', 'costCeiling stops the run once accumulated step cost reaches it', async () => {
  reset(); resolveGapsImmediately();
  // each step costs COST_TIERS.LLM_LOCAL = 0.5 (intent.risk_level mocked to LLM_LOCAL)
  const run = await al.startRun({ ...VALID, budget: { costCeiling: 1.0 }, exit_condition: { type: 'manual' } });
  assert.strictEqual(run.status, 'BUDGET_EXHAUSTED');
  assert.ok(run.costSpent >= 1.0);
  assert.strictEqual(run.stepCount, 2); // 0.5, 1.0 -> exhausted check fires before step 3
});

// ── §C: sigma check ──────────────────────────────────────────────────────────────
await test('T-010', 'no sigma_records row -> run proceeds, degraded warning logged once', async () => {
  reset(); resolveGapsImmediately();
  const run = await al.startRun({ ...VALID, budget: { maxSteps: 2 }, exit_condition: { type: 'manual' } });
  assert.strictEqual(run.status, 'BUDGET_EXHAUSTED'); // never halted on sigma
  const warnings = _store.event_log.filter(e => e.type === 'autonomous_loop.sigma_monitoring_degraded');
  assert.strictEqual(warnings.length, 1); // logged once, not once per step
});

await test('T-011', 'sigma >= threshold halts the run and triggers a real rewind call', async () => {
  reset(); resolveGapsImmediately();
  _store.sigma_records.push({ sigma: 0.85, ts: Date.now() });
  const run = await al.startRun({ ...VALID, budget: { maxSteps: 5 }, exit_condition: { type: 'manual' } });
  assert.strictEqual(run.status, 'HALTED_SIGMA');
  assert.strictEqual(_rollbacks.length, 1);
  assert.strictEqual(_rollbacks[0].snapId, run.preRunSnapshotId);
});

await test('T-012', 'sigma below threshold does not halt', async () => {
  reset(); resolveGapsImmediately();
  _store.sigma_records.push({ sigma: 0.3, ts: Date.now() });
  const run = await al.startRun({ ...VALID, budget: { maxSteps: 1 }, exit_condition: { type: 'manual' } });
  assert.notStrictEqual(run.status, 'HALTED_SIGMA');
});

// ── §D: the scoped gap-status fix ────────────────────────────────────────────────
await test('T-013', 'inserted gap has status "pending", never createLoop\'s "open" default', async () => {
  reset(); resolveGapsImmediately();
  await al.startRun({ ...VALID, budget: { maxSteps: 1 }, exit_condition: { type: 'manual' } });
  const gap = _store.gaps[0];
  assert.ok(gap, 'a gap should have been inserted');
  // resolveGapsImmediately() flips it to 'resolved' synchronously at insert,
  // but it must have started 'pending' for gap-loop's _tick() to ever see it —
  // verify by checking a run where nothing resolves it (status stays whatever was inserted).
  reset(); neverResolveGaps();
  await al.startRun({ ...VALID, budget: { maxSteps: 1 }, exit_condition: { type: 'manual' } });
  assert.strictEqual(_store.gaps[0].status, 'pending');
});

// ── §E: step outcomes ────────────────────────────────────────────────────────────
await test('T-014', 'gap resolves "resolved" -> compartment PASS, run continues to next step', async () => {
  reset(); resolveGapsImmediately();
  const run = await al.startRun({ ...VALID, budget: { maxSteps: 2 }, exit_condition: { type: 'manual' } });
  assert.strictEqual(run.steps.every(s => s.status === 'PASS'), true);
});

await test('T-015', 'gap escalates to human_required -> run.status HUMAN_REQUIRED, stops immediately', async () => {
  reset(); escalateGapsToHuman();
  const run = await al.startRun({ ...VALID, budget: { maxSteps: 5 }, exit_condition: { type: 'manual' } });
  assert.strictEqual(run.status, 'HUMAN_REQUIRED');
  assert.strictEqual(run.stepCount, 1); // stopped at the first escalation, no further steps
});

await test('T-016', 'gap never resolves -> step times out -> treated as BUDGET_EXHAUSTED (hard limit, not retried)', async () => {
  reset(); neverResolveGaps();
  const run = await al.startRun({ ...VALID, budget: { maxSteps: 5, stepTimeoutMs: 60 }, exit_condition: { type: 'manual' } });
  assert.strictEqual(run.status, 'BUDGET_EXHAUSTED');
  assert.strictEqual(run.stepCount, 1);
});

await test('T-017', 'case-library blocked signature -> run.status BLOCKED, no gap ever inserted', async () => {
  reset();
  _caseLibraryResult = { tier: 'blocked', confidence: null, workingMemorySeed: null, blocked: true, reason: 'negative crystal', signature: 'test:build' };
  const run = await al.startRun({ ...VALID, budget: { maxSteps: 3 }, exit_condition: { type: 'manual' } });
  assert.strictEqual(run.status, 'BLOCKED');
  assert.strictEqual(_store.gaps.length, 0);
});

// ── §F: exit_condition evaluation ────────────────────────────────────────────────
await test('T-018', 'exit_condition "steps" -> EXIT_MET exactly at the count', async () => {
  reset(); resolveGapsImmediately();
  const run = await al.startRun({ ...VALID, budget: { maxSteps: 10 }, exit_condition: { type: 'steps', count: 3 } });
  assert.strictEqual(run.status, 'EXIT_MET');
  assert.strictEqual(run.stepCount, 3);
});

await test('T-019', 'exit_condition "stable" -> EXIT_MET after N consecutive PASS', async () => {
  reset(); resolveGapsImmediately();
  const run = await al.startRun({ ...VALID, budget: { maxSteps: 10 }, exit_condition: { type: 'stable', consecutive: 2 } });
  assert.strictEqual(run.status, 'EXIT_MET');
  assert.strictEqual(run.stepCount, 2);
});

await test('T-020', 'exit_condition "manual" never self-exits — only budget stops it', async () => {
  reset(); resolveGapsImmediately();
  const run = await al.startRun({ ...VALID, budget: { maxSteps: 4 }, exit_condition: { type: 'manual' } });
  assert.strictEqual(run.status, 'BUDGET_EXHAUSTED');
  assert.strictEqual(run.stepCount, 4);
});

// ── §G: validateWiring ───────────────────────────────────────────────────────────
await test('T-021', 'validateWiring reports all required modules reachable', () => {
  const checks = al.validateWiring();
  assert.strictEqual(checks.jaa, true);
  assert.strictEqual(checks.intentClassifier, true);
  assert.strictEqual(checks.caseLibrary, true);
  assert.strictEqual(checks.compartmentEngine, true);
  assert.strictEqual(checks.taxonomy, true);
});

})().then(() => {
  console.log(`\n${passed} passed  ${failed} failed`);
  if (failed > 0) process.exitCode = 1;
});

module.exports = { passed, failed };
