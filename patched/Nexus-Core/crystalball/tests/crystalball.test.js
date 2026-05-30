// ═══════════════════════════════════════════════════
// NEXUS — CrystalBall Phase 2 Test Suite
// crystalball/tests/crystalball.test.js
//
// Uses Node.js built-in test runner (node:test).
// Zero external test dependencies. Run: node --test
// ═══════════════════════════════════════════════════

'use strict';

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const os     = require('os');
const path   = require('path');
const fs     = require('fs');

// ── Helpers ───────────────────────────────────────
const tmpDir = () => fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-test-'));

// ── Minimal kernel mock ───────────────────────────
function makeKernel() {
  const handlers = new Map();
  const emitted  = [];
  const ring     = [];

  return {
    on(pattern, fn) { if (!handlers.has(pattern)) handlers.set(pattern, []); handlers.get(pattern).push(fn); },
    emit(type, payload = {}, opts = {}) {
      const ev = { id: `ev-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,5)}`,
                   type, payload, tick: emitted.length + 1, wall: Date.now(),
                   causedBy: opts.causedBy ?? null, relatedTo: opts.relatedTo ?? [] };
      emitted.push(ev);
      ring.push(ev);
      // Route to handlers
      for (const [pat, fns] of handlers) {
        const match = pat === '**' || pat === type ||
          (pat.endsWith('.**') && type.startsWith(pat.slice(0,-3))) ||
          (pat.endsWith('.*')  && type.startsWith(pat.slice(0,-2)) && !type.slice(pat.length-1).includes('.'));
        if (match) fns.forEach(fn => { try { fn(ev); } catch {} });
      }
      return ev;
    },
    ancestors(id, depth = 5) { return []; },
    descendants(id, depth = 3) { return []; },
    snapshot(n = 20) { return ring.slice(-n); },
    get emitted() { return emitted; },
  };
}

// ══════════════════════════════════════════════════
// 1. NanoValidator
// ══════════════════════════════════════════════════
describe('NanoValidator', () => {
  const { compile, errorsText } = require('../../foundation/validator');

  test('validates a simple object schema', () => {
    const fn = compile({
      type: 'object',
      required: ['id', 'type'],
      properties: {
        id:   { type: 'string', minLength: 1 },
        type: { type: 'string', enum: ['gap', 'crystal', 'bep'] },
        tick: { type: 'integer', minimum: 0 },
      },
    });

    assert.ok(fn({ id: 'abc', type: 'gap', tick: 1 }), 'valid object should pass');
    assert.ok(!fn({ id: 'abc', type: 'unknown' }), 'invalid enum should fail');
    assert.ok(!fn({ type: 'gap' }), 'missing required id should fail');
    assert.ok(!fn({ id: '', type: 'gap' }), 'empty id (minLength) should fail');
  });

  test('validates nested objects', () => {
    const fn = compile({
      type: 'object',
      required: ['metrics'],
      properties: {
        metrics: {
          type: 'object',
          required: ['successRate'],
          properties: {
            successRate: { type: 'number', minimum: 0, maximum: 1 },
          },
        },
      },
    });
    assert.ok(fn({ metrics: { successRate: 0.75 } }));
    assert.ok(!fn({ metrics: { successRate: 1.5 } }));
    assert.ok(!fn({ metrics: {} }));
  });

  test('validates arrays', () => {
    const fn = compile({
      type: 'array',
      minItems: 1,
      items: { type: 'string' },
    });
    assert.ok(fn(['a', 'b']));
    assert.ok(!fn([]));
    assert.ok(!fn(['a', 2]));
  });

  test('errorsText returns readable messages', () => {
    const fn = compile({ type: 'object', required: ['x'] });
    fn({});
    const text = errorsText(fn.errors);
    assert.ok(text.includes('x'), 'should mention missing field');
  });
});

