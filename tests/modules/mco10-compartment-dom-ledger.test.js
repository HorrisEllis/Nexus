'use strict';

/**
 * tests/modules/mco10-compartment-dom-ledger.test.js
 *
 * §MCO10 2026-09-13 — real tests for lib/compartment-dom-ledger.js's
 * recordDomEvent(). Uses a real, minimal fake jaa (insert-only, records
 * what it was called with) rather than the real jaaDB singleton — this
 * module takes jaa as a parameter specifically so it doesn't need one.
 */

const assert = require('assert');
const { recordDomEvent } = require('../../lib/compartment-dom-ledger.js');

let pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); pass++; console.log(`  ✓ ${name}`); }
  catch (e) { fail++; console.log(`  ✗ ${name}\n    ${e.message}`); }
}

function fakeJaa() {
  const rows = [];
  return {
    rows,
    insert: (table, row) => rows.push({ table, row }),
  };
}

test('MCO10-001: a real compartment-tagged event is inserted with the right key', () => {
  const jaa = fakeJaa();
  const result = recordDomEvent(jaa, {
    compartmentUuid: 'c-real-123', queueId: 'q-1', type: 'dom.mutation',
    agentId: 'claude', dom: { added: 3 }, ts: 1000,
  }, () => 'fixed-uuid');
  assert.strictEqual(result.ok, true);
  assert.strictEqual(jaa.rows.length, 1);
  assert.strictEqual(jaa.rows[0].table, 'compartment_dom_ledger');
  assert.strictEqual(jaa.rows[0].row.compartmentUuid, 'c-real-123');
  assert.strictEqual(jaa.rows[0].row.queueId, 'q-1');
  assert.strictEqual(jaa.rows[0].row.domEventType, 'dom.mutation');
  assert.deepStrictEqual(JSON.parse(jaa.rows[0].row.payload), { added: 3 });
});

test('MCO10-002: an event with no compartmentUuid is dropped, not fabricated', () => {
  const jaa = fakeJaa();
  const result = recordDomEvent(jaa, { type: 'dom.snapshot', ts: 1000 });
  assert.strictEqual(result.ok, false);
  assert.ok(result.reason.includes('no compartmentUuid'));
  assert.strictEqual(jaa.rows.length, 0);
});

test('MCO10-003: a null/undefined payload is dropped, not thrown', () => {
  const jaa = fakeJaa();
  const result = recordDomEvent(jaa, null);
  assert.strictEqual(result.ok, false);
  assert.strictEqual(jaa.rows.length, 0);
});

test('MCO10-004: a real jaa.insert failure is reported, not thrown to the caller', () => {
  const jaa = { insert: () => { throw new Error('disk full'); } };
  const result = recordDomEvent(jaa, { compartmentUuid: 'c-1' });
  assert.strictEqual(result.ok, false);
  assert.ok(result.reason.includes('disk full'));
});

test('MCO10-005: queueId is honestly null when not given, never fabricated', () => {
  const jaa = fakeJaa();
  recordDomEvent(jaa, { compartmentUuid: 'c-2', type: 'dom.snapshot' }, () => 'u2');
  assert.strictEqual(jaa.rows[0].row.queueId, null);
});

console.log(`\n  mco10-compartment-dom-ledger: ${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
