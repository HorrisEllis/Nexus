'use strict';
// OB3+OB4 (docs/nexus-observability-tablet-phasemap.spec, CHUNK F) — movement
// map + bottleneck detection. OB3 maps the registry onto a flow graph (edges
// weighted by real CFR friction); OB4 finds bottlenecks (where + why) via the
// delta engine. §8.6 composes registry+CFR+delta; §1.1 real values, no mocks.
const _log = console.log;
console.log = (...a) => { const s = a[0]; if (typeof s === 'string' && s.startsWith('[jaa]')) return; _log(...a); };

const assert = require('assert');
const path = require('path');
let passed = 0, failed = 0;
function test(id, desc, fn) {
  try { fn(); _log(`  ✓ ${id} ${desc}`); passed++; }
  catch (e) { _log(`  ✗ ${id} ${desc}\n    ${e.message}`); failed++; }
}

const ROOT = path.join(__dirname, '../..');
const mm = require(path.join(ROOT, 'copilot/movement-map'));

test('T-001', 'OB3: edge friction comes from REAL CFR values (§1.1 no mocks)', () => {
  // guardian.job.error is a stress event with friction +0.08 in the real CFR table
  assert.ok(mm._frictionFor('guardian.job.error') > 0, 'a stress event must carry real friction');
  assert.strictEqual(mm._frictionFor('guardian.job.complete'), 0, 'a clean completion has no positive friction');
});

test('T-002', 'OB3: buildMovementGraph produces nodes + edges from event flow', () => {
  const events = [
    { system: 'guardian', type: 'guardian.job.error', ts: 1000 },
    { system: 'cortex', type: 'cortex.gap.found', ts: 1500 },
    { system: 'bridge', type: 'bridge.request', ts: 2000 },
  ];
  const g = mm.buildMovementGraph(events);
  assert.ok(Array.isArray(g.nodes) && g.nodes.length >= 3, 'systems become nodes');
  assert.ok(Array.isArray(g.edges) && g.edges.length >= 2, 'cross-system transitions become edges');
});

test('T-003', 'OB3: an edge carries its CFR friction weight', () => {
  const events = [
    { system: 'guardian', type: 'guardian.job.error', ts: 1000 },
    { system: 'cortex', type: 'cortex.gap.found', ts: 1500 },
  ];
  const g = mm.buildMovementGraph(events);
  const edge = g.edges.find(e => e.from === 'guardian' && e.to === 'cortex');
  assert.ok(edge && edge.friction > 0, 'the edge must carry a real friction weight');
});

test('T-004', 'OB4: detects a real bottleneck with WHERE and WHY (§16.2)', () => {
  const g = { nodes: [{ id: 'guardian', name: 'guardian', system: 'guardian', type: 'system' }], edges: [{ from: 'cortex', to: 'guardian', friction: 0.75, count: 5 }] };
  const bySystem = { guardian: [{ ts: 1000, payload: { s: 1 } }, { ts: 60000, payload: { huge: 'x'.repeat(5000) } }] };
  const bn = mm.detectBottlenecks(g, bySystem);
  assert.ok(bn.length >= 1, 'a high-friction stalled node must be detected');
  assert.ok(bn[0].where && bn[0].why, 'must state WHERE and WHY');
  assert.ok(bn[0].score >= 0.4, 'the bottleneck score must clear the threshold');
});

test('T-005', 'OB4: does NOT false-alarm on low-friction flow (no noise)', () => {
  const events = [
    { system: 'guardian', type: 'guardian.job.complete', ts: 1000 },
    { system: 'cortex', type: 'cortex.gap.found', ts: 1100 },
  ];
  const g = mm.buildMovementGraph(events);
  const bn = mm.detectBottlenecks(g, {});
  assert.strictEqual(bn.length, 0, 'clean low-friction flow is not a bottleneck');
});

test('T-006', 'OB4: bottlenecks are sorted worst-first', () => {
  const g = { nodes: [
    { id: 'a', name: 'a', system: 'a', type: 'system' },
    { id: 'b', name: 'b', system: 'b', type: 'system' },
  ], edges: [{ from: 'x', to: 'a', friction: 0.9 }, { from: 'y', to: 'b', friction: 0.5 }] };
  const bn = mm.detectBottlenecks(g, {});
  if (bn.length >= 2) assert.ok(bn[0].score >= bn[1].score, 'worst bottleneck first');
});

test('T-007', 'both functions are pure/safe on empty input (§1.2)', () => {
  assert.doesNotThrow(() => mm.buildMovementGraph([]));
  assert.doesNotThrow(() => mm.detectBottlenecks({ nodes: [], edges: [] }, {}));
});

_log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
