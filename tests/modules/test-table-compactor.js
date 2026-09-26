'use strict';
const assert = require('assert');
let passed = 0, failed = 0;
function test(id, desc, fn) {
  try { fn(); console.log(`  \u2713 ${id} ${desc}`); passed++; }
  catch (e) { console.log(`  \u2717 ${id} ${desc}\n    ${e.stack}`); failed++; }
}

const tc = require('../../cortex/memory/table-compactor');
const { TABLE_TIERS, MEMORY_TIERS } = require('../../cortex/memory/tiers.js');
const HOUR = 3600000;

function row(ts, extra = {}) { return { uuid: `u-${ts}-${Math.random()}`, ts, ...extra }; }

// §FIXED 2026-09-12 — this mock used to return the SAME objects on every
// query() call and let delete() filter that same live array — nothing
// like the real store, which assigns its own internal `id` at insert
// time and returns a fresh {...row} spread COPY on every real query().
// That leniency is exactly what let a real reference-identity bug in
// table-compactor.js/table-deduplicator.js's own removal logic pass 30
// tests here while silently deleting 0 rows against James's real data.
// Now matches guardian/jaa-store.js's real insert()/all() shape.
let _mockIdSeq = 0;
function makeMockJaa(store) {
  return {
    query: (t, fn) => (store[t] || []).filter(fn).map(r => ({ ...r })),
    insert: (t, r) => { const row = { ...r, id: r.id || `mock-id-${_mockIdSeq++}` }; (store[t] = store[t] || []).push(row); return { ...row }; },
    delete: (t, fn) => { const before = (store[t] || []).length; store[t] = (store[t] || []).filter(r => !fn({ ...r })); return before - store[t].length; },
  };
}

test('T-001', 'component_ledger and cfr_tension_history are declared short-tier, 24h — the real gap this module closes', () => {
  assert.strictEqual(TABLE_TIERS.component_ledger, 'short');
  assert.strictEqual(TABLE_TIERS.cfr_tension_history, 'short');
  assert.strictEqual(MEMORY_TIERS.short.evictAfterMs, 24 * HOUR);
});

test('T-002', 'compactTable deletes only rows past the tier window, leaves the recent window every real reader depends on untouched', () => {
  const now = Date.now();
  const evictAfterMs = MEMORY_TIERS.short.evictAfterMs;
  const store = {
    event_log: [
      row(now - evictAfterMs - HOUR),       // clearly expired
      row(now - evictAfterMs - 1),          // just past the cutoff
      row(now - 1000),                      // recent — must survive
      row(now),                             // recent — must survive
    ],
    compaction_log: [],
  };
  const jaa = makeMockJaa(store);
  const result = tc.compactTable(jaa, 'event_log', now);
  assert.strictEqual(result.deleted, 2, 'only the two genuinely expired rows should be deleted');
  assert.strictEqual(store.event_log.length, 2, 'the two recent rows must survive');
});

test('T-003', 'a row with no real timestamp is left alone, never deleted on a guess (§1.2)', () => {
  const now = Date.now();
  const evictAfterMs = MEMORY_TIERS.short.evictAfterMs;
  const store = {
    event_log: [
      { uuid: 'no-ts-1' },                     // undatable
      row(now - evictAfterMs - HOUR),          // genuinely expired
    ],
    compaction_log: [],
  };
  const jaa = makeMockJaa(store);
  const result = tc.compactTable(jaa, 'event_log', now);
  assert.strictEqual(result.deleted, 1);
  assert.strictEqual(store.event_log.length, 1);
  assert.strictEqual(store.event_log[0].uuid, 'no-ts-1', 'the undatable row must be the one that survives');
});

test('T-004', 'an already-tombstoned row is not double-counted or re-processed', () => {
  const now = Date.now();
  const evictAfterMs = MEMORY_TIERS.short.evictAfterMs;
  const store = {
    event_log: [row(now - evictAfterMs - HOUR, { _evicted: true })],
    compaction_log: [],
  };
  const jaa = makeMockJaa(store);
  const result = tc.compactTable(jaa, 'event_log', now);
  assert.strictEqual(result.deleted, 0);
  assert.strictEqual(store.event_log.length, 1);
});

test('T-005', 'a real, compressed compaction_log summary is written BEFORE the delete (§0.3 — nothing lost silently)', () => {
  const now = Date.now();
  const evictAfterMs = MEMORY_TIERS.short.evictAfterMs;
  const oldTs = now - evictAfterMs - HOUR;
  const store = {
    component_ledger: [row(oldTs), row(oldTs + 5000)],
    compaction_log: [],
  };
  const jaa = makeMockJaa(store);
  tc.compactTable(jaa, 'component_ledger', now);
  assert.strictEqual(store.compaction_log.length, 1);
  const summary = store.compaction_log[0];
  assert.strictEqual(summary.table, 'component_ledger');
  assert.strictEqual(summary.deletedCount, 2);
  assert.strictEqual(summary.oldestTs, oldTs);
  assert.strictEqual(summary.newestTs, oldTs + 5000);
});