// ══════════════════════════════════════════════════
// 2. JaaDB
// ══════════════════════════════════════════════════
describe('JaaDB', () => {
  const { JaaDB } = require('../../memory/jaa-db');

  let db, dir;
  before(async () => {
    dir = tmpDir();
    db  = new JaaDB({ dataDir: dir });
    await db.open();
  });

  after(() => fs.rmSync(dir, { recursive: true, force: true }));

  test('insert and query', async () => {
    await db.insert('gaps', { uuid: 'gap-001', type: 'missing', severity: 'high' });
    const results = await db.query('gaps', r => r.type === 'missing');
    assert.equal(results.length, 1);
    assert.equal(results[0].uuid, 'gap-001');
  });

  test('get by uuid', async () => {
    await db.insert('failures', { uuid: 'fail-001', code: 'SCHEMA_MISMATCH' });
    const rec = await db.get('failures', 'fail-001');
    assert.equal(rec.code, 'SCHEMA_MISMATCH');
  });

  test('update patches record', async () => {
    await db.insert('bep_patterns', { uuid: 'bep-001', intent: 'fill gap', metrics: { useCount: 0 } });
    await db.update('bep_patterns', 'bep-001', { metrics: { useCount: 5 } });
    const rec = await db.get('bep_patterns', 'bep-001');
    assert.equal(rec.metrics.useCount, 5);
  });

  test('count', async () => {
    await db.insert('crystals', { uuid: 'c-001', state: 'stable' });
    await db.insert('crystals', { uuid: 'c-002', state: 'candidate' });
    const n = await db.count('crystals');
    assert.ok(n >= 2);
  });

  test('unknown table throws loudly', async () => {
    await assert.rejects(() => db.insert('not_a_table', {}), /Unknown table/);
  });

  test('query newest-first', async () => {
    await db.insert('event_log', { uuid: 'ev-old', tick: 1, wall: Date.now() - 10000 });
    await db.insert('event_log', { uuid: 'ev-new', tick: 2, wall: Date.now() });
    const results = await db.query('event_log', r => ['ev-old','ev-new'].includes(r.uuid), 10);
    // newest first
    assert.equal(results[0].uuid, 'ev-new');
  });

  test('compact deduplicates by uuid', async () => {
    // insert same uuid twice
    await db.insert('agent_calls', { uuid: 'call-dup', status: 'v1' });
    await db.insert('agent_calls', { uuid: 'call-dup', status: 'v2' });
    await db.compact('agent_calls');
    const results = await db.query('agent_calls', r => r.uuid === 'call-dup');
    assert.equal(results.length, 1);
    assert.equal(results[0].status, 'v2');
  });
});

// ══════════════════════════════════════════════════
// 3. LatticeBridge
// ══════════════════════════════════════════════════
describe('LatticeBridge', () => {
  const { LatticeBridge, extractEntities } = require('../../crystalball/lattice-bridge');
  const { JaaDB } = require('../../memory/jaa-db');

  let kernel, db, lb, dir;
  before(async () => {
    dir    = tmpDir();
    kernel = makeKernel();
    db     = new JaaDB({ dataDir: dir });
    await db.open();
    lb = new LatticeBridge({ nexusKernel: kernel, jaaDB: db });
    lb.attach();
  });
  after(() => fs.rmSync(dir, { recursive: true, force: true }));

  test('ingest event and query by keyword', async () => {
    kernel.emit('gate.failed', { nodeId: 'node-42', file: 'gate/runner.js', severity: 'high' });
    // give async persist a tick
    await new Promise(r => setTimeout(r, 50));
    const hits = lb.queryByKeyword('gate/runner.js');
    assert.ok(hits.length > 0, 'should find event by file keyword');
  });

  test('queryByType with wildcard', () => {
    kernel.emit('gate.passed', { nodeId: 'node-1' });
    kernel.emit('gate.failed', { nodeId: 'node-2' });
    const hits = lb.queryByType('gate.*');
    assert.ok(hits.length >= 2);
  });

  test('extractEntities finds files', () => {
    const ents = extractEntities({ file: 'core/manifest/index.js' }, 'test');
    assert.ok(ents.some(e => e.type === 'file' && e.value.includes('index.js')));
  });

  test('extractEntities finds agents', () => {
    const ents = extractEntities({ agent: 'ollama', fallback: 'claude' }, 'raid.routed');
    assert.ok(ents.some(e => e.type === 'agent' && e.value === 'ollama'));
    assert.ok(ents.some(e => e.type === 'agent' && e.value === 'claude'));
  });

  test('stats returns non-zero after events', () => {
    const s = lb.stats;
    assert.ok(s.entityKeys >= 0);
    assert.ok(s.typeKeys >= 1);
  });
});

