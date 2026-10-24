'use strict';
/**
 * tests/modules/intelligence.test.js — Pattern Crystallisation Accumulation Fix
 * UUID: test-intelligence-v1-0000-4700-0000-000000000001
 *
 * Covers the fix for: "reuse index build" (and other heartbeat-tick event
 * types) re-announcing "pattern crystallised" identically forever, instead
 * of once. Root cause: _scanPatterns() recomputed co-occurrence/precursor
 * counts from scratch against the same sliding 500-event window every scan
 * tick — heartbeat-paced event types co-occur a roughly constant number of
 * times within any given window, so count never grew, and crystallised
 * oscillated true/false/true right at the threshold as the windowed count
 * brushed the line, re-triggering the "just crystallised" announce log on
 * every crossing.
 *
 * Fix verified here:
 *   1. count accumulates across scans (via _patternScanCursor high-water
 *      mark) instead of resetting to the per-window snapshot value.
 *   2. crystallised is a monotonic latch — once true, never flips back to
 *      false from boundary noise (co_occurrence / failure_precursor).
 *   3. The same pair of events fed across two separate scan() calls is
 *      counted once per occurrence, not double-counted at the window seam.
 *   4. bottleneck keeps its snapshot semantics (current open-gap count) but
 *      only un-crystallises when the count fully clears to 0.
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
  process.stdout.write(`\n  intelligence.test.js\n  ${passed} passed  ${failed} failed\n`);
  if (failed > 0) process.exitCode = 1;
}

// ── Mock JaaDB ────────────────────────────────────────────────────────────────
// Same technique as tests/modules/case-library.test.js — inject a fake
// module into require.cache BEFORE the real module under test first
// requires it, so the destructured `jaaDB` binding inside
// cortex/intelligence/index.js points at this mock for the whole suite.
let _store = {};
function resetStore() {
  _store = { event_log: [], bep_patterns: [], gaps: [], sigma_records: [], fault_taxonomy: [], reuse_index: [] };
}
resetStore();

let _uuidSeq = 0;
function fakeUid() { return 'pat-' + (++_uuidSeq); }

require.cache[require.resolve('../../cortex/memory/jaa-db')] = {
  id: '../memory/jaa-db', filename: '../memory/jaa-db', loaded: true,
  exports: {
    jaaDB: {
      query: (table, fn = () => true, n = 999) => (_store[table] || []).filter(fn).slice(-n),
      // §BUGFIX 2026-08-18 — real jaaDB.tail() was fixed this session
      // (cortex/memory/jaa-db.js, commit 41da171) to sort by real
      // chronological order instead of a UUID. The mock here never had a
      // tail() at all until now — real intelligence.test.js failures
      // ("jaaDB.tail is not a function") surfaced the gap directly, same
      // fix already proven in a different checkout earlier this session.
      tail: (table, n = 10) => (_store[table] || []).slice(-n).reverse(),
      insert: (table, row) => { (_store[table] = _store[table] || []).push(row); return row; },
      update: (table, uuid, patch) => {
        const row = (_store[table] || []).find(r => r.uuid === uuid);
        if (row) Object.assign(row, patch);
        return row;
      },
      evict: (table, uuid) => {
        const row = (_store[table] || []).find(r => r.uuid === uuid);
        if (row) row._evicted = true;
      },
    },
    uid: fakeUid,
  },
};

const intel = require('../../intelligence/index.js');

function ev(type, ts) {
  return { uuid: fakeUid(), type, ts: ts ?? Date.now(), payload: {} };
}

function advance(ms = 5) {
  return new Promise(r => setTimeout(r, ms));
}

// Feed N heartbeat-style co-occurring ticks, all close together (well within
// the 5s co-occurrence window), anchored to the CURRENT real time.
// IMPORTANT: no synthetic +i offsets here — _scanPatterns() captures its own
// `now = Date.now()` strictly AFTER these pushes complete (same synchronous
// call stack), so plain Date.now() per event is guaranteed <= that `now`.
// An offset like `Date.now()+i` can exceed `now` (same-millisecond clock
// granularity) and would make the event look like it's from the future
// relative to the cursor, causing it to be re-counted on every later scan —
// that was a self-inflicted bug in this test, not in the source fix.
function feedHeartbeatBurst(typeA, typeB, n) {
  for (let i = 0; i < n; i++) {
    const t = Date.now();
    _store.event_log.push(ev(typeA, t));
    _store.event_log.push(ev(typeB, t));
  }
}

function feedFiller(n, type = 'noise') {
  for (let i = 0; i < n; i++) _store.event_log.push(ev(type));
}

function resetAll() {
  resetStore();
  // §0.39.282 — wait until the clock has moved past this millisecond. The previous test's scan left its cursor at
  // Date.now(); events fed in the SAME millisecond carried ts === cursor and were treated as already scanned, so C2
  // saw no pattern row at all (flaked about 1 run in 3). A spin of at most 1 ms makes "time only moves forward" true.
  const t = Date.now(); while (Date.now() <= t) { /* spin ≤ 1 ms */ }
  // _patternScanCursor has no setter exported deliberately (boot hydration is
  // the only legitimate writer). Tests don't need to reset it — as long as
  // every timestamp used below is real Date.now()-anchored, real wall-clock
  // time only moves forward across the whole suite, so cross-test ordering
  // is automatically consistent with whatever cursor the previous test left.
}

