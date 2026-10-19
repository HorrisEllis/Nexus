'use strict';
/**
 * tests/modules/test-phase-dag.test.js — DG3 (0.60.172)
 * James, 2026-10-19: "every phasemap phase needs extensive dag, that needs to start being standard."
 *
 *   DAG-01  depends_on across one map and across maps (short key, full id, map::key) become edges; layers, order, ready
 *   DAG-02  a cycle is found, its phases are left out of the layers, and problems() refuses them
 *   DAG-03  a depends_on naming no phase is dangling; a phase with no depends_on line is undeclared ([] is declared)
 *   DAG-04  critical path = the longest chain of OPEN phases; slice: upstream/downstream transitive, blockedBy, unlocks
 *   DAG-05  two open phases changing the same file with no order between them are a conflict; ordered ones are not
 *   DAG-06  MP1's inferred dependencies join as 'inferred' edges and never duplicate a declared one
 *   DAG-07  Nexus's own 149 phasemaps build in under 5 s and every phase gets a slice
 *   DAG-08  wired: the build refuses DAG_INVALID (anyway overrides), the graph carries the slice, a route and a command exist
 */
require('../../lib/test-sandbox.js').ensure();
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '../..');
const D = require(path.join(ROOT, 'lib/phase-dag.js'));

let passed = 0, failed = 0;
function test(id, desc, fn) {
  try { fn(); console.log(`  ✓ ${id} ${desc}`); passed++; }
  catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${e.stack ? e.stack.split('\n').slice(0, 4).join('\n    ') : e.message}`); failed++; }
}
const map = (phases) => `# test map\n\nphases:\n\n${phases.map(p => `  ${p.id}:\n    status: ${p.status || 'OPEN'}\n${p.deps === undefined ? '' : `    depends_on: [${p.deps.join(', ')}]\n`}${p.files ? `    files: [${p.files.join(', ')}]\n` : ''}    does: ${p.id} does a thing\n`).join('\n')}`;

const A = { path: 'docs/a-phasemap.spec', text: map([
  { id: 'SP1_schema', status: 'DONE', deps: [] },
  { id: 'SP2_parse', deps: ['SP1_schema'], files: ['lib/parse.js'] },
  { id: 'SP3_title', deps: ['SP2'], files: ['lib/title.js'] },
  { id: 'SP4_stage', deps: ['SP3_title', 'docs/b-phasemap.spec::B1_base'], files: ['lib/stage.js'] },
]) };
const B = { path: 'docs/b-phasemap.spec', text: map([
  { id: 'B1_base', status: 'DONE', deps: [] },
  { id: 'B2_free', files: ['lib/title.js'] },
]) };

test('DAG-01', 'edges across one map and across maps; layers, order, ready', () => {
  const d = D.build([A, B]);
  const e = d.edges.map(x => `${x.from.split('::')[1]}>${x.to.split('::')[1]}`).sort();
  assert.deepStrictEqual(e, ['B1_base>SP4_stage', 'SP1_schema>SP2_parse', 'SP2_parse>SP3_title', 'SP3_title>SP4_stage']);
  assert.strictEqual(d.nodes['docs/a-phasemap.spec::SP4_stage'].layer, 3);
  assert.ok(d.order.indexOf('docs/a-phasemap.spec::SP2_parse') < d.order.indexOf('docs/a-phasemap.spec::SP4_stage'));
  assert.deepStrictEqual(d.ready.map(k => k.split('::')[1]).sort(), ['B2_free', 'SP2_parse']);
});

test('DAG-02', 'a cycle is found, left out of the layers, and refused', () => {
  const C = { path: 'docs/c-phasemap.spec', text: map([{ id: 'X1_a', deps: ['X2_b'] }, { id: 'X2_b', deps: ['X1_a'] }, { id: 'X3_c', deps: [] }]) };
  const d = D.build([C]);
  assert.strictEqual(d.cycles.length, 1); assert.deepStrictEqual(d.cycles[0].map(k => k.split('::')[1]), ['X1_a', 'X2_b']);
  assert.ok(!d.order.some(k => /X1_a|X2_b/.test(k)));
  assert.ok(/dependency cycle/.test(D.problems(d, 'X1_a')[0]));
  assert.deepStrictEqual(D.problems(d, 'X3_c'), []);
});

test('DAG-03', 'dangling depends_on; undeclared vs declared-empty', () => {
  const C = { path: 'docs/c-phasemap.spec', text: map([{ id: 'Y1_a', deps: ['NOPE9'] }, { id: 'Y2_b' }, { id: 'Y3_c', deps: [] }]) };
  const d = D.build([C]);
  assert.deepStrictEqual(d.dangling.map(x => x.ref), ['NOPE9']);
  assert.ok(/NOPE9, which is no phase/.test(D.problems(d, 'Y1_a')[0]));
  assert.deepStrictEqual(d.undeclared.map(k => k.split('::')[1]), ['Y2_b']);
  assert.ok(D.lines(D.slice(d, 'Y2_b')).some(l => /no depends_on line/.test(l)));
});

test('DAG-04', 'critical path and the slice', () => {
  const d = D.build([A, B]);
  assert.deepStrictEqual(d.critical.map(k => k.split('::')[1]), ['SP2_parse', 'SP3_title', 'SP4_stage']);
  const s = D.slice(d, 'SP3_title');
  assert.deepStrictEqual(s.upstream.map(k => k.split('::')[1]), ['SP1_schema', 'SP2_parse']);
  assert.deepStrictEqual(s.downstream.map(k => k.split('::')[1]), ['SP4_stage']);
  assert.deepStrictEqual(s.blockedBy.map(k => k.split('::')[1]), ['SP2_parse']);
  assert.deepStrictEqual(s.unlocks.map(k => k.split('::')[1]), ['SP4_stage'], 'B1 is done, so finishing SP3 unlocks SP4');
  assert.strictEqual(s.onCritical, true); assert.strictEqual(s.ready, false);
});

test('DAG-05', 'same file, no order → conflict; ordered → none', () => {
  const d = D.build([A, B], { crossMapConflicts: true });
  assert.deepStrictEqual(d.conflicts.map(c => [c.a, c.b].map(k => k.split('::')[1]).sort().join('~')), ['B2_free~SP3_title']);
  assert.strictEqual(D.build([A, B]).conflicts.length, 0, 'across maps: counted only when asked');
  const C = { path: 'docs/c-phasemap.spec', text: map([{ id: 'Z1_a', deps: [], files: ['lib/x.js'] }, { id: 'Z2_b', deps: ['Z1_a'], files: ['lib/x.js'] }]) };
  assert.strictEqual(D.build([C]).conflicts.length, 0);
});

test('DAG-06', "MP1's inferred dependencies join, never duplicating a declared one", () => {
  const d = D.build([A, B], { mapped: { 'docs/b-phasemap.spec::B2_free': { dependsOnInferred: ['SP3_title'] }, 'docs/a-phasemap.spec::SP3_title': { dependsOnInferred: ['SP2_parse'] } } });
  assert.ok(d.edges.some(e => e.kind === 'inferred' && /SP3_title$/.test(e.from) && /B2_free$/.test(e.to)));
  assert.strictEqual(d.edges.filter(e => /SP2_parse$/.test(e.from) && /SP3_title$/.test(e.to)).length, 1);
});

test('DAG-07', "Nexus's own phasemaps build fast and every phase has a slice", () => {
  const dir = path.join(ROOT, 'docs');
  const maps = fs.readdirSync(dir).filter(f => /-phasemap\.spec$/.test(f)).map(f => ({ path: `docs/${f}`, text: fs.readFileSync(path.join(dir, f), 'utf8') }));
  const t = Date.now(); const d = D.build(maps); const ms = Date.now() - t;
  assert.ok(ms < 5000, `${ms} ms`);
  assert.ok(d.stats.phases > 1000 && d.stats.edges > 500, JSON.stringify(d.stats));
  for (const k of Object.keys(d.nodes)) assert.ok(D.slice(d, k), k);
  console.log(`    (Nexus: ${JSON.stringify(d.stats)} in ${ms} ms)`);
});

test('DAG-08', 'wired into the build, the graph, a route and a command', () => {
  const src = fs.readFileSync(path.join(ROOT, 'idearium/api/index.js'), 'utf8');
  assert.ok(/code: 'DAG_INVALID'/.test(src) && /probs\.length && !anyway/.test(src), 'the build refuses an invalid DAG unless anyway');
  assert.ok(src.indexOf("code: 'DAG_INVALID'") < src.indexOf("code: 'NO_GRAPH'"), 'checked before the per-phase graph');
  assert.ok(src.includes('phaseGraph.dag = dagSlice'), 'the slice is written with the graph');
  assert.ok(src.includes("'repo.phases.dag'],") && src.includes("case 'repo.phases.dag':"), 'route');
  const cmd = fs.readFileSync(path.join(ROOT, 'idearium/cli/route-commands.js'), 'utf8');
  assert.ok(cmd.includes("key: 'repo.phases.dag'"), 'command');
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
