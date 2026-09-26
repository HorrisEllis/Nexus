'use strict';
/**
 * tests/modules/test-diagnostic-heal-path.js — pins the 2026-07-24 fixes to
 * diagnostic/nexus-diagnostic.js's heal path, found while scanning
 * cortex/self-heal ahead of making diagnostic-and-repair sovereign.
 *
 * THREE broken things, all silent, all in the "declared but never worked"
 * class this session keeps surfacing:
 *
 *  1. Phase-3 remediation called escalation.escalate(gap). Wrong module
 *     (escalation.js is the FRICTION LEDGER; the 5-level LADDER is
 *     self-heal/index.js), wrong function (escalate() has never existed on
 *     either), and wrong transport (the ladder is a cortex ORGAN in cortex's
 *     process — a require here would load a second, uninitialised copy with
 *     no bus). It threw TypeError on the first line, every time, inside a
 *     catch(e) that swallowed it.
 *
 *  2. POST /gaps/:uuid/fix emitted HEAL_REQUESTED on THIS process's
 *     nexus-bus and set triggered=true. In-process EventEmitter, ladder in
 *     another process: it reached nobody. Worse, require('../nexus-bus')
 *     never throws, so the catch() fallback that DID work was unreachable
 *     dead code. The UI reported success and healed nothing.
 *
 *  3. scoreTension came from cortex/healer/index.js, which DOES NOT EXIST.
 *     Swallowed by catch(_), so every tension number was the crude
 *     severity fallback while presenting as real scoring.
 *
 * Both heal paths now POST to cortex's /api/event, which writes event_log
 * AND re-emits on cortex's bus where the ladder actually listens — ledger
 * first, satisfying §LAW II.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
let passed = 0, failed = 0;
function test(id, desc, fn) {
  try { fn(); console.log(`  ✓ ${id} ${desc}`); passed++; }
  catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${e.message}`); failed++; }
}

const ROOT = path.join(__dirname, '../..');
const SRC = fs.readFileSync(path.join(ROOT, 'diagnostic/nexus-diagnostic.js'), 'utf8');

test('DHP-001', 'the nonexistent escalation.escalate() call is GONE — it never existed and never worked', () => {
  assert.ok(!/escModule\.escalate\(/.test(SRC), 'escalate() call must be removed');
  assert.ok(!/require\(['"]\.\.\/cortex\/self-heal/.test(SRC),
    'the cross-directory require of cortex internals must be gone — it is also a prerequisite for self-heal becoming sovereign');
});

test('DHP-002', 'escalation.js genuinely has no escalate() — proving the original call could never have worked', () => {
  const esc = require('../../cortex/self-heal/escalation.js');
  assert.strictEqual(typeof esc.escalate, 'undefined',
    'if this ever becomes defined, revisit: the fix assumed the ladder, not the friction ledger, was the intended target');
  assert.ok(typeof esc.recordAttemptOutcome === 'function', 'the real friction-ledger surface is unchanged');
});

test('DHP-003', 'the 5-level ladder is event-driven and lives in cortex — which is why HTTP, not require, is the correct transport', () => {
  const ladder = require('../../cortex/self-heal/index.js');
  assert.strictEqual(typeof ladder._onHealRequested, 'function', 'the ladder entry point is an event handler');
  assert.strictEqual(typeof ladder.escalate, 'undefined', 'the ladder has no direct-call entry either');
  const boot = fs.readFileSync(path.join(ROOT, 'cortex/boot.js'), 'utf8');
  assert.ok(/path: '\.\/self-heal'/.test(boot), 'the ladder must still be registered as a cortex organ');
});

test('DHP-004', 'BOTH heal paths now POST HEAL_REQUESTED to cortex /api/event — ledger-first, and reaching the process the ladder runs in', () => {
  const posts = SRC.match(/type: 'HEAL_REQUESTED'/g) || [];
  assert.strictEqual(posts.length, 3, `all THREE heal dispatch sites must post HEAL_REQUESTED (remediation sweep, /gaps/:uuid/fix route, and system_offline detection); found ${posts.length}`);
  assert.ok(!/bus\.emit\('HEAL_REQUESTED'/.test(SRC),
    'no in-process bus emit may remain — the ladder is in another process, so that reaches nobody');
  assert.ok((SRC.match(/\/api\/event/g) || []).length >= 2, 'both must use the cross-process event route');
});

test('DHP-005', 'cortex /api/event really does re-emit on its own bus — the assumption this fix rests on, verified not assumed', () => {
  const boot = fs.readFileSync(path.join(ROOT, 'cortex/boot.js'), 'utf8');
  const route = boot.slice(boot.indexOf("p === '/api/event'"), boot.indexOf("p === '/api/event'") + 1200);
  assert.ok(/jaaDB\.insert\('event_log'/.test(route), 'must write to the ledger first (§LAW II)');
  assert.ok(/bus\.emit\(row\.type/.test(route), 'must re-emit on cortex\'s bus, or the ladder still never hears it');
});

test('DHP-006', 'a failed heal dispatch is REPORTED, not swallowed, and reports triggered:false honestly', () => {
  assert.ok(/could not reach cortex/.test(SRC), 'the failure must be logged with its reason');
  assert.ok(!/\}\s*catch\(_\)\s*\{\s*\}[\s\S]{0,200}triggered/.test(SRC), 'the failure path must not be an empty catch');
});

test('DHP-007', 'the redundant fallback that retried the SAME failing endpoint is deleted (§16.5)', () => {
  // It could only ever fail again — theatre that made a dead path look guarded.
  const start = SRC.indexOf('let triggered = false;');
  const fixRoute = SRC.slice(start, SRC.indexOf('triggered, gapId', start));
  // Count real fetch CALLS, not mentions: the string also appears in a
  // comment and in an error message. (First draft of this assertion counted
  // all three and failed against correct code — fixed the test, not the code.)
  const calls = fixRoute.match(/await fetch\(`\$\{CORTEX\}\/api\/event`/g) || [];
  assert.strictEqual(calls.length, 1,
    `exactly one call to the endpoint in this route — retrying the identical call is not resilience; found ${calls.length}`);
  assert.ok(/theatre/.test(fixRoute), 'the deletion must be explained where it happened, not silently dropped');
});

test('DHP-008', 'the missing cortex/healer canonical scorer is now LOUD (§1.2), warn-once, instead of a silent crude fallback', () => {
  assert.ok(/_tensionWarned/.test(SRC), 'must warn once rather than per-gap');
  assert.ok(/is MISSING/.test(SRC) && /crude severity fallback/.test(SRC),
    'the log must say the numbers are degraded, not merely that a require failed');
  // And confirm the phantom is genuinely absent, so this test fails loudly if
  // someone adds the module and forgets to remove the warning.
  let exists = true;
  try { require.resolve('../../cortex/healer/index'); } catch (_) { exists = false; }
  assert.strictEqual(exists, false, 'cortex/healer/index.js still does not exist — if it now does, delete the warning and use the real scorer');
});

test('DHP-009', 'intelligence/gap/predicate.js no longer depends on the phantom — the last of the two files this comment named as broken, now fixed to match what §R7 already did for nexus-diagnostic.js on 2026-08-12', () => {
  const pred = fs.readFileSync(path.join(ROOT, 'intelligence/gap/predicate.js'), 'utf8');
  assert.ok(!/cortex\/healer\/index/.test(pred), 'must not still reference the phantom');
  assert.ok(/cortex\/self-heal\/fault-taxonomy/.test(pred), 'must use the real, already-built scorer instead');
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
