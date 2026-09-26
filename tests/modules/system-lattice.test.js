'use strict';
const assert = require('assert');
let passed = 0, failed = 0;
function test(id, desc, fn) {
  try { fn(); console.log(`  ✓ ${id} ${desc}`); passed++; }
  catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${e.message}`); failed++; }
}

// Real in-memory table fake — mirrors raid-tunables.test.js's approach,
// since persistence semantics (not just cache behavior) are what's under test.
const _tables = {};
function _table(name) { return (_tables[name] = _tables[name] || []); }
const jaaDBFake = {
  query: (table, fn) => _table(table).filter(fn),
  insert: (table, row) => { const r = { ...row }; _table(table).push(r); return r; },
  update: (table, where, values) => {
    let count = 0;
    for (const row of _table(table)) {
      if (Object.keys(where).every(k => row[k] === where[k])) { Object.assign(row, values); count++; }
    }
    return count;
  },
};
require.cache[require.resolve('../../cortex/memory/jaa-db')] = {
  id: '../memory/jaa-db', filename: '../memory/jaa-db', loaded: true,
  exports: { jaaDB: jaaDBFake, uid: () => require('crypto').randomUUID() },
};

const sysLattice = require('../../intelligence/spatial/system-lattice');
const { CausalGraph } = require('../../intelligence/cfr/graph');

test('T-001', 'addNode persists a real row to Cortex', () => {
  sysLattice.reset();
  _tables[sysLattice.NODE_TABLE] = [];
  sysLattice.addNode({ id: 'guardian', tags: ['system'] });
  const rows = _table(sysLattice.NODE_TABLE);
  assert.strictEqual(rows.length, 1);
  assert.strictEqual(rows[0].nodeId, 'guardian');
});

test('T-002', 'addNode is idempotent — second call does not duplicate the row', () => {
  sysLattice.addNode({ id: 'guardian' });
  const rows = _table(sysLattice.NODE_TABLE).filter(r => r.nodeId === 'guardian');
  assert.strictEqual(rows.length, 1);
});

test('T-003', 'connect persists a real edge row, reinforces on repeat', () => {
  _tables[sysLattice.EDGE_TABLE] = [];
  sysLattice.connect('guardian', 'ollama', 0.5, 'causal');
  const first = sysLattice.query({}).find(n => n.node.id === 'guardian');
  const w1 = first.edges.find(e => e.to === 'ollama').weight;
  sysLattice.connect('guardian', 'ollama', 0.5, 'causal');
  const second = sysLattice.query({}).find(n => n.node.id === 'guardian');
  const w2 = second.edges.find(e => e.to === 'ollama').weight;
  assert.ok(w2 > w1, `expected reinforcement, got w1=${w1} w2=${w2}`);
  const rows = _table(sysLattice.EDGE_TABLE);
  assert.strictEqual(rows.length, 1); // updated in place, not duplicated
});

test('T-004', 'load() rehydrates a fresh engine from persisted rows only', () => {
  sysLattice.reset();
  const before = sysLattice.size();
  assert.strictEqual(before.nodes, 0); // reset cleared in-memory, Cortex rows untouched
  sysLattice.load();
  const after = sysLattice.size();
  assert.ok(after.nodes >= 2, `expected rehydrated nodes, got ${after.nodes}`);
  assert.ok(after.edges >= 1, `expected rehydrated edges, got ${after.edges}`);
});

test('T-005', 'ingestCFRGraph maps cross-component causal edges onto the lattice, not same-component ones', () => {
  sysLattice.reset();
  _tables[sysLattice.NODE_TABLE] = [];
  _tables[sysLattice.EDGE_TABLE] = [];
  const g = new CausalGraph();
  g.ingest({ uuid: 'a1', componentId: 'idearium', ts: 1 });
  g.ingest({ uuid: 'a2', componentId: 'architect', ts: 2, causedBy: 'a1' }); // cross-component
  g.ingest({ uuid: 'a3', componentId: 'architect', ts: 3, causedBy: 'a2' }); // same-component, no lattice edge
  const result = sysLattice.ingestCFRGraph(g);
  assert.strictEqual(result.edgesTouched, 1); // only the cross-component hop
  const neighbors = sysLattice.neighbors('idearium');
  assert.ok(neighbors.some(n => n.node.id === 'architect'));
});

test('T-006', 'ingestCFRGraph handles a null/empty graph without throwing', () => {
  const result = sysLattice.ingestCFRGraph(null);
  assert.strictEqual(result.nodesTouched, 0);
  assert.strictEqual(result.edgesTouched, 0);
});

test('T-007', 'clusters() groups connected systems', () => {
  sysLattice.reset();
  _tables[sysLattice.NODE_TABLE] = [];
  _tables[sysLattice.EDGE_TABLE] = [];
  sysLattice.connect('bridge', 'cortex', 0.8, 'causal');
  sysLattice.connect('cortex', 'guardian', 0.8, 'causal');
  sysLattice.addNode({ id: 'isolated-system' });
  const clusters = sysLattice.clusters();
  const bridgeCluster = clusters.find(c => c.includes('bridge'));
  assert.ok(bridgeCluster.includes('cortex') && bridgeCluster.includes('guardian'));
  const isolatedCluster = clusters.find(c => c.includes('isolated-system'));
  assert.strictEqual(isolatedCluster.length, 1);
});

console.log(`\n  system-lattice: ${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
