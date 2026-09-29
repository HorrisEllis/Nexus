'use strict';
/**
 * tests/modules/nexus-nerve.test.js
 * Tests for ui/tv-shell/nerve/nerve.js's logic, extracted for Node testing.
 * The canvas rendering itself needs a real browser, but the data pipeline
 * (wire filtering, pressure mapping, node layout) is pure logic testable here.
 */

const assert = require('assert');
let passed = 0, failed = 0;

function test(desc, fn) {
  try { fn(); console.log(`  ✓ ${desc}`); passed++; }
  catch(e) { console.error(`  ✗ ${desc}\n    ${e.message}`); failed++; }
}

// ── Extracted logic — matches nerve.js exactly ────────────────────────────
const LAYOUT = {
  orchestrator:[.50,.12],guardian:[.80,.30],cortex:[.80,.70],
  copilot:[.50,.88],idearium:[.20,.70],emerge:[.20,.30],
  ollama:[.65,.50],eravos:[.35,.50],browser:[.93,.50],ui:[.07,.50],
};

function regimeColor(regime, alpha) {
  const a = (alpha !== undefined ? alpha : 1).toFixed(2);
  if (regime === 'critical') return `rgba(255,68,102,${a})`;
  if (regime === 'stressed') return `rgba(255,180,84,${a})`;
  return `rgba(0,245,255,${a})`;
}

function filterWires(rawWires) {
  return rawWires
    .filter(w => w.from?.surface && w.to?.surface
              && w.from.surface !== '*'           && w.to.surface !== '*'
              && w.from.surface !== 'browser-tab' && w.to.surface !== 'browser-tab')
    .map(w => ({ from: w.from.surface, to: w.to.surface, seam: !!w.seam, pressure: 0 }));
}

function updatePressures(nodes, wires, sigma) {
  for (const n of Object.values(nodes)) n.pressure = 0;
  for (const w of wires) {
    const p = Math.min(1, sigma + (w.seam ? 0 : 0.08));
    w.pressure = p;
    if (nodes[w.from]) nodes[w.from].pressure = Math.max(nodes[w.from].pressure, p);
    if (nodes[w.to])   nodes[w.to].pressure   = Math.max(nodes[w.to].pressure,   p);
  }
}

// ── Real hooks/index.js data ──────────────────────────────────────────────
const hooks  = require(require('path').join(__dirname, '..', '..', 'hooks/index.js'));
const raw    = hooks.allHooks();
const REAL_WIRES = filterWires(raw.filter(w => w.type === 'event-bus' || w.type === 'stream'));

test('NNT-01 real hooks data produces a non-empty wire list', () => {
  assert.ok(REAL_WIRES.length > 0, 'wire list should not be empty');
});

test('NNT-02 browser-tab surfaces are filtered from the real wire list', () => {
  const hasBrowserTab = REAL_WIRES.some(w => w.from === 'browser-tab' || w.to === 'browser-tab');
  assert.ok(!hasBrowserTab, 'browser-tab should be excluded from the nerve graph');
});

test('NNT-03 every wire has a valid from and to surface string', () => {
  for (const w of REAL_WIRES) {
    assert.ok(typeof w.from === 'string' && w.from.length > 0, `wire missing from: ${JSON.stringify(w)}`);
    assert.ok(typeof w.to   === 'string' && w.to.length > 0,   `wire missing to: ${JSON.stringify(w)}`);
  }
});

test('NNT-04 pressure at sigma=0: unseamed wires have 0.08 boost, seamed wires have 0', () => {
  const nodes = { a: { id: 'a', pressure: 0 }, b: { id: 'b', pressure: 0 } };
  const wires = [
    { from: 'a', to: 'b', seam: false, pressure: 0 },
    { from: 'a', to: 'b', seam: true,  pressure: 0 },
  ];
  updatePressures(nodes, wires, 0);
  assert.strictEqual(wires[0].pressure, 0.08);
  assert.strictEqual(wires[1].pressure, 0);
});

test('NNT-05 pressure clamped to 1.0 at high sigma', () => {
  const nodes = { a: { pressure: 0 }, b: { pressure: 0 } };
  const wires = [{ from: 'a', to: 'b', seam: false, pressure: 0 }];
  updatePressures(nodes, wires, 1.0); // sigma at max
  assert.strictEqual(wires[0].pressure, 1.0);
});

test('NNT-06 node pressure = max of all its wires, not sum', () => {
  const nodes = { hub: { pressure: 0 }, a: { pressure: 0 }, b: { pressure: 0 } };
  const wires = [
    { from: 'hub', to: 'a', seam: true,  pressure: 0 },
    { from: 'hub', to: 'b', seam: false, pressure: 0 },
  ];
  updatePressures(nodes, wires, 0);
  assert.strictEqual(nodes.hub.pressure, 0.08); // max of 0, 0.08 — not 0+0.08
});

test('NNT-07 all 10 LAYOUT systems get valid fractional positions', () => {
  for (const [id, [fx, fy]] of Object.entries(LAYOUT)) {
    assert.ok(fx >= 0 && fx <= 1, `${id} x position out of range: ${fx}`);
    assert.ok(fy >= 0 && fy <= 1, `${id} y position out of range: ${fy}`);
  }
});

test('NNT-08 regime colors — correct per regime', () => {
  assert.ok(regimeColor('stable').includes('0,245,255'));
  assert.ok(regimeColor('stressed').includes('255,180,84'));
  assert.ok(regimeColor('critical').includes('255,68,102'));
});

test('NNT-09 unknown regime falls back to stable color', () => {
  assert.ok(regimeColor('unknown').includes('0,245,255'));
});

// §0.39.282 — pinned 80 hooks when the registry held 80; it holds 157 now and the pin failed on every addition.
// It now checks what the summary claims against the hooks themselves: the totals add up, and 10 systems.
test('NNT-10 real hooks/summary: the total is the sum of its parts, across 10 systems', () => {
  const s = hooks.summary();
  assert.ok(s.total > 0);
  assert.strictEqual(Object.values(s.byType).reduce((a, b) => a + b, 0), s.total, 'byType adds up to total');
  assert.ok(s.active + s.deprecated + s.seed <= s.total, 'active + deprecated + seed within total');
  assert.strictEqual(s.systems, 10);
});

console.log(`\n  nexus-nerve: ${passed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);
