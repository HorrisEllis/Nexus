'use strict';
/**
 * tests/modules/flush-redundancy.test.js — Redundant Gaps/Patterns Purge
 * UUID: test-flush-redundancy-v1-0000-4900-0000-000000000001
 *
 * Covers the refactor that makes cortex/flush-redundancy.js's dedup logic
 * callable in-process (runFlush({jaaDB, dryRun})) instead of only runnable
 * as a manual one-off CLI script — this is what the orchestrator's new
 * `purge` command (see orchestrator-cli.test.js) calls directly.
 */

const assert = require('assert');
let passed = 0, failed = 0;
const _registry = [];
function test(id, desc, fn) { _registry.push({ id, desc, fn }); }

async function runAll() {
  for (const { id, desc, fn } of _registry) {
    try { await fn(); console.log(`  ✓ ${id} ${desc}`); passed++; }
    catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${e.message}`); failed++; }
  }
  process.stdout.write(`\n  flush-redundancy.test.js\n  ${passed} passed  ${failed} failed\n`);
  if (failed > 0) process.exitCode = 1;
}

const { runFlush } = require('../../cortex/flush-redundancy.js');

// ── Minimal mock jaaDB — independent per test, no require.cache injection
// needed since runFlush() takes jaaDB as a parameter rather than importing
// it internally. ──────────────────────────────────────────────────────────────
function mockJaaDB(initial = {}) {
  const store = { bep_patterns: [], gaps: [], ...initial };
  const evicted = [];
  return {
    store, evicted,
    query: (table, fn = () => true, n = 999) => (store[table] || []).filter(fn).slice(0, n),
    update: (table, uuid, patch) => {
      const row = (store[table] || []).find(r => r.uuid === uuid);
      if (row) Object.assign(row, patch);
      return row;
    },
    evict: (table, uuid, reason) => {
      evicted.push({ table, uuid, reason });
      const row = (store[table] || []).find(r => r.uuid === uuid);
      if (row) row._evicted = true;
    },
  };
}

function pat(uuid, signature, overrides = {}) {
  return { uuid, signature, count: 1, confidence: 0.1, lastSeen: Date.now(), ts: Date.now(), ...overrides };
}
function gap(uuid, type, path, overrides = {}) {
  return { uuid, type, path, status: 'open', attempts: 1, ts: Date.now(), ...overrides };
}

// ── §A: contract ──────────────────────────────────────────────────────────────

test('A1', 'exports runFlush', () => {
  assert.strictEqual(typeof runFlush, 'function');
});

test('A2', 'throws without a jaaDB instance', async () => {
  let threw = false;
  try { await runFlush({}); } catch (e) { threw = true; }
  assert(threw, 'runFlush({}) (no jaaDB) should throw, not silently no-op');
});

// ── §B: pattern dedup ──────────────────────────────────────────────────────────

test('B1', 'no duplicates → nothing evicted, summary reports zero', async () => {
  const db = mockJaaDB({ bep_patterns: [pat('p1', 'sig-a'), pat('p2', 'sig-b')] });
  const summary = await runFlush({ jaaDB: db, dryRun: false, log: () => {} });
  assert.strictEqual(summary.patterns.signaturesWithDupes, 0);
  assert.strictEqual(summary.patterns.rowsEvicted, 0);
  assert.strictEqual(db.evicted.length, 0);
});

test('B2', 'duplicate signatures: keeps earliest, evicts the rest, merges count', async () => {
  const t0 = Date.now();
  const db = mockJaaDB({
    bep_patterns: [
      pat('p1', 'sig-a', { ts: t0,       count: 5, confidence: 0.3 }),
      pat('p2', 'sig-a', { ts: t0 + 100, count: 7, confidence: 0.5 }), // duplicate, later
      pat('p3', 'sig-a', { ts: t0 + 200, count: 3, confidence: 0.2 }), // duplicate, later
    ],
  });
  const summary = await runFlush({ jaaDB: db, dryRun: false, log: () => {} });

  assert.strictEqual(summary.patterns.signaturesWithDupes, 1);
  assert.strictEqual(summary.patterns.rowsEvicted, 2);
  assert.strictEqual(db.evicted.length, 2);
  assert.deepStrictEqual(db.evicted.map(e => e.uuid).sort(), ['p2', 'p3']);

  const canonical = db.store.bep_patterns.find(p => p.uuid === 'p1');
  assert.strictEqual(canonical.count, 15, `merged count should sum all duplicates (5+7+3=15), got ${canonical.count}`);
  assert.strictEqual(canonical.confidence, 0.5, 'merged confidence should be the max across duplicates');
  assert(!canonical._evicted, 'the canonical (earliest) row must survive, not be evicted');
});

test('B3', 'dryRun: reports what would be evicted but evicts nothing for real', async () => {
  const t0 = Date.now();
  const db = mockJaaDB({
    bep_patterns: [pat('p1', 'sig-a', { ts: t0 }), pat('p2', 'sig-a', { ts: t0 + 100 })],
  });
  const summary = await runFlush({ jaaDB: db, dryRun: true, log: () => {} });
  assert.strictEqual(summary.dryRun, true);
  assert.strictEqual(summary.patterns.rowsEvicted, 1, 'dry-run summary should still report the count that WOULD be evicted');
  assert.strictEqual(db.evicted.length, 0, 'dry-run must not actually call evict()');
  const canonical = db.store.bep_patterns.find(p => p.uuid === 'p1');
  assert.strictEqual(canonical.count, 1, `dry-run must not mutate the canonical row's count (still 1, not the merged 2), got ${canonical.count}`);
});

