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
 *   AM-04  path loads count (path.join(__dirname,'..','ui',…), join(ROOT, 'lib', 'sentinel', '…')); comments and dynamic arguments do not
 *   AM-05  R5 (used only by moving folders → their home); his decisions win; retire = _archive, never deleted
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
t('AM-04', 'path loads are uses: static joins resolve, dynamic ones are skipped', () => {
  const fs = require('fs'), os = require('os'); const root = fs.mkdtempSync(path.join(os.tmpdir(), 'am-'));
  fs.mkdirSync(path.join(root, 'guardian'), { recursive: true }); fs.mkdirSync(path.join(root, 'cli'), { recursive: true });
  fs.writeFileSync(path.join(root, 'guardian/server.js'), "const p = path.join(__dirname, '..', 'ui', 'home', 'index.html');\n// path.join(__dirname, '..', 'tablet', 'x.html')\nconst q = path.join(__dirname, '..', someVar, 'x');\n");
  fs.writeFileSync(path.join(root, 'cli/sentinel.js'), "const C = path.join(ROOT, 'lib', 'sentinel', 'interaction-contract.json');\n");
  const e = AM.pathEdges({ root, files: ['guardian/server.js', 'cli/sentinel.js'] }).map(x => `${x.from}>${x.to}`);
  assert.deepStrictEqual(e, ['guardian>ui', 'cli>sentinel'], 'a comment and a dynamic argument are not edges');
});

t('AM-05', 'R5 follows the folders that use it; his decisions win, and retire is archived', () => {
  const m = { systems: model.systems, folders: [
    { dir: 'cli', usedBy: { guardian: 1, idearium: 1 }, uses: { sentinel: 1 } }, { dir: 'sentinel', usedBy: { cli: 1 }, uses: {} },
    { dir: 'tablet', usedBy: {}, uses: {} }, { dir: 'seams', usedBy: {}, uses: {} }] };
  const rows = Object.fromEntries(AM.propose(m, { decided: { tablet: { home: 'cos', by: 'James' }, seams: { retire: true, by: 'axioms' } } }).map(r => [r.dir, r]));
  assert.deepStrictEqual([rows.sentinel.home, rows.sentinel.rule], ['core', 'R5']);
  assert.deepStrictEqual([rows.tablet.home, rows.tablet.rule, rows.tablet.decidedBy], ['cos', 'D', 'James']);
  assert.deepStrictEqual([rows.seams.home, rows.seams.homeDir], [AM.RETIRED, `${AM.RETIRED_DIR}/seams/`]);
  assert.ok(/decided_by: "James"/.test(AM.phasemap(Object.values(rows))), 'the phasemap carries who decided');
});

console.log(`\n  ${p} passed, ${f} failed`);
process.exit(f ? 1 : 0);
