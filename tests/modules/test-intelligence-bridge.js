'use strict';
const assert = require('assert');
let passed = 0, failed = 0;
function test(id, desc, fn) {
  try { fn(); console.log(`  ✓ ${id} ${desc}`); passed++; }
  catch(e) { console.error(`  ✗ ${id} ${desc}\n    ${e.message}`); failed++; }
}

// Mock store
const _store = {};
const _events = [];
const mockJaa = {
  query:  (t, fn, n) => Object.values(_store).filter(r => r._table===t).filter(fn).slice(0,n||999),
  insert: (t, r)     => { _store[r.uuid] = {...r, _table:t}; _events.push({t,r}); return r; },
  update: (t, u, r)  => { _store[u] = {..._store[u],...r, _table:t}; return r; },
  tail:   (t, n)     => Object.values(_store).filter(r=>r._table===t).slice(-n||999),
};

require.cache[require.resolve('../../cortex/memory/jaa-db')] = {
  id:'../../cortex/memory/jaa-db', filename:'../../cortex/memory/jaa-db',
  loaded:true, exports:{ jaaDB:mockJaa, uid:()=>require('crypto').randomUUID() }
};

const ib = require('../../cortex/core/raid/intelligence-bridge');

// Seed some data
const patternId = require('crypto').randomUUID();
_store[patternId] = {
  uuid: patternId, _table: 'bep_patterns',
  crystallised: true, cluster: 'code',
  patternType: 'co_occurrence',
  typeA: 'provider.ollama', typeB: 'cortex.gaps.list',
  signature: 'ollama+gaps', confidence: 0.8, ts: Date.now(),
};

const userModelId = require('crypto').randomUUID();
_store[userModelId] = {
  uuid: userModelId, _table: 'user_model',
  preferredClusters: {
    code: {
      ollama: { successRate: 0.9, confidence: 0.8, evidence: 10 },
      claude: { successRate: 0.7, confidence: 0.6, evidence: 4 },
    }
  },
  lastUpdated: Date.now(),
};

// T-001: queryBefore returns evidence shape
test('T-001', 'queryBefore returns evidence object', () => {
  const e = ib.queryBefore({ cluster:'code', faultClass:null, intent:'fix bug', jobId:'j1' });
  assert.ok(typeof e.weight === 'number');
  assert.ok(Array.isArray(e.patterns));
  assert.ok(Array.isArray(e.precursors));
  assert.ok(Array.isArray(e.userHypotheses));
  assert.ok(Array.isArray(e.liminalItems));
});

// T-002: queryBefore finds patterns for cluster
test('T-002', 'queryBefore finds crystallised patterns for cluster', () => {
  const e = ib.queryBefore({ cluster:'code', faultClass:null, intent:'test', jobId:'j2' });
  assert.ok(e.patterns.length > 0, 'should find code cluster patterns');
});

// T-003: user model recommendation
test('T-003', 'queryBefore recommends provider from user model', () => {
  const e = ib.queryBefore({ cluster:'code', faultClass:null, intent:'test', jobId:'j3' });
  assert.ok(e.recommendation, 'should recommend a provider');
  assert.strictEqual(e.recommendation, 'ollama', 'ollama has highest score');
});

// T-004: weight increases with evidence
test('T-004', 'weight > 0 when evidence found', () => {
  const e = ib.queryBefore({ cluster:'code', faultClass:null, intent:'test', jobId:'j4' });
  assert.ok(e.weight > 0, 'weight should be positive with evidence');
});

// T-005: feedOutcome logs to event_log
test('T-005', 'feedOutcome logs success to event_log', () => {
  const before = _events.length;
  ib.feedOutcome(
    { cluster:'code', faultClass:null, intent:'test', jobId:'j5' },
    { agent:'ollama', reason:'snr_filter', cluster:'code' },
    { ok:true, provider:'ollama', durationMs:120, gapScore:0.1 }
  );
  const after = _events.length;
  assert.ok(after > before, 'should have logged');
  const log = _events.find(e => e.r.type === 'raid.outcome.success');
  assert.ok(log, 'should find success log');
});

// T-006: feedOutcome on failure opens gap
test('T-006', 'feedOutcome on failure opens gap', () => {
  const before = Object.values(_store).filter(r => r._table === 'gaps').length;
  ib.feedOutcome(
    { cluster:'code', faultClass:'import_error', intent:'fix', jobId:'j6' },
    { agent:'ollama', reason:'snr_filter', cluster:'code' },
    { ok:false, provider:'ollama', durationMs:500, gapScore:0.8 }
  );
  const after = Object.values(_store).filter(r => r._table === 'gaps').length;
  assert.ok(after > before, 'failure gap should have opened');
});

// T-007: feedOutcome on success resolves open gap
test('T-007', 'feedOutcome success resolves open failure gap', () => {
  // Open a failure gap first
  const gapId = require('crypto').randomUUID();
  _store[gapId] = {
    uuid:gapId, _table:'gaps',
    type:'raid.routing.failure', source:'timeout',
    status:'open', ts: Date.now(),
  };
  ib.feedOutcome(
    { cluster:'diagnostic', faultClass:'timeout', intent:'diagnose', jobId:'j7' },
    { agent:'chatgpt', reason:'raid', cluster:'diagnostic' },
    { ok:true, provider:'chatgpt', durationMs:800, gapScore:0.2 }
  );
  assert.strictEqual(_store[gapId].status, 'resolved', 'gap should be resolved');
});

// T-008: recordSatisfaction positive → training signal
test('T-008', 'recordSatisfaction positive → pattern.training.positive logged', () => {
  ib.recordSatisfaction('req-123', true, 'resolved my issue clearly');
  const log = Object.values(_store).find(r =>
    r._table === 'event_log' && r.type === 'pattern.training.positive'
  );
  assert.ok(log, 'training signal not logged');
});

// T-009: recordSatisfaction negative → gap opened
test('T-009', 'recordSatisfaction negative → dissatisfaction gap opened', () => {
  ib.recordSatisfaction('req-456', false, 'response was unclear and unhelpful');
  const gap = Object.values(_store).find(r =>
    r._table === 'gaps' && r.type === 'user.dissatisfaction'
  );
  assert.ok(gap, 'dissatisfaction gap not opened');
  assert.ok(gap.body.includes('unclear'));
});

// T-010: feedOutcome updates user model
test('T-010', 'feedOutcome updates user model success rate', () => {
  const before = _store[userModelId].preferredClusters?.code?.ollama?.evidence || 0;
  ib.feedOutcome(
    { cluster:'code', faultClass:null, intent:'test', jobId:'j10' },
    { agent:'ollama', reason:'intelligence', cluster:'code' },
    { ok:true, provider:'ollama', durationMs:100, gapScore:0.1 }
  );
  const after = _store[userModelId].preferredClusters?.code?.ollama?.evidence || 0;
  assert.ok(after > before, 'evidence count should increase');
});

console.log(`\n  intelligence-bridge: ${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
