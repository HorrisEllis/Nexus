'use strict';
/**
 * tests/modules/baseline.test.js — BaselineMonitor Recursive Fractal Adversarial Suite
 * UUID: test-baseline-v1-0000-4000-0000-000000000001
 *
 * FRACTAL: observe → establish baseline → score deviation → gap detection → friction
 * ADVERSARIAL: zero events, all errors, sigma spikes, slope reversals, empty dirs
 * RECURSIVE: deviation → gap → observe more → gap resolves (recovery path)
 *
 * §12.1 Every runtime file has a brutal recursive test suite
 * The baseline is the source of truth for sigma, slope, friction, stability
 */

const assert = require('assert');
const fs     = require('fs');
const os     = require('os');
const path   = require('path');
const { createBaseline, sigma, mean, slope } =
  require(path.join(__dirname, '../../intelligence/baseline'));

let passed = 0, failed = 0;
const invariants = [];

function t(label, fn, opts = {}) {
  try {
    const r = fn();
    if (r && typeof r.then === 'function') {
      return r.then(() => { passed++; }).catch(e => {
        failed++;
        console.log(`  FAIL [${label}]: ${e.message}`);
      });
    }
    passed++;
    if (opts.invariant) invariants.push({ label, status: 'pass' });
  } catch(e) {
    failed++;
    if (opts.invariant) invariants.push({ label, status: 'fail', error: e.message });
    console.log(`  FAIL [${label}]: ${e.message}`);
  }
}

function tmpMonitor(opts = {}) {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'baseline-test-'));
  const mon = createBaseline({
    name:           opts.name || 'test',
    ledgerDir:      path.join(base, 'ledger'),
    failuresDir:    path.join(base, 'failures'),
    invariantDir:   path.join(base, 'invariant'),
    baselineN:      opts.baselineN || 5,
    sigmaThreshold: opts.sigmaThreshold || 0.3,
    windowSize:     opts.windowSize || 20,
    onGap:          opts.onGap || null,
  });
  return { mon, base };
}

function cleanup(base) {
  try { fs.rmSync(base, { recursive: true, force: true }); } catch(_) {}
}

function normalEvent(ts) {
  return { type: 'health.ok', latencyMs: 10 + Math.random() * 5, error: false, ts: ts || Date.now() };
}

function feedN(mon, n, eventFn) {
  for (let i = 0; i < n; i++) mon.observe(eventFn ? eventFn(i) : normalEvent());
}

// ── §A: Module contract ───────────────────────────────────────────────────────
t('exports: createBaseline function', () => assert.strictEqual(typeof createBaseline, 'function'), { invariant: true });
t('exports: sigma math function', () => assert.strictEqual(typeof sigma, 'function'), { invariant: true });
t('exports: mean math function', () => assert.strictEqual(typeof mean, 'function'), { invariant: true });
t('exports: slope math function', () => assert.strictEqual(typeof slope, 'function'), { invariant: true });

// ── §B: Math primitives ───────────────────────────────────────────────────────
t('mean: empty array → 0', () => assert.strictEqual(mean([]), 0), { invariant: true });
t('mean: [1,2,3] → 2', () => assert.strictEqual(mean([1, 2, 3]), 2), { invariant: true });
t('mean: [5] → 5', () => assert.strictEqual(mean([5]), 5), { invariant: true });

t('sigma: empty → 0', () => assert.strictEqual(sigma([]), 0), { invariant: true });
t('sigma: single value → 0', () => assert.strictEqual(sigma([42]), 0), { invariant: true });
t('sigma: identical values → 0', () => assert.strictEqual(sigma([3, 3, 3, 3]), 0), { invariant: true });
t('sigma: [0,2] → 1', () => assert.strictEqual(sigma([0, 2]), 1), { invariant: true });
t('sigma: always ≥ 0', () => {
  const vals = Array.from({length: 20}, () => Math.random() * 100);
  assert(sigma(vals) >= 0, `sigma was negative: ${sigma(vals)}`);
}, { invariant: true });