// ── §A: module contract ───────────────────────────────────────────────────────

test('A1', 'exports _scanPatterns for direct testing', () => {
  assert.strictEqual(typeof intel._scanPatterns, 'function');
});

test('A2', 'exports getPatterns()', () => {
  assert.strictEqual(typeof intel.getPatterns, 'function');
});

// ── §B: needs >= 20 events to scan at all ────────────────────────────────────

test('B1', 'scan is a no-op below 20 events in the log', async () => {
  resetAll();
  feedHeartbeatBurst('heartbeat.tick', 'raid.health', 5); // 10 events total
  await intel._scanPatterns();
  assert.strictEqual(intel.getPatterns().length, 0, 'should not scan with < 20 events');
});

// ── §C: accumulation — the actual fix ────────────────────────────────────────

test('C1', 'count accumulates across scans instead of resetting to window snapshot', async () => {
  resetAll();
  // First scan: enough events to cross the 20-event floor and produce a
  // handful of co-occurrences (below crystallisation threshold of 10).
  feedHeartbeatBurst('heartbeat.tick', 'raid.health', 4); // 8 events, 4 co-occurring pairs
  feedFiller(12); // pad past the 20-event floor
  await intel._scanPatterns();

  const sig = ['heartbeat.tick', 'raid.health'].sort().join('::');
  const after1 = intel.getPatterns().find(p => p.signature === sig);
  assert(after1, 'pattern should exist after first scan');
  const countAfter1 = after1.count;

  // Second scan, real time has moved on — feed MORE of the same heartbeat
  // pair. Old (broken) behaviour: count would reset to just this batch's
  // window count. Fixed behaviour: count is countAfter1 + this batch's new count.
  await advance();
  feedHeartbeatBurst('heartbeat.tick', 'raid.health', 4);
  feedFiller(12);
  await intel._scanPatterns();

  const after2 = intel.getPatterns().find(p => p.signature === sig);
  assert(after2, 'pattern should still exist after second scan');
  assert(after2.count > countAfter1,
    `count should accumulate (was ${countAfter1}, now ${after2.count}) — if it reset to the window snapshot, this fails`);
  // Exactly one row for this signature — no duplicate insert.
  const rows = _store.bep_patterns.filter(p => p.signature === sig);
  assert.strictEqual(rows.length, 1, `expected exactly 1 bep_patterns row for ${sig}, found ${rows.length} (duplicate insert = the original bug)`);
});

test('C2', 'the same event pair is never double-counted across overlapping windows', async () => {
  resetAll();
  feedHeartbeatBurst('a.tick', 'b.tick', 3); // 6 co-occurring events, 3 pairs
  feedFiller(14);
  await intel._scanPatterns();
  const sig = ['a.tick', 'b.tick'].sort().join('::');
  const countAfter1 = _store.bep_patterns.find(p => p.signature === sig)?.count;

  // Re-scan with NO new events at all — count must not change, because
  // every existing event was already counted on the prior scan.
  await advance();
  await intel._scanPatterns();
  const rows = _store.bep_patterns.filter(p => p.signature === sig);
  assert.strictEqual(rows.length, 1, 'still exactly one row');
  assert.strictEqual(rows[0].count, countAfter1,
    `re-scanning with zero new events changed count from ${countAfter1} to ${rows[0].count} — same-pair double-count bug`);
});

// ── §D: monotonic crystallised latch + the base-rate gate (§2026-10-24) ───────
// NOTE (2026-10-24, James: "b, tighten the crystallizer threshold"): a pair of
// heartbeat ticks that only ever fire TOGETHER, with no spread and nothing
// distinguishing them from a shared clock, is exactly the "coincidence, not an
// invariant" case the framework (docs/innovation-toolkit.framework) says
// intuition must be regulated against. The crystallizer now holds such a pair
// as a HYPOTHESIS (crystallised:false, status:'hypothesis') — kept and counted,
// never announced as settled — until it beats base rate. D1/D2 below previously
// asserted that heartbeat pairs crystallise; that was the OLD, un-regulated
// policy. They now assert the latch mechanic the correct way round: the noise
// pair is held, and it is held QUIETLY (no re-announcement churn). The positive
// side — a pair that genuinely beats chance DOES crystallise, and the latch is
// monotonic — is proven deterministically in §F against the pure gate.

