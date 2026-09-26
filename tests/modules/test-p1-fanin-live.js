'use strict';
// §P1 nexus-live-mind — the nervous system live. The universal ledger write()
// fans every system's events out to intelligence, autopilot, co-pilot, and
// logging with ONE wire at the chokepoint. Boot wiring connects the consumers.
const assert = require('assert');
const path = require('path');
let passed = 0, failed = 0;
function test(id, desc, fn) {
  try { fn(); console.log(`  ✓ ${id} ${desc}`); passed++; }
  catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${e.message}`); failed++; }
}
const ROOT = path.join(__dirname, '../..');
const fan = require(path.join(ROOT, 'lib/ledger-fanin'));
const ledger = require(path.join(ROOT, 'lib/component-ledger'));
const { wireFanin } = require(path.join(ROOT, 'lib/ledger-fanin/boot'));

test('T-001', 'a write() to the universal ledger fans in to a subscriber', () => {
  fan._resetForTest();
  const got = [];
  fan.subscribe('c', r => got.push(r.type));
  ledger.write({ system: 'guardian', component: 'g.x', action: 'job_done', status: 'ok' });
  assert.ok(got.includes('guardian.job_done'), 'the write reached the fan-in subscriber');
});

test('T-002', 'the source is the SYSTEM (so coverage matches system names)', () => {
  fan._resetForTest();
  let src = null;
  fan.subscribe('c', r => { src = r.source; });
  ledger.write({ system: 'cortex', component: 'cortex.raid', action: 'verify', status: 'ok' });
  assert.strictEqual(src, 'cortex', 'source is the system, not the component');
});

test('T-003', 'boot wiring connects all provided consumers', () => {
  fan._resetForTest();
  const r = wireFanin({ fanin: fan, logWriter: () => {}, onIntelligence: () => {}, onAutopilot: () => {}, onCopilot: () => {} });
  for (const c of ['activity-log', 'intelligence', 'autopilot', 'copilot']) {
    assert.ok(r.wired.includes(c), `${c} wired`);
  }
});

test('T-004', 'one write reaches every wired consumer at once', () => {
  fan._resetForTest();
  const hits = { intel: 0, auto: 0, copilot: 0, log: 0 };
  wireFanin({ fanin: fan, logWriter: () => hits.log++, onIntelligence: () => hits.intel++, onAutopilot: () => hits.auto++, onCopilot: () => hits.copilot++ });
  ledger.write({ system: 'bridge', component: 'b.y', action: 'route', status: 'ok' });
  assert.strictEqual(hits.intel, 1); assert.strictEqual(hits.auto, 1);
  assert.strictEqual(hits.copilot, 1); assert.ok(hits.log >= 1);
});

test('T-005', 'coverage() names systems that have not emitted (the detection gap)', () => {
  fan._resetForTest();
  ledger.write({ system: 'guardian', component: 'g', action: 'x', status: 'ok' });
  const cov = fan.coverage(['guardian', 'cortex', 'loom']);
  assert.deepStrictEqual(cov.missing.sort(), ['cortex', 'loom']);
});

test('T-006', 'an error write reaches error_log via the fan-in → activity-log', () => {
  fan._resetForTest();
  const tables = [];
  wireFanin({ fanin: fan, logWriter: (t) => tables.push(t) });
  ledger.write({ system: 'bridge', component: 'b', action: 'error', status: 'failed' });
  assert.ok(tables.includes('event_log'), 'full activity logged');
  assert.ok(tables.includes('error_log'), 'error also to error_log');
});

test('T-007', 'a fan-in failure never breaks the ledger write (§1.2)', () => {
  fan._resetForTest();
  fan.subscribe('boom', () => { throw new Error('consumer exploded'); });
  const row = ledger.write({ system: 'guardian', component: 'g', action: 'x', status: 'ok' });
  assert.ok(row && row.system === 'guardian', 'write() still returns its row despite a throwing subscriber');
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