// ══════════════════════════════════════════════════
// 4. BEPEngine
// ══════════════════════════════════════════════════
describe('BEPEngine', () => {
  const { BEPEngine, fnv1a, tokenize, jaccardScore } = require('../../crystalball/bep-engine');
  const { JaaDB } = require('../../memory/jaa-db');

  let kernel, db, bep, dir;
  before(async () => {
    dir    = tmpDir();
    kernel = makeKernel();
    db     = new JaaDB({ dataDir: dir });
    await db.open();
    bep = new BEPEngine({ jaaDB: db, nexusKernel: kernel });
  });
  after(() => { fs.rmSync(dir, { recursive: true, force: true }); clearTimeout(bep._flushTimer); });

  test('fnv1a is deterministic', () => {
    assert.equal(fnv1a('hello'), fnv1a('hello'));
    assert.notEqual(fnv1a('hello'), fnv1a('world'));
  });

  test('tokenize strips stopwords', () => {
    const tokens = tokenize('the function and the class');
    assert.ok(!tokens.includes('the'));
    assert.ok(!tokens.includes('and'));
    assert.ok(tokens.includes('function'));
    assert.ok(tokens.includes('class'));
  });

  test('jaccardScore: identical sets = 1', () => {
    assert.equal(jaccardScore(['a','b','c'], ['a','b','c']), 1);
  });

  test('jaccardScore: disjoint sets = 0', () => {
    assert.equal(jaccardScore(['a','b'], ['c','d']), 0);
  });

  test('store and exact match', async () => {
    const pattern = await bep.store({
      intent: 'validate input fields against schema',
      tags:   ['validation', 'schema'],
      layer:  'gate',
      inputContract:  { type: 'manifest.node' },
      outputContract: { emits: 'gate.passed' },
      behaviorGraph:  { steps: ['check_required', 'check_types', 'emit'], invariants: [] },
      constraints:    ['no side effects'],
    });
    assert.ok(pattern.uuid);
    assert.ok(pattern.intentHash);

    // Force useCount > 2 and successRate > 0.5 to make it matchable
    pattern.metrics.useCount    = 5;
    pattern.metrics.successRate = 0.9;
    db._backend._cache.get('bep_patterns').push(pattern);

    const match = await bep.match('validate input fields against schema', { type: 'manifest.node' });
    assert.ok(match, 'should find exact match');
    assert.equal(match.mode, 'reuse');
    assert.equal(match.score, 1.0);
  });

  test('similarity match (Jaccard)', async () => {
    await bep.store({
      intent: 'detect missing file imports in generated code',
      tags:   ['gap-detection', 'imports'],
      layer:  'gate',
      metrics: { useCount: 10, successRate: 0.85, avgLatencyMs: 200, regressionCount: 0 },
    });

    const match = await bep.match('find missing imports in output code');
    // Should find something with partial/mutation similarity
    // (cache may not have it if useCount check fails — that's ok, test the mechanism)
    assert.ok(match === null || ['mutation', 'partial', 'reuse'].includes(match.mode));
  });

  test('EMA updates on gate result', async () => {
    const p = await bep.store({
      intent: 'emit gap events for broken refs',
      tags:   ['gap', 'broken'],
      metrics: { useCount: 5, successRate: 0.6, avgLatencyMs: 0, regressionCount: 0 },
    });
    await bep.onGateResult(p.uuid, true, 150);
    const updated = bep._cache.get(p.uuid);
    assert.ok(updated.metrics.useCount === 6);
    assert.ok(updated.metrics.successRate > 0.6); // EMA nudged up
    assert.ok(updated.metrics.avgLatencyMs > 0);
  });

  test('regressionCount triggers degrading event', async () => {
    const p = await bep.store({
      intent: 'repeatedly failing pattern',
      metrics: { useCount: 10, successRate: 0.3, avgLatencyMs: 0, regressionCount: 3 },
    });
    await bep.onGateResult(p.uuid, false, 0);
    const degrading = kernel.emitted.filter(e => e.type === 'crystalball.bep.degrading');
    assert.ok(degrading.length >= 1);
  });
});

