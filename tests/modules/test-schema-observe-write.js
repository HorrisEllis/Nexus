'use strict';
// Schema-registry P3 (docs/cortex-schema-registry-phasemap.spec) — observe on
// write. jaaDB.insert consults the registry AFTER appending and records a
// schema_drift row on deviation — NON-BLOCKING (§13.4 integrity by observation).
// The write ALWAYS succeeds (James: fluid, not rigid). Recursion-guarded.
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
const { jaaDB } = require(path.join(ROOT, 'cortex/memory/jaa-db'));
const reg = require(path.join(ROOT, 'lib/schema-registry'));

const T = `p3_obs_${Date.now()}`;

test('T-001', 'setup: establish a schema for a test table from a clean row', () => {
  jaaDB.insert(T, { uuid: 'seed', name: 'x', count: 1 });
  const s = reg.registerSchema(T);
  assert.ok(s.fields.some(f => f.name === 'count'), 'schema should capture the count field');
});

test('T-002', 'a CONFORMING write succeeds and records NO drift', () => {
  const before = (jaaDB.query('schema_drift', r => r.table === T, 99999) || []).length;
  const r = jaaDB.insert(T, { uuid: 'ok1', name: 'y', count: 2 });
  assert.strictEqual(r.uuid, 'ok1', 'write must succeed');
  const after = (jaaDB.query('schema_drift', r => r.table === T, 99999) || []).length;
  assert.strictEqual(after, before, 'a conforming write must not record drift');
});

test('T-003', 'a DEVIATING write STILL succeeds (non-blocking — the core fluid guarantee)', () => {
  const r = jaaDB.insert(T, { uuid: 'bad1', name: 123 });  // missing count, wrong type name
  assert.strictEqual(r.uuid, 'bad1', 'the write must succeed even when it deviates — nothing is blocked');
});

test('T-004', 'a DEVIATING write records a schema_drift row (§13.4 drift is data)', () => {
  const before = (jaaDB.query('schema_drift', r => r.table === T, 99999) || []).length;
  jaaDB.insert(T, { uuid: 'bad2' });  // missing name + count
  const after = (jaaDB.query('schema_drift', r => r.table === T, 99999) || []).length;
  assert.ok(after > before, 'a deviating write must produce a schema_drift record');
  const latest = (jaaDB.query('schema_drift', r => r.table === T, 99999) || []).slice(-1)[0];
  assert.ok(latest.missing.includes('name') || latest.missing.includes('count'), 'the drift row names the missing field(s)');
});

test('T-005', 'the observer never recurses — many inserts complete', () => {
  assert.doesNotThrow(() => { for (let i = 0; i < 30; i++) jaaDB.insert(T, { uuid: 'loop' + i, name: 'z', count: i }); });
});

test('T-006', 'the registry\'s own tables are NOT observed (no self-trigger)', () => {
  // inserting into schemas/schema_drift directly must not spawn more drift rows
  const before = (jaaDB.query('schema_drift', () => true, 99999) || []).length;
  jaaDB.insert('schemas', { uuid: 'x', kind: 'schema', table: 'noop', version: 1, fields: [] });
  const after = (jaaDB.query('schema_drift', () => true, 99999) || []).length;
  assert.strictEqual(after, before, 'writing a schema row must not itself generate drift');
});

test('T-007', 'FLUID: a write to an UNSCHEMATIZED table records no drift (unobserved, not violated)', () => {
  const U = `unschematized_${Date.now()}`;
  const before = (jaaDB.query('schema_drift', r => r.table === U, 99999) || []).length;
  jaaDB.insert(U, { anything: 'goes', shape: 'free' });
  const after = (jaaDB.query('schema_drift', r => r.table === U, 99999) || []).length;
  assert.strictEqual(after, before, 'no schema = not watched, never drift');
});

_log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