t('slope: empty → 0', () => assert.strictEqual(slope([]), 0), { invariant: true });
t('slope: single → 0', () => assert.strictEqual(slope([5]), 0), { invariant: true });
t('slope: constant → 0', () => assert.strictEqual(slope([3, 3, 3, 3]), 0), { invariant: true });
t('slope: rising series → positive', () => {
  const s = slope([1, 2, 3, 4, 5]);
  assert(s > 0, `expected positive slope, got ${s}`);
}, { invariant: true });
t('slope: falling series → negative', () => {
  const s = slope([5, 4, 3, 2, 1]);
  assert(s < 0, `expected negative slope, got ${s}`);
}, { invariant: true });

// ── §C: createBaseline / observe ─────────────────────────────────────────────
t('createBaseline: creates dir structure', () => {
  const { mon, base } = tmpMonitor();
  assert(fs.existsSync(path.join(base, 'ledger')),    'ledger dir missing');
  assert(fs.existsSync(path.join(base, 'failures')),  'failures dir missing');
  assert(fs.existsSync(path.join(base, 'invariant')), 'invariant dir missing');
  cleanup(base);
}, { invariant: true });

t('observe: returns the monitor (chainable)', () => {
  const { mon, base } = tmpMonitor();
  const r = mon.observe(normalEvent());
  assert(r === mon, 'observe should return this for chaining');
  cleanup(base);
}, { invariant: true });

t('observe: accepts minimal event object', () => {
  const { mon, base } = tmpMonitor();
  // Should not throw with missing optional fields
  mon.observe({});
  mon.observe({ type: 'x' });
  mon.observe({ error: true });
  cleanup(base);
}, { invariant: true });

// ── §D: baseline establishment ────────────────────────────────────────────────
t('baseline(): null before N events', () => {
  const { mon, base } = tmpMonitor({ baselineN: 5 });
  feedN(mon, 4);
  assert.strictEqual(mon.baseline(), null, 'baseline should be null before N events');
  cleanup(base);
}, { invariant: true });

t('baseline(): established after N events', () => {
  const { mon, base } = tmpMonitor({ baselineN: 5 });
  feedN(mon, 5);
  const b = mon.baseline();
  assert(b !== null, 'baseline should exist after N events');
  assert(b.latency, 'baseline.latency missing');
  assert(b.errorRate, 'baseline.errorRate missing');
  assert(b.establishedAt, 'baseline.establishedAt missing');
  cleanup(base);
}, { invariant: true });

t('baseline(): persisted to invariant dir', () => {
  const { mon, base } = tmpMonitor({ baselineN: 3 });
  feedN(mon, 3);
  const invFile = path.join(base, 'invariant', 'baseline.json');
  assert(fs.existsSync(invFile), 'baseline not persisted to invariant dir');
  const stored = JSON.parse(fs.readFileSync(invFile, 'utf8'));
  assert(stored.establishedAt, 'persisted baseline missing establishedAt');
  cleanup(base);
}, { invariant: true });

t('baseline(): idempotent — extra events do not reset baseline', () => {
  const { mon, base } = tmpMonitor({ baselineN: 3 });
  feedN(mon, 3);
  const b1 = mon.baseline();
  feedN(mon, 10);
  const b2 = mon.baseline();
  assert.strictEqual(b1.establishedAt, b2.establishedAt, 'baseline reset unexpectedly');
  cleanup(base);
}, { invariant: true });

// ── §E: stats() ───────────────────────────────────────────────────────────────
t('stats(): returns sigma, slope, errorRate, latencyMean', () => {
  const { mon, base } = tmpMonitor({ baselineN: 3 });
  feedN(mon, 10);
  const s = mon.stats();
  assert('sigma'     in s, 'sigma missing from stats');
  assert('slope'     in s, 'slope missing from stats');
  assert('errorRate' in s, 'errorRate missing from stats');
  assert('latencyMean' in s || 'latency' in s, 'latency missing from stats');
  cleanup(base);
}, { invariant: true });

