'use strict';
// The ledger fan-in — every system + intelligence + autopilot + co-pilot read
// the same unified event stream. Solves "every system and the intelligence
// system needs to read the SSE and event ledger" + surfaces detection gaps.
const assert = require('assert');
const path = require('path');
let passed = 0, failed = 0;
function test(id, desc, fn) {
  try { fn(); console.log(`  ✓ ${id} ${desc}`); passed++; }
  catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${e.message}`); failed++; }
}
const fan = require(path.join(__dirname, '../..', 'lib/ledger-fanin'));

test('T-001', 'every consumer sees EVERY system\'s events through one subscription', () => {
  fan._resetForTest();
  const seen = { intel: 0, auto: 0, copilot: 0 };
  fan.subscribe('intelligence', () => seen.intel++);
  fan.subscribe('autopilot', () => seen.auto++);
  fan.subscribe('copilot', () => seen.copilot++);
  for (const sys of ['guardian', 'cortex', 'bridge', 'loom', 'idearium']) fan.emit({ type: 'e', source: sys });
  assert.strictEqual(seen.intel, 5, 'intelligence sees all 5');
  assert.strictEqual(seen.auto, 5, 'autopilot sees all 5');
  assert.strictEqual(seen.copilot, 5, 'copilot sees all 5');
});

test('T-002', 'coverage() names systems that are SILENT (the detection gap James sensed)', () => {
  fan._resetForTest();
  for (const sys of ['guardian', 'cortex']) fan.emit({ type: 'e', source: sys });
  const cov = fan.coverage(['guardian', 'cortex', 'orchestrator', 'architect']);
  assert.deepStrictEqual(cov.missing.sort(), ['architect', 'orchestrator'], 'silent systems are named');
  assert.strictEqual(cov.feeding.length, 2);
});

test('T-003', 'a throwing subscriber is isolated — the fan-out continues (§1.2)', () => {
  fan._resetForTest();
  let good = 0;
  fan.subscribe('bad', () => { throw new Error('boom'); });
  fan.subscribe('good', () => good++);
  fan.emit({ type: 'e', source: 'guardian' });
  assert.strictEqual(good, 1, 'the good subscriber still received despite the bad one throwing');
});

test('T-004', 'subscribe is idempotent by id (re-subscribing does not double-deliver)', () => {
  fan._resetForTest();
  let n = 0;
  fan.subscribe('x', () => n++);
  fan.subscribe('x', () => n++);   // same id — replaces, not adds
  fan.emit({ type: 'e', source: 'guardian' });
  assert.strictEqual(n, 1, 'one delivery, not two');
});

test('T-005', 'replay delivers the ring buffer so a late subscriber starts caught-up (§0.3)', () => {
  fan._resetForTest();
  for (const sys of ['guardian', 'cortex', 'bridge']) fan.emit({ type: 'e', source: sys });
  let caught = 0;
  fan.subscribe('late', () => caught++, { replay: true });
  assert.strictEqual(caught, 3, 'the late subscriber replayed the 3 prior events');
});

test('T-006', 'bridgeLedger connects an existing per-system ledger without replacing its onEvent', () => {
  fan._resetForTest();
  let localGot = 0, faninGot = 0;
  const fakeLedger = { onEvent: () => localGot++ };
  fan.bridgeLedger(fakeLedger, 'guardian');
  fan.subscribe('c', () => faninGot++);
  fakeLedger.onEvent({ type: 'e', source: 'guardian' });   // simulate a record
  assert.strictEqual(localGot, 1, 'the ledger\'s own onEvent still fires');
  assert.strictEqual(faninGot, 1, 'and it also reaches the fan-in');
});

test('T-007', 'a filter narrows what a consumer receives', () => {
  fan._resetForTest();
  let tensions = 0;
  fan.subscribe('intel', () => tensions++, { filter: r => r.type === 'delta.tension' });
  fan.emit({ type: 'job.done', source: 'guardian' });
  fan.emit({ type: 'delta.tension', source: 'guardian' });
  assert.strictEqual(tensions, 1, 'only the tension event matched the filter');
});

test('T-008', 'emit rejects an event with no type (§1.2 stated, not silent)', () => {
  fan._resetForTest();
  const r = fan.emit({ source: 'guardian' });
  assert.strictEqual(r.ok, false);
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
