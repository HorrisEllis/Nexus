'use strict';
/**
 * tests/modules/test-flow-sources.test.js — BX2: the BrainOS FlowGraph backend.
 * Map: docs/2026-10-21-brainos-into-idearium-phasemap.spec (BX2) · Spec: docs/brainos-in-idearium.spec (MOD-BX-SOURCES).
 *
 * James: "What about BrainOS?" flow-sources gathers the FlowGraph server-side, composing what exists (phases+DAG, runs,
 * the Clear Glass mesh). Each source is best-effort: a source that is down leaves its part empty and is NAMED (§1.2).
 * flow-sources is an ES module (idearium is type:module), so it is reached by dynamic import.
 */
const assert = require('assert');
let passed = 0, failed = 0;
const reg = [];
function test(id, desc, fn) { reg.push({ id, desc, fn }); }

test('A1', 'exports flowFor and mesh', async () => {
  const FS = await import('../../idearium/lib/flow-sources.js');
  assert.strictEqual(typeof FS.flowFor, 'function');
  assert.strictEqual(typeof FS.mesh, 'function');
});

test('A2', 'flowFor refuses a repo with no uuid', async () => {
  const FS = await import('../../idearium/lib/flow-sources.js');
  const r = await FS.flowFor({ repo: {}, repoDir: '/tmp' });
  assert.strictEqual(r.ok, false);
  assert.match(r.error, /uuid/);
});

test('A3', 'flowFor returns the FlowGraph shape (phases, dag, runs, agents, routes, edges, sources)', async () => {
  const FS = await import('../../idearium/lib/flow-sources.js');
  const r = await FS.flowFor({ repo: { uuid: 'test-x' }, repoDir: '/nonexistent-repo' });
  assert.strictEqual(r.ok, true, 'a repo that gathers nothing still returns ok with empty parts');
  for (const k of ['phases', 'dag', 'runs', 'agents', 'routes', 'edges', 'sources']) assert.ok(k in r, `FlowGraph has ${k}`);
  assert.ok(Array.isArray(r.phases) && Array.isArray(r.edges) && Array.isArray(r.sources));
  assert.ok(r.dag && typeof r.dag === 'object' && 'layers' in r.dag);
});

test('A4', 'every source reports ok or names its failure — mesh down is named, not thrown (§1.2)', async () => {
  const FS = await import('../../idearium/lib/flow-sources.js');
  const r = await FS.flowFor({ repo: { uuid: 'test-x' }, repoDir: '/nonexistent-repo' });
  const mesh = (r.sources || []).find(s => s.source === 'mesh');
  assert.ok(mesh, 'the mesh source is listed');
  // in a headless test Clear Glass :7704 is not up → the source is marked not-ok with a reason, and agents stay []
  if (!mesh.ok) { assert.ok(mesh.error && /Clear Glass|timed out|not answering/.test(mesh.error), `the mesh failure is named: ${mesh.error}`); assert.deepStrictEqual(r.agents, []); }
  // every source entry has an ok flag; a false one carries an error
  for (const s of r.sources) { assert.ok('ok' in s); if (!s.ok) assert.ok(s.error, `${s.source} names its failure`); }
});

test('A5', 'mesh() alone returns {agents,routes} and names Clear Glass when it is down', async () => {
  const FS = await import('../../idearium/lib/flow-sources.js');
  const m = await FS.mesh();
  assert.ok(Array.isArray(m.agents) && Array.isArray(m.routes));
  if (m.error) assert.match(m.error, /Clear Glass|timed out|not answering/);
});

async function run() {
  for (const { id, desc, fn } of reg) {
    try { await fn(); console.log(`  ✓ ${id} ${desc}`); passed++; }
    catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${e.message}`); failed++; }
  }
  process.stdout.write(`\n  test-flow-sources.test.js\n  ${passed} passed  ${failed} failed\n`);
  if (failed > 0) process.exitCode = 1;
}
run();

module.exports = { passed: () => passed, failed: () => failed };