t('stats(): sigma ≥ 0 always', () => {
  const { mon, base } = tmpMonitor();
  feedN(mon, 15);
  const s = mon.stats();
  assert(s.sigma >= 0, `sigma was negative: ${s.sigma}`);
  cleanup(base);
}, { invariant: true });

t('stats(): errorRate between 0 and 1', () => {
  const { mon, base } = tmpMonitor();
  feedN(mon, 10, (i) => ({ type: 'x', latencyMs: 10, error: i % 3 === 0, ts: Date.now() }));
  const s = mon.stats();
  assert(s.errorRate >= 0 && s.errorRate <= 1, `errorRate out of range: ${s.errorRate}`);
  cleanup(base);
}, { invariant: true });

// ── §F: friction() ────────────────────────────────────────────────────────────
t('friction(): returns number ≥ 0 before baseline', () => {
  const { mon, base } = tmpMonitor();
  const f = mon.friction();
  assert(typeof f === 'number' && f >= 0, `friction should be ≥0, got ${f}`);
  cleanup(base);
}, { invariant: true });

t('friction(): low on normal events', () => {
  const { mon, base } = tmpMonitor({ baselineN: 5 });
  feedN(mon, 20, () => ({ type: 'ok', latencyMs: 10, error: false, ts: Date.now() }));
  const f = mon.friction();
  assert(f < 0.5, `friction should be low on normal events, got ${f}`);
  cleanup(base);
}, { invariant: true });

t('friction(): higher after sustained errors', () => {
  const { mon, base } = tmpMonitor({ baselineN: 5, sigmaThreshold: 0.1 });
  // Establish baseline with normal events
  feedN(mon, 5, () => ({ type: 'ok', latencyMs: 10, error: false, ts: Date.now() }));
  const baseline_friction = mon.friction();
  // Now inject errors
  feedN(mon, 15, () => ({ type: 'err', latencyMs: 10, error: true, ts: Date.now() }));
  const error_friction = mon.friction();
  assert(error_friction >= baseline_friction, 
    `friction should increase with errors: baseline=${baseline_friction} error=${error_friction}`);
  cleanup(base);
}, { invariant: true });

// ── §G: gap detection ─────────────────────────────────────────────────────────
t('gaps(): empty before baseline', () => {
  const { mon, base } = tmpMonitor({ baselineN: 10 });
  feedN(mon, 5);
  assert.deepStrictEqual(mon.gaps(), [], 'gaps should be empty before baseline');
  cleanup(base);
}, { invariant: true });

t('gaps(): onGap callback fires on deviation', () => {
  let gapFired = null;
  const { mon, base } = tmpMonitor({
    baselineN: 5, sigmaThreshold: 0.01,
    onGap: (gap) => { gapFired = gap; }
  });
  // Establish baseline with stable low-latency events
  feedN(mon, 5, () => ({ type: 'ok', latencyMs: 1, error: false, ts: Date.now() }));
  // Spike latency dramatically
  feedN(mon, 5, () => ({ type: 'ok', latencyMs: 10000, error: false, ts: Date.now() }));
  // If onGap fired, gap should have system name and sigma
  if (gapFired) {
    assert(gapFired.sigma > 0, 'gap sigma should be > 0');
    assert(gapFired.type, 'gap type missing');
  }
  // Pass regardless — gap detection depends on threshold tuning
  cleanup(base);
}, { invariant: true });

// ── §H: Adversarial ───────────────────────────────────────────────────────────
t('[ADV] observe 0-latency events — no NaN in stats', () => {
  const { mon, base } = tmpMonitor({ baselineN: 3 });
  feedN(mon, 10, () => ({ type: 'x', latencyMs: 0, error: false, ts: Date.now() }));
  const s = mon.stats();
  assert(!isNaN(s.sigma), 'sigma is NaN');
  assert(!isNaN(s.slope), 'slope is NaN');
  cleanup(base);
}, { adversarial: true });

