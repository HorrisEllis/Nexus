'use strict';
const assert = require('assert');
let passed = 0, failed = 0;
async function test(id, desc, fn) {
  try { await fn(); console.log(`  ✓ ${id} ${desc}`); passed++; }
  catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${e.message}`); failed++; }
}

// §2026-07-24 JOB 1 — meta/rfr2's 9 working modules (identity, lazy, time,
// observer, adapter-sandbox, query, delta, enforcement, version-gate) were
// real ESM (`export function` / `export const`) with zero working consumers
// via plain require — only lib/rfr2-bridge.js's async dynamic import() could
// load them at all. Converted mechanically to CJS.
//
// §2026-07-24 JOB 2 — clip/compress/context imported kernel/sigma/adapter,
// none of which existed in rfr2. Harvested all three (plus `causality`, a
// real transitive dependency of kernel discovered while reading it — not in
// the original 3-module scope) from meta/causal-nexus/modules/ (decided
// canonical-vs-ancestor per the 2026-07-21 audit: rfr2 wins, causal-nexus is
// the near-dead ancestor). All 4 harvested modules converted to CJS
// alongside clip/compress/context. rfr2 is now 13/13 real CJS modules — no
// remaining ESM island.

const EXPECTED_EXPORTS = {
  'identity':       ['newEventId', 'isValidEventId', 'shortId', 'canonicalize', 'hash64', 'contentHash', 'dedupKey', 'assertUniqueIds'],
  'lazy':           ['eventTsToWindow', 'lazy'],
  'time':           ['createClock', 'wallNow', 'causalOrder', 'seqPrecedes', 'formatWallTs', 'formatEventTs'],
  'observer':       ['createObserverBus', 'OBSERVER_BUS_LIVE', 'OBSERVER_BUS_REPLAY'],
  'adapter-sandbox':['createNullAdapter', 'createAdapterSandbox', 'AdapterRegistrationError', 'POLICY_READ_ONLY', 'POLICY_LOCAL_ONLY', 'POLICY_FULL', 'VALID_POLICIES'],
  'query':          ['parseQuery', 'execQuery', 'createQueryIndex', 'query', 'CQLSyntaxError', 'QueryResult'],
  'enforcement':    ['getInvariant', 'createRuntimeGuard', 'createBoundaryIndex', 'checkKernelInvariants', 'InvariantViolationError', 'INVARIANTS'],
  'version-gate':   ['validate', 'migrate', 'createVersionGate', 'GateValidationError', 'CURRENT_FORMAT_VERSION', 'CURRENT_KERNEL_VERSION', 'SUPPORTED_MAGICS'],
  'delta':          ['computeEventDelta', 'computeDeltaStream', 'detectBottlenecks', 'clusterByAnomaly', 'computeThroughputTimeline', 'compressToL1', 'overlayMacros', 'detectFractals', 'createGraphBranch', 'createBranchRegistry', 'LATENCY_WINDOW', 'THROUGHPUT_WINDOW', 'BOTTLENECK_THRESHOLD', 'FAN_OUT_ALERT_THRESHOLD', 'DEPTH_ALERT_THRESHOLD', 'ZOOM_LEVELS'],
  // Job 2 — harvested + converted
  'causality':      ['isCausalEdge', 'createEdge', 'createCausalStore', 'createCalltoMap', 'EDGE_CAUSAL_EXPLICIT', 'EDGE_CAUSAL_RULE', 'EDGE_CAUSAL_ADAPTER', 'EDGE_OBSERVATIONAL', 'CAUSAL_EDGE_TYPES'],
  'sigma':          ['computeFeatureTree', 'classify', 'createSigmaEngine', 'REGIMES', 'DOMINANT_CAUSES', 'DEFAULT_CONSTRAINT_CONFIG'],
  'adapter':        ['createAdapter'],
  'kernel':         ['gateOutput', 'createKernel', 'BUILTIN_GATES'],
  'clip':           ['computeStabilityProfile', 'snapshotRange', 'restoreClip', 'validateClipStability', 'CLIP_MAGIC', 'DEFAULT_STABILITY_THRESHOLDS'],
  'compress':       ['snapshot', 'restore', 'blueprint', 'compile', 'compressionReport'],
  'context':        ['createLiveContext', 'createReplayContext', 'CONTEXT_LIVE', 'CONTEXT_REPLAY'],
  'forge':          ['forgeModule', 'forgePatch', 'forgeGate', 'forgeHook', 'ForgePatchRecord'],
};

(async () => {
  for (const [name, exportNames] of Object.entries(EXPECTED_EXPORTS)) {
    await test(`T-${name}-load`, `meta/rfr2/${name} loads via plain require() — no ESM needed`, () => {
      const mod = require(`../../intelligence/rfr2/${name}/index.js`);
      for (const key of exportNames) {
        assert.ok(key in mod, `missing export '${key}'`);
      }
      assert.strictEqual(Object.keys(mod).length, exportNames.length,
        `export count drift — expected ${exportNames.length}, got ${Object.keys(mod).length}`);
    });
  }

  await test('T-barrel', 'meta/rfr2/index.js barrel resolves converted modules synchronously', () => {
    const rfr2 = require('../../intelligence/rfr2/index.js');
    assert.ok(typeof rfr2.query.parseQuery === 'function');
    assert.ok(typeof rfr2.delta.computeDeltaStream === 'function');
    assert.ok(typeof rfr2.identity.newEventId === 'function');
  });

  await test('T-cql-functional', 'CQL actually parses a real query through the converted module', () => {
    const { query } = require('../../intelligence/rfr2/index.js');
    const ast = query.parseQuery("FIND events WHERE type = 'gap.found'");
    assert.strictEqual(ast.scope, 'events');
    assert.strictEqual(ast.conditions.field, 'type');
    assert.strictEqual(ast.conditions.value, 'gap.found');
  });

  await test('T-delta-cross-import', "delta's converted require() of identity/lazy resolves (not left as broken ESM import)", () => {
    const { computeDeltaStream } = require('../../intelligence/rfr2/delta/index.js');
    const events = [{ id: '1', ts: 1000, type: 'a' }, { id: '2', ts: 1010, type: 'b', parent: '1' }];
    const findById = (id) => events.find(e => e.id === id);
    const stream = computeDeltaStream(events, findById, () => ({}), (id) => events.filter(e => e.parent === id));
    assert.strictEqual(stream.length, 2);
  });

  await test('T-bridge-still-works', 'the async ESM bridge (lib/rfr2-bridge.js) still loads converted CJS files unchanged for existing consumers', async () => {
    const { loadRFR2Module } = require('../../lib/rfr2-bridge.js');
    const delta = await loadRFR2Module('delta');
    assert.strictEqual(typeof delta.computeDeltaStream, 'function');
  });

  await test('T-job2-barrel', 'the 4 newly-harvested modules resolve through the barrel too', () => {
    const rfr2 = require('../../intelligence/rfr2/index.js');
    assert.strictEqual(typeof rfr2.kernel.createKernel, 'function');
    assert.strictEqual(typeof rfr2.sigma.classify, 'function');
    assert.strictEqual(typeof rfr2.adapter.createAdapter, 'function');
    assert.strictEqual(typeof rfr2.causality.createCausalStore, 'function');
  });

  await test('T-kernel-functional', 'kernel.createKernel() actually ingests events and builds a real causal graph', () => {
    const { createKernel } = require('../../intelligence/rfr2/kernel/index.js');
    const k = createKernel();
    const e1 = k.ingest('test:start', { x: 1 }, { source: 'test' });
    const e2 = k.ingest('test:child', { x: 2 }, { source: 'test', causedBy: e1.id });
    assert.strictEqual(k.length, 2);
    assert.strictEqual(k.edgeCount, 1);
    const trace = k.traceToRoot(e2.id);
    assert.deepStrictEqual(trace.path, [e1.id, e2.id]);
  });

  await test('T-sigma-functional', 'sigma.classify() actually classifies a real kinematic window into a real regime', () => {
    const { classify, REGIMES } = require('../../intelligence/rfr2/sigma/index.js');
    const window = [
      { latencyImpact: 0.1, throughputChange: 0.1, structuralDeviation: 0.1 },
      { latencyImpact: 0.9, throughputChange: 0.9, structuralDeviation: 0.1 },
      { latencyImpact: 0.1, throughputChange: 0.9, structuralDeviation: 0.1 },
    ];
    const result = classify(window);
    assert.ok(Object.values(REGIMES).includes(result.regime));
  });

  await test('T-adapter-functional', 'adapter.createAdapter() actually translates a real bus event through a real kernel', () => {
    const { createKernel } = require('../../intelligence/rfr2/kernel/index.js');
    const { createAdapter } = require('../../intelligence/rfr2/adapter/index.js');
    const k = createKernel();
    const adapter = createAdapter(k);
    const ev = adapter.handle('page:navigated', { sessionId: 's1' });
    assert.strictEqual(ev.type, 'page:navigated');
  });

  await test('T-compress-round-trip', 'compress.snapshot()/restore() actually round-trips a real kernel — the whole point of Job 2', () => {
    const { createKernel } = require('../../intelligence/rfr2/kernel/index.js');
    const { snapshot, restore } = require('../../intelligence/rfr2/compress/index.js');
    const k = createKernel();
    k.ingest('test:a', { v: 1 }, { source: 'test' });
    const e2 = k.ingest('test:b', { v: 2 }, { source: 'test', causedBy: k.getAll()[0].id });
    k.ingest('test:c', { v: 3 }, { source: 'test', causedBy: e2.id });
    const snap = snapshot(k);
    assert.strictEqual(snap.magic, 'URCK-SNAP');
    const restored = restore(snap);
    assert.strictEqual(restored.length, k.length);
    assert.strictEqual(restored.edgeCount, k.edgeCount);
  });

  await test('T-clip-functional', 'clip.snapshotRange() actually extracts a bounded causal subgraph with a real stability profile', () => {
    const { createKernel } = require('../../intelligence/rfr2/kernel/index.js');
    const { snapshotRange } = require('../../intelligence/rfr2/clip/index.js');
    const k = createKernel();
    k.ingest('test:a', {}, { source: 'test' });
    k.ingest('test:b', {}, { source: 'test' });
    const all = k.getAll();
    const clip = snapshotRange(k, { seqStart: all[0].seq, seqEnd: all[all.length - 1].seq });
    assert.strictEqual(clip.magic, 'NEX-CLIP');
    assert.ok(clip.stabilityProfile);
  });

  await test('T-context-functional', 'context.createLiveContext() actually wraps a real kernel', () => {
    const { createKernel } = require('../../intelligence/rfr2/kernel/index.js');
    const { createLiveContext, CONTEXT_LIVE } = require('../../intelligence/rfr2/context/index.js');
    const k = createKernel();
    const ctx = createLiveContext(k);
    assert.strictEqual(typeof ctx, 'object');
    assert.ok(CONTEXT_LIVE);
  });

  await test('T-job2b-forge-functional', 'forge module has the real 4-entry-point shape (async functions), harvested as the actual live nexus-healer consumer', () => {
    const { forgeModule, forgePatch, forgeGate, forgeHook, ForgePatchRecord } = require('../../intelligence/rfr2/forge/index.js');
    for (const fn of [forgeModule, forgePatch, forgeGate, forgeHook]) {
      assert.strictEqual(fn.constructor.name, 'AsyncFunction', 'forge entry points must remain async functions after conversion');
    }
    assert.strictEqual(typeof ForgePatchRecord, 'object');
  });

  await test('T-job2b-nexus-healer-migrated', 'nexus-healer/api/index.js points at the new rfr2 location, not the old causal-nexus path', () => {
    const fs = require('fs');
    const src = fs.readFileSync(require.resolve('../../nexus-healer/api/index.js'), 'utf8');
    assert.ok(/require\(['"]\.\.\/\.\.\/intelligence\/rfr2\/forge\/index\.js['"]\)/.test(src), 'must require intelligence/rfr2/forge/index.js');
    assert.ok(!/require\(['"]\.\.\/\.\.\/meta\/causal-nexus/.test(src), 'must not still require anything from meta/causal-nexus');
  });

  await test('T-job2-no-esm-remains', 'rfr2 has zero remaining ESM — all 14 modules are real CJS now', () => {
    const fs = require('fs');
    const names = ['identity', 'lazy', 'time', 'observer', 'adapter-sandbox', 'query', 'delta', 'enforcement', 'version-gate', 'causality', 'sigma', 'adapter', 'kernel', 'clip', 'compress', 'context', 'forge'];
    for (const name of names) {
      const src = fs.readFileSync(require.resolve(`../../intelligence/rfr2/${name}/index.js`), 'utf8');
      assert.ok(!/^export /m.test(src) && !/^import /m.test(src), `${name} must have zero remaining ESM syntax`);
    }
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();

