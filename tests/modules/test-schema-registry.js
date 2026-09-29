'use strict';
// Schema-registry P1 (docs/cortex-schema-registry-phasemap.spec). Schemas live
// IN cortex as editable rows, DERIVED from real data (§0.1 — never invented).
// Fluid: this phase only stores/reads schemas; nothing is blocked (§13.4 comes
// in P3). §8.6 built outward from config-schema + jaaDB.
const _log = console.log;
console.log = (...a) => { const s = a[0]; if (typeof s === 'string' && s.startsWith('[jaa]')) return; _log(...a); };

const assert = require('assert');
const path = require('path');
let passed = 0, failed = 0;
function test(id, desc, fn) {
  try { fn(); _log(`  ✓ ${id} ${desc}`); passed++; }
  catch (e) { _log(`  ✗ ${id} ${desc}\n    ${e.message}`); failed++; }
}

const ROOT = path.join(__dirname, '../..');
require(path.join(ROOT, 'lib/test-sandbox.js')).ensure();
const reg = require(path.join(ROOT, 'lib/schema-registry'));
// §0.39.282 — in the sandbox raid_decisions starts empty, so a derived schema had no fields and T-009/T-011 read
// undefined. Seed two real-shaped rows (the fields every RAID decision carries) so the schema is derived from data.
{
  const { jaaDB } = require(path.join(ROOT, 'cortex/memory/jaa-db'));
  if (!jaaDB.query('raid_decisions', () => true, 1).length) {
    for (const approved of [true, false]) jaaDB.insert('raid_decisions', { uuid: require('crypto').randomUUID(), intention: 'test', agent: 'ollama', approved, score: 0.5, createdAt: new Date().toISOString() });
  }
}

test('T-001', 'deriveSchema reads REAL rows and returns fields (§0.1 from data, not invented)', () => {
  const d = reg.deriveSchema('raid_decisions');
  assert.ok(d.derivedFrom >= 0, 'must report how many rows it derived from');
  if (d.derivedFrom > 0) {
    assert.ok(d.fields.length > 0, 'real rows must yield fields');
    assert.ok(d.fields.every(f => f.name && f.type), 'each field has a name + type');
  }
});

test('T-002', 'a required field is one present in ALL sampled rows', () => {
  const d = reg.deriveSchema('raid_decisions');
  if (d.derivedFrom > 0) {
    const req = d.fields.filter(f => f.required);
    assert.ok(req.some(f => f.name === 'uuid'), 'uuid should be required (in every row)');
  }
});

test('T-003', 'registerSchema persists the schema to cortex as a row (§2.2 schema IS data)', () => {
  const r = reg.registerSchema('raid_decisions');
  assert.ok(r.uuid, 'must return a persisted row with a uuid');
  assert.strictEqual(r.kind, 'schema');
  assert.strictEqual(r.table, 'raid_decisions');
});

test('T-004', 'getSchema reads the current schema back from cortex', () => {
  reg.registerSchema('raid_decisions');
  const got = reg.getSchema('raid_decisions');
  assert.ok(got, 'must read a schema back');
  assert.strictEqual(got.table, 'raid_decisions');
});

test('T-005', 're-registering bumps the version, old schema preserved (§0.3 editable, nothing lost)', () => {
  const a = reg.registerSchema('raid_decisions');
  const b = reg.registerSchema('raid_decisions');
  assert.ok(b.version > a.version, 'version must bump on re-register');
  assert.strictEqual(reg.getSchema('raid_decisions').version, b.version, 'getSchema returns the newest');
});

test('T-006', 'an explicit schema (not derived) can be registered — fluid/editable (§ author intent)', () => {
  const r = reg.registerSchema('test_manual_shape', { fields: [{ name: 'x', type: 'string', required: true }], owner: 'test' });
  assert.strictEqual(r.owner, 'test');
  assert.strictEqual(r.fields[0].name, 'x');
});

test('T-007', 'the registry is agnostic — it never throws on an unknown/empty table (fluid)', () => {
  const d = reg.deriveSchema('a_table_that_has_no_rows_xyz');
  assert.strictEqual(d.fields.length, 0, 'empty table yields empty fields, not an error');
});

// ── P2: checkShape ──
function rowForCurrentSchema() {
  const s = reg.registerSchema('raid_decisions'); // fresh
  const row = {};
  for (const f of s.fields) row[f.name] = f.type === 'boolean' ? true : f.type === 'number' ? 1 : f.type === 'object' ? null : 'x';
  return { row, schema: s };
}

test('T-008', 'P2: a row built to the current schema CONFORMS (drift false) — the check can pass', () => {
  const { row } = rowForCurrentSchema();
  const c = reg.checkShape('raid_decisions', row);
  assert.strictEqual(c.conforms, true, 'a conforming row must pass');
  assert.strictEqual(c.drift, false);
});

test('T-009', 'P2: a missing REQUIRED field is reported (the check can fail — §12.2)', () => {
  const { row, schema } = rowForCurrentSchema();
  const reqField = schema.fields.find(f => f.required).name;
  delete row[reqField];
  const c = reg.checkShape('raid_decisions', row);
  assert.strictEqual(c.conforms, false);
  assert.ok(c.missing.includes(reqField), `missing must name ${reqField}`);
});

test('T-010', 'P2: a type mismatch is reported with expected vs actual', () => {
  const { row, schema } = rowForCurrentSchema();
  const boolField = schema.fields.find(f => f.type === 'boolean');
  if (boolField) {
    row[boolField.name] = 'not-a-bool';
    const c = reg.checkShape('raid_decisions', row);
    assert.ok(c.typeMismatches.some(m => m.field === boolField.name && m.expected === 'boolean' && m.actual === 'string'));
  }
});

test('T-011', 'P2: an unexpected field is DATA not error — reported as unexpected, drift true (§13.4)', () => {
  const { row } = rowForCurrentSchema();
  row.someBrandNewField = 42;
  const c = reg.checkShape('raid_decisions', row);
  assert.ok(c.unexpected.includes('someBrandNewField'));
  assert.strictEqual(c.drift, true, 'a new field is drift — often means the schema should grow');
});

test('T-012', 'P2 FLUID: a table with NO schema is unobserved, never a violation (nothing blocked)', () => {
  const c = reg.checkShape('totally_unschematized_table_xyz', { whatever: 1 });
  assert.strictEqual(c.unobserved, true);
  assert.strictEqual(c.drift, false, 'no schema means not watched, NOT drifted — fluid');
  assert.strictEqual(c.conforms, true);
});

test('T-013', 'P2: checkShape is pure + non-throwing on a null row (§14.2)', () => {
  assert.doesNotThrow(() => reg.checkShape('raid_decisions', null));
});

_log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
