'use strict';
require('../../lib/test-sandbox.js').ensure();
/**
 * tests/modules/test-economy-resume.test.js — AB1 (0.60.165).
 * James, 2026-10-19: "fix the economy time out also like retries when the time runs out." · "i dont think it resumes."
 * A build that exhausted ONLY on time-bound holds (a provider economy/rate limit, or no local model fit free RAM) must be
 * retried once the slot frees — but NEVER a run with a real failure. economyHeld is that detector; this proves its safety.
 *
 *   AB-01  an all-transient terminal fail, old enough, is held for retry
 *   AB-02  ANY hard signal (empty/truncated/test-failed/tool-errors/…) → NOT retried, even with a transient row present
 *   AB-03  too recent (slot not yet free) → not held; too old → not resurrected
 *   AB-04  a phase that was built again to a good state since → not held
 *   AB-05  limitFor('economy') is the economy cap; a non-failed/again-good run is ignored
 */
const assert = require('assert');
const RW = require('../../lib/run-watch.js');

let passed = 0, failed = 0;
function test(id, desc, fn) {
  try { fn(); console.log(`  ✓ ${id} ${desc}`); passed++; }
  catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${e.stack ? e.stack.split('\n').slice(0, 4).join('\n    ') : e.message}`); failed++; }
}

const NOW = 1_000_000_000_000;
const old = NOW - 10 * 60 * 1000;   // 10 min ago — older than the 5-min held window
const recent = NOW - 60 * 1000;     // 1 min ago
// a build run: id, phase, a list of [state, extra] rows ending in the terminal row, based at `at`
function run(id, phase, rows, at = old) {
  return rows.map((r, i) => ({ runId: id, phase, repoUuid: 'r1', map: 'm', state: r[0], ...(r[1] || {}), ts: at + i }));
}

test('AB-01', 'an all-transient terminal fail, old enough, is held', () => {
  const rows = [
    ...run('run1', 'SP5', [
      ['building'],
      ['skipped', { memorySkip: true, error: 'not enough memory to load it now — qwen3.5:9b needs ~7.3GB' }],
      ['brick-failed', { failureClass: 'rate-limit', error: 'economy: chatgpt is at its limit — next slot in 299 s' }],
      ['contract-incomplete', { error: 'economy: at its limit' }],
    ]),
  ];
  const held = RW.economyHeld(rows, { now: NOW });
  assert.strictEqual(held.length, 1, JSON.stringify(held));
  assert.strictEqual(held[0].phase, 'SP5');
  assert.strictEqual(held[0].kind, 'build');
});

test('AB-02', 'a hard signal present → never held (safety)', () => {
  const withEmpty = run('run2', 'SP5', [
    ['building'],
    ['brick-failed', { failureClass: 'rate-limit', error: 'economy: next slot in 299 s' }],
    ['brick-failed', { failureClass: 'empty', error: 'nothing came back' }],   // a REAL failure
    ['failed', { error: 'exhausted' }],
  ]);
  assert.strictEqual(RW.economyHeld(withEmpty, { now: NOW }).length, 0, 'empty is a hard failure — not auto-retried');
  for (const hard of ['truncated', 'test-failed', 'tool-errors', 'login', 'lost', 'provider-down', 'timeout', 'unknown']) {
    const rows = run(`run-${hard}`, 'SPx', [['building'], ['brick-failed', { failureClass: 'rate-limit', error: 'next slot in 60 s' }], ['brick-failed', { failureClass: hard }], ['failed']]);
    assert.strictEqual(RW.economyHeld(rows, { now: NOW }).length, 0, `${hard} must block auto-retry`);
  }
});

test('AB-03', 'too recent is not held; too old is not resurrected', () => {
  const rec = run('run3', 'SP5', [['building'], ['failed', { failureClass: 'rate-limit', error: 'next slot in 299 s' }]], recent);
  assert.strictEqual(RW.economyHeld(rec, { now: NOW }).length, 0, 'slot has not had time to free yet');
  const ancient = run('run4', 'SP5', [['building'], ['failed', { failureClass: 'rate-limit', error: 'next slot' }]], NOW - 7 * 3600 * 1000);
  assert.strictEqual(RW.economyHeld(ancient, { now: NOW }).length, 0, 'older than maxAgeMs — not resurrected');
});

test('AB-04', 'a phase built again to a good state since → not held', () => {
  const rows = [
    ...run('run5', 'SP5', [['building'], ['failed', { failureClass: 'rate-limit', error: 'next slot in 299 s' }]], old),
    ...run('run6', 'SP5', [['building'], ['contract-complete']], NOW - 2 * 60 * 1000),   // a later successful run of SP5
  ];
  assert.strictEqual(RW.economyHeld(rows, { now: NOW }).length, 0, 'the phase already succeeded later — do not re-hold');
});

test('AB-05', 'limitFor economy cap; a clean non-failed run is ignored', () => {
  assert.strictEqual(RW.limitFor('economy', (k) => ({ 'repos.economy_retries': 4 }[k])), 4);
  assert.strictEqual(RW.limitFor('economy', () => undefined), 4, 'default economy cap');
  const good = run('run7', 'SP5', [['building'], ['contract-complete']], old);
  assert.strictEqual(RW.economyHeld(good, { now: NOW }).length, 0, 'a success is never held');
});

console.log(`\n  ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
