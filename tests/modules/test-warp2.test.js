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
 *   W2-07  an expectation declared with its emit is in place before the handlers run (found by the benchmark, 0.39.324)
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
  e.on('cause', (l, ctx) => ctx.emit('effect', { for: l.data.n }));
  e.emit('cause', { n: 1 }, { root: true, rootReason: 'outside' });
  for (const l of e.ledger.links()) assert.ok(l.causedBy || l.root === true, JSON.stringify(l));
  const effect = e.ledger.links().find(l => l.type === 'effect');
  assert.deepStrictEqual(e.ledger.chain(effect.id).map(l => l.type), ['effect', 'cause']);
  assert.throws(() => e.emit('orphan', {}), /cause/);
  assert.throws(() => e.emit('x', {}, { causedBy: 'l-999' }), /not in the ledger/);
});

test('W2-02', 'unmet in its window → a gap naming both ends; met through a middle link → fulfilled', () => {
  const e = new W.Engine();
  const a = e.emit('cause', {}, { root: true });
  e.expect({ cause: a.link.id, effect: 'effect', within: 2, step: 'effect' });
  e.advance(1); assert.deepStrictEqual(e.residue().gaps, []);
  const gaps = e.advance(2);
  assert.strictEqual(gaps.length, 1);
  assert.strictEqual(gaps[0].cause, a.link.id); assert.strictEqual(gaps[0].missingEffect, 'effect'); assert.strictEqual(gaps[0].step, 'effect');
  const f = new W.Engine();
  f.on('cause', (l, c) => c.emit('middle', {}));
  f.on('middle', (l, c) => c.emit('effect', {}));
  f.expect({ cause: 'cause', effect: 'effect', within: 1 });
  f.emit('cause', {}, { root: true });
  f.advance(5);
  assert.deepStrictEqual(f.residue(), { open: [], gaps: [] });
});

test('W2-03', 'Emerge\'s constraints first: rejected by id, or a gap', () => {
  const max = E.defineConstraint({ id: 'n.at-most-10', needs: ['n'], check: s => s.n <= 10 });
  const e = new W.Engine({ admit: admitFrom([max]) });
  assert.ok(e.emit('cause', { n: 3 }, { root: true }).ok);
  const r = e.emit('cause', { n: 99 }, { root: true });
  assert.strictEqual(r.rejected.constraint, 'n.at-most-10');
  const g = e.emit('cause', {}, { root: true });
  assert.strictEqual(g.gap.missingVariable, 'n');
  assert.strictEqual(e.ledger.links().length, 1, 'only the admitted link is in the ledger');
});

test('W2-04', 'WARP\'s Axiom stays', () => {
  const ax = new W.Axiom('no.negative', { check: (l) => !(l.data.n < 0) });
  const e = new W.Engine({ axioms: [ax] });
  assert.strictEqual(e.emit('cause', { n: -1 }, { root: true }).rejected.axiom, 'no.negative');
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

test('W2-07', 'emit(..., { expect }) — declared before the handlers run', () => {
  const e = new W.Engine();
  e.on('cause', (l, c) => { if (l.data.i !== 2) c.emit('effect', {}); });
  for (let i = 0; i < 4; i++) e.emit('cause', { i }, { root: true, expect: [{ effect: 'effect', within: 1 }] });
  const gaps = e.advance(2);
  assert.strictEqual(gaps.length, 1, 'only the cause that never got its effect');
  assert.strictEqual(e.ledger.link(gaps[0].cause).data.i, 2);
});

console.log(`\n  ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
