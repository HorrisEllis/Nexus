'use strict';
/**
 * tests/modules/test-gate-assess.test.js — GA1 (docs/2026-10-15-automatic-tracking-phasemap.spec): the gate assesses
 * before it spends. contract-gates assess / schedule · contract-adapters (requirement.imports, assessment to dispatch).
 * James (2026-10-15): "Yes like gates can asses if dependacies are being met or if context is needed."
 *
 *   GA-01  assess: an export the dependency recorded when it passed, gone from its file, is unmet; present is met; no
 *          recorded exports, or a file that cannot be read, is said and not counted; imported names no dependency provides are "context needed"
 *   GA-02  in a run: an export removed after its brick passed → the dependent brick WAITS (no agent call), the dependency
 *          re-runs, then the dependent runs once and the contract completes
 *   GA-03  no loop: a dependency that keeps losing the export is reopened at most retry_limit times, then the dependent
 *          runs and its own check decides
 *   GA-04  context needed: a brick importing a name nobody exports is NEEDS_CONTEXT, and its executor is handed the names
 *   GA-05  wired: Idearium gives the gate the code as the build sees it and puts the dependencies' code in the brief
 */
require('../../lib/test-sandbox.js').ensure();
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const ROOT = path.join(__dirname, '../..');
const CG = require(path.join(ROOT, 'cortex/core/raid/contract-gates.js'));
const CA = require(path.join(ROOT, 'cortex/core/raid/contract-adapters.js'));

