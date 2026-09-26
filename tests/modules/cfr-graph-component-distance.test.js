'use strict';
const assert = require('assert');
const { CausalGraph } = require('../../intelligence/cfr/graph');

let passed = 0, failed = 0;
function test(id, desc, fn) {
  try { fn(); console.log(`  ✓ ${id} ${desc}`); passed++; }
  catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${e.message}`); failed++; }
}

function freshGraph() {
  const g = new CausalGraph();
  g.ingest({ uuid: 'a1', componentId: 'guardian', ts: 1 });
  g.ingest({ uuid: 'a2', componentId: 'guardian', ts: 2 });
  g.ingest({ uuid: 'b1', componentId: 'ollama', ts: 3, causedBy: 'a2' });
  g.ingest({ uuid: 'b2', componentId: 'ollama', ts: 4 });
  g.ingest({ uuid: 'c1', componentId: 'cortex', ts: 5, causedBy: 'b2' });
  return g;
}

test('T-001', 'same component → distance 0', () => {
  const g = freshGraph();
  assert.strictEqual(g.componentDistance('guardian', 'guardian'), 0);
});

test('T-002', 'directly connected components → distance 1', () => {
  const g = freshGraph();
  assert.strictEqual(g.componentDistance('guardian', 'ollama'), 1);
});

test('T-003', 'two hops away → distance 2', () => {
  const g = freshGraph();
  assert.strictEqual(g.componentDistance('guardian', 'cortex'), 2);
});

test('T-004', 'unknown component → null, not Infinity or 0', () => {
  const g = freshGraph();
  assert.strictEqual(g.componentDistance('guardian', 'never-seen-component'), null);
});

test('T-005', 'missing arguments → null', () => {
  const g = freshGraph();
  assert.strictEqual(g.componentDistance(null, 'guardian'), null);
  assert.strictEqual(g.componentDistance('guardian', undefined), null);
});

test('T-006', 'disconnected component (no shared edges) → null', () => {
  const g = freshGraph();
  g.ingest({ uuid: 'z1', componentId: 'isolated-system', ts: 100 });
  assert.strictEqual(g.componentDistance('guardian', 'isolated-system'), null);
});

test('T-007', 'adjacency cache invalidates when new edges are ingested', () => {
  const g = freshGraph();
  assert.strictEqual(g.componentDistance('guardian', 'cortex'), 2);
  // A new entry creates a direct causal edge collapsing guardian↔cortex to 1 hop.
  g.ingest({ uuid: 'd1', componentId: 'cortex', ts: 6, causedBy: 'a2' });
  assert.strictEqual(g.componentDistance('guardian', 'cortex'), 1);
});

console.log(`\n  cfr-graph-component-distance: ${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