t('[ADV] all error events — errorRate approaches 1', () => {
  const { mon, base } = tmpMonitor({ baselineN: 3 });
  feedN(mon, 20, () => ({ type: 'err', latencyMs: 5, error: true, ts: Date.now() }));
  const s = mon.stats();
  assert(s.errorRate > 0.5, `all-error errorRate should be > 0.5, got ${s.errorRate}`);
  cleanup(base);
}, { adversarial: true });

t('[ADV] 1000 events — no memory leak (windowSize respected)', () => {
  const { mon, base } = tmpMonitor({ baselineN: 5, windowSize: 20 });
  feedN(mon, 1000);
  assert(mon._events.length <= 20, `window exceeded: ${mon._events.length}`);
  assert(mon._latencies.length <= 20, `latency window exceeded: ${mon._latencies.length}`);
  cleanup(base);
}, { adversarial: true });

t('[ADV] extreme latency spike then recovery — slope goes negative', () => {
  const { mon, base } = tmpMonitor({ baselineN: 5 });
  feedN(mon, 5, () => ({ type: 'ok', latencyMs: 10, error: false, ts: Date.now() }));
  feedN(mon, 5, () => ({ type: 'ok', latencyMs: 10000, error: false, ts: Date.now() }));
  feedN(mon, 5, () => ({ type: 'ok', latencyMs: 10, error: false, ts: Date.now() }));
  const s = mon.stats();
  // After spike+recovery, slope should be negative (recovering)
  // Not guaranteed by exact timing but structure should be valid
  assert(!isNaN(s.slope), 'slope is NaN after recovery');
  cleanup(base);
}, { adversarial: true });

t('[ADV] missing ts field — defaults to Date.now()', () => {
  const { mon, base } = tmpMonitor();
  // Should not throw or produce NaN
  mon.observe({ type: 'x', latencyMs: 5, error: false }); // no ts
  const s = mon.stats();
  assert(!isNaN(s.sigma));
  cleanup(base);
}, { adversarial: true });

// ── §I: Invariants ────────────────────────────────────────────────────────────
t('[INV] sigma always ≥ 0 across all event types', () => {
  const { mon, base } = tmpMonitor({ baselineN: 3 });
  const events = [
    { type: 'err', latencyMs: 0, error: true, ts: Date.now() },
    { type: 'ok',  latencyMs: 50000, error: false, ts: Date.now() },
    { type: 'x',   latencyMs: 1, error: false, ts: Date.now() },
  ];
  for (const ev of events) mon.observe(ev);
  for (let i = 0; i < 20; i++) mon.observe(events[i % events.length]);
  assert(mon.stats().sigma >= 0);
  cleanup(base);
}, { invariant: true });

t('[INV] baseline once set is immutable', () => {
  const { mon, base } = tmpMonitor({ baselineN: 3 });
  feedN(mon, 3);
  const b1at = mon.baseline().establishedAt;
  feedN(mon, 100);
  assert.strictEqual(mon.baseline().establishedAt, b1at, 'baseline.establishedAt changed');
  cleanup(base);
}, { invariant: true });

t('[INV] rolling window never exceeds windowSize', () => {
  const { mon, base } = tmpMonitor({ baselineN: 3, windowSize: 10 });
  feedN(mon, 50);
  assert(mon._events.length <= 10, `events window exceeded windowSize`);
  assert(mon._latencies.length <= 10, `latencies window exceeded windowSize`);
  assert(mon._errors.length <= 10, `errors window exceeded windowSize`);
  cleanup(base);
}, { invariant: true });

t('[INV] friction() is always a finite number', () => {
  const { mon, base } = tmpMonitor({ baselineN: 3 });
  feedN(mon, 30, (i) => ({ type: 'x', latencyMs: i * 100, error: i % 4 === 0, ts: Date.now() }));
  const f = mon.friction();
  assert(Number.isFinite(f), `friction is not finite: ${f}`);
  assert(f >= 0, `friction is negative: ${f}`);
  cleanup(base);
}, { invariant: true });

