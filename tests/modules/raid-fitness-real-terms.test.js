'use strict';
const assert = require('assert');
let passed = 0, failed = 0;
function test(id, desc, fn) {
  try { fn(); console.log(`  ✓ ${id} ${desc}`); passed++; }
  catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${e.message}`); failed++; }
}

// Mock JAA — same shape as test-snr-filter.js's fixture, kept independent
// here so this file never depends on real data/cortex/memory rows existing.
const _patches = [
  { uuid: 'p1', faultClass: 'known_fault', status: 'verified', successRate: 0.9, ts: 1 },
];
const _events = [];
require.cache[require.resolve('../../cortex/memory/jaa-db')] = {
  id: '../memory/jaa-db', filename: '../memory/jaa-db', loaded: true,
  exports: {
    jaaDB: {
      query: (table, fn, n) => {
        if (table === 'forge_patches') return _patches.filter(fn).slice(0, n || 999);
        return [];
      },
      tail: () => [],
      insert: (t, r) => { _events.push(r); return r; },
    },
    uid: () => require('crypto').randomUUID(),
  },
};

const raid = require('../../cortex/core/raid/index');
const { CausalGraph } = require('../../intelligence/cfr/graph');

// ── roleConfidence ────────────────────────────────────────────────────────────
test('T-001', 'roleConfidence: <3 calls → neutral 0.5, not fabricated', () => {
  raid._weights.delete('code:test-agent-a');
  assert.strictEqual(raid._roleConfidence('test-agent-a', 'code'), 0.5);
  raid.recordOutcome('test-agent-a', 'code', true);
  assert.strictEqual(raid._roleConfidence('test-agent-a', 'code'), 0.5); // still <3
});

test('T-002', 'roleConfidence: >=3 calls → real ratio from recorded outcomes', () => {
  raid._weights.delete('code:test-agent-b');
  raid.recordOutcome('test-agent-b', 'code', true);
  raid.recordOutcome('test-agent-b', 'code', true);
  raid.recordOutcome('test-agent-b', 'code', false);
  const conf = raid._roleConfidence('test-agent-b', 'code');
  assert.ok(Math.abs(conf - (2 / 3)) < 1e-9, `expected 2/3, got ${conf}`);
});

// ── topologicalProximity ─────────────────────────────────────────────────────
test('T-003', 'topologicalProximity: no graph injected → neutral 0.5', () => {
  raid.setCausalGraph(null);
  assert.strictEqual(raid._topologicalProximity('ollama', 'guardian'), 0.5);
});

test('T-004', 'topologicalProximity: real distances map to 1/(1+dist), not a fabricated constant', () => {
  const g = new CausalGraph();
  g.ingest({ uuid: 'a1', componentId: 'guardian', ts: 1 });
  g.ingest({ uuid: 'a2', componentId: 'ollama', ts: 2, causedBy: 'a1' });
  g.ingest({ uuid: 'a3', componentId: 'guardian-claude', ts: 3, causedBy: 'a2' });
  raid.setCausalGraph(g);
  // dist(guardian, ollama) = 1 → 1/(1+1) = 0.5
  assert.strictEqual(raid._topologicalProximity('ollama', 'guardian'), 0.5);
  // dist(guardian, guardian-claude) = 2 → 1/(1+2) = 1/3
  const two = raid._topologicalProximity('claude', 'guardian');
  assert.ok(Math.abs(two - (1 / 3)) < 1e-9, `expected 1/3, got ${two}`);
  raid.setCausalGraph(null);
});

test('T-005', 'topologicalProximity: unreachable component → neutral 0.5, not 0', () => {
  const g = new CausalGraph();
  g.ingest({ uuid: 'z1', componentId: 'isolated', ts: 1 });
  raid.setCausalGraph(g);
  assert.strictEqual(raid._topologicalProximity('ollama', 'guardian'), 0.5);
  raid.setCausalGraph(null);
});

// ── SNR pre-gate wired into _decide() ────────────────────────────────────────
test('T-006', '_decide with faultClass matching a known invariant → resolves locally, no agent', () => {
  const health = { ollama: { online: false, consecutiveFails: 5 } };
  const d = raid._decide({ prompt: 'fix it', faultClass: 'known_fault' }, health, new Map());
  assert.strictEqual(d.agent, null);
  assert.ok(d.reason.includes('snr-gate resolved locally'));
});

test('T-007', '_decide without faultClass → SNR gate never engages (existing behavior untouched)', () => {
  const health = { ollama: { online: true, consecutiveFails: 0 } };
  const d = raid._decide({ prompt: 'build code' }, health, new Map());
  assert.strictEqual(d.agent, 'ollama');
});

test('T-008', '_decide with faultClass NOT matching any invariant → falls through to normal dispatch', () => {
  const health = { ollama: { online: true, consecutiveFails: 0 } };
  const d = raid._decide({ prompt: 'build code', faultClass: 'no_such_fault' }, health, new Map());
  assert.strictEqual(d.agent, 'ollama');
});

console.log(`\n  raid-fitness-real-terms: ${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
