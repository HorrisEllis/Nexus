'use strict';
const assert = require('assert');
let passed = 0, failed = 0;
function test(id, desc, fn) {
  try { fn(); console.log(`  ✓ ${id} ${desc}`); passed++; }
  catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${e.message}`); failed++; }
}

// Ephemeral port — avoids any real port conflict; cortex/boot.js reads
// process.env.NEXUS_PORT, this must be set before requiring it.
process.env.NEXUS_PORT = '0';

// Real in-memory table fake, same shape as raid-tunables.test.js's approach —
// gaps/crystals need real filtering, not the flat push-everything mock.
const _tables = { gaps: [], crystals: [], event_log: [] };
function _table(name) { return (_tables[name] = _tables[name] || []); }

function _matches(row, where) {
  return Object.keys(where || {}).every(k => row[k] === where[k]);
}

const jaaDBFake = {
  query: (table, where, opts) => {
    let rows = _table(table).filter(r => _matches(r, where));
    if (opts?.limit) rows = rows.slice(0, opts.limit);
    return rows;
  },
  count: (table, where) => _table(table).filter(r => _matches(r, where)).length,
  tail: (table, n) => _table(table).slice(-n),
  insert: (table, row) => { const r = { ...row }; _table(table).push(r); return r; },
  update: (table, where, values) => {
    let c = 0;
    for (const row of _table(table)) if (_matches(row, where)) { Object.assign(row, values); c++; }
    return c;
  },
};
require.cache[require.resolve('../../cortex/memory/jaa-db')] = {
  id: '../memory/jaa-db', filename: '../memory/jaa-db', loaded: true,
  exports: { jaaDB: jaaDBFake, uid: () => require('crypto').randomUUID() },
};

// 2026-09-19: the faculties moved from cortex/boot.js to intelligence/routes.js
// (docs/2026-09-19-cortex-to-intelligence-and-versionium-consolidation-phasemap.spec).
// Same fake jaaDB, same default field cortex used to hold; every assertion below is unchanged.
const { createRoutes } = require('../../intelligence/routes.js');
const _routes = createRoutes({
  jaaDB: jaaDBFake,
  getField: () => ({ coherence: 0.6, friction: 0.2, resonance: 0.3, entropy: 0.2, tension: 0.1, regime: 'stable', updatedAt: Date.now() }),
  intelligence: {}, refreshMs: 0,
});
const boot = {
  _intuitionAnswer:   (p)    => _routes.intuition.answer(p),
  _mastermindAnalysis:(p, c) => _routes.mastermind.analyze(p, c),
};
const sysLattice = require('../../intelligence/spatial/system-lattice');

// ── Gap answer: real open-loop-taxonomy classification, not a blind count ───

test('T-001', 'gap question with no open gaps: honest zero, not fabricated breakdown', () => {
  _tables.gaps = [];
  const r = boot._intuitionAnswer('any open issue?');
  assert.strictEqual(r.intent, 'gaps');
  assert.ok(r.text.includes('0 open gaps'));
});

test('T-002', 'gap question with real gaps: classified by real loop_type, not a flat count', () => {
  _tables.gaps = [
    { status: 'open', loop_type: 'CAPABILITY' },
    { status: 'open', loop_type: 'CAPABILITY' },
    { status: 'open', loop_type: 'KNOWLEDGE' },
  ];
  const r = boot._intuitionAnswer('what open gaps do we have');
  assert.strictEqual(r.intent, 'gaps');
  assert.strictEqual(r.breakdown.CAPABILITY, 2);
  assert.strictEqual(r.breakdown.KNOWLEDGE, 1);
  assert.ok(r.text.includes('2 CAPABILITY'));
});

test('T-003', 'gap question infers loop_type from body text when no explicit type is set (legacy gap)', () => {
  _tables.gaps = [{ status: 'open', body: 'checksum drift detected, integrity violation' }];
  const r = boot._intuitionAnswer('any open gap right now');
  assert.strictEqual(r.breakdown.INTEGRITY, 1);
});

// ── Relationship answer: real system-lattice, not "no path at all" ─────────

test('T-004', 'relationship question for an unknown node: falls through honestly, no fabrication', () => {
  const r = boot._intuitionAnswer('how does zzz relate to yyy');
  assert.strictEqual(r.text, null);
  assert.strictEqual(r.confidence, 0);
});

test('T-005', 'relationship question for a known, connected node: real answer from system-lattice', () => {
  sysLattice.reset();
  _tables.assoc_lattice_nodes = []; _tables.assoc_lattice_edges = [];
  sysLattice.connect('guardian', 'ollama', 0.8, 'causal');
  const r = boot._intuitionAnswer('how does guardian connect to other systems');
  assert.strictEqual(r.intent, 'relationship');
  assert.strictEqual(r.subject, 'guardian');
  assert.ok(r.text.includes('ollama'));
});

test('T-006', 'relationship question for a known but isolated node: honest "no strong connections" answer', () => {
  sysLattice.addNode({ id: 'isolated-system' });
  const r = boot._intuitionAnswer('what does isolated-system connect to');
  assert.strictEqual(r.intent, 'relationship');
  assert.ok(r.text.includes('no strong connections'));
  assert.strictEqual(r.confidence, 0.5);
});

// ── Existing behavior, unchanged ────────────────────────────────────────────

test('T-007', 'health question still works exactly as before', () => {
  const r = boot._intuitionAnswer('system health status');
  assert.strictEqual(r.intent, 'status');
});

test('T-008', 'unrecognized prompt still falls through honestly', () => {
  const r = boot._intuitionAnswer('something totally unrelated to any branch');
  assert.strictEqual(r.text, null);
  assert.strictEqual(r.confidence, 0);
});

console.log(`\n  intuition-upgrade: ${passed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0); // cortex/boot.js binds a real (ephemeral) port — the event loop never empties on its own
