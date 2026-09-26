'use strict';
const assert = require('assert');
let passed = 0, failed = 0;
function test(id, desc, fn) {
  try { fn(); console.log(`  \u2713 ${id} ${desc}`); passed++; }
  catch (e) { console.log(`  \u2717 ${id} ${desc}\n    ${e.stack}`); failed++; }
}

const td = require('../../cortex/memory/table-deduplicator');

let _rowIdSeq = 0;
// §FIXED 2026-09-12 — every fixture row now gets its own unique id, same
// as a real insert() would assign (guardian/jaa-store.js: `{ ...row, id
// }`). Rows built directly into a test's store[] (bypassing insert() on
// purpose, to set up a specific scenario) still need this — dedupeTable
// disambiguates same-uuid duplicates by id, not uuid, so a fixture two
// rows sharing a uuid MUST still have two distinct real ids or the
// module has no way to tell them apart, exactly like the real store.
function row(uuid, ts, extra = {}) { return { uuid, ts, id: `fixture-id-${_rowIdSeq++}`, ...extra }; }

// §FIXED 2026-09-12 — same fix as test-table-compactor.js's own mock:
// now assigns a store-style id at insert and returns fresh spread
// copies on query(), matching guardian/jaa-store.js's real behavior —
// the leniency here is what let dedupeTable's own reference-identity
// bug pass 17 tests while silently deleting 0 rows against real data.
let _mockIdSeq = 0;
function makeMockJaa(store) {
  return {
    query: (t, fn) => (store[t] || []).filter(fn).map(r => ({ ...r })),
    insert: (t, r) => { const row = { ...r, id: r.id || `mock-id-${_mockIdSeq++}` }; (store[t] = store[t] || []).push(row); return { ...row }; },
    delete: (t, fn) => { const before = (store[t] || []).length; store[t] = (store[t] || []).filter(r => !fn({ ...r })); return before - store[t].length; },
  };
}

test('D-001', 'exact uuid collision — the newer of two same-uuid rows is kept, the older removed', () => {
  const now = Date.now();
  const store = { event_log: [row('u1', now - 1000, { note: 'old' }), row('u1', now, { note: 'new' })], dedup_log: [] };
  const jaa = makeMockJaa(store);
  const result = td.dedupeTable(jaa, 'event_log');
  assert.strictEqual(result.removed, 1);
  assert.strictEqual(store.event_log.length, 1);
  assert.strictEqual(store.event_log[0].note, 'new', 'the newer row must survive');
});

test('D-002', 'no uuid collisions at all — nothing removed, no false positives', () => {
  const now = Date.now();
  const store = { event_log: [row('u1', now), row('u2', now), row('u3', now)], dedup_log: [] };
  const jaa = makeMockJaa(store);
  const result = td.dedupeTable(jaa, 'event_log');
  assert.strictEqual(result.removed, 0);
  assert.strictEqual(store.event_log.length, 3);
});

test('D-003', 'a 3-way uuid collision keeps exactly one (the newest), removes the other two', () => {
  const now = Date.now();
  const store = {
    event_log: [row('u1', now - 2000), row('u1', now - 1000), row('u1', now, { note: 'newest' })],
    dedup_log: [],
  };
  const jaa = makeMockJaa(store);
  const result = td.dedupeTable(jaa, 'event_log');
  assert.strictEqual(result.removed, 2);
  assert.strictEqual(store.event_log.length, 1);
  assert.strictEqual(store.event_log[0].note, 'newest');
});

test('D-004', 'a row with no uuid at all is never touched — not a dedup target, not a guess', () => {
  const store = { event_log: [{ ts: Date.now() }, { ts: Date.now() }], dedup_log: [] };
  const jaa = makeMockJaa(store);
  const result = td.dedupeTable(jaa, 'event_log');
  assert.strictEqual(result.removed, 0);
  assert.strictEqual(store.event_log.length, 2);
});

test('D-005', 'a real dedup_log summary is written BEFORE the delete (§0.3)', () => {
  const now = Date.now();
  const store = { component_ledger: [row('u1', now - 1000), row('u1', now)], dedup_log: [] };
  const jaa = makeMockJaa(store);
  td.dedupeTable(jaa, 'component_ledger');
  assert.strictEqual(store.dedup_log.length, 1);
  const summary = store.dedup_log[0];
  assert.strictEqual(summary.table, 'component_ledger');
  assert.strictEqual(summary.removedCount, 1);
  assert.strictEqual(summary.groups, 1);
  assert.deepStrictEqual(summary.kinds, ['uuid_collision']);
});

test('D-006', 'content-level dedup is OFF by default — two different-uuid rows with identical content both survive with no fingerprint given', () => {
  const now = Date.now();
  const store = {
    chat_log: [row('u1', now, { chatId: 'c1', text: 'hello' }), row('u2', now, { chatId: 'c1', text: 'hello' })],
    dedup_log: [],
  };
  const jaa = makeMockJaa(store);
  const result = td.dedupeTable(jaa, 'chat_log');
  assert.strictEqual(result.removed, 0, 'no fingerprint was given — content-level dedup must never run on a guessed default');
  assert.strictEqual(store.chat_log.length, 2);
});