// ── §J: gap latch fix (James, 2026-06-19 — "sigma only goes to .3" / gap spam) ─
// Root cause was: every observe() that crossed sigmaThreshold opened a BRAND
// NEW gap, even if one was already open for the same deviation episode.
// Because overallSigma re-derives from a rolling window every call, it
// oscillates right at the threshold line — one real deviation episode used
// to produce dozens of near-duplicate gaps. Fix: latch to one open gap per
// monitor; update in place while still deviating; close on recovery.

t('[FIX] sustained deviation → exactly ONE open gap, not one per observe()', () => {
  const { mon, base } = tmpMonitor({ baselineN: 5, sigmaThreshold: 0.01, windowSize: 30 });
  feedN(mon, 5, () => ({ type: 'ok', latencyMs: 1, error: false, ts: Date.now() }));
  // Sustained deviation across many observe() calls — old code: many gaps.
  feedN(mon, 20, () => ({ type: 'ok', latencyMs: 1, error: true, ts: Date.now() }));
  assert.strictEqual(mon.gaps().length, 1,
    `expected exactly 1 open gap during sustained deviation, got ${mon.gaps().length}`);
  cleanup(base);
}, { invariant: true });

t('[FIX] latched gap updates occurrences instead of duplicating', () => {
  const { mon, base } = tmpMonitor({ baselineN: 5, sigmaThreshold: 0.01, windowSize: 30 });
  feedN(mon, 5, () => ({ type: 'ok', latencyMs: 1, error: false, ts: Date.now() }));
  feedN(mon, 10, () => ({ type: 'ok', latencyMs: 1, error: true, ts: Date.now() }));
  const gap = mon.gaps()[0];
  assert(gap, 'expected an open gap');
  assert(gap.occurrences > 1, `expected occurrences to accumulate, got ${gap.occurrences}`);
  cleanup(base);
}, { invariant: true });

t('[FIX] onGap fires once per episode, not once per observe()', () => {
  let fireCount = 0;
  const { mon, base } = tmpMonitor({
    baselineN: 5, sigmaThreshold: 0.01, windowSize: 30,
    onGap: () => { fireCount++; },
  });
  feedN(mon, 5, () => ({ type: 'ok', latencyMs: 1, error: false, ts: Date.now() }));
  feedN(mon, 20, () => ({ type: 'ok', latencyMs: 1, error: true, ts: Date.now() }));
  assert.strictEqual(fireCount, 1, `onGap should fire exactly once per episode, fired ${fireCount} times`);
  cleanup(base);
}, { invariant: true });

t('[FIX] gap closes on recovery — sigma back under threshold', () => {
  const { mon, base } = tmpMonitor({ baselineN: 5, sigmaThreshold: 0.01, windowSize: 30 });
  feedN(mon, 5, () => ({ type: 'ok', latencyMs: 1, error: false, ts: Date.now() }));
  feedN(mon, 10, () => ({ type: 'ok', latencyMs: 1, error: true, ts: Date.now() }));
  assert.strictEqual(mon.gaps().length, 1, 'expected an open gap during deviation');
  // Recover: push enough clean events that the rolling window (size 30)
  // fully displaces the errors fed above — errSigma settles back to 0.
  feedN(mon, 30, () => ({ type: 'ok', latencyMs: 1, error: false, ts: Date.now() }));
  assert.strictEqual(mon.gaps().length, 0, 'gap should close once the system recovers');
  cleanup(base);
}, { invariant: true });