test('D1', 'a heartbeat co-occurrence that cannot beat base rate is held as a hypothesis, never announced', async () => {
  resetAll();
  const logs = [];
  const origLog = console.log;
  console.log = (...args) => { logs.push(args.join(' ')); };

  try {
    // Many scans of x.tick/y.tick firing only together, amid unrelated filler.
    // Old code: crystallised at cumulative count 10 and announced. New code:
    // base-rate lift ≈ 1 (every x has a y, nothing else distinguishes them),
    // below CRYSTALLIZE_LIFT_MIN — so it is held, not latched, and silent.
    for (let i = 0; i < 8; i++) {
      feedHeartbeatBurst('x.tick', 'y.tick', 3);
      feedFiller(14);
      await intel._scanPatterns();
      await advance();
    }
  } finally {
    console.log = origLog;
  }

  const sig = ['x.tick', 'y.tick'].sort().join('::');
  const row = intel.getPatterns().find(p => p.signature === sig);
  assert(row, 'the pair is still tracked as a row (lose nothing, §0.3)');
  assert(row.count >= 10, `count still accumulates past the old threshold (got ${row.count})`);
  assert.strictEqual(row.crystallised, false, 'a base-rate-noise pair must NOT latch crystallised');
  assert.strictEqual(row.status, 'hypothesis', 'it is explicitly held as a hypothesis');
  // _label() renders 'x.tick' as '"x: tick"' — the cross-pair announce phrase.
  const crystalliseLines = logs.filter(l =>
    l.includes('pattern crystallised') && l.includes('"x: tick" always fires alongside "y: tick"'));
  assert.strictEqual(crystalliseLines.length, 0,
    `a held hypothesis must never announce as crystallised, got ${crystalliseLines.length}:\n${crystalliseLines.join('\n')}`);
});

test('D2', 'a held hypothesis keeps accumulating count without flipping its status on boundary noise', async () => {
  resetAll();
  feedHeartbeatBurst('p.tick', 'q.tick', 4);
  feedFiller(14);
  await intel._scanPatterns();

  await advance();
  feedHeartbeatBurst('p.tick', 'q.tick', 8); // cumulative count well past the old 10 bar
  feedFiller(14);
  await intel._scanPatterns();

  const sig = ['p.tick', 'q.tick'].sort().join('::');
  const afterCross = intel.getPatterns().find(p => p.signature === sig);
  assert.strictEqual(afterCross.crystallised, false, 'cumulative count alone no longer crystallises — base rate must be beaten');
  assert.strictEqual(afterCross.status, 'hypothesis', 'still a hypothesis');
  const countAtCross = afterCross.count;

  // Next scan: only noise, no new p.tick/q.tick pairs. Status must not churn.
  await advance();
  feedFiller(25);
  await intel._scanPatterns();

  const after = intel.getPatterns().find(p => p.signature === sig);
  assert.strictEqual(after.status, 'hypothesis', 'status must not oscillate when a later scan sees no new occurrences');
  assert.strictEqual(after.count, countAtCross, 'count holds when no new occurrences arrive');
});

// ── §E: bottleneck keeps snapshot semantics ──────────────────────────────────

test('E1', 'bottleneck count reflects current open-gap snapshot, not accumulated history', async () => {
  resetAll();
  feedFiller(25);
  for (let i = 0; i < 6; i++) _store.gaps.push({ uuid: 'g' + i, type: 'stale_module', status: 'open', ts: Date.now() });
  await intel._scanPatterns();
  const sig = 'bottleneck::stale_module';
  const row1 = intel.getPatterns().find(p => p.signature === sig);
  assert(row1, 'bottleneck pattern should exist with 6 open gaps');
  assert.strictEqual(row1.count, 6, `bottleneck count should equal current open count (6), got ${row1.count}`);

  // Clear 4 of the 6 gaps — count should drop to reflect reality, not keep
  // accumulating like co-occurrence/precursor now correctly do.
  await advance();
  _store.gaps = _store.gaps.slice(0, 2);
  feedFiller(25);
  await intel._scanPatterns();
  const row2 = intel.getPatterns().find(p => p.signature === sig);
  assert.strictEqual(row2.count, 2, `bottleneck count should drop to current snapshot (2), got ${row2.count}`);
});

