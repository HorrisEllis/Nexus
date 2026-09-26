'use strict';
const assert = require('assert');
const { makeTestBus } = require('./_test-bus-helper');
let passed = 0, failed = 0;
function test(id, desc, fn) {
  try { fn(); console.log(`  ✓ ${id} ${desc}`); passed++; }
  catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${e.message}`); failed++; }
}

const env = require('../../cortex/core/raid/envelope');
const router = require('../../cortex/core/raid/router');

// Controllable fake capability-registry (the hot-swappable target directory)
let _caps = [];
const fakeRegistry = {
  capabilities: () => _caps,
  resolve: (q) => {
    const hits = _caps.filter(c =>
      c.name.includes(q) || (c.description || '').includes(q) ||
      (c.when || []).some(w => w.includes(q)));
    return hits.length ? { found: true, capabilities: hits } : { found: false, message: 'miss' };
  },
};
function cap(name, over = {}) {
  return { name, namespace: name.split('.')[0], description: `does ${name}`, when: [name], ...over };
}

// ── Envelope ─────────────────────────────────────────────────────────────────
test('E-001', 'make() builds a valid envelope with a CREATED trail entry', () => {
  const e = env.make('find gaps', { from: 'copilot', ts: 1000 });
  assert.ok(env.isValid(e));
  assert.strictEqual(e.status, 'created');
  assert.strictEqual(e.trail.length, 1);
  assert.strictEqual(e.trail[0].system, 'copilot');
});

test('E-002', 'stamp() appends a hop without mutating the original (§0.3)', () => {
  const a = env.make('x', { from: 'ui', ts: 1 });
  const b = env.stamp(a, 'raid', 'routed', { target: 'idearium', ts: 2 });
  assert.strictEqual(a.trail.length, 1, 'original untouched');
  assert.strictEqual(b.trail.length, 2);
  assert.strictEqual(b.target, 'idearium');
  assert.strictEqual(b.status, 'routed');
});

// ── Router: the core principle ───────────────────────────────────────────────
test('R-001', 'START POINT DOESN\'T MATTER: same intent from copilot vs a UI routes identically', () => {
  _caps = [cap('idearium.gap.find', { when: ['find gaps'] })];
  const bus = makeTestBus();
  router.init({ bus, capabilityRegistry: fakeRegistry });
  const decided = [];
  bus.on('raid.route.decided', e => decided.push(e.payload));

  bus.emit('raid.route.request', { envelope: env.make('find gaps', { from: 'copilot' }) });
  bus.emit('raid.route.request', { envelope: env.make('find gaps', { from: 'ui:idearium' }) });

  assert.strictEqual(decided.length, 2);
  assert.strictEqual(decided[0].envelope.target, 'idearium');
  assert.strictEqual(decided[1].envelope.target, 'idearium');
  assert.strictEqual(decided[0].capability, decided[1].capability); // identical routing regardless of origin
  router.stop();
});

test('R-002', 'HOT-SWAP: swap the provider in the registry, RAID routes to the new one — no surface change', () => {
  _caps = [cap('guardian.dispatch', { when: ['run a job'] })];
  const bus = makeTestBus();
  router.init({ bus, capabilityRegistry: fakeRegistry });
  let target = null;
  bus.on('raid.route.decided', e => { target = e.payload.envelope.target; });

  bus.emit('raid.route.request', { envelope: env.make('run a job', { from: 'cli' }) });
  assert.strictEqual(target, 'guardian');

  // provider swapped live — a different system now offers the same intent:
  _caps = [cap('loom.dispatch', { when: ['run a job'] })];
  bus.emit('raid.route.request', { envelope: env.make('run a job', { from: 'cli' }) });
  assert.strictEqual(target, 'loom', 'RAID must route to the newly-announced provider, caller unchanged');
  router.stop();
});

test('R-003', 'explicit capability skips resolution and routes to its namespace', () => {
  _caps = [cap('cortex.memory.search'), cap('idearium.gap.find')];
  const bus = makeTestBus();
  router.init({ bus, capabilityRegistry: fakeRegistry });
  let decided = null;
  bus.on('raid.route.decided', e => { decided = e.payload; });
  bus.emit('raid.route.request', { envelope: env.make('anything', { from: 'copilot', capability: 'cortex.memory.search' }) });
  assert.strictEqual(decided.envelope.target, 'cortex');
  assert.strictEqual(decided.capability, 'cortex.memory.search');
  router.stop();
});

test('R-004', 'NO ROUTE is honest — emits raid.route.no_route, never silently drops (§1.2)', () => {
  _caps = [cap('idearium.gap.find', { when: ['find gaps'] })];
  const bus = makeTestBus();
  router.init({ bus, capabilityRegistry: fakeRegistry });
  let noRoute = null, decided = false;
  bus.on('raid.route.no_route', e => { noRoute = e.payload; });
  bus.on('raid.route.decided', () => { decided = true; });
  bus.emit('raid.route.request', { envelope: env.make('brew coffee', { from: 'copilot' }) });
  assert.ok(noRoute, 'must emit no_route');
  assert.strictEqual(decided, false);
  assert.strictEqual(noRoute.envelope.status, 'no_route');
  router.stop();
});

test('R-005', 'the trail logs every hop: created → routed (the ledger James described)', () => {
  _caps = [cap('idearium.gap.find', { when: ['find gaps'] })];
  const bus = makeTestBus();
  router.init({ bus, capabilityRegistry: fakeRegistry });
  let decided = null;
  bus.on('raid.route.decided', e => { decided = e.payload; });
  bus.emit('raid.route.request', { envelope: env.make('find gaps', { from: 'copilot' }) });
  const trail = decided.envelope.trail;
  assert.strictEqual(trail[0].status, 'created');
  assert.strictEqual(trail[1].status, 'routed');
  assert.strictEqual(trail[1].system, 'cortex/core/raid/router');
  router.stop();
});

test('R-006', 'fulfill() closes the loop: target reports FULFILLED, surface can hear it', () => {
  _caps = [cap('idearium.gap.find', { when: ['find gaps'] })];
  const bus = makeTestBus();
  router.init({ bus, capabilityRegistry: fakeRegistry });
  let fulfilled = null;
  bus.on('raid.route.fulfilled', e => { fulfilled = e.payload; });

  let routed = null;
  bus.on('raid.route.decided', e => { routed = e.payload.envelope; });
  bus.emit('raid.route.request', { envelope: env.make('find gaps', { from: 'copilot' }) });

  // idearium fulfills:
  router.fulfill(routed, { gaps: 3 }, { system: 'idearium' });
  assert.ok(fulfilled);
  assert.strictEqual(fulfilled.envelope.status, 'fulfilled');
  assert.deepStrictEqual(fulfilled.envelope.result, { gaps: 3 });
  // full journey in the trail: created → routed → fulfilled
  assert.deepStrictEqual(fulfilled.envelope.trail.map(t => t.status), ['created', 'routed', 'fulfilled']);
  router.stop();
});

test('R-007', 'invalid envelope is ignored, not thrown', () => {
  const bus = makeTestBus();
  router.init({ bus, capabilityRegistry: fakeRegistry });
  assert.doesNotThrow(() => bus.emit('raid.route.request', { envelope: { junk: true } }));
  router.stop();
});

test('R-008', 'router does not consume its own emissions (§14.4 no loop)', () => {
  _caps = [cap('idearium.gap.find', { when: ['find gaps'] })];
  const bus = makeTestBus();
  router.init({ bus, capabilityRegistry: fakeRegistry });
  let requests = 0;
  bus.on('raid.route.request', () => { requests++; });
  bus.emit('raid.route.request', { envelope: env.make('find gaps', { from: 'copilot' }) });
  assert.strictEqual(requests, 1, 'decided/fulfilled must not re-trigger a request');
  router.stop();
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
