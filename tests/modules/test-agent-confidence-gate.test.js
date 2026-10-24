'use strict';
/**
 * tests/modules/test-agent-confidence-gate.test.js — the confidence gate (CG1)
 * Map: docs/2026-10-24-agent-orchestration-phasemap.spec
 *
 * James, 2026-10-24: "before an agent does anything. if confidence is lower
 * than 75%, context must be obtained. build worksurface, compile list of
 * dependancies, find the context, ask user last."
 *
 * The rungs are injected (scriptable) so the ladder's ORDER, threshold and
 * ask-user-LAST escalation are proven deterministically, without a backend.
 */

const assert = require('assert');
const { gate, CONFIDENCE_THRESHOLD } = require('../../lib/agent-confidence-gate.js');

let passed = 0, failed = 0;
const reg = [];
function test(id, desc, fn) { reg.push({ id, desc, fn }); }

// A set of rungs that record the order they ran in, each optionally raising
// confidence by a scripted amount and returning a context marker.
function scripted(order, { wsLift = 0, depLift = 0, ctxLift = 0, askLift = 0, askAnswered = true, throwOn = null } = {}) {
  const mk = (name, lift) => async (input, state) => {
    order.push(name);
    if (throwOn === name) throw new Error(`${name} boom`);
    return { context: { marker: name }, confidence: Math.min(1, state.confidence + lift) };
  };
  return {
    buildWorksurface: mk('worksurface', wsLift),
    compileDeps:      mk('dependencies', depLift),
    findContext:      mk('context', ctxLift),
    askUser: async (input, state) => { order.push('ask-user'); return { answered: askAnswered, confidence: Math.min(1, state.confidence + askLift), context: 'user said' }; },
  };
}

// ── A: the threshold is a floor, not a tax ────────────────────────────────────
test('A1', 'at or above 75% the agent proceeds with NO context obtained', async () => {
  const order = [];
  const r = await gate({ confidence: 0.8, message: 'x' }, scripted(order));
  assert.strictEqual(r.proceed, true);
  assert.strictEqual(r.confident, true);
  assert.deepStrictEqual(order, [], 'no rung should run when already confident');
  assert.strictEqual(r.context.worksurface, null, 'no worksurface gathered');
  assert.strictEqual(r.asked, false);
});

test('A2', 'the threshold is exactly 0.75 (his "75%")', () => {
  assert.strictEqual(CONFIDENCE_THRESHOLD, 0.75);
});

// ── B: below the threshold, the ladder runs in HIS exact order ────────────────
test('B1', 'below 75% the rungs run in order: worksurface → dependencies → context → ask-user', async () => {
  const order = [];
  // no rung raises confidence, so all four run
  const r = await gate({ confidence: 0.3, message: 'x' }, scripted(order));
  assert.deepStrictEqual(order, ['worksurface', 'dependencies', 'context', 'ask-user'], 'exact order of the ladder');
  assert.strictEqual(r.asked, true, 'the user is asked last');
  // every rung is recorded (§1.2)
  const rungs = r.steps.map(s => s.rung);
  assert.deepStrictEqual(rungs, ['worksurface', 'dependencies', 'context', 'ask-user']);
});

// ── C: stop as soon as the context is enough (don't ask the user) ─────────────
test('C1', 'a rung that raises confidence to 0.75 stops the ladder before the user is asked', async () => {
  const order = [];
  // worksurface raises 0.5 → 0.8, so dependencies/context/ask-user never run
  const r = await gate({ confidence: 0.5, message: 'x' }, scripted(order, { wsLift: 0.3 }));
  assert.deepStrictEqual(order, ['worksurface'], 'only the first rung ran');
  assert.strictEqual(r.confident, true);
  assert.strictEqual(r.asked, false, 'the user is NOT asked when context sufficed');
});

test('C2', 'the user is asked ONLY after the first three rungs fail to reach the threshold', async () => {
  const order = [];
  // each rung lifts a little but not enough; the user is the last resort
  const r = await gate({ confidence: 0.4, message: 'x' }, scripted(order, { wsLift: 0.05, depLift: 0.05, ctxLift: 0.05, askLift: 0.3 }));
  assert.strictEqual(order.indexOf('ask-user'), 3, 'ask-user runs only in 4th position, after the three context rungs');
  assert.strictEqual(r.asked, true);
  assert.strictEqual(r.confident, true, 'the user raised it over the threshold');
});

// ── D: nothing silently fails (§1.2) ──────────────────────────────────────────
test('D1', 'a rung that throws is recorded as an error, not thrown, and the ladder continues', async () => {
  const order = [];
  const r = await gate({ confidence: 0.3, message: 'x' }, scripted(order, { throwOn: 'dependencies' }));
  const dep = r.steps.find(s => s.rung === 'dependencies');
  assert.strictEqual(dep.action, 'error');
  assert.match(dep.error, /boom/);
  assert.ok(order.includes('context'), 'the ladder continued past the error to the context rung');
  assert.ok(order.includes('ask-user'), 'and on to asking the user');
});

test('D2', 'with no asker wired, the gate records it could not ask and still proceeds with gathered context', async () => {
  const order = [];
  const deps = scripted(order); deps.askUser = null; // no asker on this surface
  const r = await gate({ confidence: 0.3, message: 'x' }, deps);
  const ask = r.steps.find(s => s.rung === 'ask-user');
  assert.strictEqual(ask.action, 'unavailable');
  assert.strictEqual(r.asked, false);
  assert.strictEqual(r.proceed, true, 'the mandate (obtain context) is satisfied; it proceeds');
  assert.strictEqual(r.confident, false, 'but it is honest that it is still below the threshold');
});

// ── E: the confidence read falls back to the SNR tier when none is given ───────
test('E1', 'a resolved invariant SNR result reads as fully confident (no ladder)', async () => {
  const order = [];
  const r = await gate({ message: 'x', snr: { type: 'invariant', snr: 1 } }, scripted(order));
  assert.strictEqual(r.confident, true);
  assert.deepStrictEqual(order, []);
});

test('E2', 'a genuine unknown (no confidence, no snr) reads below threshold and runs the ladder', async () => {
  const order = [];
  const r = await gate({ message: 'x' }, scripted(order));
  assert.ok(order.length > 0, 'the ladder ran for an unknown');
});

async function run() {
  for (const { id, desc, fn } of reg) {
    try { await fn(); console.log(`  ✓ ${id} ${desc}`); passed++; }
    catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${e.message}`); failed++; }
  }
  process.stdout.write(`\n  test-agent-confidence-gate.test.js\n  ${passed} passed  ${failed} failed\n`);
  if (failed > 0) process.exitCode = 1;
}
run();

module.exports = { passed: () => passed, failed: () => failed };
