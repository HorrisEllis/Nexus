'use strict';
// Per-system activity + error logging into cortex, riding the ledger fan-in.
// "A full log for each system's activity to save in cortex, error.log, history
// preserved."
const assert = require('assert');
const path = require('path');
let passed = 0, failed = 0;
function test(id, desc, fn) {
  try { fn(); console.log(`  ✓ ${id} ${desc}`); passed++; }
  catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${e.message}`); failed++; }
}
const fan = require(path.join(__dirname, '../..', 'lib/ledger-fanin'));
const log = require(path.join(__dirname, '../..', 'lib/activity-log'));

function harness() {
  fan._resetForTest(); log._resetForTest();
  const w = { event_log: [], error_log: [] };
  log.attach(fan, { writer: (t, r) => { (w[t] = w[t] || []).push(r); } });
  return w;
}

test('T-001', 'every system\'s activity is written to cortex event_log, tagged by system', () => {
  const w = harness();
  fan.emit({ type: 'guardian.job.done', source: 'guardian' });
  fan.emit({ type: 'cortex.gap.found', source: 'cortex' });
  assert.strictEqual(w.event_log.length, 2);
  assert.deepStrictEqual(w.event_log.map(r => r.system).sort(), ['cortex', 'guardian']);
});

test('T-002', 'errors ALSO go to a separate error_log (queryable alone)', () => {
  const w = harness();
  fan.emit({ type: 'bridge.circuit.error', source: 'bridge', payload: { error: 'open' } });
  assert.strictEqual(w.error_log.length, 1, 'the error is in error_log');
  assert.strictEqual(w.event_log.length, 1, 'and still in the full activity log');
  assert.strictEqual(w.error_log[0].level, 'error');
});

test('T-003', 'error detection catches fail/crash/denied/exception too', () => {
  assert.ok(log._isError({ type: 'x.failed' }));
  assert.ok(log._isError({ type: 'raid.denied' }));
  assert.ok(log._isError({ type: 'proc.crash' }));
  assert.ok(log._isError({ type: 'ok.done', payload: { severity: 'high' } }));
  assert.ok(!log._isError({ type: 'guardian.job.done' }));
});

test('T-004', 'per-system enable/disable (James: "enable logging")', () => {
  const w = harness();
  log.disable('guardian');
  fan.emit({ type: 'guardian.x', source: 'guardian' });
  fan.emit({ type: 'cortex.y', source: 'cortex' });
  assert.ok(!w.event_log.some(r => r.system === 'guardian'), 'guardian excluded when disabled');
  assert.ok(w.event_log.some(r => r.system === 'cortex'), 'cortex still logged');
});

test('T-005', 'default is all-systems-on (history preserved for everything)', () => {
  const s = (log._resetForTest(), log.status());
  assert.strictEqual(s.mode, 'all-systems');
});

test('T-006', 'a log-write failure never breaks the emitter (§1.2)', () => {
  fan._resetForTest(); log._resetForTest();
  log.attach(fan, { writer: () => { throw new Error('cortex down'); } });
  assert.doesNotThrow(() => fan.emit({ type: 'guardian.x', source: 'guardian' }), 'emit must not throw even if logging fails');
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