test('B4', 'legacy rows with no signature field fall back to a content hash, not crash', async () => {
  const db = mockJaaDB({
    bep_patterns: [
      { uuid: 'p1', count: 1, ts: Date.now() }, // no signature, no sigHash
    ],
  });
  await assertDoesNotThrow(() => runFlush({ jaaDB: db, dryRun: false, log: () => {} }));
});

async function assertDoesNotThrow(fn) {
  try { await fn(); } catch (e) { throw new Error(`should not have thrown: ${e.message}`); }
}

// ── §C: gap dedup ──────────────────────────────────────────────────────────────

test('C1', 'duplicate open gaps sharing {type,path}: keeps earliest, merges attempts', async () => {
  const t0 = Date.now();
  const db = mockJaaDB({
    gaps: [
      gap('g1', 'stale_module', 'idearium:4800', { ts: t0,       attempts: 2 }),
      gap('g2', 'stale_module', 'idearium:4800', { ts: t0 + 100, attempts: 3 }),
    ],
  });
  const summary = await runFlush({ jaaDB: db, dryRun: false, log: () => {} });
  assert.strictEqual(summary.gaps.keysWithDupes, 1);
  assert.strictEqual(summary.gaps.rowsEvicted, 1);
  const canonical = db.store.gaps.find(g => g.uuid === 'g1');
  assert.strictEqual(canonical.attempts, 5, 'merged attempts should sum (2+3=5)');
});

test('C2', 'closed gaps are never touched, even if they would otherwise look like dupes', async () => {
  const t0 = Date.now();
  const db = mockJaaDB({
    gaps: [
      gap('g1', 'stale_module', 'x', { status: 'open' }),
      gap('g2', 'stale_module', 'x', { status: 'closed' }), // same type/path, but closed
    ],
  });
  const summary = await runFlush({ jaaDB: db, dryRun: false, log: () => {} });
  assert.strictEqual(summary.gaps.rowsEvicted, 0, 'a closed gap should never be grouped with an open one for eviction');
  assert(!db.store.gaps.find(g => g.uuid === 'g2')._evicted, 'closed gap must not be evicted');
});

test('C3', 'gapHash takes priority over the {type,path} fallback key when present', async () => {
  const t0 = Date.now();
  const db = mockJaaDB({
    gaps: [
      gap('g1', 'a', 'pathA', { ts: t0,       gapHash: 'same-hash' }),
      gap('g2', 'b', 'pathB', { ts: t0 + 100, gapHash: 'same-hash' }), // different type/path, same hash
    ],
  });
  const summary = await runFlush({ jaaDB: db, dryRun: false, log: () => {} });
  assert.strictEqual(summary.gaps.keysWithDupes, 1, 'rows sharing gapHash should be grouped together regardless of type/path');
});

// ── §D: log callback ───────────────────────────────────────────────────────────

test('D1', 'custom log callback is used instead of console.log when provided', async () => {
  const t0 = Date.now();
  const db = mockJaaDB({ bep_patterns: [pat('p1', 'sig-a', { ts: t0 }), pat('p2', 'sig-a', { ts: t0 + 100 })] });
  const lines = [];
  await runFlush({ jaaDB: db, dryRun: false, log: (msg) => lines.push(msg) });
  assert(lines.some(l => l.includes('flush summary')), 'custom log callback should receive the summary lines');
});

// ── RUN ───────────────────────────────────────────────────────────────────────
runAll();

module.exports = { passed: () => passed, failed: () => failed };
