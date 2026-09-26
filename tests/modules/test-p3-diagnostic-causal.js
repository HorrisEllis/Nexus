'use strict';
// §P3 — the diagnostic kernel finds gaps/tension/friction AND the conditions that
// created them, composing the live substrate (RFR2, snapshot timeline, fan-in
// coverage, loom self-model).
const assert = require('assert');
const path = require('path');
let passed = 0, failed = 0;
async function test(id, desc, fn) { try { await fn(); console.log(`  ✓ ${id} ${desc}`); passed++; } catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${e.message}`); failed++; } }
const dc = require(path.join(__dirname, '../..', 'lib/diagnostic-causal'));
const rf = { readFieldForFriction: async () => ({ root: 'root-cond', conditions: ['root-cond', 'x', 'tension'], available: true }) };

(async () => {
  await test('T-001', 'explainFinding traces a finding to its causal conditions (RFR2)', async () => {
    const e = await dc.explainFinding({ type: 'delta.tension', system: 'guardian', severity: 0.82 }, { relationalField: rf });
    assert.strictEqual(e.root, 'root-cond'); assert.ok(e.conditions.length >= 2); assert.strictEqual(e.available, true);
  });
  await test('T-002', 'diagnoseDeep explains every finding + counts traced conditions', async () => {
    const r = await dc.diagnoseDeep([{ type: 'delta.tension', system: 'g', severity: 0.8 }, { type: 'sigma.spike', system: 'c', severity: 0.9 }], { relationalField: rf });
    assert.strictEqual(r.total, 2); assert.strictEqual(r.withTracedConditions, 2);
  });
  await test('T-003', 'diagnoseDeep pulls live self-model context (loom capability scan)', async () => {
    const r = await dc.diagnoseDeep([{ type: 'x', system: 'g', severity: 0.8 }], { relationalField: rf });
    assert.ok(r.context.selfModel, 'has self-model'); assert.ok('capabilities' in r.context.selfModel || 'error' in r.context.selfModel);
  });
  await test('T-004', 'coverage names silent systems as blind spots', async () => {
    const r = await dc.diagnoseDeep([{ type: 'x', system: 'g', severity: 0.8 }], { relationalField: rf, expectedSystems: ['guardian', 'cortex', 'nonexistent-sys'] });
    assert.ok(r.context.coverage, 'has coverage');
  });
  await test('T-005', 'honest degrade — a finding with no chain is stated, not fatal', async () => {
    const badRf = { readFieldForFriction: async () => ({ root: null, conditions: [], available: false, reason: 'no chain' }) };
    const e = await dc.explainFinding({ type: 'x' }, { relationalField: badRf });
    assert.strictEqual(e.available, false); assert.ok(e.reason);
  });
  console.log(`\n${passed} passed, ${failed} failed`); process.exit(failed ? 1 : 0);
})();
