'use strict';
// RFR2 wired into the intelligence system (James). The Relational Field Reader:
// friction/tension → RFR2 causality.traceToRoot finds the CONDITIONS that caused
// it; RFR2 sigma.classify characterizes the deviation. Must be a real wire, in
// loom's connection graph, honest-degrade if RFR2 is unavailable.
const assert = require('assert');
const path = require('path');
let passed = 0, failed = 0;
async function test(id, desc, fn) {
  try { await fn(); console.log(`  ✓ ${id} ${desc}`); passed++; }
  catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${e.message}`); failed++; }
}
const ROOT = path.join(__dirname, '../..');
const rf = require(path.join(ROOT, 'intelligence/relational-field'));

(async () => {
  await test('T-001', 'traces friction back to its causal ROOT condition (RFR2 causality)', async () => {
    const { loadRFR2Module } = require(path.join(ROOT, 'lib/rfr2-bridge.js'));
    const causality = await loadRFR2Module('causality');
    const store = causality.createCausalStore();
    store.addEdge(causality.createEdge('A', 'B', 'causal/explicit', 'r1', 1, 1.0));
    store.addEdge(causality.createEdge('B', 'C', 'causal/explicit', 'r2', 1, 1.0));
    const field = await rf.readFieldForFriction({ id: 'C', causalStore: store });
    assert.strictEqual(field.root, 'A', 'friction at C must trace to root condition A');
    assert.deepStrictEqual(field.conditions, ['A', 'B', 'C'], 'the causal path is the conditions');
    assert.strictEqual(field.available, true);
  });

  await test('T-002', 'characterizes the deviation from baseline (RFR2 sigma)', async () => {
    const { loadRFR2Module } = require(path.join(ROOT, 'lib/rfr2-bridge.js'));
    const causality = await loadRFR2Module('causality');
    const store = causality.createCausalStore();
    store.addEdge(causality.createEdge('A', 'B', 'causal/explicit', 'r1', 1, 1.0));
    const field = await rf.readFieldForFriction({ id: 'B', causalStore: store, kinematicWindow: [1, 2, 4, 8, 16] });
    assert.ok(field.deviation !== null, 'RFR2 sigma should classify a sufficient window');
  });

  await test('T-003', 'honest degrade — no event id returns a stated reason, never throws (§1.2)', async () => {
    const field = await rf.readFieldForFriction({});
    assert.strictEqual(field.available, false);
    assert.ok(field.reason, 'must state why it could not read the field');
  });

  await test('T-004', 'batch: trackFrictionConditions reads the field over many events', async () => {
    const { loadRFR2Module } = require(path.join(ROOT, 'lib/rfr2-bridge.js'));
    const causality = await loadRFR2Module('causality');
    const store = causality.createCausalStore();
    store.addEdge(causality.createEdge('X', 'Y', 'causal/explicit', 'r', 1, 1.0));
    const res = await rf.trackFrictionConditions([{ id: 'Y' }, { id: 'Z' }], { causalStore: store });
    assert.strictEqual(res.total, 2);
    assert.ok(res.traced >= 1, 'at least the wired event traces');
  });

  await test('T-005', 'registered as a first-class intelligence capability', () => {
    const idx = require('fs').readFileSync(path.join(ROOT, 'intelligence/index.js'), 'utf8');
    assert.ok(/relational-field/.test(idx), 'intelligence must expose the relational-field capability');
    assert.ok(/RFR2 wired into the intelligence/.test(idx), 'the wire is described');
  });

  await test('T-006', 'RFR2↔intelligence is in loom\'s connection graph (visible to the system)', () => {
    const { FILES } = require(path.join(ROOT, 'loom/maps/observability-map'));
    const relField = FILES.find(f => f[1] === 'nexus.intelligence.relational-field');
    assert.ok(relField, 'relational-field must be a mapped component');
    assert.ok(relField[2].includes('nexus.lib.rfr2-bridge'), 'wired to the RFR2 bridge');
    assert.ok(relField[2].includes('nexus.intelligence.mastermind'), 'wired to the intelligence mastermind');
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
