'use strict';
/**
 * tests/modules/test-pulse-watch.test.js — PR1, PR3 (docs/2026-10-05-announce-pulse-repair-phasemap.spec), 0.39.328.
 * James: "need the systems to anounce themselves. that way i can add new systems automatically." ·
 *        "use negative space reasoning for missed heartbeats."
 *
 *   PW-01  a system is known from its first beat — nothing else edited
 *   PW-02  a system that stops beating is a gap naming it and its last beat, within its interval × grace; a late beat clears it
 *   PW-02b one silent system among beating ones (the real case) still becomes a gap
 *   PW-03  a system that was expected and never announced is negative space too, after the boot grace
 *   PW-04  each beat is a WARP 2 link caused by the one before; the ledger is rotated, never grown forever, and the
 *          watch keeps working across a rotation
 *   PW-05  orchestrator's /sse frames parse, split across chunks
 */
const assert = require('assert');
const path = require('path');
const { createPulseWatch, parseSse } = require(path.join(__dirname, '../../lib/pulse-watch.js'));

let passed = 0, failed = 0;
function test(id, desc, fn) {
  try { fn(); console.log(`  ✓ ${id} ${desc}`); passed++; }
  catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${e.stack ? e.stack.split('\n').slice(0, 3).join('\n    ') : e.message}`); failed++; }
}
const clock = () => { let t = 1_000_000_000; return { now: () => t, add: (ms) => { t += ms; } }; };

test('PW-01', 'known from its first beat', () => {
  const c = clock(); const seen = [];
  const w = createPulseWatch({ now: c.now, onAnnounce: (s) => seen.push(s.id) });
  w.beat('brand-new-system', { intervalMs: 10000, port: 4242 });
  assert.deepStrictEqual(seen, ['brand-new-system']);
  assert.ok(w.isOnline('brand-new-system'));
  assert.strictEqual(w.state()[0].port, 4242);
});

test('PW-02', 'stops beating → a gap naming it and its last beat; a late beat clears it', () => {
  const c = clock(); const gaps = [], back = [];
  const w = createPulseWatch({ now: c.now, onGap: (g) => gaps.push(g), onRecover: (r) => back.push(r) });
  w.beat('idearium', { intervalMs: 10000 });
  const last = c.now();
  c.add(14000); w.tick(); assert.strictEqual(gaps.length, 0, 'inside interval × 1.5: one late beat is not a miss');
  c.add(3000); w.tick();
  assert.strictEqual(gaps.length, 1);
  assert.strictEqual(gaps[0].kind, 'missed-heartbeat'); assert.strictEqual(gaps[0].system, 'idearium'); assert.strictEqual(gaps[0].lastBeat, last);
  assert.ok(!w.isOnline('idearium'));
  c.add(5000); w.tick(); assert.strictEqual(gaps.length, 1, 'reported once, not on every tick');
  w.beat('idearium', { intervalMs: 10000 });
  assert.strictEqual(back.length, 1); assert.ok(w.isOnline('idearium'));
});

test('PW-02b', 'one silent system among beating ones still becomes a gap (found end to end)', () => {
  const c = clock(); const gaps = [];
  const w = createPulseWatch({ now: c.now, onGap: (g) => gaps.push(g) });
  w.beat('idearium', { intervalMs: 10000 }); w.beat('loom', { intervalMs: 10000 });
  for (let i = 0; i < 20; i++) { c.add(2000); w.beat('loom', { intervalMs: 10000 }); }   // loom beats, idearium is silent
  w.tick();
  assert.deepStrictEqual(gaps.map(g => g.system), ['idearium']);
  assert.ok(w.isOnline('loom'));
});

test('PW-03', 'expected and never announced → negative space after the boot grace', () => {
  const c = clock(); const gaps = [];
  const w = createPulseWatch({ now: c.now, onGap: (g) => gaps.push(g), bootGraceMs: 60000 });
  w.expect(['guardian', 'cortex']);
  w.beat('guardian', { intervalMs: 10000 });
  for (let i = 0; i < 5; i++) { c.add(10000); w.beat('guardian', { intervalMs: 10000 }); w.tick(); }
  assert.strictEqual(gaps.length, 0, 'inside the boot grace');
  for (let i = 0; i < 2; i++) { c.add(10000); w.beat('guardian', { intervalMs: 10000 }); w.tick(); }
  assert.deepStrictEqual(gaps.map(g => `${g.kind}:${g.system}`), ['never-announced:cortex']);
});

test('PW-04', 'beats are caused links; the ledger rotates and the watch keeps working', () => {
  const c = clock(); const gaps = [];
  const w = createPulseWatch({ now: c.now, onGap: (g) => gaps.push(g), maxLedger: 40 });
  w.beat('a', { intervalMs: 10000 });
  c.add(10000); const second = w.beat('a', { intervalMs: 10000 });
  assert.ok(second.causedBy, 'the second beat is caused by the first');
  for (let i = 0; i < 30; i++) { c.add(10000); w.beat('a', { intervalMs: 10000 }); w.tick(); }
  assert.ok(w.rotations >= 1, 'rotated');
  assert.ok(w.engine.ledger.entries().length <= 45, `bounded: ${w.engine.ledger.entries().length}`);
  c.add(20000); w.tick();
  assert.strictEqual(gaps.length, 1, 'a miss after a rotation is still caught');
});

test('PW-05', '/sse frames parse, split across chunks', () => {
  const a = parseSse('data: {"type":"orchestrator.pulse","systemId":"loom"}\n\ndata: {"type":"orch');
  assert.deepStrictEqual(a.events.map(e => e.systemId), ['loom']);
  const b = parseSse('estrator.pulse","systemId":"cortex"}\n\n', a.carry);
  assert.deepStrictEqual(b.events.map(e => e.systemId), ['cortex']);
});

console.log(`\n  ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
