'use strict';
/**
 * tests/modules/test-context-stream.test.js — GM5 (0.60.156): context found as a SISO stream, not climbed as a ladder.
 * James, 2026-10-18: "it needs to be non linear and agnostic" · "look at siso". Map: docs/2026-10-18-gate-memory-phasemap.spec
 * addendum (b), whose proof this is.
 *
 *   CS-01  three sources answering out of order give the same answer every time; a source with no ask is residue ("absent");
 *          a source that errors is "failed", with its reason
 *   CS-02  the 'model' source is asked only the need no free piece covered, and what is still uncovered is the build
 *   CS-03  a fourth source joins by one row, the finder unchanged; two rows with one signature are a hard error
 *   CS-04  on siso/ (the shared primitive), the note capped and naming what was not found; the real table answers
 *   CS-05  the wiring: every gate's attempt carries the stream's note; the routes, the command rows, the agent's /find
 */
const path = require('path');
const fs = require('fs');
const ROOT = path.join(__dirname, '../..');
require(path.join(ROOT, 'lib/test-sandbox.js')).ensure();
const assert = require('assert');

let passed = 0, failed = 0;
async function test(id, desc, fn) {
  try { await fn(); console.log(`  ✓ ${id} ${desc}`); passed++; }
  catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${e.stack ? e.stack.split('\n').slice(0, 5).join('\n    ') : e.message}`); failed++; }
}
const quiet = async (fn) => { const l = console.log, w = console.warn; console.log = () => {}; console.warn = () => {}; try { return await fn(); } finally { console.log = l; console.warn = w; } };
const later = (ms, v) => new Promise(r => setTimeout(() => r(v), ms));

(async () => {
  const CS = require(path.join(ROOT, 'lib/context-stream.js'));
  const SRC = require(path.join(ROOT, 'lib/context-sources.js'));
  const NEED = ['contract ledger', 'gate reuse', 'lattice neighbours'];
  const fakes = (delays) => [
    { signature: 't.ledger', system: 'test', cost: 'free', kinds: ['causal'], ask: async () => later(delays[0], [{ id: 'L1', text: 'the contract ledger of this gate', score: 0.9 }]) },
    { signature: 't.reuse', system: 'test', cost: 'free', kinds: ['exact'], ask: async () => later(delays[1], [{ id: 'R1', text: 'a gate reuse of a finished reply', score: 0.7 }, { id: 'R2', text: 'unrelated', score: 0.2 }]) },
    { signature: 't.vector', system: 'test', cost: 'free', kinds: ['resembles'], ask: async () => later(delays[2], [{ id: 'V1', text: 'reads like a ledger', score: 0.4 }]) },
    { signature: 't.absent', system: 'test', cost: 'free', kinds: ['reference'], ask: null },
    { signature: 't.broken', system: 'test', cost: 'free', kinds: ['reference'], phase: 'GMx', ask: async () => { throw new Error('nobody there'); } },
  ];
  const only = (rows) => rows.map(r => r.signature);

  await test('CS-01', 'out of order, the same answer; absent is residue; failed says why', async () => {
    const shapes = [];
    for (const d of [[5, 40, 80], [80, 5, 40], [40, 80, 5]]) {
      const rows = fakes(d);
      const r = await CS.find({ text: 'gate context', need: NEED }, { sources: only(rows), extra: rows });
      assert.ok(r.ok);
      shapes.push(JSON.stringify({ ids: r.pieces.map(p => [p.from, p.id, p.score]), covered: r.covered, residue: r.residue }));
      assert.deepStrictEqual(r.residue.absent, ['t.absent'], 'a source with no ask stays in pending — said');
      assert.deepStrictEqual(r.residue.failed.map(f => [f.source, f.why, f.phase]), [['t.broken', 'nobody there', 'GMx']]);
      assert.deepStrictEqual(r.covered, ['contract ledger', 'gate reuse']);
      assert.deepStrictEqual(r.residue.need, ['lattice neighbours']);
      assert.ok(r.pieces.every(p => p.from && p.system === 'test' && p.kind && typeof p.at === 'number'), 'provenance on every piece');
    }
    assert.strictEqual(new Set(shapes).size, 1, 'the arrival order changes nothing');
  });

  await test('CS-02', 'the model is asked only the residue; what is still uncovered is the build', async () => {
    const rows = fakes([1, 1, 1]);
    let modelWasAsked = null;
    const model = { signature: 't.model', system: 'test', cost: 'model', kinds: ['reference'], ask: async (q) => { modelWasAsked = q.need; return [{ id: 'M1', text: 'nothing about it', score: 0.5 }]; } };
    const build = { signature: 't.build', system: 'test', cost: 'build', kinds: [], ask: async () => { throw new Error('a build was asked'); } };
    const r = await CS.find({ text: 'gate context', need: NEED }, { sources: [...only(rows), 't.model', 't.build'], extra: [...rows, model, build] });
    assert.deepStrictEqual(modelWasAsked, ['lattice neighbours'], 'only the uncovered need');
    assert.deepStrictEqual(r.build, ['lattice neighbours'], 'the build would be asked exactly the residue');
    assert.ok(!r.residue.failed.some(f => f.source === 't.build'), 'the finder never builds');
    const all = await CS.find({ text: 'gate context', need: ['contract ledger'] }, { sources: [...only(rows), 't.model'], extra: [...rows, model] });
    assert.ok(!all.asked.some(a => a.source === 't.model'), 'nothing uncovered: the model is not asked at all');
  });

  await test('CS-03', 'a source joins by one row; one signature twice is a hard error', async () => {
    const rows = fakes([1, 1, 1]);
    const fourth = { signature: 't.lattice', system: 'test', cost: 'free', kinds: ['temporal'], ask: async () => [{ id: 'N1', text: 'lattice neighbours of the gate', score: 0.6, kind: 'temporal' }] };
    const r = await CS.find({ text: 'gate context', need: NEED }, { sources: [...only(rows), 't.lattice'], extra: [...rows, fourth] });
    assert.deepStrictEqual(r.residue.need, [], 'the fourth source covered the rest');
    assert.strictEqual(r.pieces.find(p => p.id === 'N1').kind, 'temporal', 'its edge kind travels with the piece');
    assert.throws(() => SRC.rows({ extra: [{ signature: 'atlas', system: 'x', cost: 'free' }] }), /signature collision/);
    const finder = fs.readFileSync(path.join(ROOT, 'lib/context-stream.js'), 'utf8');
    for (const s of SRC.ROWS.map(r => r.signature).filter(x => !['free', 'model', 'build'].includes(x))) assert.ok(!new RegExp(`'${s}'`).test(finder), `the finder does not name '${s}'`);
  });

  await test('CS-04', 'on siso/; the note capped and naming what was not found; the real table answers', async () => {
    const src = fs.readFileSync(path.join(ROOT, 'lib/context-stream.js'), 'utf8');
    assert.ok(/'siso', 'index\.js'/.test(src) && /extends Gate/.test(src) && /new Stream\(/.test(src), 'Event → Gate → Stream, from siso/');
    const rows = fakes([1, 1, 1]);
    const r = await CS.find({ text: 'gate context', need: NEED }, { sources: only(rows), extra: rows });
    const n = CS.note(r, { budget: 200 });
    assert.ok(n.length <= 200 && /^CONTEXT FOUND/.test(n) && /not found: lattice neighbours/.test(n), n);
    assert.strictEqual(CS.note({ ok: true, pieces: [] }), '', 'nothing found: nothing said');
    const real = await quiet(() => CS.find({ text: 'contract ledger per gate' }, { timeoutMs: 1500 }));
    const asked = real.asked.map(a => a.source);
    for (const s of ['atlas', 'components']) assert.ok(asked.includes(s), `${s} was asked`);
    assert.ok(real.residue.absent.includes('agent-tools') || !real.residue.need.length, 'the model row with no ask is residue when it would be asked');
    for (const f of real.residue.failed) assert.ok(f.why.length > 0, `${f.source} says why`);
  });

  await test('CS-05', 'the wiring: the gate carries the note; routes, command rows, the agent\'s /find', () => {
    const api = fs.readFileSync(path.join(ROOT, 'idearium/api/index.js'), 'utf8');
    const a = api.indexOf('const makeAttempt = ('), b = api.indexOf('const makeOnOutcome = (');
    const body = api.slice(a, b);
    assert.ok(/context-stream\.js'\);[\s\S]*CSx\.find\(\{ text: `\$\{phase\}/.test(body), 'the stream is asked once per gate');
    assert.ok(/\+ \(streamNote \? `\\n\\n\$\{streamNote\}` : ''\)/.test(body), 'its note goes in the message');
    for (const r of ["['POST',   ['api','context',  'find'],", "['POST',   ['api','repos',    ':uuid','context','find'],", "['GET',    ['api','context',  'sources'],"]) assert.ok(api.includes(r), r);
    const rc = fs.readFileSync(path.join(ROOT, 'idearium/cli/route-commands.js'), 'utf8');
    assert.ok(rc.includes("key: 'context.find'") && rc.includes("key: 'context.sources'"), 'command rows');
    const ui = fs.readFileSync(path.join(ROOT, 'idearium/ui/js/app.js'), 'utf8');
    assert.ok(/case 'find': \{[\s\S]{0,400}\/context\/find/.test(ui), "the agent's /find");
  });

  console.log(`\n  ${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
