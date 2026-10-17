'use strict';
// CT-01..07 (0.60.134): the template for each system's COS compartment, held by loom.
// James, 2026-10-17: "and you know i mean cos compartment right? make a template for it now that loom holds"
const assert = require('assert'), fs = require('fs'), path = require('path');
require('../../lib/test-sandbox.js').ensure();
const REPO = path.resolve(__dirname, '..', '..');
const T = require('../../loom/templates/cos-compartment.js');
const I = require('../../cos/foundation/intent.js');
let passed = 0, failed = 0; const tests = [];
const test = (n, f) => tests.push([n, f]);

test('CT-01 every system\'s compartment intent is one COS accepts: an end state with a runnable check, conditions, at most five axioms', () => {
  const all = T.compartments();
  assert.ok(all.length >= 10, `${all.length} compartments`);
  for (const m of all) {
    const n = I.normalize(m.cos.intent);
    assert.deepStrictEqual(n.errors, [], `${m.system}: ${n.errors.join('; ')}`);
    assert.ok(m.cos.intent.axioms.length <= I.MAX_AXIOMS);
    assert.strictEqual(m.cos.intent.endState[0].check.kind, 'command');
    assert.strictEqual(m.schema, 'nexus.compartment/2');
  }
});
test('CT-02 the same compartments nexus-self makes (nexus-self-<system> under nexus-self), not a second set', () => {
  const src = fs.readFileSync(path.join(REPO, 'idearium/repo/nexus-self.js'), 'utf8');
  assert.ok(src.includes(`PARENT_COMPARTMENT = '${T.PARENT}'`) && /compName = \(system\) => `\$\{PARENT_COMPARTMENT\}-\$\{system\}`/.test(src));
  const m = T.compartmentFor('cortex');
  assert.deepStrictEqual([m.cos.name, m.cos.parent], ['nexus-self-cortex', 'nexus-self']);
});
test('CT-03 COS verifies the end state for real: nexus-healer (sovereign) meets it, cortex (not yet) does not', () => {
  const ok = I.verify(T.compartmentFor('nexus-healer').cos.intent, REPO);
  assert.deepStrictEqual([ok.endState.met, ok.endState.total], [1, 1], JSON.stringify(ok.endState.results));
  const no = I.verify(T.compartmentFor('cortex').cos.intent, REPO);
  assert.deepStrictEqual([no.endState.met, no.endState.total], [0, 1]);
});
test('CT-04 the seal: ready only when sovereign; until then the blockers are named and its folder is mounted read-only', () => {
  const h = T.compartmentFor('nexus-healer'), c = T.compartmentFor('cortex');
  assert.ok(h.seal.ready && h.mounts[0].mode === 'rw');
  assert.ok(!c.seal.ready && c.mounts[0].mode === 'ro' && c.seal.blockers && (c.seal.blockers.data + c.seal.blockers.primitive + c.seal.blockers.capability) > 0);
  for (const m of [h, c]) assert.deepStrictEqual(m.mounts.map(x => x.path), [`${m.system}/`, 'lib/', 'node_modules/'], 'its folder and the kernel, nothing of another system');
});
test('CT-05 apply writes each intent onto the compartment COS holds, creates none, and says which are missing', () => {
  const calls = [];
  const cos = { getCompartment: (n) => (n === 'nexus-self-cortex' ? { id: 'c1', name: n } : null), setIntent: (id, intent) => { calls.push([id, intent.endState.length]); return { ok: true, dropped: [] }; }, createCompartment: () => { throw new Error('apply must not create'); } };
  const r1 = T.apply({ system: 'cortex', cos });
  assert.ok(r1.ok && r1.applied === 1); assert.deepStrictEqual(calls, [['c1', 1]]);
  const r2 = T.apply({ system: 'loom', cos });
  assert.ok(r2.results[0].said && /ensureCompartments/.test(r2.results[0].said));
});
test('CT-06 loom serves it: the routes, declared in loom\'s registry; the command reaches loom through its own routes', () => {
  const srv = fs.readFileSync(path.join(REPO, 'loom/server.js'), 'utf8');
  assert.ok(srv.includes("p === '/api/compartments/apply'") && srv.includes("p.startsWith('/api/compartments/')") && srv.includes("p === '/api/compartments'"));
  const reg = require('../../loom/registry-components.js');
  for (const [m, p] of [['GET', '/api/compartments'], ['GET', '/api/compartments/:system'], ['POST', '/api/compartments/apply']]) assert.ok(reg.some(r => r.route.method === m && r.route.path === p), `${m} ${p}`);
  const { SPEC } = require('../../idearium/cli/route-commands.js');
  const row = SPEC.find(r => r.key === 'system.compartment');
  assert.deepStrictEqual(row.req({ args: ['cortex'], flags: {} }), { system: 'loom', method: 'GET', path: '/api/compartments/cortex' });
  assert.strictEqual(row.req({ args: [], flags: { apply: true } }).method, 'POST');
});
test('CT-07 the template reaches up into no system (it reads only the kernel), so the ratchet holds', () => {
  const SB = require('../../lib/system-boundary.js');
  const out = SB.scan({ root: REPO }).crossings.filter(c => c.from === 'loom/templates/cos-compartment.js' && c.kind !== 'kernel');
  assert.deepStrictEqual(out, []);
  assert.ok(SB.check({ root: REPO }).ok);
});

(async () => {
  for (const [n, f] of tests) { try { await f(); passed++; console.log(`  ✓ ${n}`); } catch (e) { failed++; console.log(`  ✗ ${n}\n    ${e.message}`); } }
  console.log(`\n  ${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
