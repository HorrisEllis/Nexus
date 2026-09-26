'use strict';
/** lib/lenses.js + the two generated-tool surfaces. */
const assert = require('assert');
const path = require('path');
const L = require(path.join(__dirname, '../../lib/lenses.js'));
const CAP = require(path.join(__dirname, '../../lib/agent-tools/tools/coordination/capability-tools.js'));

let passed = 0, failed = 0;
function test(id, name, fn) {
  try { const r = fn(); if (r && r.then) throw new Error('sync test returned a promise'); console.log(`  ✓ ${id} ${name}`); passed++; }
  catch (e) { console.log(`  ✗ ${id} ${name}\n    ${e.message}`); failed++; }
}
async function atest(id, name, fn) {
  try { await fn(); console.log(`  ✓ ${id} ${name}`); passed++; }
  catch (e) { console.log(`  ✗ ${id} ${name}\n    ${e.message}`); failed++; }
}

test('LN-1', 'every lens declares the question it answers', () => {
  const l = L.list();
  assert.ok(l.length >= 5);
  for (const x of l) assert.ok(x.name && x.question, `${x.name} must state its question`);
});

test('LN-2', 'parse refuses empty input by name', () => {
  for (const bad of [undefined, null, '', '   ']) {
    const r = L.parse(bad);
    assert.strictEqual(r.ok, false); assert.ok(r.reason);
  }
});

test('LN-3', 'a lens is FINDING, ABSTAIN, UNAVAILABLE or ERROR — never silently absent', () => {
  const p = L.parse('hello world');
  const VALID = new Set(['FINDING', 'ABSTAIN', 'UNAVAILABLE', 'ERROR']);
  for (const [n, r] of Object.entries(p.readings)) {
    assert.ok(VALID.has(r.status), `${n} returned status "${r.status}"`);
    if (r.status !== 'FINDING') assert.ok(r.reason, `${n} must say why it did not find`);
  }
});

test('LN-4', 'the axiom lens ABSTAINS rather than passing an empty table', () => {
  // The defect it guards: axiom_check returns passed:true with axiomCount 0, so
  // "I added a stub that returns fake data" passes clean. A gate with nothing in
  // it must not report a pass.
  const r = L.parse('anything').readings.axioms;
  if (r.status === 'UNAVAILABLE') assert.ok(/EMPTY|axiomCount/.test(r.reason));
  else assert.notStrictEqual(r.status, 'FINDING');
});

test('LN-5', 'the shape lens catches a swallowed failure', () => {
  const r = L.parse('try { x(); } catch (_) { }').readings.shape;
  assert.strictEqual(r.status, 'FINDING');
  assert.ok(r.markers.some(m => /empty catch/.test(m)));
});

test('LN-6', 'contrast names a SOLE FINDING instead of burying it in a total', () => {
  const c = L.contrast(L.parse('try { x(); } catch (_) { }  // TODO for now'));
  assert.strictEqual(c.ok, true);
  assert.ok(/SOLE FINDING/.test(c.verdict), `got "${c.verdict}"`);
  assert.ok(c.soleFinding && c.soleFinding.lens);
});

test('LN-7', 'contrast reports COVERAGE — a clean verdict from blind lenses is the failure', () => {
  const c = L.contrast(L.parse('nothing notable here'));
  assert.ok(/\d+\/\d+ lenses could see/.test(c.coverage));
  for (const b of c.blindReasons) assert.ok(b.lens && b.reason);
  if (c.blind.length === Object.keys(L.list()).length) assert.ok(/NO READING/.test(c.verdict));
});

(async () => {
  await atest('CAP-1', 'capabilities are GENERATED from the registry, not hand-listed', async () => {
    const r = await CAP.execute({ action: 'list' });
    assert.ok(r.totalServed > 100, `expected 100+ served capabilities, got ${r.totalServed}`);
    assert.ok(Object.keys(r.systems).length > 8, 'expected many systems');
  });

  await atest('CAP-2', 'a declared-but-unserved capability is REFUSED, not called (§1.1)', async () => {
    const u = await CAP.execute({ action: 'unserved' });
    assert.ok(u.count > 0, 'this tree has declared-unserved capabilities');
    const id = u.capabilities[0].id;
    const call = await CAP.execute({ action: 'call', id });
    assert.ok(call.error && /served by nothing/.test(call.error),
      `calling an unserved capability must be refused by name, got: ${JSON.stringify(call).slice(0, 120)}`);
    const d = await CAP.execute({ action: 'describe', id });
    assert.ok(d.warning && /SERVED BY NOTHING/.test(d.warning));
  });

  await atest('CAP-3', 'unserved capabilities are never offered in list', async () => {
    const l = await CAP.execute({ action: 'list', limit: 500 });
    const u = await CAP.execute({ action: 'unserved' });
    const unservedIds = new Set(u.capabilities.map(c => c.id));
    for (const c of l.capabilities) assert.ok(!unservedIds.has(c.id), `${c.id} is unserved but was offered`);
  });

  await atest('CAP-4', 'a missing :param is refused BY NAME, never sent as ":id"', async () => {
    const l = await CAP.execute({ action: 'list', limit: 500 });
    const { rows } = CAP._capabilities();
    const withParam = rows.find(r => r.served && r.path.includes(':'));
    if (!withParam) return;
    const r = await CAP.execute({ action: 'call', id: withParam.id });
    assert.ok(r.error && /needs params/.test(r.error), `got ${JSON.stringify(r).slice(0, 120)}`);
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
