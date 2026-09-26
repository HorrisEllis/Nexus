'use strict';
const assert = require('assert');
const compReg = require('../../lib/component-registry');
const mc = require('../../orchestrator/lib/mutation-contract');

let passed = 0, failed = 0;
function test(id, desc, fn) {
  try { fn(); console.log(`  ✓ ${id} ${desc}`); passed++; }
  catch(e) { console.error(`  ✗ ${id} ${desc}\n    ${e.stack}`); failed++; }
}

// Same mockJaa pattern as test-component-registry.js and test-grammar-fallback.js
const _store = {};
const _ledger = [];
const mockJaa = {
  insert: (table, row) => {
    if (table === 'event_log') _ledger.push(row);
    _store[row.id || row.uuid] = { ...row };
    return row;
  },
  update: (table, uuid, row) => { _store[row.id || uuid] = { ...row }; return row; },
  query:  (table, fn) => Object.values(_store).filter(fn),
};
const _busEvents = [];
const mockBus = { emit: (type, payload) => _busEvents.push({ type, payload }) };

compReg.init(mockJaa, mockBus);
mc.init(mockJaa, mockBus);

compReg.register({
  id: 'test.widget.panel', namespace: 'test', name: 'panel', version: '1.0.0',
  grammar: ['test', 'panel'], route: { method: 'GET', path: '/api/test/panel' },
  description: 'test-only component for mutation-contract verification',
});

test('T-001', 'comp_properties defaults to {} on registration', () => {
  const c = compReg.get('test.widget.panel');
  assert.deepStrictEqual(c.comp_properties, {});
});

test('T-002', 'checkTarget rejects forbidden identity fields', () => {
  for (const f of ['id', 'uuid', 'namespace', 'comp_types', 'registeredAt']) {
    const r = mc.checkTarget(f);
    assert.strictEqual(r.ok, false, `expected ${f} to be forbidden`);
  }
});

test('T-003', 'checkTarget rejects fields outside comp_properties entirely', () => {
  const r = mc.checkTarget('description');
  assert.strictEqual(r.ok, false);
});

test('T-004', 'checkTarget allows comp_properties.* paths', () => {
  const r = mc.checkTarget('comp_properties.style.color');
  assert.strictEqual(r.ok, true);
});

test('T-005', 'mutateProperty rejects an invalid issuedVia', () => {
  const r = mc.mutateProperty('test.widget.panel', 'comp_properties.style.color', '#ff0000', { issuedVia: 'telepathy' });
  assert.strictEqual(r.ok, false);
  assert.match(r.error, /issuedVia must be one of/);
});

test('T-006', 'mutateProperty rejects forbidden target, component untouched', () => {
  const before = compReg.get('test.widget.panel');
  const r = mc.mutateProperty('test.widget.panel', 'namespace', 'hijacked', { issuedVia: 'cli' });
  assert.strictEqual(r.ok, false);
  const after = compReg.get('test.widget.panel');
  assert.strictEqual(after.namespace, before.namespace);
});

test('T-007', 'mutateProperty on unknown component fails cleanly', () => {
  const r = mc.mutateProperty('test.does.not.exist', 'comp_properties.style.color', '#fff', { issuedVia: 'cli' });
  assert.strictEqual(r.ok, false);
  assert.match(r.error, /not found/);
});

test('T-008', 'successful mutation: property applied, audit event written, bus emitted', () => {
  const ledgerBefore = _ledger.length;
  const busBefore = _busEvents.length;
  const r = mc.mutateProperty('test.widget.panel', 'comp_properties.style.color', '#ff0000', { issuedVia: 'cli' });
  assert.strictEqual(r.ok, true);
  assert.strictEqual(compReg.get('test.widget.panel').comp_properties.style.color, '#ff0000');
  // 2 ledger rows, not 1: compReg.update() (called internally to apply the
  // property write) fires its own 'component.updated' event via the
  // registry's existing _emit — that's pre-existing registry behavior,
  // not something this module should suppress. Plus this module's own
  // explicit 'property_mutated' audit event. Both are real and expected.
  assert.strictEqual(_ledger.length, ledgerBefore + 2, 'expected component.updated + property_mutated');
  const newRows = _ledger.slice(ledgerBefore);
  assert.ok(newRows.some(row => row.type === 'component.property_mutated'), 'expected a property_mutated audit row');
  assert.ok(newRows.some(row => row.type === 'component.updated'), 'expected component-registry\'s own update row');
  assert.strictEqual(_busEvents.length, busBefore + 2, 'expected both component.updated and component.property_mutated on the bus');
});

test('T-009', 'ledger event field names match spec §9.5 literally', () => {
  const r = mc.mutateProperty('test.widget.panel', 'comp_properties.style.visibility', 'hidden', { issuedVia: 'api' });
  assert.strictEqual(r.event.comp_id, 'test.widget.panel');
  assert.strictEqual(r.event.event_type, 'property_mutated');
  assert.strictEqual(r.event.field, 'comp_properties.style.visibility');
  assert.strictEqual(r.event.new_value, 'hidden');
  assert.ok('old_value' in r.event);
  assert.ok('issued_via' in r.event);
  assert.ok('timestamp' in r.event);
});

test('T-010', 'old_value is captured correctly across repeated mutations', () => {
  const r1 = mc.mutateProperty('test.widget.panel', 'comp_properties.thresholds.driftWarning', 0.15, { issuedVia: 'cli' });
  assert.strictEqual(r1.event.old_value, null); // never set before
  const r2 = mc.mutateProperty('test.widget.panel', 'comp_properties.thresholds.driftWarning', 0.25, { issuedVia: 'cli' });
  assert.strictEqual(r2.event.old_value, 0.15);
});

test('T-011', 'uninitialized module fails loudly, never silently no-ops (§1.2)', () => {
  // Build a fresh, un-init'd instance by clearing the require cache —
  // proves the audit-first guard actually fires rather than asserting it
  // by reading the source.
  delete require.cache[require.resolve('../../orchestrator/lib/mutation-contract')];
  const freshMc = require('../../orchestrator/lib/mutation-contract');
  const r = freshMc.mutateProperty('test.widget.panel', 'comp_properties.style.color', '#000', { issuedVia: 'cli' });
  assert.strictEqual(r.ok, false);
  assert.match(r.error, /init\(jaaDB, bus\) was never called/);
  // restore for any tests after this file in a combined run
  freshMc.init(mockJaa, mockBus);
});

console.log(`\n  mutation-contract: ${passed} passed, ${failed} failed\n`);
process.exit(failed ? 1 : 0);
