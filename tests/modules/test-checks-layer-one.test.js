'use strict';
/**
 * tests/modules/test-checks-layer-one.test.js — QA1's runners built in layer 1 of the gating census (0.60.157).
 * James, 2026-10-13: "gates for everything to reduce workload from agents, checkpoints, and fault and fialure mode mapping" ·
 * 2026-10-18: "need to get them done bottom up. really need it all working."
 * Each runner is checked the way CK-246 asks: a planted defect turns it red, the clean case is green, the real tree answers.
 *
 *   CQ-01  CK-252 every check names its primitive — the real catalogue green; a planted check with none, red
 *   CQ-02  CK-239 every edge has two ends — loom's real registry answers; a wire to a missing hook, red
 *   CQ-03  CK-237 every condition names a machine check — a free-sentence condition, red; a file of real kinds, green
 *   CQ-04  CK-231 nothing stopped half-way — a run idle at 'started', red; ended and waiting runs, green; through Idearium's route
 */
const path = require('path');
const fs = require('fs');
const os = require('os');
const ROOT = path.join(__dirname, '../..');
require(path.join(ROOT, 'lib/test-sandbox.js')).ensure();
const assert = require('assert');

let passed = 0, failed = 0;
async function test(id, desc, fn) {
  try { await fn(); console.log(`  ✓ ${id} ${desc}`); passed++; }
  catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${e.stack ? e.stack.split('\n').slice(0, 5).join('\n    ') : e.message}`); failed++; }
}
const quiet = async (fn) => { const l = console.log, w = console.warn, i = console.info; console.log = () => {}; console.warn = () => {}; console.info = () => {}; try { return await fn(); } finally { console.log = l; console.warn = w; console.info = i; } };

(async () => {
  const CC = require(path.join(ROOT, 'lib/check-catalogue.js'));
  for (const id of ['CK-231', 'CK-237', 'CK-239', 'CK-252']) assert.strictEqual(CC.runnable(id), 'runner', `${id} has a runner`);

  await test('CQ-01', 'CK-252: the real catalogue names a primitive for every check; a planted one without, red', () => {
    const real = CC.run('CK-252', {});
    assert.ok(real.ok && real.evidence.checks > 100, real.reason);
    const R = require(path.join(ROOT, 'lib/checks/ck-252-primitive.js'));
    const bad = R.run({}, { catalogue: { primitives: ['state', 'cause'], checks: [{ id: 'CK-X1', primitive: 'state' }, { id: 'CK-X2' }, { id: 'CK-X3', primitive: 'vibes' }] } });
    assert.deepStrictEqual(bad.items.map(i => i.id), ['CK-X2', 'CK-X3']);
  });

  await test('CQ-02', 'CK-239: loom\'s registry answers; a wire to a missing hook and a hook without its component, red', () => {
    const real = CC.run('CK-239', {});
    assert.strictEqual(real.verifiable, true);
    assert.ok(real.evidence.wires > 1000, JSON.stringify(real.evidence));
    const R = require(path.join(ROOT, 'lib/checks/ck-239-two-ends.js'));
    const reg = { component: { a: { id: 'a' } }, hook: { 'a.export': { id: 'a.export', component_id: 'a' }, 'z.in': { id: 'z.in', component_id: 'z' } }, wire: { w1: { from_hook_id: 'a.export', to_hook_id: 'b.import' } } };
    const r = R.run({}, { registry: reg });
    assert.deepStrictEqual(r.items.map(i => [i.kind, i.missing]).sort(), [['hook', 'z'], ['wire', 'b.import']]);
    assert.strictEqual(R.run({}, { registry: { component: { a: {} }, hook: { h: { component_id: 'a' } }, wire: { w: { from_hook_id: 'h', to_hook_id: 'h' } } } }).ok, true);
  });

  await test('CQ-03', 'CK-237: a free-sentence condition can never be proven, red; machine checks, green; read from a file', () => {
    const R = require(path.join(ROOT, 'lib/checks/ck-237-verifiable.js'));
    const contracts = [{ name: 'c1', payload: { gates: [{ id: 'g1', pass_when: [{ test: 't.js' }, 'it works well', { exists: 'a.js' }] }, { id: 'g2', pass_when: [{ check: 'CK-248' }, { note: 'looks fine' }] }] } }];
    const r = R.run({}, { contracts });
    assert.deepStrictEqual(r.items.map(i => `${i.gate}:${i.condition}`), ['g1:it works well', 'g2:{"note":"looks fine"}']);
    assert.strictEqual(r.evidence.conditions, 5);
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ck237-'));
    const NE = require(path.join(ROOT, 'lib/node-export.js'));
    fs.writeFileSync(path.join(tmp, 'ok.contract'), NE.toYaml(NE.wrap('contract', 'ok', { v: 2, gates: [{ id: 'g', pass_when: [{ gate: 'g0' }, { evidence: 'e' }] }] })));
    const f = CC.run('CK-237', { path: '.' }, { root: tmp });
    assert.ok(f.ok && f.evidence.contracts === 1, f.reason);
    assert.strictEqual(CC.run('CK-237', {}).verifiable, false, 'no contract: unverifiable, never a pass');
  });

  await test('CQ-04', 'CK-231: a run idle half-way, red; ended and waiting runs, green; Idearium hands in the rows', async () => {
    const now = 10 * 60 * 60 * 1000;
    const rows = [
      { runId: 'r1', repoUuid: 'u', map: 'm', phase: 'P1', state: 'started', ts: now - 3 * 60 * 60 * 1000 },
      { runId: 'r2', repoUuid: 'u', map: 'm', phase: 'P2', state: 'started', ts: now - 3 * 60 * 60 * 1000 }, { runId: 'r2', state: 'proven', ts: now - 2 * 60 * 60 * 1000 },
      { runId: 'r3', repoUuid: 'u', map: 'm', phase: 'P3', state: 'started', ts: now - 60 * 1000 },
    ];
    const R = require(path.join(ROOT, 'lib/checks/ck-231-half-states.js'));
    const r = R.run({}, { rows, now });
    assert.deepStrictEqual(r.items.map(i => i.runId), ['r1'], 'only the run that stopped half-way, past its timeout');
    assert.strictEqual(R.run({}, { rows: rows.slice(1), now }).ok, true);
    assert.strictEqual(CC.run('CK-231', {}).verifiable, false, 'no rows: unverifiable, never a pass');
    const api = await quiet(() => import(path.join(ROOT, 'idearium/api/index.js')));
    const via = await quiet(() => api._route('POST', '/api/checks/CK-231/run', {}));
    const d = via.json.data || via.json;
    assert.strictEqual(via.status, 200);
    assert.strictEqual(d.verifiable, true, `the route hands the rows in: ${d.reason}`);
  });

  console.log(`\n  ${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
