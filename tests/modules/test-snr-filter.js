'use strict';
const assert = require('assert');
let passed = 0, failed = 0;
function test(id, desc, fn) {
  try { fn(); console.log(`  ✓ ${id} ${desc}`); passed++; }
  catch(e) { console.error(`  ✗ ${id} ${desc}\n    ${e.message}`); failed++; }
}

// Mock JAA
const _patches = [
  { uuid:'p1', faultClass:'import_error', status:'verified', successRate:0.85, ts:1 },
  { uuid:'p2', faultClass:'timeout',      status:'verified', successRate:0.3,  ts:1 },
];
const _patterns = [
  { uuid:'pat1', crystallised:true, cluster:'code', patternType:'failure_precursor',
    signature:'heartbeat→error', confidence:0.8, ts:1 },
];
const _friction = [
  { uuid:'f1', faultClass:'api_degraded', friction:0.6, ts:1 },
];
const _events = [];

require.cache[require.resolve('../../cortex/memory/jaa-db')] = {
  id:'../memory/jaa-db', filename:'../memory/jaa-db', loaded:true,
  exports: {
    jaaDB: {
      query: (table, fn, n) => {
        if (table === 'forge_patches')      return _patches.filter(fn).slice(0,n||999);
        if (table === 'bep_patterns')       return _patterns.filter(fn).slice(0,n||999);
        if (table === 'fault_taxonomy')     return _friction.filter(fn).slice(0,n||999);
        if (table === 'interstitial_spaces')return [];
        if (table === 'event_log')          return _events.filter(fn).slice(0,n||999);
        return [];
      },
      tail:   (t,n) => [],
      insert: (t,r) => { _events.push(r); return r; },
    },
    uid: () => require('crypto').randomUUID(),
  },
};

const sf = require('../../cortex/core/raid/snr-filter');

// T-001: known invariant → no dispatch
test('T-001', 'known invariant (successRate>0.7) → dispatch:false, tokens:0', () => {
  const r = sf.filter({ intent:'fix import error', cluster:'code', faultClass:'import_error' });
  assert.ok(!r.dispatch);
  assert.strictEqual(r.tokens, 0);
  assert.strictEqual(r.type, 'invariant');
  assert.ok(r.reason.includes('import_error'));
});

// T-002: low success rate patch → not used as invariant
test('T-002', 'low success rate patch (0.3) → not resolved locally', () => {
  const r = sf.filter({ intent:'fix timeout', cluster:'code', faultClass:'timeout' });
  // timeout patch has 0.3 success rate — below 0.7 threshold
  assert.ok(r.dispatch, 'should dispatch — low success rate not an invariant');
});

// T-003: no fault class → genuine unknown
test('T-003', 'no fault class, no pattern → dispatch:true, type:unknown', () => {
  const r = sf.filter({ intent:'analyze something new', cluster:'analysis', faultClass:null });
  assert.ok(r.dispatch);
  assert.strictEqual(r.type, 'unknown');
});

// T-004: elevated friction → open loop flagged
test('T-004', 'elevated friction → open_loop flagged, dispatch:true', () => {
  const r = sf.filter({ intent:'api call', cluster:'code', faultClass:'api_degraded' });
  assert.ok(r.dispatch);
  assert.strictEqual(r.type, 'open_loop');
  assert.ok(r.reason.includes('friction'));
});

// T-005: open loop injects context flag
test('T-005', 'open loop → injectContext:true', () => {
  const r = sf.filter({ intent:'api call', cluster:'code', faultClass:'api_degraded' });
  assert.ok(r.injectContext);
});

// T-006: SNR value correct per type
test('T-006', 'SNR: invariant=1.0, open_loop=0.5, unknown=0.0', () => {
  const inv = sf.filter({ intent:'fix import', cluster:'code', faultClass:'import_error' });
  assert.strictEqual(inv.snr, 1.0);

  const loop = sf.filter({ intent:'api', cluster:'code', faultClass:'api_degraded' });
  assert.strictEqual(loop.snr, 0.5);

  const unk = sf.filter({ intent:'brand new thing', cluster:'hostile', faultClass:null });
  assert.strictEqual(unk.snr, 0.0);
});

// T-007: filter logs to event_log
test('T-007', 'filter logs decision to event_log', () => {
  const before = _events.length;
  sf.filter({ intent:'test logging', cluster:'code', faultClass:null });
  assert.ok(_events.length > before);
  const log = _events[_events.length-1];
  assert.strictEqual(log.type, 'raid.snr.filter');
});

// T-008: checkInvariant standalone
test('T-008', 'checkInvariant returns fix for known fault class', () => {
  const r = sf.checkInvariant('fix import', 'code', 'import_error');
  assert.ok(r);
  assert.strictEqual(r.type, 'invariant');
  assert.strictEqual(r.tokens, 0);
});

// T-009: checkInvariant null for unknown fault class
test('T-009', 'checkInvariant returns null for unknown fault class', () => {
  const r = sf.checkInvariant('do something', 'code', 'unknown_fault_xyz');
  assert.strictEqual(r, null);
});

// T-010: stats() returns shape
test('T-010', 'stats() returns total, byType, efficiency', () => {
  const s = sf.stats();
  assert.ok(typeof s.total === 'number');
  assert.ok(typeof s.efficiency === 'string');
});

console.log(`\n  snr-filter: ${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
