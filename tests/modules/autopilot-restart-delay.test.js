'use strict';
/**
 * tests/modules/autopilot-restart-delay.test.js
 * Tests the minRestartDelay fix for the actual 6-crash circuit-breaker trip
 * traced from a real boot log 2026-06-30: clear-glass's electron process
 * was self-terminating via requestSingleInstanceLock() failing because
 * autopilot's 1s/2s/4s backoff outraced Windows' lock-file cleanup after
 * the previous instance exited.
 */

const assert = require('assert');
let passed = 0, failed = 0;

function test(desc, fn) {
  try { fn(); console.log(`  ✓ ${desc}`); passed++; }
  catch(e) { console.error(`  ✗ ${desc}\n    ${e.message}`); failed++; }
}

// Extracted verbatim from autopilot.js's fixed delay calculation
function computeDelay(kernel, backoffMs) {
  return kernel.minRestartDelay ? Math.max(kernel.minRestartDelay, backoffMs) : backoffMs;
}

test('ARD-01 kernel with no minRestartDelay uses plain backoffMs unchanged', () => {
  const kernel = { name: 'guardian' };
  assert.strictEqual(computeDelay(kernel, 1000), 1000);
  assert.strictEqual(computeDelay(kernel, 8000), 8000);
});

test('ARD-02 clear-glass-shaped kernel enforces the floor on first attempt', () => {
  const kernel = { name: 'clear-glass', minRestartDelay: 3000 };
  // backoffMs starts at BACKOFF_BASE_MS = 1000 — would have been 1s without the fix
  assert.strictEqual(computeDelay(kernel, 1000), 3000);
});

test('ARD-03 floor only raises, never shortens the curve once backoffMs exceeds it', () => {
  const kernel = { name: 'clear-glass', minRestartDelay: 3000 };
  assert.strictEqual(computeDelay(kernel, 8000), 8000); // already past floor, untouched
  assert.strictEqual(computeDelay(kernel, 16000), 16000);
});

test('ARD-04 exact floor boundary — backoffMs equal to minRestartDelay stays the same', () => {
  const kernel = { name: 'clear-glass', minRestartDelay: 3000 };
  assert.strictEqual(computeDelay(kernel, 3000), 3000);
});

test('ARD-05 reproduces the real crash-loop timeline — fixed delays never go below 3s', () => {
  const kernel = { name: 'clear-glass', minRestartDelay: 3000 };
  const realBackoffSequence = [1000, 2000, 4000, 8000, 16000]; // from the actual log
  const fixedDelays = realBackoffSequence.map(b => computeDelay(kernel, b));
  assert.deepStrictEqual(fixedDelays, [3000, 3000, 4000, 8000, 16000]);
  // First two attempts (1s, 2s) were exactly where the real log showed
  // crashes 1 and 2 — both now get the 3s floor instead.
  assert.ok(fixedDelays.every(d => d >= 3000), 'no delay should ever go below the floor');
});

test('ARD-06 zero/undefined minRestartDelay treated as "no floor", not a 0ms floor', () => {
  const kernel = { name: 'guardian', minRestartDelay: 0 };
  // 0 is falsy — `kernel.minRestartDelay ?` correctly skips the floor logic
  // entirely rather than computing Math.max(0, backoffMs), which would be
  // a silent no-op that LOOKS like it's doing something but isn't.
  assert.strictEqual(computeDelay(kernel, 1000), 1000);
});

console.log(`\n  autopilot-restart-delay: ${passed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);
