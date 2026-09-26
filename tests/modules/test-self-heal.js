'use strict';
const assert = require('assert');
const { makeTestBus } = require('./_test-bus-helper');
let passed = 0, failed = 0;
function test(id, desc, fn) {
  try { fn(); console.log(`  ✓ ${id} ${desc}`); passed++; }
  catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${e.message}`); failed++; }
}

// ── Mocks ───────────────────────────────────────────────────────────────────
let _faultRows = {};
let _recordCalls = [];
require.cache[require.resolve('../../cortex/self-heal/fault-taxonomy')] = {
  id: '../self-heal/fault-taxonomy', filename: '../self-heal/fault-taxonomy', loaded: true,
  exports: {
    KNOWN_FAULT_CLASSES: ['stale_module', 'timeout', 'api_degraded', 'queue_saturated',
      'memory_pressure', 'bottleneck', 'circuit_breaker', 'import_error'],
    bandFor: (f) => f >= 1.0 ? 'FAILURE_MODE' : f >= 0.7 ? 'HIGH' : f >= 0.4 ? 'ELEVATED' : 'NOMINAL',
    getFaultClass: (fc) => _faultRows[fc] || null,
  },
};
require.cache[require.resolve('../../cortex/self-heal/escalation')] = {
  id: '../self-heal/escalation', filename: '../self-heal/escalation', loaded: true,
  exports: {
    recordAttemptOutcome: (fc, level, succeeded, meta) => { _recordCalls.push({ fc, level, succeeded, meta }); },
  },
};
let _fixMapResults = [];
require.cache[require.resolve('../../cortex/memory/fix-map')] = {
  id: '../../cortex/memory/fix-map', filename: '../../cortex/memory/fix-map', loaded: true,
  exports: { lookupFix: () => _fixMapResults },
};
let _tables = { forge_patches: [], failure_modes: [] };
require.cache[require.resolve('../../cortex/memory/jaa-db')] = {
  id: '../../cortex/memory/jaa-db', filename: '../../cortex/memory/jaa-db', loaded: true,
  exports: {
    jaaDB: {
      query: (t, fn, n) => (_tables[t] || []).filter(fn).slice(0, n || 999),
      insert: (t, r) => { (_tables[t] = _tables[t] || []).push(r); return r; },
      get: () => null, update: () => 0, tail: () => [],
    },
    uid: () => require('crypto').randomUUID(),
  },
};
let _diagResult = { composite: 0.9, status: 'healthy', engines: {}, critical: [], engineCount: 12, ts: Date.now() };
require.cache[require.resolve('../../lib/diag-engines')] = {
  id: '../../lib/diag-engines', filename: '../../lib/diag-engines', loaded: true,
  exports: { runAll: () => _diagResult },
};
require.cache[require.resolve('../../lib/nexus-expansion-boot')] = {
  id: '../../lib/nexus-expansion-boot', filename: '../../lib/nexus-expansion-boot', loaded: true,
  exports: { buildDiagSnapshot: () => ({}) },
};

const selfHeal = require('../../cortex/self-heal');

function reset() {
  _faultRows = {}; _recordCalls = []; _fixMapResults = [];
  _tables = { forge_patches: [], failure_modes: [] };
  _diagResult = { composite: 0.9, status: 'healthy', engines: {}, critical: [], engineCount: 12, ts: Date.now() };
}

test('T-001', 'semantic gap types are skipped, never attempted', () => {
  reset();
  const bus = makeTestBus();
  let skipped = null;
  bus.on('cortex.self-heal.skipped', (e) => { skipped = e; });
  selfHeal.init({ bus });
  bus.emit('HEAL_REQUESTED', { gapType: 'semantic_drift', gapUuid: 'g1' });
  assert.ok(skipped, 'expected skipped event');
  assert.strictEqual(skipped.payload.reason.includes('semantic_gap_excluded'), true);
  assert.strictEqual(_recordCalls.length, 0);
  selfHeal.stop();
});

test('T-002', 'level 0: known verified forge_patches fix is staged, not auto-applied', () => {
  reset();
  _tables.forge_patches.push({ uuid: 'p1', faultClass: 'timeout', status: 'verified', successRate: 0.9 });
  const bus = makeTestBus();
  let staged = null;
  bus.on('cortex.self-heal.fix_staged', (e) => { staged = e; });
  selfHeal.init({ bus });
  bus.emit('HEAL_REQUESTED', { gapType: 'timeout', gapUuid: 'g2' });
  assert.ok(staged, 'expected fix_staged event');
  assert.strictEqual(staged.payload.candidate.source, 'forge_patches');
  assert.strictEqual(_recordCalls.length, 0); // staging isn't an outcome yet
  selfHeal.stop();
});

test('T-003', 'level 0: no known fix records a real failed attempt at level 0', () => {
  reset();
  const bus = makeTestBus();
  selfHeal.init({ bus });
  bus.emit('HEAL_REQUESTED', { gapType: 'timeout', gapUuid: 'g3' });
  assert.strictEqual(_recordCalls.length, 1);
  assert.strictEqual(_recordCalls[0].level, 0);
  assert.strictEqual(_recordCalls[0].succeeded, false);
  selfHeal.stop();
});

test('T-004', 'level 1 (count=1): known safe-fix pattern requests remediation', () => {
  reset();
  _faultRows.bottleneck = { faultClass: 'bottleneck', friction: 0.2, count: 1 };
  const bus = makeTestBus();
  let requested = null;
  bus.on('cortex.self-heal.remediation_requested', (e) => { requested = e; });
  selfHeal.init({ bus });
  bus.emit('HEAL_REQUESTED', { gapType: 'bottleneck', gapUuid: 'g4', modulePath: 'mod/x' });
  assert.ok(requested);
  assert.strictEqual(requested.payload.level, 1);
  selfHeal.stop();
});

test('T-005', 'level 1: unrecognised pattern records a real failed attempt, does not fabricate a fix', () => {
  reset();
  _faultRows.mystery_fault = { faultClass: 'mystery_fault', friction: 0.2, count: 1 };
  const bus = makeTestBus();
  selfHeal.init({ bus });
  bus.emit('HEAL_REQUESTED', { gapType: 'mystery_fault', gapUuid: 'g5' });
  assert.strictEqual(_recordCalls.length, 1);
  assert.strictEqual(_recordCalls[0].level, 1);
  selfHeal.stop();
});

test('T-006', 'level 2 (count=2): proposes a forge_patches row with status:proposed, never verified', () => {
  reset();
  _faultRows.timeout = { faultClass: 'timeout', friction: 0.3, count: 2 };
  const bus = makeTestBus();
  let proposed = null;
  bus.on('cortex.self-heal.fix_proposed', (e) => { proposed = e; });
  selfHeal.init({ bus });
  bus.emit('HEAL_REQUESTED', { gapType: 'timeout', gapUuid: 'g6' });
  assert.ok(proposed);
  assert.strictEqual(proposed.payload.proposal.status, 'proposed');
  assert.strictEqual(_tables.forge_patches.some(p => p.status === 'verified' && p.proposedBy), false);
  selfHeal.stop();
});

test('T-007', 'level 3 (count>=3): deep scan with critical findings emits findings, no friction raised', () => {
  reset();
  _faultRows.timeout = { faultClass: 'timeout', friction: 0.6, count: 3 };
  _diagResult = { composite: 0.3, status: 'critical', engines: {}, critical: ['cascade_risk', 'fault_tree'], engineCount: 12, ts: Date.now() };
  const bus = makeTestBus();
  let findings = null;
  bus.on('cortex.self-heal.deep_scan_findings', (e) => { findings = e; });
  selfHeal.init({ bus });
  bus.emit('HEAL_REQUESTED', { gapType: 'timeout', gapUuid: 'g7' });
  assert.ok(findings);
  assert.deepStrictEqual(findings.payload.critical, ['cascade_risk', 'fault_tree']);
  assert.strictEqual(_recordCalls.length, 0);
  selfHeal.stop();
});

test('T-008', 'level 3: no critical findings records a real failed attempt', () => {
  reset();
  _faultRows.timeout = { faultClass: 'timeout', friction: 0.6, count: 5 }; // count>3 still clamps to level 3
  const bus = makeTestBus();
  selfHeal.init({ bus });
  bus.emit('HEAL_REQUESTED', { gapType: 'timeout', gapUuid: 'g8' });
  assert.strictEqual(_recordCalls.length, 1);
  assert.strictEqual(_recordCalls[0].level, 3);
  selfHeal.stop();
});

test('T-009', 'FAILURE_MODE fault class enters failure mode, writes failure_modes, no auto-attempt', () => {
  reset();
  _faultRows.timeout = { faultClass: 'timeout', friction: 1.0, count: 9 };
  const bus = makeTestBus();
  let failureMode = null;
  bus.on('cortex.self-heal.failure_mode', (e) => { failureMode = e; });
  selfHeal.init({ bus });
  bus.emit('HEAL_REQUESTED', { gapType: 'timeout', gapUuid: 'g9' });
  assert.ok(failureMode);
  assert.strictEqual(_tables.failure_modes.length, 1);
  assert.strictEqual(_tables.failure_modes[0].faultClass, 'timeout');
  assert.strictEqual(_recordCalls.length, 0); // no further auto-attempt, per spec level 4
  selfHeal.stop();
});

test('T-010', 'HEAL_REQUESTED with no gapType is a no-op, not a throw', () => {
  reset();
  const bus = makeTestBus();
  selfHeal.init({ bus });
  assert.doesNotThrow(() => bus.emit('HEAL_REQUESTED', { gapUuid: 'g10' }));
  selfHeal.stop();
});

test('T-011', 'stop() removes the listener — no further attempts after stop', () => {
  reset();
  const bus = makeTestBus();
  selfHeal.init({ bus });
  selfHeal.stop();
  bus.emit('HEAL_REQUESTED', { gapType: 'timeout', gapUuid: 'g11' });
  assert.strictEqual(_recordCalls.length, 0);
});

test('T-012', 'SEMANTIC_GAP_TYPES is exported and named per the audit contract', () => {
  assert.ok(Array.isArray(selfHeal.SEMANTIC_GAP_TYPES));
  assert.ok(selfHeal.SEMANTIC_GAP_TYPES.length > 0);
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
