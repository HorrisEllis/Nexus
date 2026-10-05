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
// §0.39.314 SY1 — James: "There is only 15 systems. Not 27. Any system that's in idearium is a system, nothing more."
// What T-006/T-007 pinned before (warp, cos, economy, nexstore, general as systems) is superseded: every tag resolves to
// one of lib/nexus-self/systems.js's 15, and the tag as written is kept as `tags`.
// §0.39.341 SY2 — James: "cos needs to be a nested compartment" · asked where: "Its own system (16th)". cos is a system;
// "only the 15" is now "only the systems in systems.js" (16).
test('T-006', 'a phase\'s own systems: line wins and is marked declared; every tag resolves to a system; the written tags are kept', () => {
  const txt = ['spec:', '  phases:', '    A1_declared:', '      systems: [Warp, cos, raid]', '      does: talks about cortex and guardian', '      status: OPEN',
    '    A2_guessed:', '      does: the cortex and the economy', '      status: OPEN', '    A3_nothing:', '      does: just words', '      status: OPEN'].join('\n');
  const ps = pm.parsePhasemapText(txt, 'm');
  assert.deepStrictEqual([ps[0].systems, ps[0].tags, ps[0].systemsFrom], [['core', 'cos', 'cortex'], ['warp', 'cos', 'raid'], 'declared'],
    'warp is core\'s directory, cos is its own system (SY2), raid is cortex\'s; the prose (cortex, guardian) is not added');
  assert.deepStrictEqual([ps[1].systems, ps[1].systemsFrom], [['cortex'], 'guessed'], 'economy is not a system');
  assert.deepStrictEqual([ps[2].systems, ps[2].systemsFrom], [['core'], 'guessed'], 'nothing named → core (was "general", not a system)');
  const list = pm.parsePhasemapText(['phases:', '  - id: L1', '    systems: [nexstore]', '    status: built'].join('\n'), 'l');
  assert.deepStrictEqual([list[0].systems, list[0].tags, list[0].systemsFrom], [['core'], ['nexstore'], 'declared'], 'the list form reads it too');
});
test('T-007', 'only the systems in systems.js: every phase\'s systems are Idearium\'s; bySystem has no other key; a tag is answered for its system', () => {
  const NS = require('../../lib/nexus-self/systems.js');
  const all = pm.loadAll();
  assert.strictEqual(NS.names().length, 16, 'the 15 of SY1 + cos (SY2, James: "Its own system (16th)")');
  assert.ok(NS.names().includes('cos'));
  const outside = all.phases.filter(p => p.systems.some(x => !NS.names().includes(x))).map(p => `${p.map}:${p.id} ${p.systems}`);
  assert.deepStrictEqual(outside, [], 'a phase on something that is not a system');
  assert.deepStrictEqual(Object.keys(all.bySystem).filter(k => !NS.names().includes(k)), []);
  const mine = all.phases.filter(p => /emerge-field-memory-build-phasemap/.test(p.map));
  assert.ok(mine.length > 30 && mine.every(p => p.systemsFrom === 'declared'), 'the EMERGE map still declares every phase');
  assert.ok((all.bySystem.core || []).some(p => p.id === 'EV0_contracts_for_every_system'), 'EV0 (cos, warp, emerge) is core\'s (warp, emerge)');
  assert.ok((all.bySystem.cos || []).some(p => p.id === 'EV0_contracts_for_every_system'), '… and COS\'s (SY2)');
  const cosMap = all.phases.filter(p => /cos-machines-phasemap/.test(p.map));
  assert.ok(cosMap.length >= 7 && cosMap.every(p => p.systems.includes('cos')), 'the COS machines map is COS\'s');
  assert.strictEqual(pm.forSystem('cos').system, 'cos');
  assert.ok(pm.forSystem('cos').phases.some(p => p.id === 'VM1_control_like_vmware'), 'COS\'s Phases tab has VM1');
  const ev0 = all.phases.find(p => p.id === 'EV0_contracts_for_every_system');
  assert.ok(ev0.tags.includes('cos') && ev0.tags.includes('warp'), 'its tags as written are kept');
  assert.strictEqual(pm.forSystem('raid').system, 'cortex');
  assert.strictEqual(pm.forSystem('__no_such_system_xyz__').total, 0, 'a name that is no system and no tag answers empty, not core');
});
console.log(`\n${passed} passed, ${failed} failed`); process.exit(failed ? 1 : 0);