test('T-006', 'a long-tier table (never expires) is skipped, not force-compacted', () => {
  const jaa = makeMockJaa({ crystals: [row(Date.now() - 1000 * HOUR * 24 * 365)] });
  const result = tc.compactTable(jaa, 'crystals');
  assert.strictEqual(result.skipped, true);
  assert.strictEqual(result.deleted, 0);
});

test('T-007', 'a table with no declared tier at all is skipped with an honest reason, not silently ignored', () => {
  const jaa = makeMockJaa({});
  const result = tc.compactTable(jaa, 'some_table_nobody_has_classified_yet');
  assert.strictEqual(result.skipped, true);
  assert.ok(/not tier-managed/.test(result.reason));
});

test('T-008', 'start() refuses to run without a real, explicit tables[] list — see the module\'s own §HONEST SCOPE', () => {
  assert.throws(() => tc.start(makeMockJaa({}), []), /real, explicit tables/);
  assert.throws(() => tc.start(makeMockJaa({}), null), /real, explicit tables/);
});

test('T-009', 'start() runs an immediate boot compaction, same as sigma-compaction.js\'s own pattern', () => {
  const now = Date.now();
  const evictAfterMs = MEMORY_TIERS.short.evictAfterMs;
  const store = { event_log: [row(now - evictAfterMs - HOUR)], compaction_log: [] };
  const jaa = makeMockJaa(store);
  tc.start(jaa, ['event_log'], 999999999); // interval irrelevant — only the immediate boot sweep is under test
  assert.strictEqual(store.event_log.length, 0, 'the immediate boot sweep should have already run');
  tc.stop();
});

test('T-010', 'capTable keeps only the N most recent rows per group, removes the rest', () => {
  const now = Date.now();
  const store = {
    sigma_records: [
      { uuid: 'a', type: 'cortex', ts: now - 3000 },
      { uuid: 'b', type: 'cortex', ts: now - 2000 },
      { uuid: 'c', type: 'cortex', ts: now - 1000 },
      { uuid: 'd', type: 'guardian', ts: now },
    ],
    compaction_log: [],
  };
  const jaa = makeMockJaa(store);
  const result = tc.capTable(jaa, 'sigma_records', (r) => r.type, 2);
  assert.strictEqual(result.removed, 1);
  assert.strictEqual(store.sigma_records.length, 3);
  assert.ok(!store.sigma_records.some(r => r.uuid === 'a'), 'the oldest cortex row must be the one removed');
  assert.ok(store.sigma_records.some(r => r.uuid === 'd'), 'guardian group, under the cap, must be untouched');
});

test('T-011', 'capTable requires a real keyFn and a real positive maxPerGroup, no defaults guessed', () => {
  const jaa = makeMockJaa({});
  assert.throws(() => tc.capTable(jaa, 'sigma_records', null, 100), /real, explicit keyFn/);
  assert.throws(() => tc.capTable(jaa, 'sigma_records', (r) => r.type, 0), /real maxPerGroup/);
});

test('T-012', 'a group at or under the cap is left completely untouched', () => {
  const now = Date.now();
  const store = { sigma_records: [{ uuid: 'a', type: 'cortex', ts: now }, { uuid: 'b', type: 'cortex', ts: now }], compaction_log: [] };
  const jaa = makeMockJaa(store);
  const result = tc.capTable(jaa, 'sigma_records', (r) => r.type, 2);
  assert.strictEqual(result.removed, 0);
  assert.strictEqual(store.sigma_records.length, 2);
});

test('T-013', 'startCaps requires a real, explicit specs[] list', () => {
  assert.throws(() => tc.startCaps(makeMockJaa({}), []), /real, explicit specs/);
});

test('T-014', 'startCaps runs an immediate boot sweep', () => {
  const now = Date.now();
  const store = {
    sigma_records: Array.from({ length: 5 }, (_, i) => ({ uuid: `u${i}`, type: 'cortex', ts: now - i * 1000 })),
    compaction_log: [],
  };
  const jaa = makeMockJaa(store);
  tc.startCaps(jaa, [{ table: 'sigma_records', keyFn: (r) => r.type, maxPerGroup: 3 }], 999999999);
  assert.strictEqual(store.sigma_records.length, 3, 'the immediate boot sweep should have already run');
  tc.stopCaps();
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
