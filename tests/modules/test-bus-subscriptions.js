'use strict';
/**
 * tests/modules/test-bus-subscriptions.js — pins §B1, the blocker
 * docs/nexus-tablet.spec named for T4: "consumer graph is single-process;
 * most edges do not exist yet" / "cross-process subscriber counts — the
 * connectome's edges. Single-process only."
 *
 * Two simulated processes = two independent EventEmitters publishing into one
 * shared JaaStore, which is exactly what two OS processes are from the store's
 * point of view. Every assertion is against the real JaaStore and the real
 * consumer-registry, no mocks of the thing under test (§1.3).
 *
 * Two API assumptions were wrong on the first attempt and are pinned here so
 * they cannot silently regress:
 *   1. JaaStore has no find() — the read-many method is all().
 *   2. upsert() MERGES ({...existing, ...row}), so it would keep an event type
 *      a system had STOPPED subscribing to alive forever, drawn as a live
 *      edge. insert() with an explicit id does a full replace, which is what a
 *      snapshot requires. T-B1-006 exists solely to hold that line.
 */
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { EventEmitter } = require('events');

let passed = 0, failed = 0;
function test(id, desc, fn) {
  try { fn(); console.log(`  ✓ ${id} ${desc}`); passed++; }
  catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${e.message}`); failed++; }
}

const { JaaStore } = require('../../guardian/jaa-store.js');
const bs = require('../../lib/bus-subscriptions.js');

function freshStore() {
  return new JaaStore(fs.mkdtempSync(path.join(os.tmpdir(), 'b1-test-')));
}
function busWith(...pairs) {
  const b = new EventEmitter();
  for (const [type, count] of pairs) for (let i = 0; i < count; i++) b.on(type, () => {});
  return b;
}

test('T-B1-001', 'a process publishes its own subscription snapshot into the shared store', () => {
  const jaa = freshStore();
  const r = bs.publish({ systemId: 'cortex', bus: busWith(['cfr.updated', 1], ['gap.found', 2]), jaa });
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.types, 2);
  assert.strictEqual(r.totalListeners, 3);
  const rows = jaa.all(bs.TABLE, {});
  assert.strictEqual(rows.length, 1);
  assert.strictEqual(rows[0].systemId, 'cortex');
  assert.strictEqual(rows[0].pid, process.pid, 'the publishing pid is recorded — provenance, not just counts');
});

test('T-B1-002', 'THE B1 FIX: an event consumed in TWO processes reports 2 — the edge that did not exist before', () => {
  const jaa = freshStore();
  bs.publish({ systemId: 'cortex',   bus: busWith(['cfr.updated', 1]), jaa });
  bs.publish({ systemId: 'guardian', bus: busWith(['cfr.updated', 1]), jaa });
  const c = bs.consumersOf('cfr.updated', jaa);
  assert.strictEqual(c.observed, true);
  assert.strictEqual(c.live, 2, 'both processes must be counted — a local listenerCount() can only ever see 1');
  assert.deepStrictEqual(c.bySystem.map(s => s.systemId).sort(), ['cortex', 'guardian']);
});

test('T-B1-003', 'STALENESS IS NOT LIVENESS: a dead process\'s listeners are reported stale, never summed into live', () => {
  const jaa = freshStore();
  bs.publish({ systemId: 'cortex',   bus: busWith(['cfr.updated', 1]), jaa });
  bs.publish({ systemId: 'guardian', bus: busWith(['cfr.updated', 3]), jaa });
  // Age guardian's row past the stale threshold — a crashed process leaves
  // its last snapshot behind exactly like this.
  const g = jaa.all(bs.TABLE, {}).find(r => r.systemId === 'guardian');
  jaa.insert(bs.TABLE, { ...g, ts: Date.now() - (bs.STALE_MS + 10000) });

  const c = bs.consumersOf('cfr.updated', jaa);
  assert.strictEqual(c.live, 1, 'only the fresh process counts as a live edge');
  assert.strictEqual(c.stale, 3, 'the dead process\'s listeners are surfaced as stale, not deleted and not counted live');
  assert.notStrictEqual(c.live + c.stale, c.live, 'live and stale must remain distinguishable — summing them is the confident-and-wrong failure B1 exists to prevent');
  const stale = c.bySystem.find(s => s.systemId === 'guardian');
  assert.strictEqual(stale.stale, true);
  assert.ok(stale.ageMs > bs.STALE_MS);
});

test('T-B1-004', 'edges() yields the cross-process consumer edge list T4 needs, ordered by live weight', () => {
  const jaa = freshStore();
  bs.publish({ systemId: 'cortex',   bus: busWith(['a.evt', 2], ['b.evt', 1]), jaa });
  bs.publish({ systemId: 'guardian', bus: busWith(['a.evt', 1]), jaa });
  const e = bs.edges(jaa);
  assert.strictEqual(e.observed, true);
  assert.strictEqual(e.edges[0].type, 'a.evt', 'heaviest live edge first');
  assert.strictEqual(e.edges[0].live, 3);
  assert.deepStrictEqual(e.edges[0].systems.map(s => s.systemId).sort(), ['cortex', 'guardian']);
  assert.strictEqual(e.edges.find(x => x.type === 'b.evt').live, 1);
});

test('T-B1-005', 'a symbol event name is skipped, not crashed on or stringified into a fake edge', () => {
  const jaa = freshStore();
  const b = new EventEmitter();
  b.on(Symbol('secret'), () => {});
  b.on('real.evt', () => {});
  const r = bs.publish({ systemId: 'x', bus: b, jaa });
  assert.strictEqual(r.types, 1, 'only the string event type is publishable — a symbol means nothing to another process');
});

test('T-B1-006', 'FULL REPLACE, not merge: a system that STOPS subscribing drops the edge — the upsert() bug that would have kept it alive forever', () => {
  const jaa = freshStore();
  bs.publish({ systemId: 'cortex', bus: busWith(['keep.evt', 1], ['dropped.evt', 2]), jaa });
  assert.strictEqual(bs.consumersOf('dropped.evt', jaa).live, 2, 'precondition: the edge exists');
  // Republish with dropped.evt no longer subscribed.
  bs.publish({ systemId: 'cortex', bus: busWith(['keep.evt', 1]), jaa });
  assert.strictEqual(bs.consumersOf('dropped.evt', jaa).live, 0, 'the stale edge must be GONE — jaa.upsert() would have merged it back and drawn it forever');
  assert.strictEqual(bs.consumersOf('keep.evt', jaa).live, 1, 'the surviving edge is unaffected');
  assert.strictEqual(jaa.all(bs.TABLE, {}).length, 1, 'still exactly one current row per system');
});

test('T-B1-007', '§1.1 an anonymous publish is refused loudly', () => {
  const jaa = freshStore();
  assert.throws(() => bs.publish({ bus: busWith(['a', 1]), jaa }), /systemId.*required/i);
});

test('T-B1-008', '§1.2 honest degradation: no store, or a bus with no introspection, is REPORTED — never a silent zero', () => {
  const noStore = bs.publish({ systemId: 'x', bus: busWith(['a', 1]) });
  assert.strictEqual(noStore.ok, false);
  assert.ok(/no JAA store/.test(noStore.reason));

  const noIntrospect = bs.publish({ systemId: 'x', bus: { on() {} }, jaa: freshStore() });
  assert.strictEqual(noIntrospect.ok, false);
  assert.ok(/eventNames/.test(noIntrospect.reason));

  const unread = bs.consumersOf('a.evt', null);
  assert.strictEqual(unread.observed, false);
  assert.strictEqual(unread.live, null, 'unobservable must be null, never 0 — 0 reads as "verified nothing consumes this"');
});

test('T-B1-009', 'consumer-registry.consumers() now aggregates cross-process, and still returns a NUMBER for every existing caller (§5.14)', () => {
  const jaa = freshStore();
  bs.publish({ systemId: 'cortex',   bus: busWith(['shared.evt', 1]), jaa });
  bs.publish({ systemId: 'guardian', bus: busWith(['shared.evt', 2]), jaa });

  const cr = require('../../lib/consumer-registry.js');
  // A local bus that sees NOTHING — proving the count comes from the shared
  // store, not from this process.
  cr.init({ jaa, bus: new EventEmitter() });
  const n = cr.consumers('shared.evt');
  assert.strictEqual(typeof n, 'number', 'existing callers must keep getting a number');
  assert.strictEqual(n, 3, 'the count must come from the cross-process map, not the empty local bus');

  const d = cr.consumersDetailed('shared.evt');
  assert.strictEqual(d.source, 'cross-process');
  assert.strictEqual(d.live, 3);
  assert.strictEqual(d.bySystem.length, 2);
});

test('T-B1-010', 'consumer-registry falls back to the local bus when the shared store holds nothing for a type — degraded, not blind', () => {
  const cr = require('../../lib/consumer-registry.js');
  const localBus = busWith(['local.only', 2]);
  cr.init({ jaa: freshStore(), bus: localBus });
  const d = cr.consumersDetailed('local.only');
  assert.strictEqual(d.source, 'local-bus-only', 'must say WHERE the number came from');
  assert.strictEqual(d.live, 2);
});

test('T-B1-011', 'health() reports live vs stale publishers rather than one confident total', () => {
  const jaa = freshStore();
  bs.publish({ systemId: 'a', bus: busWith(['e', 1]), jaa });
  bs.publish({ systemId: 'b', bus: busWith(['e', 1]), jaa });
  const b = jaa.all(bs.TABLE, {}).find(r => r.systemId === 'b');
  jaa.insert(bs.TABLE, { ...b, ts: Date.now() - (bs.STALE_MS + 5000) });
  const h = bs.health(jaa);
  assert.strictEqual(h.systemsPublishing, 2);
  assert.strictEqual(h.systemsLive, 1);
  assert.strictEqual(h.systemsStale, 1);
  assert.strictEqual(h.totalLiveListeners, 1, 'stale listeners excluded from the live total');
});

test('T-B1-012', 'publishPeriodically publishes immediately and returns an unref\'d timer — telemetry must never hold a process open', () => {
  const jaa = freshStore();
  const t = bs.publishPeriodically({ systemId: 'p', bus: busWith(['e', 1]), jaa, intervalMs: 60000 });
  try {
    assert.strictEqual(jaa.all(bs.TABLE, {}).length, 1, 'must publish once immediately, not only after the first interval');
    assert.ok(t, 'returns the timer so a caller can stop it');
  } finally { clearInterval(t); }
});

test('T-B1-013', 'PUBLISHERS ARE WIRED: cortex and orchestrator both start the publisher, and both do it AFTER their listeners exist', () => {
  const fs2 = require('fs');
  const cortex = fs2.readFileSync(path.join(__dirname, '../../cortex/boot.js'), 'utf8');
  const orch   = fs2.readFileSync(path.join(__dirname, '../../orchestrator.js'), 'utf8');

  assert.ok(/_startSubscriptionPublisher\(\)/.test(cortex), 'cortex must call the publisher');
  assert.ok(/publishPeriodically\(\{\s*systemId: SYSTEM/.test(cortex), 'cortex must publish under its own SYSTEM id');
  // Timing matters: called from _startHeartbeat, which fires on registration
  // success — i.e. after boot wired its listeners. Publishing at module load
  // would snapshot an empty bus and record cortex as consuming nothing.
  const hb = cortex.slice(cortex.indexOf('function _startHeartbeat'), cortex.indexOf('function _startHeartbeat') + 400);
  assert.ok(/_startSubscriptionPublisher\(\)/.test(hb), 'cortex must publish from _startHeartbeat (post-registration), not at module load');

  assert.ok(/_startSubscriptionPublisher\(\)/.test(orch), 'orchestrator must call the publisher');
  assert.ok(/systemId: 'orchestrator'/.test(orch), 'orchestrator must publish under its own id');
  const sw = orch.slice(orch.indexOf('function startWatchdog'), orch.indexOf('function startWatchdog') + 400);
  assert.ok(/_startSubscriptionPublisher\(\)/.test(sw), 'orchestrator must publish from startWatchdog (post-server-bind)');
});

test('T-B1-014', 'a publisher failing to start can never take its system down — both wirings contain the failure loudly', () => {
  const fs2 = require('fs');
  for (const [name, file] of [['cortex', '../../cortex/boot.js'], ['orchestrator', '../../orchestrator.js']]) {
    const src = fs2.readFileSync(path.join(__dirname, file), 'utf8');
    const fn = src.slice(src.indexOf('function _startSubscriptionPublisher'), src.indexOf('function _startSubscriptionPublisher') + 900);
    assert.ok(/try\s*\{/.test(fn) && /catch/.test(fn), `${name}'s publisher must be try/caught — observability must never block boot`);
    assert.ok(/console\.(error|warn)/.test(fn), `${name}'s publisher must fail LOUDLY (§1.2), not silently`);
  }
});

test('T-B1-015', 'BOTH real store facades work — JaaStore (.all) and the jaaDB facade (.query only)', () => {
  const store = freshStore();
  const facade = { insert: (t, r) => store.insert(t, r), query: (t, w, o) => store.all(t, w, o) }; // jaaDB's real shape
  bs.publish({ systemId: 'viaFacade', bus: busWith(['f.evt', 2]), jaa: facade });
  const c = bs.consumersOf('f.evt', facade);
  assert.strictEqual(c.observed, true, 'a query-only facade must be readable — cortex/orchestrator both hold exactly this shape');
  assert.strictEqual(c.live, 2);
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