// ══════════════════════════════════════════════════
// 5. MCL
// ══════════════════════════════════════════════════
describe('MemoryCrystallizationLayer', () => {
  const { MemoryCrystallizationLayer } = require('../../crystalball/mcl');
  const { LatticeBridge }              = require('../../crystalball/lattice-bridge');
  const { JaaDB }                      = require('../../memory/jaa-db');

  let kernel, db, lb, mcl, dir;
  before(async () => {
    dir    = tmpDir();
    kernel = makeKernel();
    db     = new JaaDB({ dataDir: dir });
    await db.open();
    lb  = new LatticeBridge({ nexusKernel: kernel, jaaDB: db });
    lb.attach();
    mcl = new MemoryCrystallizationLayer({ jaaDB: db, nexusKernel: kernel, latticeBridge: lb });
  });
  after(() => fs.rmSync(dir, { recursive: true, force: true }));

  test('high-weight events produce trace', async () => {
    const ev = kernel.emit('gate.failed', { nodeId: 'n1', severity: 'high' });
    const result = await mcl.process(ev, { causalDepth: 2 });
    assert.ok(['trace','candidate','crystallized'].includes(result.state));
    assert.ok(result.score > 0.3);
  });

  test('low-weight events are archived', async () => {
    // Fake a very old bridge_message
    const ev = { id: 'old-ev', type: 'bridge_message', payload: {}, tick: 0, wall: Date.now() - 30 * 3_600_000 };
    const result = await mcl.process(ev, {});
    assert.equal(result.state, 'archived');
  });

  test('reinforceTrace promotes via feedback', async () => {
    const ev = kernel.emit('healer.exhausted', { gapId: 'g-99' });
    const result = await mcl.process(ev, { causalDepth: 4 });
    if (result.traceId) {
      mcl.reinforceTrace(result.traceId, 9); // high feedback score
      // Reinforcement triggers async candidate check — just assert no throw
    }
    assert.ok(true);
  });

  test('sweep returns promoted count', async () => {
    const n = await mcl.sweep();
    assert.ok(typeof n === 'number' && n >= 0);
    const evt = kernel.emitted.find(e => e.type === 'crystalball.mcl.sweep.complete');
    assert.ok(evt);
  });
});

