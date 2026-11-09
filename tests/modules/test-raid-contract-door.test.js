'use strict';
/**
 * tests/modules/test-raid-contract-door.test.js — RAID's executable .contract v2 by Cortex's route (cortex/core/raid/contract-v2-door.js).
 * James, 2026-11-09: "Every. Thing nexus does, end state first, step by step, each gate checks, if it fails becomes a gap to fix to get the pipeline
 * moving again." · "Cortex is the book keeper."
 *   RD2-01  booked (validated, a file in Cortex's books); an agent's refused; a bad id and an invalid payload refused, named; twice refused (409)
 *   RD2-02  evidence moves the contract as far as it goes; a gate is never checked before its evidence (no attempt spent); complete is RAID's
 *   RD2-03  a gate's packet is the smallest context it needs; a gate with two requires splits into children (chunking)
 */
require('../../lib/test-sandbox.js').ensure();
const assert = require('assert'), fs = require('fs'), os = require('os'), path = require('path');
const D = require(path.join(__dirname, '../../cortex/core/raid/contract-v2-door.js'));
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'raid-door-'));
let passed = 0, failed = 0;
async function T(id, d, fn) { try { await fn(); console.log(`  ✓ ${id} ${d}`); passed++; } catch (e) { console.error(`  ✗ ${id} ${d}\n    ${(e.stack || e.message).split('\n').slice(0, 5).join('\n    ')}`); failed++; } }
const H = (m, p, b) => D.handle(m, p, b || {}, { dir });
const P = { outcome: { what: 'two steps' }, refs: { x: { path: 'package.json' }, y: { path: 'VERSION' } },
  gates: [{ id: 'a', type: 'task', depends_on: [], pass_when: [{ evidence: 'step:a' }] }, { id: 'b', type: 'task', depends_on: ['a'], requires: ['x', 'y'], pass_when: [{ evidence: 'step:b' }] }] };
(async () => {
  console.log('\n⬢  RAID: the .contract v2 door\n');
  await T('RD2-01', 'booked, a file in Cortex\'s books; refusals named', async () => {
    const ok = await H('POST', '/api/raid/contracts/v2', { id: 'c1', payload: P, by: 'system:cos' });
    assert.deepStrictEqual([ok.status, ok.json.complete, ok.json.gates.map(g => g.status)], [200, false, ['READY', 'BLOCKED']]);
    assert.ok(fs.existsSync(path.join(dir, 'c1.contract')));
    assert.strictEqual((await H('POST', '/api/raid/contracts/v2', { id: 'c2', payload: P, by: 'agent:copilot' })).status, 403);
    assert.strictEqual((await H('POST', '/api/raid/contracts/v2', { id: 'a b', payload: P })).status, 400);
    const bad = await H('POST', '/api/raid/contracts/v2', { id: 'c3', payload: { outcome: {}, gates: [{ id: 'g', type: 'vibe' }] } });
    assert.strictEqual(bad.status, 400); assert.match(bad.json.error, /outcome.what is required/); assert.match(bad.json.error, /type must be/);
    assert.strictEqual((await H('POST', '/api/raid/contracts/v2', { id: 'c1', payload: P })).status, 409);
  });
  await T('RD2-02', 'evidence moves it as far as it goes; no gate is checked before its evidence; complete is RAID\'s', async () => {
    let r = await H('POST', '/api/raid/contracts/v2/c1/evidence', { key: 'step:a', value: 'met', by: 'system:cos' });
    assert.deepStrictEqual(r.json.gates.map(g => g.status), ['PASSED', 'READY'], 'b waits for its own evidence, no attempt spent');
    r = await H('POST', '/api/raid/contracts/v2/c1/evidence', { key: 'step:b', value: 'met' });
    assert.deepStrictEqual([r.json.gates.map(g => g.status), r.json.complete], [['PASSED', 'PASSED'], true]);
    assert.strictEqual((await H('GET', '/api/raid/contracts/v2/c1')).json.complete, true);
    assert.strictEqual((await H('GET', '/api/raid/contracts/v2/nope')).status, 404);
  });
  await T('RD2-03', 'a gate\'s packet is the smallest context it needs; a gate splits into children', async () => {
    await H('POST', '/api/raid/contracts/v2', { id: 'c4', payload: P, by: 'person' });
    const pk = await H('GET', '/api/raid/contracts/v2/c4/gates/b/packet');
    assert.deepStrictEqual(Object.keys(pk.json.packet).sort(), ['contract', 'gaps', 'gate', 'invariants', 'outcome', 'refs', 'upstream']);
    const sp = await H('POST', '/api/raid/contracts/v2/c4/gates/b/split', { by: 'requires' });
    assert.ok(sp.json.ok, JSON.stringify(sp.json)); assert.ok(sp.json.gates.length > 2, 'b became children');
  });
  fs.rmSync(dir, { recursive: true, force: true });
  console.log(`\n  ${passed} passed, ${failed} failed\n`); process.exit(failed ? 1 : 0);
})();
