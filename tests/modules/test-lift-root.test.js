'use strict';
/**
 * tests/modules/test-lift-root.test.js — a project imported inside its own folder is lifted to the repo's root (0.60.206, SD22)
 * Map: docs/2026-10-10-idearium-solid-phasemap.spec (SD22_a_wrapped_repo_lifts_to_its_root).
 * James, 2026-10-22: "im so sick of this phase, been stuck on 2 days. the file is in the directory already for the phase, so what is
 * broken?"
 *
 *   LR-01  planLift on his shape: looking-glass-bundle-v0_4/ is the project, the agent's root lib/title.js is a collision
 *   LR-02  planLift refuses what is not a wrapper: a marker at the root, a folder with no marker, a folder with a minority of files
 *   LR-03  through the real layer and the route: the root copy is archived (kept), the original takes its path, the wrapper is gone
 */
require('../../lib/test-sandbox.js').ensure();
const assert = require('assert');
const path = require('path');
const { pathToFileURL } = require('url');
const ROOT = path.join(__dirname, '..', '..');

let passed = 0, failed = 0;
async function test(id, desc, fn) {
  try { await fn(); console.log(`  ✓ ${id} ${desc}`); passed++; }
  catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${e.stack ? e.stack.split('\n').slice(0, 5).join('\n    ') : e.message}`); failed++; }
}
const quiet = async (fn) => { const l = console.log, w = console.warn; console.log = () => {}; console.warn = () => {}; try { return await fn(); } finally { console.log = l; console.warn = w; } };

(async () => {
  console.log('\n⬡  a wrapped repo lifts to its root\n');
  const LR = await import(pathToFileURL(path.join(ROOT, 'idearium/repo/lift-root.js')).href);
  const W = 'looking-glass-bundle-v0_4';

  await test('LR-01', 'his shape: the bundle folder is the project; the agent\'s root copies are collisions, archived', () => {
    const p = LR.planLift([`${W}/LOOKING-GLASS-phasemap.spec`, `${W}/README.md`, `${W}/lib/title.js`, `${W}/tests/sp5-title.test.js`, `${W}/src/main.js`,
      'lib/title.js', 'tests/sp5-title.test.js', '.nexus/proof/latest.json', 'proof/PROOF-REPORT.md'], { now: 0 });
    assert.strictEqual(p.wrapper, W, JSON.stringify(p));
    assert.strictEqual(p.moves.length, 5);
    assert.deepStrictEqual(p.collisions.map(c => c.path).sort(), ['lib/title.js', 'tests/sp5-title.test.js']);
    assert.ok(p.collisions.every(c => c.archive.startsWith('.nexus/archive/lift-root/')), 'archived, never deleted');
  });

  await test('LR-02', 'not a wrapper: a root marker, a folder without one, a folder with too few files', () => {
    assert.strictEqual(LR.planLift(['package.json', 'src/a.js', 'src/b.js']).wrapper, null);
    assert.match(LR.planLift(['src/a.js', 'src/b.js', 'x.txt']).why, /no project marker/);
    assert.match(LR.planLift(['w/README.md', 'a.js', 'b.js', 'c.js', 'd.js']).why, /not most of them/);
    assert.match(LR.planLift(['a.js']).why, /already at the repo's root/);
  });

  const api = await quiet(() => import(pathToFileURL(path.join(ROOT, 'idearium/api/index.js')).href));
  const R = (m, p, b) => quiet(() => api._route(m, p, b));
  const layer = api.getRepoLayer();

  await test('LR-03', 'the real layer and route: root copy archived, original at the root, wrapper emptied, a second apply refused', async () => {
    const repoUuid = await quiet(async () => {
      const w = (await R('POST', '/api/workshop', { from: { kind: 'blank' }, title: `Lift LR ${Date.now().toString(36)}` })).json.workshop;
      return (await R('POST', `/api/workshop/${w.uuid}/save`, {})).json.repoUuid;
    });
    const ORIG = "'use strict';\nfunction title(s) { if (typeof s !== 'string') throw new TypeError('Input must be a string'); return s.trim(); }\nmodule.exports = { title };\n";
    await quiet(() => {
      for (const f of (layer.get(repoUuid).files || [])) { const p = f.path || f; layer.moveFile(repoUuid, p, `${W}/${p}`, { defer: true }); }   // the workshop's own files go in too
      layer.writeFile(repoUuid, `${W}/README.md`, '# Looking Glass\n', { defer: true });
      layer.writeFile(repoUuid, `${W}/lib/title.js`, ORIG, { defer: true });
      layer.writeFile(repoUuid, 'lib/title.js', 'module.exports = {};\n', { defer: true });   // the agent's copy at the root
      layer.refresh(repoUuid);
    });
    const plan = await R('GET', `/api/repos/${repoUuid}/lift-root`);
    assert.strictEqual(plan.json.wrapper, W, JSON.stringify(plan.json).slice(0, 400));
    const r = await R('POST', `/api/repos/${repoUuid}/lift-root`, {});
    assert.strictEqual(r.status, 200, JSON.stringify(r.json).slice(0, 400));
    assert.strictEqual(r.json.failed.length, 0, JSON.stringify(r.json.failed));
    assert.ok(/Input must be a string/.test(layer.readFile(repoUuid, 'lib/title.js').content), 'the original took the root path: ' + JSON.stringify(layer.readFile(repoUuid, 'lib/title.js').content));
    const arch = r.json.archived[0].archive;
    assert.strictEqual(layer.readFile(repoUuid, arch).content.trim(), 'module.exports = {};', 'the agent\'s copy is kept in the archive');
    const paths = (layer.get(repoUuid).files || []).map(f => f.path || f);
    assert.ok(!paths.some(p => p.startsWith(`${W}/`)), `nothing left in the wrapper: ${paths.join(', ')}`);
    const again = await R('POST', `/api/repos/${repoUuid}/lift-root`, {});
    assert.strictEqual(again.status, 409);
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
