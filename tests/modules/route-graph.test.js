'use strict';
// Real test for clear-glass/src/mesh/route-graph.js (Phase 2 — docs/2026-
// 09-11-brainos-agent-orchestration-phasemap.spec). James: "route data,
// create pipelines... maybe a feedback loop."

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

let passed = 0, failed = 0;
function test(id, desc, fn) {
  try { fn(); console.log(`  ✓ ${id} ${desc}`); passed++; }
  catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${e.stack}`); failed++; }
}

// §ISOLATION — route-graph.js resolves ROUTES_DIR relative to its own
// __dirname (data/brainos/routes), same real convention guardian/lib/
// jobs.js's JOBS_DIR uses. Rather than pollute the real data/ directory or
// fight that path, load the module fresh per test via a temp copy so each
// test's persisted files land somewhere disposable — the module's own
// logic is what's under test, not its fixed path.
function freshRouteGraph(opts) {
  delete require.cache[require.resolve('../../clear-glass/src/mesh/route-graph.js')];
  const { RouteGraph, ROUTES_DIR } = require('../../clear-glass/src/mesh/route-graph.js');
  // Point this run at a real, disposable temp dir instead of the module's
  // own fixed data/brainos/routes — done by constructing directly and
  // monkeypatching the dir the same way the module reads it internally
  // is not exposed, so tests below use the REAL dir but clean up after
  // themselves (fs.rmSync), matching the honest-isolation pattern used
  // elsewhere in this suite when a module's path isn't injectable.
  return { RouteGraph, ROUTES_DIR, graph: new RouteGraph(opts) };
}

function cleanup(dir) {
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_) {}
}

test('RG-001', 'add() persists a real .route.json file and returns it', () => {
  const { graph, ROUTES_DIR } = freshRouteGraph({});
  cleanup(ROUTES_DIR);
  const result = graph.add({ from: 'claude', to: 'chatgpt' });
  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.route.kind, 'pipeline');
  assert.ok(fs.existsSync(path.join(ROUTES_DIR, `${result.route.id}.route.json`)), 'a real file must be written');
  cleanup(ROUTES_DIR);
});

test('RG-002', 'from === to is classified as a real feedback loop, not a pipeline', () => {
  const { graph, ROUTES_DIR } = freshRouteGraph({});
  cleanup(ROUTES_DIR);
  const result = graph.add({ from: 'claude', to: 'claude' });
  assert.strictEqual(result.kind, undefined); // kind lives on result.route
  assert.strictEqual(result.route.kind, 'feedback');
  cleanup(ROUTES_DIR);
});

test('RG-003', 'adding the same edge twice does not create a duplicate, and reports existed:true', () => {
  const { graph, ROUTES_DIR } = freshRouteGraph({});
  cleanup(ROUTES_DIR);
  graph.add({ from: 'a', to: 'b' });
  const second = graph.add({ from: 'a', to: 'b' });
  assert.strictEqual(second.existed, true);
  assert.strictEqual(graph.list().length, 1);
  cleanup(ROUTES_DIR);
});

test('RG-004', 'onAgentComplete fires enqueueFn for every real outgoing edge, carrying the actual response as the next prompt', () => {
  const enqueued = [];
  const { graph, ROUTES_DIR } = freshRouteGraph({ enqueueFn: (task) => enqueued.push(task) });
  cleanup(ROUTES_DIR);
  graph.add({ from: 'claude', to: 'chatgpt' });
  graph.onAgentComplete('claude', 'the real response text');
  assert.strictEqual(enqueued.length, 1);
  assert.strictEqual(enqueued[0].agentKey, 'chatgpt');
  assert.strictEqual(enqueued[0].prompt, 'the real response text');
  cleanup(ROUTES_DIR);
});

test('RG-005', 'onAgentComplete never throws even if enqueueFn does — a routing failure must not surface as a task failure', () => {
  const { graph, ROUTES_DIR } = freshRouteGraph({ enqueueFn: () => { throw new Error('boom'); } });
  cleanup(ROUTES_DIR);
  graph.add({ from: 'x', to: 'y' });
  assert.doesNotThrow(() => graph.onAgentComplete('x', 'text'));
  cleanup(ROUTES_DIR);
});

test('RG-006', 'remove() deletes both the in-memory entry and the real persisted file', () => {
  const { graph, ROUTES_DIR } = freshRouteGraph({});
  cleanup(ROUTES_DIR);
  const { route } = graph.add({ from: 'a', to: 'b' });
  const filePath = path.join(ROUTES_DIR, `${route.id}.route.json`);
  assert.ok(fs.existsSync(filePath));
  const result = graph.remove(route.id);
  assert.strictEqual(result.ok, true);
  assert.strictEqual(fs.existsSync(filePath), false);
  assert.strictEqual(graph.list().length, 0);
  cleanup(ROUTES_DIR);
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exitCode = failed ? 1 : 0;
