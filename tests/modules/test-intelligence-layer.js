'use strict';
// CHUNK H (docs/nexus-observability-tablet-phasemap.spec) — the intelligence
// layer: OB7 optimization, OB8 pattern leverage, OB10 sigma-roles, OB11 edge cases.
const _log = console.log;
console.log = (...a) => { const s = a[0]; if (typeof s === 'string' && s.startsWith('[jaa]')) return; _log(...a); };

const assert = require('assert');
const path = require('path');
let passed = 0, failed = 0;
async function test(id, desc, fn) {
  try { await fn(); _log(`  ✓ ${id} ${desc}`); passed++; }
  catch (e) { _log(`  ✗ ${id} ${desc}\n    ${e.message}`); failed++; }
}
const ROOT = path.join(__dirname, '../..');
const roles = require(path.join(ROOT, 'lib/sigma-roles'));
const leverage = require(path.join(ROOT, 'lib/pattern-leverage'));
const edges = require(path.join(ROOT, 'lib/edge-cases'));
const optimizer = require(path.join(ROOT, 'copilot/optimizer'));

(async () => {
  // ── OB10 ──
  await test('T-001', 'OB10: ONE sigma score reads as FIVE different roles per component intent', () => {
    const sigma = { score: 0.72, axes: { structural: 0.5, temporal: 0.7, contextual: 0.3 } };
    assert.ok(/performance/.test(roles.interpret(sigma, 'execution-pipeline').reading));
    assert.ok(/drift/.test(roles.interpret(sigma, 'gap-engine').reading));
    assert.ok(/expectation/.test(roles.interpret(sigma, 'contract').reading));
    assert.ok(/leverage/.test(roles.interpret(sigma, 'bda').reading));
    assert.ok(/deviation/.test(roles.interpret(sigma, 'raid').reading));
  });
  await test('T-002', 'OB10: the reading carries provenance (which axis drove it)', () => {
    const r = roles.interpret({ score: 0.6, axes: { structural: 0.2, temporal: 0.8, contextual: 0.1 } }, 'performance');
    assert.strictEqual(r.drivingAxis, 'temporal', 'performance is temporal-led');
    assert.ok(r.why.includes('temporal'));
  });
  await test('T-003', 'OB10: severity ladder (nominal/watch/elevated/critical)', () => {
    assert.strictEqual(roles.interpret({ score: 0.1, axes: {} }, 'drift').severity, 'nominal');
    assert.strictEqual(roles.interpret({ score: 0.8, axes: {} }, 'drift').severity, 'critical');
  });

  // ── OB8 ──
  await test('T-004', 'OB8: leverage ranks a rare-critical pattern ABOVE a common-trivial one', () => {
    const ranked = leverage.rankPatterns([
      { name: 'rare', occurrenceCount: 2, impact: 0.9 },
      { name: 'common', occurrenceCount: 100, impact: 0.2 },
    ]);
    assert.strictEqual(ranked[0].name, 'rare', 'importance is not raw frequency');
  });
  await test('T-005', 'OB8: important() surfaces only high-leverage patterns', () => {
    const imp = leverage.important([
      { name: 'big', occurrenceCount: 1, impact: 0.9 },
      { name: 'small', occurrenceCount: 50, impact: 0.1 },
    ]);
    assert.ok(imp.some(p => p.name === 'big') && !imp.some(p => p.name === 'small'));
  });
  await test('T-006', 'OB8: the formula is versioned (drift detectable, §13.4)', () => {
    assert.ok(leverage.FORMULA_VERSION, 'leverage formula must be versioned');
  });

  // ── OB11 ──
  await test('T-007', 'OB11: a known edge case is diagnosed BY NAME', () => {
    const m = edges.matchEdgeCase('copilot', 'ollama offline, confidence null');
    assert.ok(m && m.name === 'ollama_offline', 'must match the known edge case by name');
  });
  await test('T-008', 'OB11: an UNMAPPED fault yields no match → a coverage gap (§13.4 grows from failures)', () => {
    const m = edges.matchEdgeCase('guardian', 'totally novel fault qzx');
    assert.strictEqual(m, null, 'novel fault is unmapped');
    const gap = edges.coverageGap('guardian', 'totally novel fault qzx');
    assert.strictEqual(gap.type, 'edge_case_coverage_gap');
  });

  // ── OB7 ──
  await test('T-009', 'OB7: produces optimization proposals from live observability data', async () => {
    const r = await optimizer.propose({ useIntelligence: false });
    assert.ok(Array.isArray(r.proposals));
    assert.ok('healthy' in r);
  });
  await test('T-010', 'OB7: proposals carry action + leverage + priority, sorted by leverage', async () => {
    const r = await optimizer.propose({ useIntelligence: false });
    for (const p of r.proposals) {
      for (const k of ['target', 'action', 'leverage', 'priority']) assert.ok(k in p, `proposal has ${k}`);
    }
    if (r.proposals.length >= 2) assert.ok(r.proposals[0].leverage >= r.proposals[r.proposals.length - 1].leverage);
  });

  _log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
