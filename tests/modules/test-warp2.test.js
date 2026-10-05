'use strict';
/**
 * tests/modules/test-warp2.test.js — EM2, 0.39.323 (docs/2026-10-02-emerge-field-memory-build-phasemap.spec).
 * James: "still i want to make warp mine" · "no. i want warp 2" · "next"
 *
 *   W2-01  every link in the ledger has causedBy or root:true; a handler's emits are caused by its link; chain() walks to the root
 *   W2-02  an expectation unmet in its window is a gap naming both ends; one met (even through a middle link) is fulfilled
 *   W2-03  every link passes the constraints first: Emerge's, through warp/adapters/emerge-field.js — rejected by id, or a gap
 *   W2-04  WARP's Axiom stays: a 1.x hard Axiom rejects a link
 *   W2-05  1.x through the adapter: the same results as without it, and every event is a link (parent known, or an unknown-cause root)
 *   W2-06  warp/core's WARP 2 files carry no SISO shape and import nothing outside warp/; the ledger verifies
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '../..');
const W = require(path.join(ROOT, 'warp'));
const { attach } = require(path.join(ROOT, 'warp/adapters/siso-gates.js'));
const { admitFrom } = require(path.join(ROOT, 'warp/adapters/emerge-field.js'));
const E = require(path.join(ROOT, 'emerge/core'));

let passed = 0, failed = 0;
function test(id, desc, fn) {
  try { fn(); console.log(`  ✓ ${id} ${desc}`); passed++; }
  catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${e.stack ? e.stack.split('\n').slice(0, 3).join('\n    ') : e.message}`); failed++; }
}

test('W2-01', 'every link has its cause or is a marked root', () => {
  const e = new W.Engine();
  e.on('order.placed', (l, ctx) => ctx.emit('order.billed', { for: l.data.n }));
  e.emit('order.placed', { n: 1 }, { root: true, rootReason: 'a customer' });
  for (const l of e.ledger.links()) assert.ok(l.causedBy || l.root === true, JSON.stringify(l));
  const billed = e.ledger.links().find(l => l.type === 'order.billed');
  assert.deepStrictEqual(e.ledger.chain(billed.id).map(l => l.type), ['order.billed', 'order.placed']);
  assert.throws(() => e.emit('orphan', {}), /cause/);
  assert.throws(() => e.emit('x', {}, { causedBy: 'l-999' }), /not in the ledger/);
});

test('W2-02', 'unmet in its window → a gap naming both ends; met through a middle link → fulfilled', () => {
  const e = new W.Engine();
  const a = e.emit('order.placed', {}, { root: true });
  e.expect({ cause: a.link.id, effect: 'order.shipped', within: 2, step: 'ship' });
  e.advance(1); assert.deepStrictEqual(e.residue().gaps, []);
  const gaps = e.advance(2);
  assert.strictEqual(gaps.length, 1);
  assert.strictEqual(gaps[0].cause, a.link.id); assert.strictEqual(gaps[0].missingEffect, 'order.shipped'); assert.strictEqual(gaps[0].step, 'ship');
  const f = new W.Engine();
  f.on('order.placed', (l, c) => c.emit('order.packed', {}));
  f.on('order.packed', (l, c) => c.emit('order.shipped', {}));
  f.expect({ cause: 'order.placed', effect: 'order.shipped', within: 1 });
  f.emit('order.placed', {}, { root: true });
  f.advance(5);
  assert.deepStrictEqual(f.residue(), { open: [], gaps: [] });
});

test('W2-03', 'Emerge\'s constraints first: rejected by id, or a gap', () => {
  const max = E.defineConstraint({ id: 'qty.at-most-10', needs: ['qty'], check: s => s.qty <= 10 });
  const e = new W.Engine({ admit: admitFrom([max]) });
  assert.ok(e.emit('order.placed', { qty: 3 }, { root: true }).ok);
  const r = e.emit('order.placed', { qty: 99 }, { root: true });
  assert.strictEqual(r.rejected.constraint, 'qty.at-most-10');
  const g = e.emit('order.placed', {}, { root: true });
  assert.strictEqual(g.gap.missingVariable, 'qty');
  assert.strictEqual(e.ledger.links().length, 1, 'only the admitted link is in the ledger');
});

test('W2-04', 'WARP\'s Axiom stays', () => {
  const ax = new W.Axiom('no.negative', { check: (l) => !(l.data.qty < 0) });
  const e = new W.Engine({ axioms: [ax] });
  assert.strictEqual(e.emit('order.placed', { qty: -1 }, { root: true }).rejected.axiom, 'no.negative');
});

test('W2-05', '1.x through the adapter: unchanged, and every event a link', () => {
  const build = () => {
    const s = new W.Stream({ log: new W.StreamLog() });
    s.register(new W.Gate('ring:push', { transform: (ev) => new W.Event('ring:pushed', { v: ev.data.v }) }));
    return s;
  };
  const plain = build(); plain.emit(new W.Event('ring:push', { v: 1 })); plain.emit(new W.Event('loose', {}));
  const s = build(); const e = new W.Engine(); const detach = attach(s, e);
  s.emit(new W.Event('ring:push', { v: 1 })); s.emit(new W.Event('loose', {}));
  assert.deepStrictEqual(s.pending.map(x => x.type), plain.pending.map(x => x.type), '1.x results unchanged');
  assert.strictEqual(s.log.entries().length, plain.log.entries().length);
  const links = e.ledger.links();
  assert.deepStrictEqual(links.map(l => l.type), ['ring:push', 'ring:pushed', 'loose']);
  assert.strictEqual(links[1].causedBy, links[0].id, 'the parent the 1.x Stream knew, recorded');
  assert.ok(links[0].root && /cause unknown/.test(links[0].rootReason));
  detach(); s.emit(new W.Event('after', {})); assert.strictEqual(e.ledger.links().length, 3, 'detached');
});

test('W2-06', 'WARP 2\'s core files: no SISO shape, nothing from outside warp/, a verifying ledger', () => {
  for (const f of ['Link.js', 'Expectation.js', 'Ledger.js', 'Engine.js']) {
    const src = fs.readFileSync(path.join(ROOT, 'warp/core', f), 'utf8').replace(/\/\/.*$/gm, '');
    assert.ok(!/\b(Gate|Stream|StreamLog|Event)\b/.test(src), `${f} carries SISO's shape`);
    for (const m of src.matchAll(/require\('([^']+)'\)/g)) assert.ok(m[1].startsWith('./'), `${f} requires ${m[1]}`);
  }
  const e = new W.Engine(); e.emit('a', {}, { root: true }); e.expect({ cause: 'a', effect: 'b', within: 1 }); e.advance(3);
  assert.deepStrictEqual(e.ledger.verify(), { ok: true, brokenAt: null });
});

console.log(`\n  ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
