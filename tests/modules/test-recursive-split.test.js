'use strict';
/**
 * tests/modules/test-recursive-split.test.js — BR2 (docs/2026-10-15-one-contract-raid-releases-phasemap.spec): splitting
 * recursively, to a depth bound. contract-gates unitsOf / depthOf / split({ by: 'units' }) / schedule({ depth }) ·
 * lib/checks/ck-247-decomposition.js.
 * James: "we added gating and chunking recursively, dynamically, like bricks" · "yes" (to recursion deeper than one level).
 *
 *   RS-01  the steps inside one action are read out (';', sentences, list items, 'then'); depth counts the splits
 *   RS-02  a brick fails twice → split by its actions (depth 1); a piece that still fails twice → split again by the steps
 *          inside it (depth 2); each piece runs alone and the whole passes through its parents' integration
 *   RS-03  at the depth bound a piece is not split again — it says so, once (indivisible), and is not looped on
 *   RS-04  never the same pieces again: a units split equal to the pieces it came from is refused
 *   RS-05  CK-247 runs: green on a contract split within its bound; red on a planted gate past the bound and on a
 *          re-split of the same pieces; a contract gate can name it ({ check: CK-247, path })
 */
require('../../lib/test-sandbox.js').ensure();
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const ROOT = path.join(__dirname, '../..');
const CG = require(path.join(ROOT, 'cortex/core/raid/contract-gates.js'));
const CC = require(path.join(ROOT, 'lib/check-catalogue.js'));
const NE = require(path.join(ROOT, 'lib/node-export.js'));
const saveP = (f, p) => CG.save(f, { doc: NE.wrap('contract', p.uuid, p, { context: 'test' }), payload: p });