let passed = 0, failed = 0;
async function test(id, desc, fn) {
  try { await fn(); console.log(`  ✓ ${id} ${desc}`); passed++; }
  catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${e.stack ? e.stack.split('\n').slice(0, 8).join('\n    ') : e.message}`); failed++; }
}
const quiet = async (fn) => { const w = console.warn, l = console.log; console.warn = () => {}; console.log = () => {}; try { return await fn(); } finally { console.warn = w; console.log = l; } };
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'nx-ga1-'));
const put = (rel, t) => { fs.mkdirSync(path.dirname(path.join(tmp, rel)), { recursive: true }); fs.writeFileSync(path.join(tmp, rel), t); };
put('docs/x-phasemap.spec', 'phases:\n  P1: { files: [lib/a.js, lib/b.js] }\n');
const contract = (bImports = ['./a.js: x, y']) => CA.fromPhasePlan({ intent: 'two files', conditions: [], order: ['lib/a.js', 'lib/b.js'], files: [
  { path: 'lib/a.js', new: true, layer: 'kernel', exports: [{ name: 'x' }, { name: 'y' }], imports: [], steps: ['export x and y'] },
  { path: 'lib/b.js', new: true, layer: 'engine', exports: [{ name: 'z' }], imports: bImports, steps: ['use x and y'] }] },
  { phaseKey: 'P1', title: 'ga1', inputs: [{ id: 'map', path: 'docs/x-phasemap.spec' }], root: tmp }).payload;
const A_FULL = "'use strict';\nfunction x() {}\nfunction y() {}\nmodule.exports = { x, y };\n";
const A_NO_Y = "'use strict';\nfunction x() {}\nmodule.exports = { x };\n";
const learners = { door: () => {}, friction: () => {} };
const run = (p, executors, onEvent = () => {}) => CG.schedule(p, { root: tmp, executors, learners, onEvent, maxRounds: 30 });

(async () => {
  console.log('\ntest-gate-assess — the gate assesses before it spends (GA1)');

  await test('GA-01', 'assess: unmet / met / unreadable said / context needed', () => {
    const p = contract();
    const b = p.gates.find(g => g.file === 'lib/b.js'), a = p.gates.find(g => g.file === 'lib/a.js');
    assert.deepStrictEqual(b.requirement.imports, ['./a.js: x, y'], 'the plan\'s imports ride on the gate');
    let r = CG.assess(p, b.id, { root: tmp });
    assert.ok(r.ready && r.deps[0].unchecked && /no exports were recorded when it passed — not checked/.test(r.why[0]), 'the plan\'s promise alone is not evidence');
    p.state.evidence[`${a.id}.exports`] = '["x","y"]';
    put('lib/a.js', A_NO_Y);
    r = CG.assess(p, b.id, { root: tmp });
    assert.ok(!r.ready && r.deps[0].missing[0] === 'y' && /no longer exports y/.test(r.why[0]), JSON.stringify(r));
    assert.deepStrictEqual(r.context.needs, ['y']);
    put('lib/a.js', A_FULL);
    r = CG.assess(p, b.id, { root: tmp });
    assert.ok(r.ready && !r.context.needs.length, JSON.stringify(r));
    r = CG.assess(p, b.id, { root: tmp, read: () => null });
    assert.ok(r.ready && r.deps[0].unreadable && /could not be read — not checked/.test(r.why[0]), 'unreadable is said, never counted as unmet');
    assert.strictEqual(CG.assess(p, a.id, { root: tmp }).deps.length, 0, 'a brick with no dependencies has nothing to check');
  });

  await test('GA-02', 'an export removed after its brick passed: the dependent waits, the dependency re-runs, then it runs once', () => quiet(async () => {
    const p = contract(); const calls = []; let removed = false;
    const ex = { agent: async (t, args, { gate }) => {
      calls.push(gate.id);
      if (gate.file === 'lib/a.js') { put('lib/a.js', A_FULL); return { ok: true, agent: 'ollama', evidence: { [`${gate.id}.verified`]: 'ok', [`${gate.id}.exports`]: '["x","y"]' } }; }
      put('lib/b.js', "const { x, y } = require('./a.js');\nmodule.exports = { z: () => x() || y() };\n");
      return { ok: true, agent: 'ollama', evidence: { [`${gate.id}.verified`]: 'ok' } };
    }, integrate: async () => ({ ok: true, evidence: { 'phase.integrated': 'met 1/1' } }) };
    const moves = [];
    const r = await run(p, ex, (e) => { moves.push(`${e.gate}:${e.status}`); if (!removed && e.gate.startsWith('b1') && e.status === 'PASSED') { removed = true; put('lib/a.js', A_NO_Y); } });
    assert.ok(r.complete, JSON.stringify({ why: r.why, moves }));
    const b = p.gates.find(g => g.file === 'lib/b.js').id, a = p.gates.find(g => g.file === 'lib/a.js').id;
    assert.ok(moves.includes(`${b}:WAITING`), moves.join(' '));
    assert.strictEqual(calls.filter(x => x === a).length, 2, 'the dependency re-ran');
    assert.strictEqual(calls.filter(x => x === b).length, 1, 'the dependent spent one call, not a wasted one');
    assert.strictEqual(p.state.evidence[`${a}.reopened`], '1');
    assert.ok(moves.indexOf(`${b}:WAITING`) < moves.lastIndexOf(`${a}:PASSED`), 'waited, then the dependency passed again');
  }));

  await test('GA-03', 'no loop: reopened at most retry_limit times, then the dependent runs and its own check decides', () => quiet(async () => {
    const p = contract(); const calls = [];
    const ex = { agent: async (t, args, { gate }) => {
      calls.push(gate.id);
      if (gate.file === 'lib/a.js') { put('lib/a.js', A_NO_Y); return { ok: true, agent: 'ollama', evidence: { [`${gate.id}.verified`]: 'ok', [`${gate.id}.exports`]: '["x","y"]' } }; }
      return { ok: false, agent: 'ollama', error: 'y is not exported by a.js' };
    }, integrate: async () => ({ ok: true, evidence: { 'phase.integrated': 'met 1/1' } }) };
    const r = await run(p, ex);
    const a = p.gates.find(g => g.file === 'lib/a.js').id, b = p.gates.find(g => g.file === 'lib/b.js').id;
    assert.ok(!r.complete);
    assert.strictEqual(p.state.evidence[`${a}.reopened`], '3', 'reopened retry_limit (3) times');
    assert.strictEqual(calls.filter(x => x === a).length, 4, 'ran once + 3 reopenings, then no more');
    assert.ok(calls.includes(b), 'then the dependent ran, and its own check decided');
  }));

  await test('GA-04', 'context needed: NEEDS_CONTEXT, and the executor is handed the names', () => quiet(async () => {
    const p = contract(['./a.js: x, w']); const handed = []; const moves = [];
    const ex = { agent: async (t, args, { gate, assessment }) => {
      if (gate.file === 'lib/a.js') { put('lib/a.js', A_FULL); return { ok: true, agent: 'ollama', evidence: { [`${gate.id}.verified`]: 'ok', [`${gate.id}.exports`]: '["x","y"]' } }; }
      handed.push(assessment && assessment.context.needs);
      return { ok: true, agent: 'ollama', evidence: { [`${gate.id}.verified`]: 'ok' } };
    }, integrate: async () => ({ ok: true, evidence: { 'phase.integrated': 'met 1/1' } }) };
    const r = await run(p, ex, (e) => moves.push(`${e.gate}:${e.status}`));
    assert.ok(r.complete, JSON.stringify(r.why));
    const b = p.gates.find(g => g.file === 'lib/b.js').id;
    assert.ok(moves.includes(`${b}:NEEDS_CONTEXT`), moves.join(' '));
    assert.deepStrictEqual(handed, [['w']]);
    assert.match(p.state.evidence[`${b}.assessed`], /imports w, which no dependency provides/);
    // and through the agent executor to the dispatcher
    let seen = null;
    const agentEx = CA.agentExecutor({ route: () => [{ provider: 'ollama:qwen' }], boundaries: { budget: () => null }, dispatch: async (hops, ctx) => { seen = ctx.assessment; return { ok: true, provider: 'ollama:qwen' }; } });
    await agentEx('t', {}, { gate: p.gates.find(g => g.id === b), packet: {}, contract: null, assessment: { context: { needs: ['w'] }, deps: [] } });
    assert.deepStrictEqual(seen.context.needs, ['w'], 'the dispatcher gets the assessment');
  }));

  await test('GA-05', 'wired: Idearium hands the gate its code view and the brief carries the dependencies\' code', () => {
    const api = fs.readFileSync(path.join(ROOT, 'idearium/api/index.js'), 'utf8');
    assert.ok(api.includes('assessing: { read: codeOf }'));
    assert.ok(api.includes("const dispatch = async (hops, { gate, assessment = null }) => {"));
    // §GW24 0.60.76 — the dependencies' code goes through PP.contextNote: ranked, cut to the agent's budget, the cut recorded
    assert.ok(api.includes('PP.contextNote({ needs: assessment.context.needs'));
    assert.ok(api.includes('[`${gate.id}.context`]: ctx.summary'));
  });

  fs.rmSync(tmp, { recursive: true, force: true });
  console.log(`\n  ${passed} passed, ${failed} failed`);
  process.exitCode = failed ? 1 : 0;
  setTimeout(() => process.exit(process.exitCode), 50).unref();
})();
