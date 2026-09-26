'use strict';
const assert = require('assert');
process.env.NEXUS_PORT = '0';

let passed = 0, failed = 0;
function test(id, desc, fn) {
  try { fn(); console.log(`  ✓ ${id} ${desc}`); passed++; }
  catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${e.message}`); failed++; }
}

const _tables = { gaps: [], event_log: [], crystals: [] };
function _table(name) { return (_tables[name] = _tables[name] || []); }
function _matches(row, where) { return Object.keys(where || {}).every(k => row[k] === where[k]); }

const jaaDBFake = {
  query: (table, where, opts) => {
    let rows = _table(table).filter(r => _matches(r, where));
    if (opts?.limit) rows = rows.slice(0, opts.limit);
    return rows;
  },
  count: (table, where) => _table(table).filter(r => _matches(r, where)).length,
  tail: (table, n) => _table(table).slice(-n),
  insert: (table, row) => { const r = { ...row }; _table(table).push(r); return r; },
  update: () => 0,
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

test('T-001', 'no open gaps: honest "no open issues", unchanged from before', () => {
  _tables.gaps = [];
  const r = boot._mastermindAnalysis('what is happening', null);
  assert.ok(r.analysis.includes('No open issues'));
});

test('T-002', 'gap with no ancestry in recent events: honest untraced phrasing', () => {
  _tables.gaps = [{ id: 'gap-1', type: 'CAPABILITY', status: 'open' }];
  _tables.event_log = [];
  const r = boot._mastermindAnalysis('what is happening', null);
  assert.ok(r.analysis.includes('Open issues (no traced cause) (1): CAPABILITY'));
  assert.ok(!r.analysis.includes('Root-cause trace'));
});

test('T-003', 'gap with real ancestry: traces the actual causal chain, not just the gap name', () => {
  _tables.gaps = [{ id: 'gap-1', type: 'CAPABILITY', status: 'open' }];
  _tables.event_log = [
    { id: 'e1', type: 'ollama.offline', ts: 1 },
    { id: 'e2', type: 'guardian.dispatch.failed', ts: 2, causedBy: 'e1' },
    { id: 'gap-1', type: 'CAPABILITY', ts: 3, causedBy: 'e2' },
  ];
  const r = boot._mastermindAnalysis('why did this happen', null);
  assert.ok(r.analysis.includes('Root-cause trace'));
  assert.ok(r.analysis.includes('ollama.offline'));
  assert.ok(r.analysis.includes('guardian.dispatch.failed'));
});

test('T-004', 'multiple open gaps, both traceable: every gap gets its own trace, none dropped', () => {
  _tables.gaps = [
    { id: 'gap-1', type: 'CAPABILITY', status: 'open' },
    { id: 'gap-2', type: 'KNOWLEDGE', status: 'open' },
  ];
  _tables.event_log = [
    { id: 'e1', type: 'ollama.offline', ts: 1 },
    { id: 'gap-1', type: 'CAPABILITY', ts: 2, causedBy: 'e1' },
    { id: 'e2', type: 'network.flap', ts: 3 },
    { id: 'gap-2', type: 'KNOWLEDGE', ts: 4, causedBy: 'e2' },
  ];
  const r = boot._mastermindAnalysis('status check', null);
  const traceCount = (r.analysis.match(/Root-cause trace/g) || []).length;
  assert.strictEqual(traceCount, 2, `expected both gaps traced, got: ${r.analysis}`);
  assert.ok(r.analysis.includes('ollama.offline'));
  assert.ok(r.analysis.includes('network.flap'));
});

test('T-007', 'gap already ingested with a real causedBy via event_log is never clobbered by the gaps-table fallback', () => {
  // Regression test for a real bug caught mid-merge: ingest() overwrites
  // nodes unconditionally, so re-ingesting a gap row lacking causedBy
  // after event_log already supplied the real chain would have silently
  // erased it.
  _tables.gaps = [{ id: 'gap-1', type: 'CAPABILITY', status: 'open' }]; // no causedBy here on purpose
  _tables.event_log = [
    { id: 'e1', type: 'ollama.offline', ts: 1 },
    { id: 'gap-1', type: 'CAPABILITY', ts: 2, causedBy: 'e1' }, // the richer version
  ];
  const r = boot._mastermindAnalysis('status check', null);
  assert.ok(r.analysis.includes('Root-cause trace'), `trace was clobbered: ${r.analysis}`);
  assert.ok(r.analysis.includes('ollama.offline'));
});

test('T-005', 'context snippet still appended exactly as before', () => {
  _tables.gaps = [];
  const r = boot._mastermindAnalysis('x', 'some prior conversation context');
  assert.ok(r.analysis.includes('some prior conversation context'));
});

test('T-006', 'field/regime shape unchanged — copilot server.js reads these fields directly', () => {
  const r = boot._mastermindAnalysis('x', null);
  assert.ok('regime' in r);
  assert.ok('field' in r);
  assert.strictEqual(r.modelUsed, 'cortex.mastermind');
});

console.log(`\n  mastermind-upgrade: ${passed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);
