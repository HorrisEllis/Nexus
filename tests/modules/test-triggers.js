'use strict';
// §CA2 — triggers/conditions: fire an action WHEN a fan-in event matches, RAID-gated.
const assert = require('assert');
const path = require('path');
let passed = 0, failed = 0;
async function test(id, desc, fn) { try { await fn(); console.log(`  ✓ ${id} ${desc}`); passed++; } catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${e.message}`); failed++; } }
const trig = require(path.join(__dirname, '../..', 'lib/triggers'));
const fanin = require(path.join(__dirname, '../..', 'lib/ledger-fanin'));

(async () => {
  await test('T-001', 'an event-type condition fires when a matching event lands on the fan-in', async () => {
    trig._resetForTest(); trig.start({ skipRestore: true });
    let n = 0;
    trig.registerTrigger({ name: 'a', condition: { type: 'event', matchType: 'test.thing' }, fn: async () => n++ });
    fanin.emit({ type: 'test.thing', source: 'unit-test' });
    await new Promise(r => setTimeout(r, 20));
    assert.strictEqual(n, 1);
  });

  await test('T-002', 'a non-matching event does not fire the trigger', async () => {
    trig._resetForTest(); trig.start({ skipRestore: true });
    let n = 0;
    trig.registerTrigger({ name: 'b', condition: { type: 'event', matchType: 'test.thing' }, fn: async () => n++ });
    fanin.emit({ type: 'test.other', source: 'unit-test' });
    await new Promise(r => setTimeout(r, 20));
    assert.strictEqual(n, 0);
  });

  await test('T-003', 'a prefix condition (sigma.*) matches any sub-type — the relational-field path', async () => {
    trig._resetForTest(); trig.start({ skipRestore: true });
    let seen = [];
    trig.registerTrigger({ name: 'sigma-watch', once: false, maxFires: 5, condition: { type: 'event', matchType: 'sigma.' }, fn: async (row) => seen.push(row.type) });
    fanin.emit({ type: 'sigma.event.halt_risk', source: 'orion' });
    fanin.emit({ type: 'sigma.event.warning', source: 'orion' });
    fanin.emit({ type: 'not.sigma.at.all', source: 'orion' });
    await new Promise(r => setTimeout(r, 20));
    assert.deepStrictEqual(seen, ['sigma.event.halt_risk', 'sigma.event.warning']);
  });

  await test('T-004', 'a metric condition (predicate over the row) fires only when the threshold is crossed', async () => {
    trig._resetForTest(); trig.start({ skipRestore: true });
    let fired = null;
    trig.registerTrigger({ name: 'metric', condition: { type: 'metric', matchType: 'metric.update', predicate: (row) => row.value > 0.8 }, fn: async (row) => { fired = row.value; } });
    fanin.emit({ type: 'metric.update', source: 'unit-test', value: 0.4 });
    fanin.emit({ type: 'metric.update', source: 'unit-test', value: 0.95 });
    await new Promise(r => setTimeout(r, 20));
    assert.strictEqual(fired, 0.95);
  });

  await test('T-005', 'once (default) fires exactly one time even if the condition matches again', async () => {
    trig._resetForTest(); trig.start({ skipRestore: true });
    let n = 0;
    trig.registerTrigger({ name: 'once', condition: { type: 'event', matchType: 'test.thing' }, fn: async () => n++ });
    fanin.emit({ type: 'test.thing', source: 'unit-test' });
    fanin.emit({ type: 'test.thing', source: 'unit-test' });
    fanin.emit({ type: 'test.thing', source: 'unit-test' });
    await new Promise(r => setTimeout(r, 20));
    assert.strictEqual(n, 1, 'a once trigger must disarm after its first fire');
  });

  await test('T-006', 'an armed (once:false) trigger respects maxFires', async () => {
    trig._resetForTest(); trig.start({ skipRestore: true });
    let n = 0;
    trig.registerTrigger({ name: 'armed', once: false, maxFires: 2, condition: { type: 'event', matchType: 'test.thing' }, fn: async () => n++ });
    fanin.emit({ type: 'test.thing', source: 'unit-test' });
    fanin.emit({ type: 'test.thing', source: 'unit-test' });
    fanin.emit({ type: 'test.thing', source: 'unit-test' });
    await new Promise(r => setTimeout(r, 20));
    assert.strictEqual(n, 2, `expected 2, got ${n}`);
  });

  await test('T-007', 'disarmTrigger unsubscribes — no further fires', async () => {
    trig._resetForTest(); trig.start({ skipRestore: true });
    let n = 0;
    const r = trig.registerTrigger({ name: 'to-cancel', once: false, condition: { type: 'event', matchType: 'test.thing' }, fn: async () => n++ });
    trig.disarmTrigger(r.id);
    fanin.emit({ type: 'test.thing', source: 'unit-test' });
    await new Promise(res => setTimeout(res, 20));
    assert.strictEqual(n, 0, 'a disarmed trigger must not fire');
  });

  await test('T-008', 'a throwing action never crashes the engine (§1.2)', async () => {
    trig._resetForTest(); trig.start({ skipRestore: true });
    trig.registerTrigger({ name: 'boom', condition: { type: 'event', matchType: 'test.boom' }, fn: async () => { throw new Error('fail'); } });
    let ok = 0;
    trig.registerTrigger({ name: 'ok', condition: { type: 'event', matchType: 'test.boom' }, fn: async () => ok++ });
    fanin.emit({ type: 'test.boom', source: 'unit-test' });
    await new Promise(r => setTimeout(r, 20));
    assert.strictEqual(ok, 1, 'the good trigger still fired after the bad one threw');
  });

  await test('T-009', 'list + get track triggers', async () => {
    trig._resetForTest(); trig.start({ skipRestore: true });
    const r = trig.registerTrigger({ name: 'tracked', once: false, condition: { type: 'event', matchType: 'test.tracked' }, fn: async () => {} });
    assert.ok(trig.get(r.id));
    assert.ok(trig.list().length >= 1);
    trig.stop();
  });

  await test('T-010', 'a denied action does not run (RAID gate)', async () => {
    trig._resetForTest(); trig.start({ skipRestore: true });
    const sm = require(path.join(__dirname, '../..', 'copilot/lib/self-model'));
    const orig = sm.governAction;
    sm.governAction = () => ({ allowed: false, reason: 'test-deny' });
    let ran = 0;
    trig.registerTrigger({ name: 'blocked', condition: { type: 'event', matchType: 'test.blocked' }, fn: async () => ran++ });
    fanin.emit({ type: 'test.blocked', source: 'unit-test' });
    await new Promise(r => setTimeout(r, 20));
    sm.governAction = orig;
    assert.strictEqual(ran, 0, 'denied trigger must not run');
  });

  console.log(`\n${passed} passed, ${failed} failed`); process.exit(failed ? 1 : 0);
})();