test('D-007', 'content-level dedup with an explicit fingerprint removes the older content-duplicate, keeps the newer', () => {
  const now = Date.now();
  const store = {
    chat_log: [
      row('u1', now - 1000, { chatId: 'c1', text: 'hello' }),
      row('u2', now, { chatId: 'c1', text: 'hello' }),
      row('u3', now, { chatId: 'c1', text: 'different' }),
    ],
    dedup_log: [],
  };
  const jaa = makeMockJaa(store);
  const result = td.dedupeTable(jaa, 'chat_log', { fingerprint: (r) => `${r.chatId}::${r.text}` });
  assert.strictEqual(result.removed, 1);
  assert.strictEqual(store.chat_log.length, 2);
  assert.ok(store.chat_log.some(r => r.uuid === 'u2'), 'the newer content-duplicate must survive');
  assert.ok(store.chat_log.some(r => r.uuid === 'u3'), 'the genuinely distinct row must survive');
});

test('D-008', 'a fingerprint function that throws on a row is treated as "cannot classify", never crashes the pass', () => {
  const now = Date.now();
  const store = { chat_log: [row('u1', now, { weird: true }), row('u2', now, { weird: true })], dedup_log: [] };
  const jaa = makeMockJaa(store);
  const result = td.dedupeTable(jaa, 'chat_log', { fingerprint: () => { throw new Error('boom'); } });
  assert.strictEqual(result.removed, 0);
  assert.strictEqual(store.chat_log.length, 2);
});

test('D-009', 'dedupeAll() requires a real, explicit tables[] list, same discipline as table-compactor.js', () => {
  assert.throws(() => td.dedupeAll({ query: () => [] }, []), /real, explicit tables/);
  assert.throws(() => td.dedupeAll({ query: () => [] }, null), /real, explicit tables/);
});

test('D-010', 'dedupeAll() runs dedupeTable across every listed table independently, one failure does not block the rest', () => {
  const now = Date.now();
  const store = {
    event_log: [row('u1', now - 1000), row('u1', now)],
    component_ledger: [row('u2', now)],
    dedup_log: [],
  };
  const jaa = makeMockJaa(store);
  const results = td.dedupeAll(jaa, ['event_log', 'component_ledger']);
  assert.strictEqual(results.length, 2);
  assert.strictEqual(results[0].removed, 1);
  assert.strictEqual(results[1].removed, 0);
});

test('D-011', 'an empty table is a real no-op, not an error', () => {
  const jaa = makeMockJaa({});
  const result = td.dedupeTable(jaa, 'nonexistent_table');
  assert.strictEqual(result.removed, 0);
  assert.strictEqual(result.groups, 0);
});

test('D-012', 'start() refuses to run without a real, explicit tables[] list', () => {
  assert.throws(() => td.start(makeMockJaa({}), []), /real, explicit tables/);
  assert.throws(() => td.start(makeMockJaa({}), null), /real, explicit tables/);
});

test('D-013', 'start() runs an immediate boot dedup pass, same as table-compactor.js\'s own pattern', () => {
  const now = Date.now();
  const store = { event_log: [row('u1', now - 1000), row('u1', now)], dedup_log: [] };
  const jaa = makeMockJaa(store);
  td.start(jaa, ['event_log'], 999999999);
  assert.strictEqual(store.event_log.length, 1, 'the immediate boot dedup sweep should have already run');
  td.stop();
});

test('D-014', 'insertDeduped requires a real fingerprint function, no default guessed', () => {
  const jaa = makeMockJaa({});
  assert.throws(() => td.insertDeduped(jaa, 'chat_log', row('u1', Date.now()), null), /requires a real fingerprint/);
});

test('D-015', 'insertDeduped stores the first occurrence of a fingerprint in full', () => {
  const store = { chat_log: [] };
  const jaa = makeMockJaa(store);
  td.insertDeduped(jaa, 'chat_log', row('u1', Date.now(), { text: 'hello' }), (r) => r.text);
  assert.strictEqual(store.chat_log.length, 1);
  assert.strictEqual(store.chat_log[0].text, 'hello');
  assert.strictEqual(store.chat_log[0].fingerprint, 'hello');
});

test('D-016', 'insertDeduped writes only a tiny reference row on a repeat, not the full payload again', () => {
  const store = { chat_log: [] };
  const jaa = makeMockJaa(store);
  td.insertDeduped(jaa, 'chat_log', row('u1', Date.now(), { text: 'hello', bigField: 'x'.repeat(1000) }), (r) => r.text);
  td.insertDeduped(jaa, 'chat_log', row('u2', Date.now(), { text: 'hello', bigField: 'y'.repeat(1000) }), (r) => r.text);
  assert.strictEqual(store.chat_log.length, 2);
  const ref = store.chat_log[1];
  assert.strictEqual(ref.refOf, 'u1');
  assert.strictEqual(ref.bigField, undefined, 'the repeat must not carry the full original payload');
});

test('D-017', 'insertDeduped inserts normally when the fingerprint function declines to classify (returns null)', () => {
  const store = { chat_log: [] };
  const jaa = makeMockJaa(store);
  td.insertDeduped(jaa, 'chat_log', row('u1', Date.now(), { text: 'x' }), () => null);
  assert.strictEqual(store.chat_log.length, 1);
  assert.strictEqual(store.chat_log[0].fingerprint, undefined);
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
