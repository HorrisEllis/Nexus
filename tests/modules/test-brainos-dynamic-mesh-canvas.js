'use strict';
/**
 * tests/modules/test-brainos-dynamic-mesh-canvas.js
 * James: "brainos is important. do that next." Real, live dynamic
 * rendering of agent-mesh's listMeshView() on the canvas — real
 * add/update/remove diffing, and precise verification that a scoped
 * (kind:'node') snapshot update never erases kind:'agent' entries,
 * since the real mesh.nodes.snapshot SSE event only ever contains
 * node-kind data (confirmed directly against agent-mesh.js's own
 * _startNodePulse tick, which calls listNodes(), not listMeshView()).
 */
const assert = require('assert');

let passed = 0, failed = 0;
function test(id, desc, fn) {
  try { fn(); console.log(`  ✓ ${id} ${desc}`); passed++; }
  catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${e.message}`); failed++; }
}

class FakeClassList {
  constructor() { this._set = new Set(); }
  add(c) { this._set.add(c); }
  remove(c) { this._set.delete(c); }
  contains(c) { return this._set.has(c); }
}
class FakeEl {
  constructor(tag) {
    this.tag = tag; this.children = []; this.attrs = {};
    this.classList = new FakeClassList(); this.textContent = ''; this.style = {};
    this._listeners = {};
  }
  setAttribute(k, v) { this.attrs[k] = v; }
  appendChild(c) { this.children.push(c); return c; }
  getBoundingClientRect() { return { x: 0, y: 0, width: 1, height: 1 }; }
  remove() { this._removed = true; }
  addEventListener(ev, fn) { this._listeners[ev] = fn; }
  click() { if (this._listeners.click) this._listeners.click(); }
}

function meshLayerOf(svg) {
  return svg.children.find((c) => c.attrs.class === 'brainos-canvas-mesh-layer');
}
function liveMeshNodeIds(svg) {
  return meshLayerOf(svg).children
    .filter((g) => !g._removed)
    .map((g) => g.attrs['data-node-id']);
}

function run() {
  global.document = { createElementNS: (ns, tag) => new FakeEl(tag) };
  delete require.cache[require.resolve('../../ui/brainos/brainos-canvas.js')];
  require('../../ui/brainos/brainos-canvas.js');
  const canvas = global.BrainOSCanvas;
  const container = new FakeEl('div');
  const svg = canvas.mount(container);

  test('BDM-001', 'initial full renderMeshView adds both agent-kind and node-kind entries', () => {
    canvas.renderMeshView([
      { kind: 'agent', id: 'a1', label: 'claude-ctx-1', status: 'connected', health: 100 },
      { kind: 'node', id: 'n1', label: 'clearglass', status: 'alive', health: 100 },
    ]);
    const ids = liveMeshNodeIds(svg);
    assert.ok(ids.includes('a1') && ids.includes('n1'), `expected both a1 and n1, got ${ids}`);
  });

  test('BDM-002', 'a scoped (onlyKind:"node") update does NOT remove the agent-kind entry — the exact real bug this session traced', () => {
    canvas.renderMeshView([{ kind: 'node', id: 'n1', label: 'clearglass', status: 'idle', health: 40 }], { onlyKind: 'node' });
    const ids = liveMeshNodeIds(svg);
    assert.ok(ids.includes('a1'), 'a1 (agent-kind) must survive a node-only scoped update');
    assert.ok(ids.includes('n1'), 'n1 should still be present (it was in this update)');
  });

  test('BDM-003', 'a node-kind entry absent from a new scoped snapshot IS removed — real liveness, not a permanent ghost', () => {
    canvas.renderMeshView([], { onlyKind: 'node' });
    const ids = liveMeshNodeIds(svg);
    assert.ok(!ids.includes('n1'), 'n1 should be removed once absent from a real node-only snapshot');
    assert.ok(ids.includes('a1'), 'a1 (agent-kind, out of scope) must still be untouched');
  });

  test('BDM-004', 'onRealEvent(mesh.nodes.snapshot) correctly scopes to onlyKind:"node" internally', () => {
    canvas.onRealEvent({ type: 'mesh.nodes.snapshot', nodes: [{ kind: 'node', id: 'n2', label: 'guardian-proc', status: 'alive', health: 100 }], ts: Date.now() });
    const ids = liveMeshNodeIds(svg);
    assert.ok(ids.includes('n2'), 'n2 should be added by the real snapshot event');
    assert.ok(ids.includes('a1'), 'a1 (agent-kind) must still survive this event too');
  });

  test('BDM-005', 'onRealEvent(mesh.node.status_changed) pulses the real, existing node without throwing', () => {
    canvas.onRealEvent({ type: 'mesh.node.status_changed', instanceId: 'n2', from: 'alive', to: 'idle', ts: Date.now() });
  });

  test('BDM-006', 'onRealEvent(mesh.node.status_changed) for an unknown/removed id is a safe no-op, not a throw', () => {
    canvas.onRealEvent({ type: 'mesh.node.status_changed', instanceId: 'never-existed', ts: Date.now() });
  });

  test('BDM-007', '§NO_CAP_ON_VISIBILITY — every real entry in a large batch gets rendered, no truncation', () => {
    const many = Array.from({ length: 47 }, (_, i) => ({ kind: 'node', id: `bulk-${i}`, label: `n${i}`, status: 'alive', health: 100 }));
    canvas.renderMeshView(many, { onlyKind: 'node' });
    const ids = liveMeshNodeIds(svg);
    for (let i = 0; i < 47; i++) assert.ok(ids.includes(`bulk-${i}`), `bulk-${i} missing — visibility cap would violate §NO_CAP_ON_VISIBILITY`);
  });

  test('BDM-008', 'onNodeClick fires with the real, current node data when a rendered node is clicked', () => {
    canvas.renderMeshView([{ kind: 'node', id: 'click-test', label: 'clickable', status: 'alive', health: 100 }], { onlyKind: 'node' });
    let received = null;
    canvas.onNodeClick((n) => { received = n; });
    const g = meshLayerOf(svg).children.find((el) => el.attrs['data-node-id'] === 'click-test');
    assert.ok(g, 'expected to find the real rendered node group');
    g.click();
    assert.ok(received, 'onNodeClick callback should have fired');
    assert.strictEqual(received.id, 'click-test');
    assert.strictEqual(received.status, 'alive');
    canvas.onNodeClick(null); // real cleanup — don't leak this callback into later tests
  });

  test('BDM-009', 'unmount() clears all dynamic mesh state cleanly', () => {
    canvas.unmount();
    // Real check: mounting again should start from a real, empty mesh layer.
    const container2 = new FakeEl('div');
    const svg2 = canvas.mount(container2);
    const ids = liveMeshNodeIds(svg2);
    assert.strictEqual(ids.length, 0, 'a fresh mount should have zero dynamic mesh nodes until a real fetch/event populates it');
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exitCode = failed ? 1 : 0;
}

run();
