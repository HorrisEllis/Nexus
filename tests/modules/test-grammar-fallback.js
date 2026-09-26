'use strict';
const assert = require('assert');
const ge     = require('../../lib/grammar-engine');
const compReg = require('../../lib/component-registry');
const { resolveCommand } = require('../../guardian/lib/grammar-fallback');

let passed = 0, failed = 0;
function test(id, desc, fn) {
  try { fn(); console.log(`  ✓ ${id} ${desc}`); passed++; }
  catch(e) { console.error(`  ✗ ${id} ${desc}\n    ${e.stack}`); failed++; }
}
async function asyncTest(id, desc, fn) {
  try { await fn(); console.log(`  ✓ ${id} ${desc}`); passed++; }
  catch(e) { console.error(`  ✗ ${id} ${desc}\n    ${e.stack}`); failed++; }
}

// Load a known mock tree directly (bypasses the HTTP fetch path — orchestrator
// isn't running in this test process, same approach test-grammar-engine.js uses)
const mockTree = {
  cortex: {
    gaps: {
      list: { componentId: 'cortex.gaps.list', params: [], returns: { render: 'table' } },
    },
  },
};
ge.load(mockTree, { gaps: 'cortex.gaps.list' });

// Mock JAA — same pattern as tests/modules/test-component-registry.js,
// not a new convention invented for this file.
const _store = {};
const mockJaa = {
  insert: (table, row) => { _store[row.id || row.uuid] = { ...row }; return row; },
  update: (table, uuid, row) => { _store[row.id || uuid] = { ...row }; return row; },
  query:  (table, fn) => Object.values(_store).filter(fn),
};
compReg.init(mockJaa, null);

(async () => {
  await asyncTest('T-001', 'resolves a known command to its componentId', async () => {
    const r = await resolveCommand('cortex gaps list');
    assert.strictEqual(r.resolved, true);
    assert.strictEqual(r.componentId, 'cortex.gaps.list');
    assert.strictEqual(r.matched, 'cortex gaps list');
  });

  await asyncTest('T-002', 'resolves via alias', async () => {
    const r = await resolveCommand('gaps');
    assert.strictEqual(r.resolved, true);
    assert.strictEqual(r.componentId, 'cortex.gaps.list');
  });

  await asyncTest('T-003', 'unknown command → resolved:false, never throws', async () => {
    const r = await resolveCommand('totally not a real command');
    assert.strictEqual(r.resolved, false);
    assert.ok(r.reason);
  });

  await asyncTest('T-004', 'resolved component with no registered route → route:null, honest note', async () => {
    const r = await resolveCommand('cortex gaps list');
    assert.strictEqual(r.route, null);
    assert.match(r.note, /no registered route/);
  });

  await asyncTest('T-005', 'resolved component WITH a registered route is reported but never invoked', async () => {
    // Register a real component with a route to prove resolveCommand surfaces
    // it without calling it — there is no fetch/http call in resolveCommand
    // at all for the invocation step, only for the grammar-tree fetch.
    compReg.register({
      id: 'test.echo.ping', namespace: 'test', name: 'ping', version: '1.0.0',
      grammar: ['test', 'ping'], route: { method: 'GET', path: '/api/test/ping' },
      description: 'test-only component for grammar-fallback verification',
    });
    ge.load({ ...mockTree, test: { ping: { componentId: 'test.echo.ping', params: [] } } }, {});
    const r = await resolveCommand('test ping');
    assert.strictEqual(r.resolved, true);
    assert.deepStrictEqual(r.route, { method: 'GET', path: '/api/test/ping' });
    assert.match(r.note, /not wired yet \(Phase 40\)/);
  });

  await asyncTest('T-006', 'orchestrator unreachable + grammar not pre-loaded → resolved:false, not a throw', async () => {
    ge.invalidate();
    const r = await resolveCommand('anything', { orchestratorUrl: 'http://127.0.0.1:1' }); // port 1 — guaranteed refused
    assert.strictEqual(r.resolved, false);
    assert.ok(r.reason);
    // restore for any tests that might run after this file in a combined suite
    ge.load(mockTree, { gaps: 'cortex.gaps.list' });
  });

  console.log(`\n  grammar-fallback: ${passed} passed, ${failed} failed\n`);
  process.exit(failed ? 1 : 0);
})();