let passed = 0, failed = 0;
async function test(id, desc, fn) {
  try { await fn(); console.log(`  ✓ ${id} ${desc}`); passed++; }
  catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${e.stack ? e.stack.split('\n').slice(0, 4).join('\n    ') : e.message}`); failed++; }
}
const quiet = async (fn) => { const w = console.warn, l = console.log; console.warn = () => {}; console.log = () => {}; try { return await fn(); } finally { console.warn = w; console.log = l; } };
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'nx-br2-'));

// one brick with two actions; the second action holds three steps
const contract = () => ({ v: 2, uuid: 'br2', outcome: { what: 'notes', done_when: [{ gate: 'b1' }] }, refs: {}, invariants: [], gaps: [], failure: { retry_limit: 3 },
  gates: [{ id: 'b1', type: 'task', kind: 'build:file.js', file: 'lib/notes.js', depends_on: [], requires: [],
    actions: ['export add and list', 'store notes in memory; validate the text. Then return ok'], pass_when: [{ evidence: 'b1.verified', match: '^ok' }], run: { agent: 'lib/notes.js' } }],
  state: { gates: {}, evidence: {}, checkpoints: [] } });

// an executor that fails any piece holding more than one step, and passes single steps; a split parent re-verifies
function executor(seen) {
  return async (target, args, { gate }) => {
    seen.push(gate.id);
    if ((gate.children || []).length) return { ok: true, agent: 'verify', evidence: { [`${gate.id}.verified`]: 'ok', [`${gate.id}.integrated`]: 'ok — assembled' } };
    const a = String((gate.actions || [])[0] || '');
    const steps = CG.unitsOf({ actions: [a] });
    if ((gate.actions || []).length > 1 || steps) return { ok: false, agent: 'ollama', error: 'the export add is missing' };
    return { ok: true, agent: 'ollama', evidence: { [`${gate.id}.verified`]: 'ok', [`${gate.id}.done`]: 'yes' } };
  };
}

(async () => {
  console.log('\ntest-recursive-split — splitting recursively, to a depth (BR2)');

  await test('RS-01', 'the steps inside one action; depth counts the splits', () => {
    assert.deepStrictEqual(CG.unitsOf({ actions: ['store notes in memory; validate the text. Then return ok'] }), ['store notes in memory', 'validate the text', 'return ok']);
    assert.deepStrictEqual(CG.unitsOf({ actions: ['- read the file\n- parse it\n- write the index'] }), ['read the file', 'parse it', 'write the index']);
    assert.strictEqual(CG.unitsOf({ actions: ['export add'] }), null);
    assert.strictEqual(CG.unitsOf({ actions: ['a; b', 'c'] }), null, 'only a single action has units');
    const p = contract(); CG.split(p, 'b1', { by: 'actions' });
    assert.strictEqual(CG.depthOf(p, p.gates.find(g => g.id === 'b1.2')), 1);
  });

  await test('RS-02', 'fails twice → its actions (depth 1) → a piece fails twice → its steps (depth 2) → the whole passes', () => quiet(async () => {
    const p = contract(); const seen = [];
    const r = await CG.schedule(p, { root: tmp, executors: { agent: executor(seen) }, learners: { door: () => {}, friction: () => {} }, maxRounds: 40, depth: 3 });
    assert.ok(r.complete, JSON.stringify({ why: r.why, log: r.log.map(l => `${l.gate}:${l.status}`) }));
    const splits = r.log.filter(l => l.status === 'SPLIT').map(l => l.gate);
    assert.deepStrictEqual(splits, ['b1', 'b1.2'], JSON.stringify(r.log.map(l => `${l.gate}:${l.status}`)));
    assert.ok(p.gates.some(g => g.id === 'b1.2.3' && g.actions[0] === 'return ok' && CG.depthOf(p, g) === 2));
    assert.ok(seen.includes('b1.2.1') && seen.includes('b1.2.3'), 'each step ran on its own');
    assert.strictEqual(p.state.gates.b1.status, 'PASSED'); assert.strictEqual(p.state.gates['b1.2'].status, 'PASSED');
  }));

  await test('RS-03', 'at the depth bound: not split again, said once, not looped on', () => quiet(async () => {
    const p = contract(); const seen = [];
    const r = await CG.schedule(p, { root: tmp, executors: { agent: executor(seen) }, learners: { door: () => {}, friction: () => {} }, maxRounds: 40, depth: 1 });
    assert.ok(!r.complete);
    assert.ok(!p.gates.some(g => /^b1\.2\.\d+$/.test(g.id)), 'no depth-2 pieces');
    assert.match(p.state.evidence['b1.2.indivisible'], /at the depth bound \(1\)/);
    assert.strictEqual(r.log.filter(l => l.gate === 'b1.2' && l.status === 'INDIVISIBLE').length, 1, 'said once');
    assert.ok(seen.filter(x => x === 'b1.2').length <= 3, 'retried within its retry_limit (3), not looped');
  }));

  await test('RS-04', 'never the same pieces again (CK-247)', () => {
    const p = contract(); CG.split(p, 'b1', { by: 'actions' });
    assert.throws(() => CG.split(p, 'b1.1', { by: 'units', units: ['export add and list'] }), /the pieces it already is/);
  });

  await test('RS-05', 'CK-247 runs: green within the bound; red past it and on a re-split; a gate can name it', () => quiet(async () => {
    const p = contract();
    await CG.schedule(p, { root: tmp, executors: { agent: executor([]) }, learners: { door: () => {}, friction: () => {} }, maxRounds: 40, depth: 3 });
    const ok = path.join(tmp, 'ok.contract'); saveP(ok, p);
    const g = CC.run('CK-247', { path: ok, depth: 3 }, { root: tmp });
    assert.ok(g.ok && g.evidence.splits === 2, JSON.stringify(g));
    const red = CC.run('CK-247', { path: ok, depth: 1 }, { root: tmp });
    assert.ok(!red.ok && red.items.some(i => /depth 2 is past the bound 1/.test(i.problem)), JSON.stringify(red));
    const q = contract(); CG.split(q, 'b1', { by: 'actions' });
    const c1 = q.gates.find(x => x.id === 'b1.1'); c1.actions = [...q.gates.find(x => x.id === 'b1').actions];   // planted: a child that is its parent's pieces
    CG.split(q, 'b1.1', { by: 'actions' });
    const bad = path.join(tmp, 'bad.contract'); saveP(bad, q);
    const rr = CC.run('CK-247', { path: bad }, { root: tmp });
    assert.ok(!rr.ok && rr.items.some(i => /re-split/.test(i.problem)), JSON.stringify(rr));
    const cond = CG.checkCondition({ check: 'CK-247', path: ok }, { root: tmp, state: { evidence: {}, gates: {} }, runTest: () => ({ code: 0 }) });
    assert.ok(cond.ok, JSON.stringify(cond));
  }));

  fs.rmSync(tmp, { recursive: true, force: true });
  console.log(`\n  ${passed} passed, ${failed} failed`);
  process.exitCode = failed ? 1 : 0;
})();
