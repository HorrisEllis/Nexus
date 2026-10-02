'use strict';
// The loom phasemap section — loom knows what each system is BECOMING (roadmap),
// not just what it is. James: "consolidate phasemaps, split by system, add to loom."
const assert = require('assert');
const path = require('path');
let passed = 0, failed = 0;
function test(id, desc, fn) { try { fn(); console.log(`  ✓ ${id} ${desc}`); passed++; } catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${e.message}`); failed++; } }
const pm = require(path.join(__dirname, '../..', 'loom/scanners/phasemap-map'));

test('T-001', 'loadAll reads phases across all phasemap specs', () => {
  const all = pm.loadAll();
  assert.ok(all.total > 20, `expected many phases, got ${all.total}`);
  assert.ok(all.maps.length >= 10, 'reads many phasemaps');
});
test('T-002', 'each phase has a status (done/pending/in-progress)', () => {
  const all = pm.loadAll();
  assert.ok(all.phases.every(p => ['done', 'pending', 'in-progress'].includes(p.status)));
  assert.ok(all.phases.some(p => p.status === 'done'), 'some are marked done');
});
test('T-003', 'phases are split by system (LP2)', () => {
  const all = pm.loadAll();
  assert.ok(Object.keys(all.bySystem).length >= 5, 'multiple systems');
  assert.ok(all.bySystem.cortex || all.bySystem.raid, 'core systems present');
});
test('T-004', 'forSystem returns a system roadmap with done/pending counts', () => {
  const r = pm.forSystem('cortex');
  assert.ok(r.total > 0); assert.ok('done' in r && 'pending' in r);
});
test('T-005', 'summary reports the whole roadmap', () => {
  const s = pm.summary();
  assert.ok(s.phases > 20 && s.maps >= 10 && s.text.includes('phases'));
});
// §EV0 (4) 2026-10-02 — E16 "Declared, not guessed" (docs/2026-10-02-emerge-field-memory-build-phasemap.spec)
test('T-006', 'a phase\'s own systems: line wins and is marked declared; without one the prose guess is marked guessed', () => {
  const txt = ['spec:', '  phases:', '    A1_declared:', '      systems: [Warp, cos]', '      does: talks about cortex and guardian', '      status: OPEN',
    '    A2_guessed:', '      does: the cortex and the economy', '      status: OPEN', '    A3_nothing:', '      does: just words', '      status: OPEN'].join('\n');
  const ps = pm.parsePhasemapText(txt, 'm');
  assert.deepStrictEqual([ps[0].systems, ps[0].systemsFrom], [['warp', 'cos'], 'declared'], 'as written, lower-cased; the prose (cortex, guardian) is not added');
  assert.deepStrictEqual([ps[1].systems, ps[1].systemsFrom], [['cortex', 'economy'], 'guessed'], 'economy is a system now');
  assert.deepStrictEqual([ps[2].systems, ps[2].systemsFrom], [['general'], 'guessed']);
  const list = pm.parsePhasemapText(['phases:', '  - id: L1', '    systems: [nexstore]', '    status: built'].join('\n'), 'l');
  assert.deepStrictEqual([list[0].systems, list[0].systemsFrom], [['nexstore'], 'declared'], 'the list form reads it too');
});
test('T-007', 'EV0\'s proof: loom lists the EMERGE map\'s phases under cos and warp; none of them is tagged general', () => {
  const all = pm.loadAll();
  const mine = all.phases.filter(p => /emerge-field-memory-build-phasemap/.test(p.map));
  assert.ok(mine.length > 30, `the map's phases (${mine.length})`);
  assert.ok(mine.every(p => p.systemsFrom === 'declared'), 'every phase of it declares its systems');
  assert.ok(!mine.some(p => p.systems.includes('general')), 'no phase of it is general');
  assert.ok((all.bySystem.cos || []).some(p => p.id === 'EV0_contracts_for_every_system'), 'EV0 under cos');
  assert.ok((all.bySystem.warp || []).some(p => p.id === 'EV0_contracts_for_every_system'), 'EV0 under warp');
});
console.log(`\n${passed} passed, ${failed} failed`); process.exit(failed ? 1 : 0);
