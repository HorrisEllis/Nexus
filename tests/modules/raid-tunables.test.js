'use strict';
const assert = require('assert');
let passed = 0, failed = 0;
function test(id, desc, fn) {
  try { fn(); console.log(`  ✓ ${id} ${desc}`); passed++; }
  catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${e.message}`); failed++; }
}

// Real in-memory table fake — distinct from the flat push-everything mock
// used elsewhere in this suite. tunables.js's seed/get/set/reload logic
// depends on query() actually reflecting prior insert()/update() calls,
// which that flatter mock never modeled.
const _tables = {};
function _table(name) { return (_tables[name] = _tables[name] || []); }

const jaaDBFake = {
  query: (table, fn) => _table(table).filter(fn),
  insert: (table, row) => { const r = { ...row }; _table(table).push(r); return r; },
  update: (table, where, values) => {
    let count = 0;
    for (const row of _table(table)) {
      if (Object.keys(where).every(k => row[k] === where[k])) { Object.assign(row, values); count++; }
    }
    return count;
  },
};
require.cache[require.resolve('../../cortex/memory/jaa-db')] = {
  id: '../memory/jaa-db', filename: '../memory/jaa-db', loaded: true,
  exports: { jaaDB: jaaDBFake, uid: () => require('crypto').randomUUID() },
};

const tunables = require('../../cortex/core/raid/tunables');

test('T-001', 'load() seeds every DEFAULTS key as a real row on first call, empty table', () => {
  tunables.reload();
  _tables[tunables.TABLE] = []; // force truly empty, independent of any prior test's seeding
  const values = tunables.load();
  for (const key of Object.keys(tunables.DEFAULTS)) {
    assert.strictEqual(values[key], tunables.DEFAULTS[key]);
  }
  const rows = _table(tunables.TABLE);
  assert.strictEqual(rows.length, Object.keys(tunables.DEFAULTS).length);
});

test('T-002', 'seeding logs raid.tunables.seeded to event_log', () => {
  _tables[tunables.TABLE] = [];
  _tables['event_log'] = [];
  tunables.reload();
  const seedEvents = _table('event_log').filter(e => e.type === 'raid.tunables.seeded');
  assert.strictEqual(seedEvents.length, 1);
});

test('T-003', 'second load() does not re-seed — table already has rows', () => {
  const before = _table(tunables.TABLE).length;
  tunables.reload();
  assert.strictEqual(_table(tunables.TABLE).length, before);
});

test('T-004', 'get() returns the cached/seeded value', () => {
  assert.strictEqual(tunables.get('invariantThreshold'), 0.7);
});

test('T-005', 'get() on unknown key throws — no silent fallback', () => {
  assert.throws(() => tunables.get('not_a_real_key'));
});

test('T-006', 'set() updates the real row, not just the cache', () => {
  tunables.set('invariantThreshold', 0.85, { source: 'test' });
  assert.strictEqual(tunables.get('invariantThreshold'), 0.85);
  const row = _table(tunables.TABLE).find(r => r.key === 'invariantThreshold');
  assert.strictEqual(row.value, 0.85);
});

test('T-007', 'set() logs raid.tunables.changed with prior and new value', () => {
  const before = _table('event_log').filter(e => e.type === 'raid.tunables.changed').length;
  tunables.set('frictionThreshold', 0.6, { source: 'test' });
  const changes = _table('event_log').filter(e => e.type === 'raid.tunables.changed');
  assert.strictEqual(changes.length, before + 1);
  const last = changes[changes.length - 1];
  assert.strictEqual(last.payload.key, 'frictionThreshold');
  assert.strictEqual(last.payload.value, 0.6);
});

test('T-008', 'reload() re-reads from the store, reflecting an external change', () => {
  const row = _table(tunables.TABLE).find(r => r.key === 'minCallsForConfidence');
  row.value = 7; // external mutation, bypassing tunables.set()
  tunables.reload();
  assert.strictEqual(tunables.get('minCallsForConfidence'), 7);
});

console.log(`\n  raid-tunables: ${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
