'use strict';
const assert = require('assert');
let passed = 0, failed = 0;
function test(id, desc, fn) {
  try { fn(); console.log(`  ✓ ${id} ${desc}`); passed++; }
  catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${e.message}`); failed++; }
}

// Mock JAA — in-memory table, mirrors real insert/get/update semantics closely
// enough to prove the logic, not the store (the store itself is guardian/jaa-store.js,
// already covered elsewhere).
let _table = [];
require.cache[require.resolve('../../cortex/memory/jaa-db')] = {
  id: '../memory/jaa-db', filename: '../memory/jaa-db', loaded: true,
  exports: {
    jaaDB: {
      get: (table, where) => {
        if (table !== 'fault_taxonomy') return null;
        return _table.find(r => Object.entries(where).every(([k, v]) => r[k] === v)) || null;
      },
      insert: (table, row) => { if (table === 'fault_taxonomy') _table.push(row); return row; },
      update: (table, where, values) => {
        if (table !== 'fault_taxonomy') return 0;
        let n = 0;
        _table = _table.map(r => {
          if (Object.entries(where).every(([k, v]) => r[k] === v)) { n++; return { ...r, ...values }; }
          return r;
        });
        return n;
      },
      query: () => [],
    },
    uid: () => require('crypto').randomUUID(),
  },
};

const ft = require('../../cortex/self-heal/fault-taxonomy');

function reset() { _table = []; }

test('T-001', 'unknown fault class on first occurrence creates a row at the level-0 delta', () => {
  reset();
  const { row, band } = ft.raiseFriction('timeout', 0);
  assert.strictEqual(row.friction, 0.10);
  assert.strictEqual(row.count, 1);
  assert.strictEqual(band, 'NOMINAL');
});

test('T-002', 'repeated level-1 failures accumulate friction additively', () => {
  reset();
  ft.raiseFriction('api_degraded', 1); // 0.20
  const { row } = ft.raiseFriction('api_degraded', 1); // 0.40
  assert.strictEqual(row.friction, 0.40);
  assert.strictEqual(row.count, 2);
});

test('T-003', 'friction band crosses ELEVATED at exactly 0.4', () => {
  reset();
  ft.raiseFriction('bottleneck', 1); // 0.20
  const { band } = ft.raiseFriction('bottleneck', 1); // 0.40
  assert.strictEqual(band, 'ELEVATED');
});

test('T-004', 'friction is capped at FAILURE_MODE (1.0), never overshoots', () => {
  reset();
  for (let i = 0; i < 5; i++) ft.raiseFriction('memory_pressure', 3); // 0.50 each, would overshoot to 2.5
  const row = ft.getFaultClass('memory_pressure');
  assert.strictEqual(row.friction, 1.0);
});

test('T-005', 'justEnteredFailureMode fires exactly once, on the crossing call', () => {
  reset();
  const r1 = ft.raiseFriction('circuit_breaker', 3); // 0.50
  const r2 = ft.raiseFriction('circuit_breaker', 3); // 1.00 — crosses here
  const r3 = ft.raiseFriction('circuit_breaker', 3); // already at 1.00 — must not re-fire
  assert.strictEqual(r1.justEnteredFailureMode, false);
  assert.strictEqual(r2.justEnteredFailureMode, true);
  assert.strictEqual(r3.justEnteredFailureMode, false);
});

test('T-006', 'unknown ladder level throws loudly (§1.2 — no silent failure)', () => {
  reset();
  assert.throws(() => ft.raiseFriction('timeout', 7), /unknown ladder level/);
});

test('T-007', 'recordSuccess decays friction and raises successRate without resetting to zero', () => {
  reset();
  ft.raiseFriction('import_error', 2); // 0.35
  ft.raiseFriction('import_error', 2); // 0.70
  const result = ft.recordSuccess('import_error', 0.5);
  assert.strictEqual(result.friction, 0.35); // 0.70 * 0.5
  assert.ok(result.successRate > 0);
  assert.notStrictEqual(result.friction, 0); // improving, not amnesia
});

test('T-008', 'raiseFriction with no faultClass throws (missing required input is loud, not silent)', () => {
  reset();
  assert.throws(() => ft.raiseFriction(null, 0), /faultClass is required/);
});

// ── §R7 2026-08-12 — scoreTension(gap), the function service/nexus-
//    diagnostic.js's /tension route always tried to call and never found
//    (cortex/healer never existed) ────────────────────────────────────────
test('T-009', 'scoreTension for a mapped gap type with real accumulated history returns the REAL friction, not a guess', () => {
  reset();
  ft.raiseFriction('circuit_breaker', 2);
  ft.raiseFriction('circuit_breaker', 2);   // 0.35 + 0.35 = 0.70, real accumulated history
  const t = ft.scoreTension({ type: 'kernel_circuit_open', severity: 'high' });
  assert.strictEqual(t, 0.70, 'must return the REAL accumulated friction for the mapped fault class, not recompute from severity');
});

test('T-010', 'scoreTension for an unmapped or never-seen gap type falls back to a fresh, honest estimate — the same real delta table, not an invented number', () => {
  reset();
  const high = ft.scoreTension({ type: 'totally-unmapped-gap-type', severity: 'high' });
  const low = ft.scoreTension({ type: 'totally-unmapped-gap-type', severity: 'low' });
  assert.strictEqual(high, ft.FRICTION_DELTA_BY_LEVEL[2], 'must reuse the real delta table, not a separate arbitrary formula');
  assert.strictEqual(low, ft.FRICTION_DELTA_BY_LEVEL[0]);
  assert.notStrictEqual(high, 2, 'must NOT be the old crude fallback (severity===\'high\'?2:1)');
});

test('T-011', 'scoreTension never throws on a null/malformed gap — a missing tension score must never crash the caller (§1.2)', () => {
  reset();
  assert.doesNotThrow(() => ft.scoreTension(null));
  assert.doesNotThrow(() => ft.scoreTension({}));
});

test('T-012', 'GAP_TYPE_TO_FAULT_CLASS is exported and real — a mapped gap type genuinely resolves to a known fault class', () => {
  assert.strictEqual(ft.GAP_TYPE_TO_FAULT_CLASS['kernel_circuit_open'], 'circuit_breaker');
  assert.ok(ft.KNOWN_FAULT_CLASSES.includes(ft.GAP_TYPE_TO_FAULT_CLASS['kernel_circuit_open']), 'the mapped target must itself be a real, known fault class');
});

// ── §BUILT 2026-09-11 — recordAttempt(), the missing half escalation.js's
//    recordAttemptOutcome() needs to call after raiseFriction/recordSuccess
//    so the row is guaranteed to exist by then ─────────────────────────────
test('T-013', 'recordAttempt bumps a real, separate attempts field on an existing row, distinct from count', () => {
  reset();
  ft.raiseFriction('timeout', 1); // creates the row, count:1
  const r1 = ft.recordAttempt('timeout');
  assert.strictEqual(r1.attempts, 1);
  const r2 = ft.recordAttempt('timeout');
  assert.strictEqual(r2.attempts, 2, 'must accumulate, not reset each call');
  assert.strictEqual(r2.count, 1, 'must never touch raiseFriction\'s own count field');
});

test('T-014', 'recordAttempt is a real no-op (not a throw) against a fault class with no row yet', () => {
  reset();
  assert.doesNotThrow(() => ft.recordAttempt('never_seen_fault_class'));
  assert.strictEqual(ft.recordAttempt('never_seen_fault_class'), null, 'honest null — no row to fabricate one for');
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