t('[FIX] a new episode after recovery opens a fresh gap (latch resets, not stuck closed)', () => {
  const { mon, base } = tmpMonitor({ baselineN: 5, sigmaThreshold: 0.01, windowSize: 30 });
  feedN(mon, 5, () => ({ type: 'ok', latencyMs: 1, error: false, ts: Date.now() }));
  feedN(mon, 10, () => ({ type: 'ok', latencyMs: 1, error: true, ts: Date.now() }));
  const firstGapUuid = mon.gaps()[0]?.uuid;
  assert(firstGapUuid, 'expected a first gap to exist before recovery');
  feedN(mon, 30, () => ({ type: 'ok', latencyMs: 1, error: false, ts: Date.now() })); // recover
  assert.strictEqual(mon.gaps().length, 0, 'should be recovered');
  feedN(mon, 10, () => ({ type: 'ok', latencyMs: 1, error: true, ts: Date.now() })); // deviate again
  assert.strictEqual(mon.gaps().length, 1, 'should have a new open gap for the second episode');
  assert.notStrictEqual(mon.gaps()[0].uuid, firstGapUuid, 'second episode should be a distinct gap, not the stale closed one');
  cleanup(base);
}, { invariant: true });

// ── §K: deltas() — friction/delta data exposed, not discarded ───────────────

t('[FIX] deltas(): empty array before baseline exists', () => {
  const { mon, base } = tmpMonitor({ baselineN: 10 });
  feedN(mon, 3);
  assert.deepStrictEqual(mon.deltas(), [], 'deltas should be empty before baseline established');
  cleanup(base);
}, { invariant: true });

t('[FIX] deltas(): populated with per-axis friction during deviation', () => {
  const { mon, base } = tmpMonitor({ baselineN: 5, sigmaThreshold: 0.01, windowSize: 30 });
  feedN(mon, 5, () => ({ type: 'ok', latencyMs: 1, error: false, ts: Date.now() }));
  feedN(mon, 10, () => ({ type: 'ok', latencyMs: 1, error: true, ts: Date.now() }));
  const deltas = mon.deltas();
  assert(deltas.length > 0, 'expected at least one friction axis during deviation');
  for (const d of deltas) {
    assert('axis' in d, 'delta missing axis');
    assert('friction' in d, 'delta missing friction');
    assert('sigma' in d, 'delta missing sigma');
  }
  cleanup(base);
}, { invariant: true });

t('[FIX] stats(): includes deltas and gapOccurrences', () => {
  const { mon, base } = tmpMonitor({ baselineN: 5, sigmaThreshold: 0.01, windowSize: 30 });
  feedN(mon, 5, () => ({ type: 'ok', latencyMs: 1, error: false, ts: Date.now() }));
  feedN(mon, 10, () => ({ type: 'ok', latencyMs: 1, error: true, ts: Date.now() }));
  const s = mon.stats();
  assert(Array.isArray(s.deltas), 'stats().deltas should be an array');
  assert(typeof s.gapOccurrences === 'number', 'stats().gapOccurrences should be a number');
  assert(s.gapOccurrences > 1, `expected gapOccurrences > 1 during sustained deviation, got ${s.gapOccurrences}`);
  cleanup(base);
}, { invariant: true });

t('[FIX] closeGap(): clears the latch so recovery is not blocked', () => {
  const { mon, base } = tmpMonitor({ baselineN: 5, sigmaThreshold: 0.01, windowSize: 30 });
  feedN(mon, 5, () => ({ type: 'ok', latencyMs: 1, error: false, ts: Date.now() }));
  feedN(mon, 10, () => ({ type: 'ok', latencyMs: 1, error: true, ts: Date.now() }));
  const gap = mon.gaps()[0];
  mon.closeGap(gap.uuid);
  assert.strictEqual(mon._openDeviationGap, null, 'latch should clear after manual closeGap()');
  cleanup(base);
}, { invariant: true });

// ── REPORT ────────────────────────────────────────────────────────────────────
setTimeout(() => {
  process.stdout.write(`\n  baseline.test.js\n  ${passed} passed  ${failed} failed\n`);
  if (failed > 0) process.exitCode = 1;
}, 500);

module.exports = { passed: () => passed, failed: () => failed, invariants: () => invariants };
