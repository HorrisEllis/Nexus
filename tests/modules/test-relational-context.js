'use strict';
// §relational-context (R10) — real token reduction, verified live, direction bug locked in as a regression test.
const assert = require('assert');
const path = require('path');
let passed = 0, failed = 0;
async function test(id, desc, fn) { try { await fn(); console.log(`  ✓ ${id} ${desc}`); passed++; } catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${e.message}`); failed++; } }
const rc = require(path.join(__dirname, '../..', 'lib/relational-context'));

(async () => {
  await test('T-001', 'REGRESSION — upstreamDependencies finds gap-field\'s KNOWN real dependency on diagnostic-causal, not the reverse', async () => {
    // §the actual bug found while building this session: the traversal
    // direction was backwards, verified against this exact known-true
    // relationship (built in R1, certain gap-field calls diagnostic-causal).
    const r = rc.upstreamDependencies('nexus.lib.gap-field');
    const found = r.directDependencies.some(d => d.component === 'nexus.lib.diagnostic-causal');
    assert.ok(found, 'gap-field genuinely calls diagnostic-causal — the traversal must find this as a real dependency, not miss it or find the reverse');
  });

  await test('T-002', 'THE GATE — selectContext returns measurably fewer tokens than the naive baseline, with real numbers', async () => {
    const r = rc.selectContext('nexus.lib.gap-field');
    assert.ok(r.relevantTokens > 0, 'must have real content, not an empty result');
    assert.ok(r.baselineTokens > r.relevantTokens, 'the naive baseline must be larger — that is the entire point');
    assert.ok(r.reduction > 50, `expected a real, substantial reduction, got ${r.reduction}%`);
  });

  await test('T-003', 'relevantContent carries REAL file text, not placeholders', async () => {
    const r = rc.selectContext('nexus.lib.gap-field');
    const gapFieldContent = r.relevantContent[r.relevantFiles.find(f => f.endsWith('gap-field.js'))];
    assert.ok(gapFieldContent.includes('function report'), 'must be the real file content, verifiable against known real source');
  });

  await test('T-004', 'the target component\'s own file is always included in relevantFiles, not just its dependencies', async () => {
    const r = rc.selectContext('nexus.lib.gap-field');
    assert.ok(r.relevantFiles.some(f => f.endsWith('gap-field.js')), 'the target itself must always be part of its own relevant context');
  });

  await test('T-005', 'a nonexistent component id returns an honest empty result, not a crash', async () => {
    assert.doesNotThrow(() => rc.selectContext('nexus.totally.not.real'));
    const r = rc.selectContext('nexus.totally.not.real');
    assert.strictEqual(r.relevantFiles.length, 0);
  });

  await test('T-006', '_estimateTokens is a real, consistent measure, not a placeholder constant', async () => {
    const short = rc._estimateTokens('a');
    const long = rc._estimateTokens('a'.repeat(4000));
    assert.ok(long > short * 100, 'token estimate must scale with real content length');
  });

  console.log(`\n${passed} passed, ${failed} failed`); process.exit(failed ? 1 : 0);
})();
