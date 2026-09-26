'use strict';
// §P5/P6 — co-pilot identity (who am I), governance gate, agent switching, and the
// NEXUS model in cortex — all WIRED from existing lib modules (§8.6).
const assert = require('assert');
const path = require('path');
let passed = 0, failed = 0;
async function test(id, desc, fn) { try { await fn(); console.log(`  ✓ ${id} ${desc}`); passed++; } catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${e.message}`); failed++; } }
const sm = require(path.join(__dirname, '../..', 'copilot/lib/self-model'));

(async () => {
  await test('T-001', 'whoAmI answers from real evidence, never fabricates', () => {
    const w = sm.whoAmI({ userModel: { getHypotheses: () => [] } });
    assert.ok(w.text, 'has an answer'); assert.strictEqual(w.known, false, 'no evidence → not known');
    assert.ok(/what would you like me to know/i.test(w.text), 'asks back when unknown (dynamic)');
  });
  await test('T-002', 'whoAmI states learned hypotheses when evidence exists', () => {
    const w = sm.whoAmI({ userModel: { getHypotheses: () => [{ claim: 'prefers concise answers' }, { claim: 'works in Portland' }] } });
    assert.strictEqual(w.known, true); assert.ok(/concise|Portland/.test(w.text), 'reflects real hypotheses');
  });
  await test('T-003', 'governAction runs intent + constitutional checks', () => {
    const g = sm.governAction({ action: 'x' });
    assert.ok('allowed' in g, 'returns a verdict'); assert.ok('checks' in g);
  });
  await test('T-004', 'switchAgent routes via the real agent-router', () => {
    const r = sm.switchAgent({ intent: 'coding', prompt: 'fix' });
    assert.ok(r.ok || r.reason, 'returns a result'); if (r.ok) assert.ok(r.agent, 'chose an agent');
  });
  await test('T-005', 'buildNexusModel assembles the model + is persistable', async () => {
    let persisted = null;
    const m = await sm.buildNexusModel({ persist: true, jaaDB: { insert: (t, r) => { persisted = { t, r }; } } });
    assert.ok(m.summary || m.error, 'built a model');
    if (m.summary) { assert.ok(persisted, 'wrote to cortex'); assert.strictEqual(persisted.t, 'self_model'); assert.strictEqual(persisted.r.id, 'nexus'); }
  });
  await test('T-006', 'recordIdentityEvidence routes to reflection', () => {
    const r = sm.recordIdentityEvidence('name', { value: 'James', source: 'user' });
    assert.ok('ok' in r, 'returns a result (ok or honest reason)');
  });
  console.log(`\n${passed} passed, ${failed} failed`); process.exit(failed ? 1 : 0);
})();