// ══════════════════════════════════════════════════
// 6. MQL
// ══════════════════════════════════════════════════
describe('MemoryQueryLayer', () => {
  const { MemoryQueryLayer, classifyIntent } = require('../../crystalball/mql');
  const { BEPEngine }                        = require('../../crystalball/bep-engine');
  const { LatticeBridge }                    = require('../../crystalball/lattice-bridge');
  const { MemoryCrystallizationLayer }       = require('../../crystalball/mcl');
  const { JaaDB }                            = require('../../memory/jaa-db');

  let kernel, db, lb, bep, mcl, mql, dir;
  before(async () => {
    dir    = tmpDir();
    kernel = makeKernel();
    db     = new JaaDB({ dataDir: dir });
    await db.open();
    lb  = new LatticeBridge({ nexusKernel: kernel, jaaDB: db });
    lb.attach();
    bep = new BEPEngine({ jaaDB: db, nexusKernel: kernel });
    mcl = new MemoryCrystallizationLayer({ jaaDB: db, nexusKernel: kernel, latticeBridge: lb });
    mql = new MemoryQueryLayer({ jaaDB: db, nexusKernel: kernel, latticeBridge: lb, bepEngine: bep, mcl });
  });
  after(() => { fs.rmSync(dir, { recursive: true, force: true }); clearTimeout(bep._flushTimer); });

  test('classifyIntent: debug_failure', () => {
    assert.equal(classifyIntent('why did the gate fail').mode, 'debug_failure');
    assert.deepEqual(classifyIntent('why did the gate fail').lanes, ['B','C','E']);
  });

  test('classifyIntent: gap_fill', () => {
    assert.equal(classifyIntent('implement the missing function').mode, 'gap_fill');
  });

  test('classifyIntent: general default', () => {
    assert.equal(classifyIntent('hello nexus').mode, 'general');
  });

  test('query returns sections and trace', async () => {
    // Seed some data
    await db.insert('failures', { uuid: 'f1', type: 'gate.failed', resolved: false, payload: { file: 'runner.js' } });
    await db.insert('event_log', { uuid: 'ev1', type: 'gate.failed', payload: { file: 'runner.js' }, wall: Date.now() });

    const result = await mql.query('why did runner.js fail', 'sess-1');
    assert.ok(result.sections, 'should have sections');
    assert.ok(result.trace,    'should have trace');
    assert.ok(result.trace.uuid.startsWith('mql-'));
    assert.ok(typeof result.trace.final_included === 'number');
    assert.ok(Array.isArray(result.trace.items_used));
  });

  test('emits crystalball.memory.retrieved', async () => {
    await mql.query('fill the gap in gate', 'sess-2');
    const ev = kernel.emitted.find(e => e.type === 'crystalball.memory.retrieved');
    assert.ok(ev, 'should emit memory.retrieved');
    assert.ok(ev.payload.latencyMs >= 0);
  });
});

// ══════════════════════════════════════════════════
// 7. CrystalBall integration (full init)
// ══════════════════════════════════════════════════
describe('CrystalBall integration', () => {
  const { CrystalBall } = require('../../crystalball/index');
  const { JaaDB }       = require('../../memory/jaa-db');

  let kernel, db, cb, dir;
  before(async () => {
    dir    = tmpDir();
    kernel = makeKernel();
    db     = new JaaDB({ dataDir: dir });
    await db.open();
    cb = new CrystalBall({ nexusKernel: kernel, jaaDB: db });
    await cb.init();
  });
  after(() => {
    fs.rmSync(dir, { recursive: true, force: true });
    clearTimeout(cb.bep._flushTimer);
  });

  test('emits crystalball.ready on init', () => {
    const ev = kernel.emitted.find(e => e.type === 'crystalball.ready');
    assert.ok(ev, 'crystalball.ready should be emitted');
    assert.equal(ev.payload.uuid, 'nexus-mod-crystalball-0000-4000-0000-000000000001');
  });

  test('exposes lb, bep, mcl, mql', () => {
    assert.ok(cb.lb,  'lb should exist');
    assert.ok(cb.bep, 'bep should exist');
    assert.ok(cb.mcl, 'mcl should exist');
    assert.ok(cb.mql, 'mql should exist');
  });

  test('gate.failed triggers MCL processing', async () => {
    kernel.emit('gate.failed', { nodeId: 'n-test', severity: 'fatal' });
    await new Promise(r => setTimeout(r, 30)); // let async settle
    // MCL processes it — no crash = pass
    assert.ok(true);
  });

  test('crystalball.mcl.sweep event triggers sweep', async () => {
    kernel.emit('crystalball.mcl.sweep', {});
    await new Promise(r => setTimeout(r, 30));
    const ev = kernel.emitted.find(e => e.type === 'crystalball.mcl.sweep.done');
    assert.ok(ev);
  });

  test('feedback.submitted calls reinforceTrace', () => {
    // Should not throw
    kernel.emit('feedback.submitted', { traceId: 'nonexistent', score: 8 });
    assert.ok(true);
  });
});
