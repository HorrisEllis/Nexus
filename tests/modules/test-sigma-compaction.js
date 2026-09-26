'use strict';
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
let passed = 0, failed = 0;
const _tests = [];
function test(id, desc, fn) { _tests.push({ id, desc, fn }); }

const sc = require('../../orchestrator/lib/sigma-compaction');
const HOUR = 3600000;

function rec(ts, sigma, type = 'x') { return { uuid: `${ts}-${sigma}-${Math.random()}`, ts, sigma, type }; }

test('T-001', 'rollup groups by hour with correct count/avg/max', () => {
  const base = 1000 * HOUR;
  const rolls = sc.rollup([rec(base + 1, 0.2, 'a'), rec(base + 2, 0.4, 'a'), rec(base + HOUR + 1, 0.6, 'b')]);
  assert.strictEqual(rolls.length, 2);
  assert.strictEqual(rolls[0].count, 2);
  assert.strictEqual(rolls[0].avgSigma, 0.3);
  assert.strictEqual(rolls[0].maxSigma, 0.4);
  assert.strictEqual(rolls[1].count, 1);
});

test('T-002', 'warn/halt counts use sigma-writer\'s own thresholds (0.5 / 0.7)', () => {
  const base = 1000 * HOUR;
  const [r] = sc.rollup([rec(base, 0.3), rec(base + 1, 0.55), rec(base + 2, 0.75), rec(base + 3, 0.9)]);
  assert.strictEqual(r.warnCount, 1);  // 0.55 only — halts are not double-counted as warns
  assert.strictEqual(r.haltCount, 2);  // 0.75, 0.9
});

test('T-003', 'topTypes ranks by frequency, caps at 5', () => {
  const base = 1000 * HOUR;
  const rows = [];
  for (let i = 0; i < 7; i++) rows.push(rec(base + i, 0.1, `type${i % 6}`)); // type0 twice
  const [r] = sc.rollup(rows);
  assert.strictEqual(r.topTypes.length, 5);
  assert.strictEqual(r.topTypes[0].type, 'type0');
  assert.strictEqual(r.topTypes[0].count, 2);
});

test('T-004', 'mergeRollups sums counts and recomputes a weighted average — crash-idempotency math', () => {
  const a = { bucket: 0, count: 2, avgSigma: 0.2, maxSigma: 0.4, warnCount: 0, haltCount: 0, topTypes: [{ type: 'a', count: 2 }] };
  const b = { bucket: 0, count: 2, avgSigma: 0.6, maxSigma: 0.8, warnCount: 1, haltCount: 1, topTypes: [{ type: 'a', count: 1 }, { type: 'b', count: 1 }] };
  const m = sc.mergeRollups(a, b);
  assert.strictEqual(m.count, 4);
  assert.strictEqual(m.avgSigma, 0.4); // (0.2*2 + 0.6*2)/4
  assert.strictEqual(m.maxSigma, 0.8);
  assert.strictEqual(m.topTypes[0].count, 3); // a: 2+1
});

test('T-005', 'compact deletes only expired rows — the recent window every real reader depends on is untouched', () => {
  const now = Date.now();
  const rows = [rec(now - sc.RETENTION_MS - HOUR, 0.3), rec(now - sc.RETENTION_MS - 1, 0.4), rec(now - 1000, 0.5), rec(now, 0.6)];
  const store = { sigma_records: [...rows], sigma_rollups: [] };
  const jaa = {
    query: (t, fn) => (store[t] || []).filter(fn),
    get: (t, w) => (store[t] || []).find(r => Object.entries(w).every(([k, v]) => r[k] === v)) || null,
    upsert: (t, row) => { store[t].push(row); return row; },
    delete: (t, fn) => { const before = store[t].length; store[t] = store[t].filter(r => !fn(r)); return before - store[t].length; },
  };
  const result = sc.compact(jaa, now);
  assert.strictEqual(result.deleted, 2);
  assert.strictEqual(store.sigma_records.length, 2); // the two recent rows survive
  assert.ok(store.sigma_rollups.length >= 1);
});

test('T-006', 'compact on an already-clean table is a no-op', () => {
  const now = Date.now();
  const store = { sigma_records: [rec(now, 0.5)], sigma_rollups: [] };
  const jaa = {
    query: (t, fn) => (store[t] || []).filter(fn),
    get: () => null, upsert: (t, r) => r,
    delete: () => { throw new Error('delete must not be called with nothing expired'); },
  };
  const result = sc.compact(jaa, now);
  assert.strictEqual(result.deleted, 0);
  assert.strictEqual(result.rollups, 0);
});

test('T-007', 'REAL JaaStore round-trip: rows hard-deleted, rollups written, and the file on disk actually shrinks after flush + fresh reload', async () => {
  const { JaaStore } = require('../../guardian/jaa-store');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sigma-compact-'));
  const store = new JaaStore(dir);
  const now = Date.now();
  for (let i = 0; i < 50; i++) store.insert('sigma_records', rec(now - sc.RETENTION_MS - HOUR - i * 1000, 0.4 + (i % 5) / 10, 'load_test'));
  for (let i = 0; i < 5; i++) store.insert('sigma_records', rec(now - i * 1000, 0.3, 'recent'));
  const jaa = { // same adapter surface orchestrator's jaaDB exposes over JaaStore
    query: (t, w, n) => store.all(t, w, typeof n === 'number' ? { limit: n } : n),
    get: (t, w) => store.get(t, w),
    upsert: (t, r, k) => store.upsert(t, r, k),
    delete: (t, w) => store.delete(t, w),
  };
  const result = sc.compact(jaa, now);
  assert.strictEqual(result.deleted, 50);
  store.close(); // synchronous flushAll — the store's own contract, not a sleep racing the 1500ms debounce
  const reloaded = new JaaStore(dir);
  const remaining = reloaded.all('sigma_records', {});
  const rollups = reloaded.all('sigma_rollups', {});
  assert.strictEqual(remaining.length, 5, 'disk must hold only the 5 recent rows after reload — deletes persisted, no resurrection');
  assert.ok(rollups.length >= 1, 'rollups must survive on disk');
  assert.strictEqual(rollups.reduce((s, r) => s + r.count, 0), 50, 'rollups must account for every deleted row (§0.3)');
});

test('T-008', 'RETENTION_MS comes from tiers.js short tier, not a local invention', () => {
  const { MEMORY_TIERS } = require('../../cortex/memory/tiers.js');
  assert.strictEqual(sc.RETENTION_MS, MEMORY_TIERS.short.evictAfterMs);
});

(async () => {
  for (const { id, desc, fn } of _tests) {
    try { await fn(); console.log(`  ✓ ${id} ${desc}`); passed++; }
    catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${e.message}`); failed++; }
  }
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
