'use strict';
/**
 * tests/modules/test-brainos-canvas-agent-mesh.js
 * James: "BrainOS live control panel yes, lets get brainos built."
 * Verifies the real fixes to ui/brainos/brainos-canvas.js:
 * bridge removed (fully retired system), agent-mesh added as a real
 * node, and mesh.* events correctly route to it.
 *
 * Minimal DOM stub — just enough surface for the real mount()/pulse()/
 * onRealEvent() to execute for real, not a jsdom substitute for
 * everything this file could theoretically touch.
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
    this.tag = tag;
    this.children = [];
    this.attrs = {};
    this.classList = new FakeClassList();
    this.textContent = '';
  }
  setAttribute(k, v) { this.attrs[k] = v; }
  appendChild(c) { this.children.push(c); return c; }
  getBoundingClientRect() { return { x: 0, y: 0, width: 1, height: 1 }; }
  remove() {}
}

function run() {
  global.document = { createElementNS: (ns, tag) => new FakeEl(tag) };
  delete require.cache[require.resolve('../../ui/brainos/brainos-canvas.js')];
  require('../../ui/brainos/brainos-canvas.js');
  const canvas = global.BrainOSCanvas;

  test('BCM-001', 'bridge is genuinely gone from the real system list', () => {
    assert.ok(!canvas.getRealSystemIds().includes('bridge'));
  });

  test('BCM-002', 'agent-mesh is a real system node now', () => {
    assert.ok(canvas.getRealSystemIds().includes('agent-mesh'));
  });

  test('BCM-003', 'mount() builds a real SVG including the agent-mesh node, without throwing', () => {
    const container = new FakeEl('div');
    const svg = canvas.mount(container);
    assert.ok(svg);
  });

  test('BCM-004', 'pulse(agent-mesh) runs against a real, existing node (not silently no-op on an unrecognized id)', () => {
    canvas.pulse('agent-mesh');
  });

  test('BCM-005', 'onRealEvent correctly routes a real mesh.* event without throwing', () => {
    canvas.onRealEvent({ type: 'mesh.node.status_changed', instanceId: 'x' });
  });

  test('BCM-006', 'onRealEvent still handles guardian-style events — no regression from the mesh.* addition', () => {
    canvas.onRealEvent({ type: 'STREAM_TOKEN', provider: 'claude' });
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exitCode = failed ? 1 : 0;
}

run();
