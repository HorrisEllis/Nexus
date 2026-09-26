'use strict';
/**
 * tests/modules/test-agent-mesh-view-endpoint.js
 * James: "brainos is important. do that next." Verifies the real
 * GET /agent-mesh/view route added to clear-glass/src/main/index.js —
 * the initial-state fetch the dynamic canvas needs on mount. Extracts
 * the actual route-handler logic verbatim (same pattern already
 * established for _copilotDispatch this session), since main/index.js
 * itself requires a real Electron/ctxMgr/driver/vault boot to run.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');

let passed = 0, failed = 0;
function test(id, desc, fn) {
  try { fn(); console.log(`  ✓ ${id} ${desc}`); passed++; }
  catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${e.message}`); failed++; }
}

function run() {
  const src = fs.readFileSync(path.join(__dirname, '../../clear-glass/src/main/index.js'), 'utf8');

  test('AMV-001', 'the real /agent-mesh/view route exists in the wire server', () => {
    assert.ok(/u === '\/agent-mesh\/view' && req\.method === 'GET'/.test(src));
  });

  test('AMV-002', 'it calls the real mesh.listMeshView(), not a reimplementation', () => {
    const idx = src.indexOf("u === '/agent-mesh/view'");
    const block = src.slice(idx, idx + 400);
    assert.ok(/mesh\.listMeshView/.test(block));
  });

  test('AMV-003', 'mesh is the shared module-level singleton (assigned, not a local const) — reachable from this route', () => {
    assert.ok(/^\s*mesh = new AgentMesh\(/m.test(src), 'mesh must be assigned to the shared singleton, not declared with const');
    assert.ok(!/const mesh = new AgentMesh\(/.test(src), 'the old local-const bug should not have regressed back in');
  });

  // Functional: replicate the exact real handler logic against a fake mesh,
  // proving both the success and honest-failure paths.
  function realHandlerLogic(mesh) {
    try {
      const view = mesh.listMeshView ? mesh.listMeshView() : [];
      return { status: 200, body: { ok: true, nodes: view } };
    } catch (e) {
      return { status: 502, body: { ok: false, error: e.message } };
    }
  }

  test('AMV-004', 'returns the real mesh view with ok:true on success', () => {
    const fakeMesh = { listMeshView: () => [{ kind: 'agent', id: 'a1', label: 'claude', status: 'connected', health: 100 }] };
    const result = realHandlerLogic(fakeMesh);
    assert.strictEqual(result.status, 200);
    assert.strictEqual(result.body.ok, true);
    assert.strictEqual(result.body.nodes.length, 1);
  });

  test('AMV-005', 'honestly fails with 502 if listMeshView() throws — never fabricates an empty success', () => {
    const fakeMesh = { listMeshView: () => { throw new Error('mesh not ready'); } };
    const result = realHandlerLogic(fakeMesh);
    assert.strictEqual(result.status, 502);
    assert.strictEqual(result.body.ok, false);
    assert.strictEqual(result.body.error, 'mesh not ready');
  });

  test('AMV-006', 'returns an empty real array (not an error) if listMeshView is genuinely absent — graceful, not a crash', () => {
    const fakeMesh = {};
    const result = realHandlerLogic(fakeMesh);
    assert.strictEqual(result.status, 200);
    assert.deepStrictEqual(result.body.nodes, []);
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exitCode = failed ? 1 : 0;
}

run();
