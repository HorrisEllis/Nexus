'use strict';
/**
 * tests/modules/adversary-suite.test.js — Phase 25 sub-step 4 Suite
 * UUID: test-adversary-suite-v1-0000-4000-0000-000000000001
 *
 * Covers all 6 attack classes (syntax, logic, edge-case, state,
 * cross-domain, stress) and the QA/QC layer (syntax, schema, type,
 * invariant, deterministic-replay), each exercised with both a genuinely
 * violating input and a genuinely clean one — none of these are theater
 * that always passes.
 */

const assert = require('assert');
let passed = 0, failed = 0;

async function test(id, desc, fn) {
  try { await fn(); console.log(`  ✓ ${id} ${desc}`); passed++; }
  catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${e.message}`); failed++; }
}

const as = require('../../meta/adversary-suite');

function makeCompartment(overrides = {}) {
  return {
    id: 'c-test',
    result: { ok: true },
    constraint_frame: { risk_ceiling: 'READ', boundary: { paths: [], systems: [] } },
    trace_log: [],
    status: 'RUNNING',
    ...overrides,
  };
}

(async () => {

// ── §A: attack class — syntax ──────────────────────────────────────────────────
await test('T-001', 'circular reference in result -> syntax violation', () => {
  const circular = {}; circular.self = circular;
  const c = makeCompartment({ result: circular });
  const v = as._attackSyntax(c);
  assert.ok(v && v.type === 'syntax');
});

await test('T-002', 'clean serializable result -> no syntax violation', () => {
  const c = makeCompartment({ result: { a: 1, b: [1,2,3] } });
  assert.strictEqual(as._attackSyntax(c), null);
});

// ── §B: attack class — logic ──────────────────────────────────────────────────
await test('T-003', 'READ-risk result claiming mutation -> logic violation', () => {
  const c = makeCompartment({ result: { mutated: true }, constraint_frame: { risk_ceiling: 'READ' } });
  const v = as._attackLogic(c);
  assert.ok(v && v.type === 'logic');
});

await test('T-004', 'FORGE-risk result claiming mutation -> no logic violation (expected for that risk class)', () => {
  const c = makeCompartment({ result: { mutated: true }, constraint_frame: { risk_ceiling: 'FORGE' } });
  assert.strictEqual(as._attackLogic(c), null);
});

// ── §C: attack class — edge-case ──────────────────────────────────────────────────
await test('T-005', 'null result with no execution error -> edge-case violation', () => {
  const c = makeCompartment({ result: null });
  const v = as._attackEdgeCase(c);
  assert.ok(v && v.type === 'edge_case');
});

await test('T-006', 'null result WITH an execution error -> no edge-case violation (already handled upstream)', () => {
  const c = makeCompartment({ result: null, _executionError: 'boom' });
  assert.strictEqual(as._attackEdgeCase(c), null);
});

await test('T-007', 'non-null result -> no edge-case violation', () => {
  const c = makeCompartment({ result: { ok: true } });
  assert.strictEqual(as._attackEdgeCase(c), null);
});

// ── §D: attack class — state (frame violation) ────────────────────────────────────
await test('T-008', 'touching a boundary-excluded path -> frame_violation', () => {
  const c = makeCompartment({
    result: { touchedPaths: ['/etc/secrets'] },
    constraint_frame: { boundary: { paths: ['/etc/secrets'], systems: [] } },
  });
  const v = as._attackState(c, { strictBoundary: false });
  assert.ok(v && v.type === 'frame_violation');
});

await test('T-009', 'touching a boundary-excluded system -> frame_violation', () => {
  const c = makeCompartment({
    result: { touchedSystems: ['production-db'] },
    constraint_frame: { boundary: { paths: [], systems: ['production-db'] } },
  });
  const v = as._attackState(c, { strictBoundary: false });
  assert.ok(v && v.type === 'frame_violation');
});

await test('T-010', 'touching a path NOT in the exclusion list -> no violation under lenient boundary', () => {
  const c = makeCompartment({
    result: { touchedPaths: ['/tmp/scratch'] },
    constraint_frame: { boundary: { paths: ['/etc/secrets'], systems: [] } },
  });
  const v = as._attackState(c, { strictBoundary: false });
  assert.strictEqual(v, null);
});

await test('T-011', 'strictBoundary: touching a path not pre-declared in-scope -> frame_violation even without explicit exclusion', () => {
  const c = makeCompartment({
    result: { touchedPaths: ['/unexpected/path'] },
    constraint_frame: { boundary: { paths: [], systems: [], inScopePaths: ['/expected/path'] } },
  });
  const v = as._attackState(c, { strictBoundary: true });
  assert.ok(v && v.type === 'frame_violation');
});

await test('T-012', 'strictBoundary with boundary.allowAny -> no violation even for unexpected paths', () => {
  const c = makeCompartment({
    result: { touchedPaths: ['/anywhere'] },
    constraint_frame: { boundary: { paths: [], systems: [], allowAny: true } },
  });
  const v = as._attackState(c, { strictBoundary: true });
  assert.strictEqual(v, null);
});

await test('T-013', 'no boundary declared at all -> no state check possible, no false violation', () => {
  const c = makeCompartment({ result: { touchedPaths: ['/x'] }, constraint_frame: {} });
  assert.strictEqual(as._attackState(c, { strictBoundary: true }), null);
});

// ── §E: attack class — cross-domain ──────────────────────────────────────────────
await test('T-014', 'result claiming a different domain than declared -> cross_domain violation', () => {
  const c = makeCompartment({ result: { domain: 'guardian' }, _declaredDomain: 'cortex' });
  const v = as._attackCrossDomain(c);
  assert.ok(v && v.type === 'cross_domain');
});

await test('T-015', 'result domain matches declared domain -> no violation', () => {
  const c = makeCompartment({ result: { domain: 'cortex' }, _declaredDomain: 'cortex' });
  assert.strictEqual(as._attackCrossDomain(c), null);
});

await test('T-016', 'no declared domain on compartment -> no false violation', () => {
  const c = makeCompartment({ result: { domain: 'guardian' } });
  assert.strictEqual(as._attackCrossDomain(c), null);
});

// ── §F: attack class — stress (real re-execution) ──────────────────────────────────
await test('T-017', 'non-deterministic executor across repetitions -> violation (stress class actually re-runs code)', async () => {
  const c = makeCompartment();
  let call = 0;
  const flakyExecutor = async () => ({ value: call++ }); // different output every call
  const v = await as._attackStress(c, { stressIterations: 3 }, flakyExecutor);
  assert.ok(v, 'non-determinism should be caught');
});

await test('T-018', 'deterministic executor across repetitions -> no violation', async () => {
  const c = makeCompartment();
  const stableExecutor = async () => ({ value: 42 });
  const v = await as._attackStress(c, { stressIterations: 3 }, stableExecutor);
  assert.strictEqual(v, null);
});

await test('T-019', 'executor that throws during stress repetition -> violation, not an uncaught crash', async () => {
  const c = makeCompartment();
  let call = 0;
  const sometimesThrows = async () => { call++; if (call === 2) throw new Error('flaky failure'); return { ok: true }; };
  const v = await as._attackStress(c, { stressIterations: 3 }, sometimesThrows);
  assert.ok(v && /flaky failure/.test(v.detail));
});

await test('T-020', 'stressIterations <= 1 -> stress class does not run at all (no executor re-invocation for low-risk intents)', async () => {
  const c = makeCompartment();
  let calls = 0;
  const executor = async () => { calls++; return { ok: true }; };
  const v = await as._attackStress(c, { stressIterations: 1 }, executor);
  assert.strictEqual(v, null);
  assert.strictEqual(calls, 0, 'should never have been invoked');
});

await test('T-021', 'budget.timeMs exceeded across repetitions -> stress violation', async () => {
  const c = makeCompartment({ constraint_frame: { budget: { timeMs: 1 } } });
  const slowExecutor = async () => { await new Promise(r => setTimeout(r, 20)); return { ok: true }; };
  const v = await as._attackStress(c, { stressIterations: 2 }, slowExecutor);
  assert.ok(v && /budget/.test(v.detail));
});

// ── §G: full runAdversarySuite — intensity scaling by risk ──────────────────────────
await test('T-022', 'IRREVERSIBLE risk gets max stress iterations', async () => {
  const c = makeCompartment({ constraint_frame: { risk_ceiling: 'IRREVERSIBLE', boundary: {} } });
  const report = await as.runAdversarySuite(c, async () => ({ ok: true }));
  assert.strictEqual(report.intensity.stressIterations, 5);
});

await test('T-023', 'READ risk gets minimal stress iterations', async () => {
  const c = makeCompartment({ constraint_frame: { risk_ceiling: 'READ', boundary: {} } });
  const report = await as.runAdversarySuite(c, async () => ({ ok: true }));
  assert.strictEqual(report.intensity.stressIterations, 1);
});

await test('T-024', 'clean compartment with no executor -> ran:true, no violations, stress class marked not-run (null, not passed)', async () => {
  const c = makeCompartment();
  const report = await as.runAdversarySuite(c, null);
  assert.strictEqual(report.ran, true);
  assert.strictEqual(report.violations.length, 0);
  const stressResult = report.attackResults.find(r => r.class === 'stress');
  assert.strictEqual(stressResult.violated, null, 'null means not run, distinct from false (passed)');
});

await test('T-025', 'multiple simultaneous violations are all captured, not just the first', async () => {
  const c = makeCompartment({
    result: { mutated: true, domain: 'guardian' },
    constraint_frame: { risk_ceiling: 'READ', boundary: {} },
    _declaredDomain: 'cortex',
  });
  const report = await as.runAdversarySuite(c, null);
  assert.ok(report.violations.length >= 2, 'logic violation AND cross-domain violation should both be present');
});

// ── §H: QA/QC layer ────────────────────────────────────────────────────────────────
await test('T-026', 'clean RUNNING compartment with serializable result -> all QA/QC checks pass', () => {
  const c = makeCompartment();
  const report = as.runQAQC(c);
  assert.ok(Object.values(report.checks).every(v => v === true));
});

await test('T-027', 'execution error -> type check fails', () => {
  const c = makeCompartment({ _executionError: 'boom' });
  const report = as.runQAQC(c);
  assert.strictEqual(report.checks.type, false);
});

await test('T-028', 'compartment already resolved before QA/QC runs -> invariant check fails', () => {
  const c = makeCompartment({ status: 'PASS' });
  const report = as.runQAQC(c);
  assert.strictEqual(report.checks.invariant, false);
});

await test('T-029', 'trace already containing a resolution event -> deterministic_replay check fails', () => {
  const c = makeCompartment({ trace_log: [{ event: 'PASS', data: {}, ts: Date.now() }] });
  const report = as.runQAQC(c);
  assert.strictEqual(report.checks.deterministic_replay, false);
});

await test('T-030', 'non-serializable result -> syntax check fails in QA/QC too', () => {
  const circular = {}; circular.self = circular;
  const c = makeCompartment({ result: circular });
  const report = as.runQAQC(c);
  assert.strictEqual(report.checks.syntax, false);
});

})().then(() => {
  console.log(`\n${passed} passed  ${failed} failed`);
  if (failed > 0) process.exitCode = 1;
});

module.exports = { passed, failed };
