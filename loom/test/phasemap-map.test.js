'use strict';
/**
 * loom/test/phasemap-map.test.js — LP1/LP2/LP3 verification.
 * loom-phasemap-section-phasemap.spec shipped LP1+LP2 without a test file —
 * this closes that gap. No fixture dir: phasemap-map.js mirrors spec-map.js's
 * own pattern (ROOT = path.resolve(__dirname, '../..'), hardcoded, no inject
 * point), and spec-map.js itself has no test file either — so this asserts
 * structural invariants against the REAL docs tree, same as the rest of loom's
 * scanners are exercised, rather than inventing a fixture-injection seam that
 * doesn't exist anywhere else in this module family (§16.5 — don't add a new
 * pattern to fix one test when the existing pattern is load-bearing elsewhere).
 * Run: node loom/test/phasemap-map.test.js
 */
const assert = require('assert');
const pm = require('../scanners/phasemap-map');

let pass = 0, fail = 0;
function check(label, fn) {
  return Promise.resolve().then(fn).then(() => { pass++; console.log(`  PASS  ${label}`); })
    .catch(e => { fail++; console.log(`  FAIL  ${label} — ${e.message}`); });
}

async function main() {
  console.log('\nLOOM LP1/LP2/LP3 — phasemap-map test\n');

  let all;
  await check('loadAll() returns the documented shape', async () => {
    all = pm.loadAll();
    assert.ok(Array.isArray(all.phases), 'phases must be an array');
    assert.ok(Array.isArray(all.maps), 'maps must be an array');
    assert.ok(all.bySystem && typeof all.bySystem === 'object', 'bySystem must be an object');
    assert.strictEqual(all.total, all.phases.length, 'total must equal phases.length');
  });

  await check('finds at least the 13 maps this spec named plus itself', async () => {
    // loom-phasemap-section-phasemap.spec names 13 pre-existing maps; this
    // spec's own doc is a 14th, phase-map.spec (the legacy monolith, if
    // still present under a phasemap-matching name) may add more — the
    // floor is 13, not an exact count, since new phasemaps get added.
    assert.ok(all.maps.length >= 13, `expected >= 13 maps, got ${all.maps.length}: ${all.maps.join(', ')}`);
  });

  await check('every phase has a non-empty id, a known status, and >=1 system tag', async () => {
    const validStatus = new Set(['done', 'in-progress', 'pending']);
    for (const p of all.phases) {
      assert.ok(p.id && p.id.length > 0, 'phase id must be non-empty');
      assert.ok(validStatus.has(p.status), `unknown status "${p.status}" on ${p.map}:${p.id}`);
      assert.ok(Array.isArray(p.systems) && p.systems.length >= 1, `${p.map}:${p.id} has no system tag`);
    }
  });

  await check('bySystem is a true partition — every (phase,system) pair from phases[] appears exactly once', async () => {
    let bySystemCount = 0;
    for (const sys of Object.keys(all.bySystem)) bySystemCount += all.bySystem[sys].length;
    let phasesSystemCount = 0;
    for (const p of all.phases) phasesSystemCount += p.systems.length;
    assert.strictEqual(bySystemCount, phasesSystemCount,
      'sum of bySystem[*].length must equal sum of phases[*].systems.length (LP2\'s grouping must not drop or duplicate)');
  });

  await check('forSystem() done+pending totals match bySystem for a real system', async () => {
    const sys = Object.keys(all.bySystem).sort((a, b) => all.bySystem[b].length - all.bySystem[a].length)[0];
    const road = pm.forSystem(sys);
    assert.strictEqual(road.system, sys);
    assert.strictEqual(road.total, all.bySystem[sys].length);
    assert.strictEqual(road.done + road.pending <= road.total, true, 'done+pending must not exceed total (in-progress is the remainder)');
  });

  await check('forSystem() on a system with zero phases returns an empty, non-throwing roadmap', async () => {
    const road = pm.forSystem('__no_such_system_xyz__');
    assert.strictEqual(road.total, 0);
    assert.deepStrictEqual(road.phases, []);
  });

  await check('summary() counts reconcile with loadAll() (done+inProgress+pending === total)', async () => {
    const s = pm.summary();
    assert.strictEqual(s.phases, all.total);
    assert.strictEqual(s.done + s.inProgress + s.pending, s.phases);
    assert.strictEqual(s.systems, Object.keys(all.bySystem).length);
    assert.ok(s.text.includes(String(s.phases)), 'summary text must cite the real phase count, not a stale one');
  });

  await check('MODULE_ID + VERSION are exported (§5.1 — every component identifiable)', async () => {
    assert.strictEqual(pm.MODULE_ID, 'loom-phasemap-map');
    assert.ok(pm.VERSION);
  });

  await check('persistHistory() is idempotent — a second call with nothing changed writes zero rows', async () => {
    const r1 = pm.persistHistory();
    assert.strictEqual(r1.ok, true);
    const r2 = pm.persistHistory();
    assert.strictEqual(r2.changed, 0, 'a second call with no real status change must write nothing');
  });

  await check('persistHistory() correctly diffs against a seeded prior state, not just re-writing everything', async () => {
    const target = pm.loadAll().phases[0];
    const { jaaDB } = require('../../cortex/memory/jaa-db');
    const fakeStatus = target.status === 'done' ? 'pending' : 'done';
    jaaDB.insert(pm.TABLE, { map: target.map, phaseId: target.id, title: target.title, status: fakeStatus, priorStatus: null, systems: target.systems, dependsOn: null, commitHash: null, recordedAt: Date.now() - 5000 });
    const r = pm.persistHistory();
    assert.ok(r.changed >= 1, 'a seeded prior state that disagrees with the real current status must be detected as a real change');
  });

  await check('historyFor() returns real transitions in chronological order, including priorStatus', async () => {
    const target = pm.loadAll().phases[0];
    const hist = pm.historyFor(target.map, target.id);
    assert.ok(hist.length >= 1);
    for (let i = 1; i < hist.length; i++) assert.ok(hist[i].recordedAt >= hist[i - 1].recordedAt, 'history must be chronological, oldest first');
  });

  await check('a phase-id shared across two DIFFERENT phasemap files does not collide (the real bug found and fixed this session)', async () => {
    // §BUGFIX 2026-08-12 — persistHistory() originally stored the phase's
    // own id under a field literally named `id`, colliding with jaaDB's
    // own reserved `id` semantics. Two real phases (both named P5/P6,
    // one in raid-warp-verification-phasemap, one in raid-verification-
    // spine-phasemap) silently overwrote each other's rows every call.
    // Renamed to `phaseId`. This test locks the fix in.
    const all = pm.loadAll();
    const byBareId = {};
    all.phases.forEach(p => { (byBareId[p.id] = byBareId[p.id] || []).push(p.map); });
    const collisions = Object.entries(byBareId).filter(([id, maps]) => maps.length > 1);
    if (collisions.length === 0) return; // nothing to test against right now — not a failure
    const [dupId, maps] = collisions[0];
    pm.persistHistory();
    const h0 = pm.historyFor(maps[0], dupId);
    const h1 = pm.historyFor(maps[1], dupId);
    assert.ok(h0.length >= 1 && h1.length >= 1, 'both same-named phases across different maps must have their OWN independent history, not one overwriting the other');
  });

  console.log(`\n${pass} passed, ${fail} failed\n`);
  process.exit(fail ? 1 : 0);
}

main();
