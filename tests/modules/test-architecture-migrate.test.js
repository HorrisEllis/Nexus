'use strict';
require('../../lib/test-sandbox.js').ensure();
/**
 * tests/modules/test-architecture-migrate.test.js — RF0/RF1 (0.60.234): the refactor tool reads the architecture and proposes the
 * migration as phases. James, 2026-10-24: "need to make the refactor tool from the phgases. so we can make each system sovereignfor
 * the cos migratoin" · "15 systems. the rest of the folders need to migrate."
 *
 *   AM-01  propose: R1 one system uses it → that system; R2 lib/ or two systems → core; R3 uses one place (not lib/) → there,
 *          through another folder's home; R4 no evidence → unplaced, never guessed; bottom-up dependsOn
 *   AM-02  read on Nexus itself: the 15 systems are not proposed to move; every other top-level folder the census counts is
 *   AM-03  phasemap: one phase per folder, numbered keys, DAG-clean (lib/phase-dag.js), unplaced ones wait on MV0
 */
const assert = require('assert');
const path = require('path');
const AM = require('../../lib/architecture-migrate.js');
const D = require('../../lib/phase-dag.js');
let p = 0, f = 0;
const t = (id, d, fn) => { try { fn(); console.log(`  ✓ ${id} ${d}`); p++; } catch (e) { console.error(`  ✗ ${id} ${d}\n    ${e.stack.split('\n').slice(0, 4).join('\n    ')}`); f++; } };

const model = { systems: [{ id: 'guardian', dirs: ['guardian'] }, { id: 'idearium', dirs: ['idearium'] }, { id: 'ollama-bridge', dirs: ['ollama'] }],
  folders: [
    { dir: 'mesh', usedBy: { guardian: 1 }, uses: {} },
    { dir: 'warp', usedBy: { core: 2, idearium: 1 }, uses: { emerge: 1 } },
    { dir: 'emerge', usedBy: { guardian: 1, idearium: 1, warp: 1 }, uses: {} },
    { dir: 'emergence', usedBy: {}, uses: { warp: 9 } },
    { dir: 'tablet', usedBy: {}, uses: {} },
    { dir: 'remote', usedBy: {}, uses: { core: 1 } },
  ] };

t('AM-01', 'the four rules, and bottom-up order', () => {
  const rows = Object.fromEntries(AM.propose(model).map(r => [r.dir, r]));
  assert.deepStrictEqual([rows.mesh.home, rows.mesh.rule, rows.mesh.homeDir], ['guardian', 'R1', 'guardian/mesh/']);
  assert.deepStrictEqual([rows.warp.home, rows.warp.rule, rows.warp.homeDir], ['core', 'R2', 'lib/warp/']);
  assert.deepStrictEqual([rows.emerge.home, rows.emerge.rule], ['core', 'R2'], 'two systems use it → kernel');
  assert.deepStrictEqual([rows.emergence.home, rows.emergence.rule], ['core', 'R3'], 'uses only warp → goes where warp goes');
  assert.deepStrictEqual([rows.tablet.placed, rows.tablet.rule], [false, 'R4']);
  assert.deepStrictEqual([rows.remote.placed, rows.remote.rule], [false, 'R4'], 'using only lib/ is no evidence');
  assert.deepStrictEqual(rows.warp.dependsOn, ['emerge']); assert.deepStrictEqual(rows.emergence.dependsOn, ['warp']);
});

const live = AM.propose(AM.read({ root: path.join(__dirname, '../..') }));
t('AM-02', 'on Nexus: none of the 15 moves; every other folder is proposed', () => {
  const S = require('../../lib/nexus-self/systems.js');
  const fifteen = new Set(S.SYSTEMS.flatMap(s => s.dirs || []).concat(['lib']));
  assert.ok(live.length > 0);
  for (const r of live) assert.ok(!fifteen.has(r.dir), `${r.dir} is one of the 15`);
  for (const r of live.filter(x => x.placed)) assert.ok(/^[a-z-]+\/[^/]+\/$/.test(r.homeDir), r.homeDir);
});

t('AM-03', 'the proposal is a DAG-clean phasemap', () => {
  const text = AM.phasemap(live, { date: '2026-10-24', origin: 'test' });
  const dag = D.build([{ path: 'docs/x-phasemap.spec', text }]);
  const keys = Object.keys(dag.nodes);
  assert.strictEqual(keys.length, live.length + 1, 'one phase per folder + MV0');
  for (const k of keys) assert.deepStrictEqual(D.problems(dag, k), [], k);
  assert.strictEqual(dag.cycles.length, 0);
  for (const r of live.filter(x => !x.placed)) assert.ok(new RegExp(`MV\\d+_${r.dir.replace(/[^a-z0-9]+/gi, '_')}:\\n      status: OPEN\\n      depends_on: \\[[^\\]]*MV0_unplaced_homes`).test(text), `${r.dir} waits on MV0`);
});
console.log(`\n  ${p} passed, ${f} failed`);
process.exit(f ? 1 : 0);
