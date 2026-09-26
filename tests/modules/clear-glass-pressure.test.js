'use strict';
/**
 * tests/modules/clear-glass-pressure.test.js
 * Tests for getPressure() / getAllPressure() added to
 * clear-glass/src/providers/host.js (2026-06-29).
 *
 * The behaviors that matter: crash escalation is real, decay after 5min
 * is real, a loaded tab with full health has zero pressure, a crashed tab
 * has high pressure regardless of its recorded health score, and the
 * formula caps at 1.0 under any conditions. "Looks right" isn't the bar
 * — these are the failure modes that would silently produce wrong tension
 * values in the relational field if getPressure() returned nonsense.
 */

const assert = require('assert');
let passed = 0, failed = 0;

function test(desc, fn) {
  try { fn(); console.log(`  ✓ ${desc}`); passed++; }
  catch(e) { console.error(`  ✗ ${desc}\n    ${e.message}`); failed++; }
}

// ── Extract the exact getPressure logic for isolation ─────────────────────
// Copied verbatim from host.js — if either changes, the other must too.
function getPressure(st) {
  if (!st) return { pressure: 0, status: 'not-started' };
  const recentCrash = st.lastCrashAt && (Date.now() - st.lastCrashAt) < 300_000;
  const crashEscalation = recentCrash ? Math.min(0.3, (st.crashCount || 0) * 0.1) : 0;
  let pressure;
  if (st.status === 'crashed') pressure = Math.min(1, 0.7 + crashEscalation);
  else if (st.status === 'loaded') pressure = Math.min(1, (1 - (st.health ?? 1)) * 0.6 + crashEscalation);
  else pressure = 0.1 + crashEscalation;
  return { pressure: Number(pressure.toFixed(3)), status: st.status, crashCount: st.crashCount || 0 };
}

const NOW = Date.now();
const FIVE_MIN_AGO = NOW - 300_001; // just outside the decay window

// ── Not-started / unknown ────────────────────────────────────────────────────
test('CGP-01 unknown provider returns pressure 0, not an error', () => {
  const r = getPressure(null);
  assert.strictEqual(r.pressure, 0);
  assert.strictEqual(r.status, 'not-started');
});

// ── Loaded tab — healthy ────────────────────────────────────────────────────
test('CGP-02 loaded tab at full health has zero pressure', () => {
  const r = getPressure({ status: 'loaded', health: 1 });
  assert.strictEqual(r.pressure, 0);
});

test('CGP-03 loaded tab at half health has meaningful pressure', () => {
  const r = getPressure({ status: 'loaded', health: 0.5 });
  assert.ok(r.pressure > 0 && r.pressure < 0.7, `expected 0 < pressure < 0.7, got ${r.pressure}`);
});

test('CGP-04 loaded tab with no health score assumes full health — no false pressure', () => {
  const r = getPressure({ status: 'loaded' });
  assert.strictEqual(r.pressure, 0, 'missing health should not create false pressure');
});

// ── Crashed tab ──────────────────────────────────────────────────────────────
test('CGP-05 crashed tab has pressure >= 0.7 regardless of health score', () => {
  const r = getPressure({ status: 'crashed', health: 1, crashCount: 1, lastCrashAt: NOW });
  assert.ok(r.pressure >= 0.7, `expected >= 0.7, got ${r.pressure}`);
});

test('CGP-06 crash escalation: 3 recent crashes pushes pressure above single-crash baseline', () => {
  const single = getPressure({ status: 'crashed', health: 1, crashCount: 1, lastCrashAt: NOW });
  const triple = getPressure({ status: 'crashed', health: 1, crashCount: 3, lastCrashAt: NOW });
  assert.ok(triple.pressure > single.pressure, `3 crashes (${triple.pressure}) should exceed 1 crash (${single.pressure})`);
});

test('CGP-07 pressure never exceeds 1.0 regardless of crash count', () => {
  const r = getPressure({ status: 'crashed', health: 0, crashCount: 100, lastCrashAt: NOW });
  assert.ok(r.pressure <= 1.0, `pressure ${r.pressure} exceeded 1.0`);
});

// ── Decay after 5 minutes ────────────────────────────────────────────────────
test('CGP-08 crash escalation decays after 5 minutes — loaded tab returns to base pressure', () => {
  const recent = getPressure({ status: 'loaded', health: 1, crashCount: 3, lastCrashAt: NOW });
  const old    = getPressure({ status: 'loaded', health: 1, crashCount: 3, lastCrashAt: FIVE_MIN_AGO });
  assert.ok(recent.pressure > old.pressure, `recent crashes (${recent.pressure}) should produce more pressure than old ones (${old.pressure})`);
  assert.strictEqual(old.pressure, 0, 'fully-healthy loaded tab with old crashes should decay to 0 pressure');
});

test('CGP-09 crashed tab with old crash: escalation decays but base crash pressure remains', () => {
  const r = getPressure({ status: 'crashed', health: 1, crashCount: 5, lastCrashAt: FIVE_MIN_AGO });
  assert.ok(r.pressure >= 0.7, `base crash pressure should persist after decay window, got ${r.pressure}`);
  const fresh = getPressure({ status: 'crashed', health: 1, crashCount: 5, lastCrashAt: NOW });
  assert.ok(fresh.pressure >= r.pressure, 'fresh crashes should have at least as much pressure as old ones');
});

// ── Injected / ambient ────────────────────────────────────────────────────────
test('CGP-10 injected tab has mild ambient pressure — not zero, not high', () => {
  const r = getPressure({ status: 'injected', crashCount: 0 });
  assert.ok(r.pressure > 0 && r.pressure < 0.4, `expected mild ambient (0–0.4), got ${r.pressure}`);
});

// ── crashCount in output ──────────────────────────────────────────────────────
test('CGP-11 crashCount is echoed in output — callers need it for diagnostics', () => {
  const r = getPressure({ status: 'crashed', crashCount: 7, lastCrashAt: NOW });
  assert.strictEqual(r.crashCount, 7);
});

test('CGP-12 crashCount defaults to 0 when missing — no crash history is not the same as unknown', () => {
  const r = getPressure({ status: 'loaded', health: 1 });
  assert.strictEqual(r.crashCount, 0);
});

console.log(`\n  clear-glass-pressure: ${passed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);
