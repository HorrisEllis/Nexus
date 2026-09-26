'use strict';
/**
 * tests/modules/test-clear-glass-single-instance.js — real regression test
 * for the 2026-07-24 fix: a confirmed genuine second clear-glass instance
 * (requestSingleInstanceLock() failing after one retry) was being treated
 * as FATAL/exit(1) — scary error-level logging for what is Electron's
 * designed, correctly-working singleton-app behavior. The first, legitimate
 * instance's own 'second-instance' handler shows/focuses its window; this
 * second launch's only job is to lose the lock race and exit quietly.
 *
 * §HONEST LIMITATION — same as test-clear-glass-idle-vs-open.js: Electron
 * is not installed in this test environment, so acquireSingleInstanceLockOrExit()
 * cannot be executed directly (it calls the real app.requestSingleInstanceLock()).
 * Verified structurally: the right exit code, the right absence of alarming
 * wording, and the right log content are all confirmed against the real
 * source, not assumed.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
let passed = 0, failed = 0;
function test(id, desc, fn) {
  try { fn(); console.log(`  ✓ ${id} ${desc}`); passed++; }
  catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${e.message}`); failed++; }
}

const SRC_PATH = path.join(__dirname, '../../clear-glass/src/main/index.js');
const src = fs.readFileSync(SRC_PATH, 'utf8');
const fnMatch = src.match(/async function acquireSingleInstanceLockOrExit\s*\([^)]*\)\s*\{[\s\S]*?\n\}/);

test('CGSI-001', 'acquireSingleInstanceLockOrExit() function is found intact', () => {
  assert.ok(fnMatch, 'function body must be locatable for the rest of these checks to mean anything');
});

test('CGSI-002', 'a confirmed genuine second instance exits 0, not 1 — this is not a failure', () => {
  const body = fnMatch[0];
  // The LAST process.exit(N) call in the function is the "confirmed after
  // retry" path (the first requestSingleInstanceLock() call at the top
  // returns true and returns early, never reaching any exit() call).
  const exitCalls = [...body.matchAll(/process\.exit\((\d+)\)/g)].map(m => m[1]);
  assert.strictEqual(exitCalls.length, 1, `expected exactly one process.exit() call in this function, found ${exitCalls.length}`);
  assert.strictEqual(exitCalls[0], '0', 'the confirmed-genuine-second-instance path must exit 0 (success — singleton handoff working as designed), not 1 (implies this process failed)');
});

test('CGSI-003', 'the log message no longer says FATAL — a working singleton handoff is not fatal', () => {
  const body = fnMatch[0];
  const finalLogMatch = body.match(/console\.error\(`[^`]*requestSingleInstanceLock\(\) failed again after retry[^`]*`\)/);
  assert.ok(finalLogMatch, 'the final failure log call must be locatable');
  assert.ok(!/FATAL/.test(finalLogMatch[0]), 'the actual log MESSAGE (not surrounding comments) must not say FATAL — it mischaracterizes normal Electron singleton behavior as a crash');
});

test('CGSI-004', 'the log message still explains WHY (§1.2 — informative, not just quiet) — the 2026-06-30 fix this replaces was about zero-log-output being indistinguishable from a real crash; that must not regress', () => {
  const body = fnMatch[0];
  const finalLogMatch = body.match(/console\.error\(`\[[^`]*requestSingleInstanceLock\(\) failed again after retry[^`]*`\)/);
  assert.ok(finalLogMatch, 'the final failure path must still log something specific, not go silent');
  assert.ok(/second-instance/.test(finalLogMatch[0]), "must explain the 'second-instance' handoff mechanism, not just state a bare fact");
});

test('CGSI-005', 'the retry-once mechanism itself is untouched — still useful for the real autopilot-restart-race case', () => {
  const body = fnMatch[0];
  assert.ok(/LOCK_RETRY_DELAY_MS/.test(body), 'the retry delay must still be used — this fix changes the OUTCOME after a confirmed failure, not whether a retry is attempted first');
  const lockCalls = (body.match(/app\.requestSingleInstanceLock\(\)/g) || []).length;
  assert.strictEqual(lockCalls, 2, 'must still call requestSingleInstanceLock() exactly twice (initial + one retry)');
});

test('CGSI-006', "autopilot's own crash-vs-intentional tracking does not depend on clear-glass's exit code, so this fix cannot break autopilot's circuit breaker either way", () => {
  const autopilotSrc = fs.readFileSync(path.join(__dirname, '../../nexus/autopilot.js'), 'utf8');
  const exitHandlerMatch = autopilotSrc.match(/proc\.on\('exit',\s*\(code,\s*signal\)\s*=>\s*\{[\s\S]*?\n {2}\}\);/);
  assert.ok(exitHandlerMatch, "autopilot.js's proc.on('exit', ...) handler must be locatable");
  const handler = exitHandlerMatch[0];
  assert.ok(/s\.status === 'stopping'/.test(handler) && /s\.status === 'dormant'/.test(handler),
    'crash-vs-intentional must be decided by s.status, not by the exit code — confirms this fix is safe regardless of what code clear-glass itself exits with');
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