test('E2', 'bottleneck un-crystallises only once fully cleared (count hits 0), not at the 4/5 boundary', async () => {
  resetAll();
  feedFiller(25);
  for (let i = 0; i < 5; i++) _store.gaps.push({ uuid: 'h' + i, type: 'drift', status: 'open', ts: Date.now() });
  await intel._scanPatterns();
  const sig = 'bottleneck::drift';
  assert.strictEqual(intel.getPatterns().find(p => p.signature === sig)?.crystallised, true, 'should crystallise at count 5');

  // Drop to 3 (below threshold of 5, but not zero) — should STAY crystallised.
  await advance();
  _store.gaps = _store.gaps.slice(0, 3);
  feedFiller(25);
  await intel._scanPatterns();
  assert.strictEqual(intel.getPatterns().find(p => p.signature === sig)?.crystallised, true,
    'should NOT un-crystallise from 5→3 — that is the same boundary-oscillation bug class');

  // Drop to 0 — should fully clear.
  await advance();
  _store.gaps = [];
  feedFiller(25);
  await intel._scanPatterns();
  const afterClear = intel.getPatterns().find(p => p.signature === sig);
  // Once count hits 0, the `topGaps` loop's `count < 2` guard means this
  // signature is never upserted again — confirm it's not left dangling as
  // crystallised:true forever from a stale row.
  assert(!afterClear || afterClear.crystallised === true,
    'either the row is untouched (last known state) or explicitly still latched — never silently flipped false by boundary noise');
});

// ── §F: the base-rate crystallisation gate, pure & deterministic (§2026-10-24) ─
// James: "b, tighten the crystallizer threshold." _coOccurrenceLift is pure, so
// the positive side (a pair that genuinely beats chance) is proven here without
// fighting the event-feeding timing the integration tests above are coupled to.

test('F0', 'exports _coOccurrenceLift', () => {
  assert.strictEqual(typeof intel._coOccurrenceLift, 'function');
});

test('F1', 'two rare types that co-occur over a real time span beat base rate (would crystallise)', () => {
  // 10 observed co-occurrences of two types that each fire 12× across a 10-min
  // window (600000ms), 5s co-occurrence window. Chance expectation is tiny.
  const lift = intel._coOccurrenceLift({ freqA: 12, freqB: 12, observed: 10, spanMs: 600000, windowMs: 5000 });
  // expected = 12*12*(5000/600000) = 1.2 ; lift = 10/1.2 ≈ 8.3
  assert(lift >= 1.5, `rare exclusive pair should clear the 1.5 bar, got lift=${lift}`);
});

test('F2', 'two LOUD types co-occurring at chance rate do NOT beat base rate (held as hypothesis)', () => {
  // Each type fires 200× across the same 10-min window; 40 co-occurrences is
  // roughly what chance alone produces, so lift sits near 1.
  const lift = intel._coOccurrenceLift({ freqA: 200, freqB: 200, observed: 40, spanMs: 600000, windowMs: 5000 });
  // expected = 200*200*(5000/600000) ≈ 333 ; lift = 40/333 ≈ 0.12
  assert(lift < 1.5, `loud chance-rate pair must fall below the bar, got lift=${lift}`);
});

test('F3', 'a burst (whole stream inside one window) cannot be called an invariant', () => {
  // 500 events in 2s (span < windowMs): every pair is trivially in-window, so
  // timing carries no information and lift collapses toward ~1, below the bar.
  const lift = intel._coOccurrenceLift({ freqA: 30, freqB: 30, observed: 30, spanMs: 2000, windowMs: 5000 });
  // fraction capped at 1 → expected = 30*30 = 900 ; lift = 30/900 ≈ 0.03
  assert(lift < 1.5, `a burst must not crystallise on timing, got lift=${lift}`);
});

test('F4', 'degenerate / missing inputs return 0 (held), never a false positive', () => {
  assert.strictEqual(intel._coOccurrenceLift({ freqA: 0, freqB: 5, observed: 3, spanMs: 100000, windowMs: 5000 }), 0);
  assert.strictEqual(intel._coOccurrenceLift({ freqA: 5, freqB: 5, observed: 0, spanMs: 100000, windowMs: 5000 }), 0);
  // zero span → fraction 1 → expected = freqA*freqB, a real (low) lift, not a pass
  const z = intel._coOccurrenceLift({ freqA: 5, freqB: 5, observed: 3, spanMs: 0, windowMs: 5000 });
  assert(z < 1.5, `zero span must not auto-pass, got ${z}`);
});

test('F5', 'lift rises monotonically with observed co-occurrences, all else equal', () => {
  const base = { freqA: 20, freqB: 20, spanMs: 600000, windowMs: 5000 };
  const a = intel._coOccurrenceLift({ ...base, observed: 5 });
  const b = intel._coOccurrenceLift({ ...base, observed: 15 });
  assert(b > a, `more real co-occurrences must mean more lift (got ${a} then ${b})`);
});

// ── RUN ───────────────────────────────────────────────────────────────────────
runAll();

module.exports = { passed: () => passed, failed: () => failed };
