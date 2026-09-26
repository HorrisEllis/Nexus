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
console.log(`\n${passed} passed, ${failed} failed`); process.exit(failed ? 1 : 0);
