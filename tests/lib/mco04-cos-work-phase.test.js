'use strict';
/**
 * tests/lib/mco04-cos-work-phase.test.js
 *
 * §MCO04 2026-09-18 — James: "Migrate to cos. Expand cos if needed just
 * make sure you map first." Real, live tests against the actual COS
 * host/gate/bus pipeline (no mocks) — a fresh, isolated state/map file
 * per run, exactly like the real CLI would use, just pointed at a temp
 * location instead of the real COS_COMP_DIR.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const assert = require('assert');

let pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); pass++; console.log(`  ✓ ${name}`); }
  catch (e) { fail++; console.log(`  ✗ ${name}\n    ${e.message}`); }
}

function freshHost() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mco04-cos-'));
  const { createHost } = require('../../cos/host/index.js');
  return createHost({ stateFile: path.join(dir, 'state.json'), mapFile: path.join(dir, 'map.json'), logLevel: 'ERRORS' });
}

const { createCompartment } = require('../../cos/cli/commands/create.js');
const { advanceWorkPhase } = require('../../cos/cli/commands/advance-work-phase.js');

test('MCO04-001: a freshly created real COS compartment starts with workPhase null', () => {
  const host = freshHost();
  const comp = createCompartment(host, { name: `mco04-test-${Date.now()}-a`, purpose: 'test', networkIsolated: true });
  assert.strictEqual(comp.workPhase, null);
});

test('MCO04-002: advanceWorkPhase null -> EXPLORING succeeds and persists to the real store', () => {
  const host = freshHost();
  const name = `mco04-test-${Date.now()}-b`;
  createCompartment(host, { name, purpose: 'test' });
  const updated = advanceWorkPhase(host, { name, nextPhase: 'EXPLORING' });
  assert.strictEqual(updated.workPhase, 'EXPLORING');
  const reread = host.store.getCompartmentByName(name);
  assert.strictEqual(reread.workPhase, 'EXPLORING', 'must be durably persisted in the real state store, not just in-memory');
});

test('MCO04-003: the full real sequence null -> EXPLORING -> ACTING -> VERIFYING all succeed in order', () => {
  const host = freshHost();
  const name = `mco04-test-${Date.now()}-c`;
  createCompartment(host, { name, purpose: 'test' });
  advanceWorkPhase(host, { name, nextPhase: 'EXPLORING' });
  advanceWorkPhase(host, { name, nextPhase: 'ACTING' });
  const final = advanceWorkPhase(host, { name, nextPhase: 'VERIFYING' });
  assert.strictEqual(final.workPhase, 'VERIFYING');
});

test('MCO04-004: advanceWorkPhase refuses a skip (EXPLORING -> VERIFYING)', () => {
  const host = freshHost();
  const name = `mco04-test-${Date.now()}-d`;
  createCompartment(host, { name, purpose: 'test' });
  advanceWorkPhase(host, { name, nextPhase: 'EXPLORING' });
  assert.throws(() => advanceWorkPhase(host, { name, nextPhase: 'VERIFYING' }), /cannot advance/);
});

test('MCO04-005: advanceWorkPhase refuses going backward (ACTING -> EXPLORING)', () => {
  const host = freshHost();
  const name = `mco04-test-${Date.now()}-e`;
  createCompartment(host, { name, purpose: 'test' });
  advanceWorkPhase(host, { name, nextPhase: 'EXPLORING' });
  advanceWorkPhase(host, { name, nextPhase: 'ACTING' });
  assert.throws(() => advanceWorkPhase(host, { name, nextPhase: 'EXPLORING' }), /cannot advance/);
});

test('MCO04-006: advanceWorkPhase throws for a nonexistent compartment', () => {
  const host = freshHost();
  assert.throws(() => advanceWorkPhase(host, { name: 'does-not-exist-xyz', nextPhase: 'EXPLORING' }), /not found/);
});

test('MCO04-007: advanceWorkPhase refuses an unrecognized phase name before ever touching the store', () => {
  const host = freshHost();
  const name = `mco04-test-${Date.now()}-f`;
  createCompartment(host, { name, purpose: 'test' });
  assert.throws(() => advanceWorkPhase(host, { name, nextPhase: 'BOGUS' }), /must be one of/);
});

test('MCO04-008: workPhase and state (process lifecycle) are real, independent axes', () => {
  const host = freshHost();
  const name = `mco04-test-${Date.now()}-g`;
  const comp = createCompartment(host, { name, purpose: 'test' });
  assert.strictEqual(comp.state, 'created');
  const advanced = advanceWorkPhase(host, { name, nextPhase: 'EXPLORING' });
  assert.strictEqual(advanced.state, 'created', 'advancing work phase must never silently change process state');
});

console.log(`\n  mco04-cos-work-phase: ${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
