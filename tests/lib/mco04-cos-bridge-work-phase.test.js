'use strict';
/**
 * tests/lib/mco04-cos-bridge-work-phase.test.js
 *
 * §MCO04 2026-09-18 — real, live test of lib/cos-bridge.js's new
 * advanceWorkPhase() / toolsAllowedForWorkPhase(), through the bridge's
 * own real getHost() (a fresh, real COS host each call — the bridge's
 * own documented convention), not the lower-level cos/ test harness.
 */

const assert = require('assert');
let pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); pass++; console.log(`  ✓ ${name}`); }
  catch (e) { fail++; console.log(`  ✗ ${name}\n    ${e.message}`); }
}

const bridge = require('../../lib/cos-bridge.js');

test('MCO04-B01: createCompartment + advanceWorkPhase through the real bridge, end to end', () => {
  const name = `mco04-bridge-${Date.now()}-a`;
  const created = bridge.createCompartment({ name, purpose: 'bridge test' });
  assert.strictEqual(created.ok, true, JSON.stringify(created));
  assert.strictEqual(created.compartment.workPhase, null);

  const advanced = bridge.advanceWorkPhase({ name, nextPhase: 'EXPLORING' });
  assert.strictEqual(advanced.ok, true, JSON.stringify(advanced));
  assert.strictEqual(advanced.compartment.workPhase, 'EXPLORING');
});

test('MCO04-B02: advanceWorkPhase through the bridge refuses a skip, returns {ok:false} not a throw', () => {
  const name = `mco04-bridge-${Date.now()}-b`;
  bridge.createCompartment({ name });
  bridge.advanceWorkPhase({ name, nextPhase: 'EXPLORING' });
  const r = bridge.advanceWorkPhase({ name, nextPhase: 'VERIFYING' });
  assert.strictEqual(r.ok, false);
  assert.ok(r.error.includes('cannot advance'));
});

test('MCO04-B03: advanceWorkPhase through the bridge refuses a missing name without touching COS', () => {
  const r = bridge.advanceWorkPhase({ nextPhase: 'EXPLORING' });
  assert.strictEqual(r.ok, false);
  assert.ok(r.error.includes('name is required'));
});

test('MCO04-B04: toolsAllowedForWorkPhase returns real, disjoint EXPLORING/ACTING allowlists against the actual tool registry', () => {
  const agentTools = require('../../lib/agent-tools/index.js');
  const exploring = bridge.toolsAllowedForWorkPhase('EXPLORING', { agentTools });
  const acting = bridge.toolsAllowedForWorkPhase('ACTING', { agentTools });
  assert.ok(Array.isArray(exploring) && exploring.length > 0);
  assert.ok(Array.isArray(acting));
  const overlap = exploring.filter(n => acting.includes(n));
  assert.strictEqual(overlap.length, 0, `overlap: ${overlap.join(', ')}`);
});

test('MCO04-B05: toolsAllowedForWorkPhase returns null for an unrestricted/unknown phase', () => {
  assert.strictEqual(bridge.toolsAllowedForWorkPhase('NOT_REAL'), null);
});

console.log(`\n  mco04-cos-bridge-work-phase: ${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
