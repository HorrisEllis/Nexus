'use strict';
// UM1 (docs/cortex-schema-registry-phasemap.spec) — the user-model declares its
// SHAPE at init so it's trustworthy: the integrity foundation for "it knows me".
// The model becomes schema-observed (P3), and still works. §0.1 schema derived
// from real rows, §1.1 it runs at init on the live system.
const _log = console.log;
console.log = (...a) => { const s = a[0]; if (typeof s === 'string' && (s.startsWith('[jaa]') || s.startsWith('[user-model]'))) return; _log(...a); };

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
const um = require(path.join(ROOT, 'copilot/lib/user-model'));

test('T-001', 'user-model init self-registers a schema for user_model_hypotheses (UM1)', () => {
  um.init(jaaDB);
  const s = reg.getSchema('user_model_hypotheses');
  assert.ok(s, 'a schema must exist after init');
  assert.ok(s.fields.some(f => f.name === 'claim'), 'schema must capture the claim field');
  assert.ok(s.fields.some(f => f.name === 'confidence'), 'schema must capture confidence');
});

test('T-002', 'the user-model is now schema-OBSERVED — a malformed hypothesis records drift', () => {
  um.init(jaaDB);
  const before = (jaaDB.query('schema_drift', r => r.table === 'user_model_hypotheses', 99999) || []).length;
  jaaDB.insert('user_model_hypotheses', { uuid: `um1-bad-${Date.now()}`, confidence: 0.5 }); // missing required claim
  const after = (jaaDB.query('schema_drift', r => r.table === 'user_model_hypotheses', 99999) || []).length;
  assert.ok(after > before, 'a malformed hypothesis must be flagged as drift (integrity observed)');
});

test('T-003', 'the model STILL works — observe + buildUserContext function (§1.2 non-fatal)', () => {
  um.init(jaaDB);
  assert.doesNotThrow(() => um.observe('prefers verification before handoff', 'preference', {}, 0.8));
  if (typeof um.buildUserContext === 'function') {
    const ctx = um.buildUserContext();
    assert.ok(typeof ctx === 'string', 'buildUserContext must still return');
  }
});

test('T-004', 'a well-formed hypothesis (full shape) does NOT record drift', () => {
  um.init(jaaDB);
  const before = (jaaDB.query('schema_drift', r => r.table === 'user_model_hypotheses', 99999) || []).length;
  // build a row matching the schema's required fields
  const s = reg.getSchema('user_model_hypotheses');
  const row = { uuid: `um1-good-${Date.now()}` };
  for (const f of s.fields) if (!(f.name in row)) row[f.name] = f.type === 'number' ? 0 : f.type === 'boolean' ? false : f.type === 'object' ? null : 'x';
  jaaDB.insert('user_model_hypotheses', row);
  const after = (jaaDB.query('schema_drift', r => r.table === 'user_model_hypotheses', 99999) || []).length;
  assert.strictEqual(after, before, 'a well-formed hypothesis must not record drift');
});

_log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
