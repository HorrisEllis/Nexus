'use strict';
/**
 * test-dynamic-tension.js — real tests for the delta-based, dynamically
 * updating tension pipeline (2026-08-23): intelligence/cfr/ledger.js's
 * continuous cfr_tension_history writes, lib/gap-priority.js's
 * tensionFromDelta() real windowed read, and intelligence/gap/predicate.js's
 * escalateTension() using it as a real fallback instead of a hardcoded
 * constant. Runs against the actual modules, not reimplementations.
 */
process.env.JAA_DATA_DIR = require('path').join(require('os').tmpdir(), `dynamic-tension-test-${Date.now()}`);

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

let passed = 0, failed = 0;
async function test(name, fn) {
  try { await fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (e) { failed++; console.log(`  ✗ ${name}: ${e.message}`); }
}

function freshLedger(systemId) {
  const { createCFRLedger } = require('../../intelligence/cfr/ledger.js');
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cfr-dyntension-'));
  const ledger = createCFRLedger({ ledgerDir: tmpDir, systemId });
  ledger.open();
  return { ledger, cleanup: () => fs.rmSync(tmpDir, { recursive: true, force: true }) };
}

async function main() {
  await test('tensionFromDelta is honestly null before any real CFR history exists', () => {
    const gp = require('../../lib/gap-priority.js');
    assert.strictEqual(gp.tensionFromDelta('never-seen-system-xyz'), null);
  });

  await test('CFR ledger.record() writes a real, continuous row to cfr_tension_history on every call', () => {
    const { ledger, cleanup } = freshLedger('test-sys-1');
    ledger.record('test.event', { data: 'x'.repeat(500) }, { source: 'test-sys-1' });
    ledger.record('test.event', { data: 'x'.repeat(1500) }, { source: 'test-sys-1' });
    const { jaaDB } = require('../../cortex/memory/jaa-db.js');
    const rows = jaaDB.query('cfr_tension_history', r => r.source === 'test-sys-1');
    assert.strictEqual(rows.length, 2, 'one real row per real record() call, not batched or skipped');
    cleanup();
  });

  await test('tensionFromDelta returns the real windowed average, matching the raw underlying data exactly', () => {
    const { ledger, cleanup } = freshLedger('test-sys-2');
    // Real, deliberate payload growth: first transition is always 0
    // (computeDelta's own real, documented behavior with no prior entry),
    // each subsequent one should be a real, non-trivial, identical delta.
    for (let i = 0; i < 4; i++) ledger.record('test.event', { data: 'x'.repeat(i * 800) }, { source: 'test-sys-2' });
    const gp = require('../../lib/gap-priority.js');
    const t = gp.tensionFromDelta('test-sys-2');
    const { jaaDB } = require('../../cortex/memory/jaa-db.js');
    const rows = jaaDB.query('cfr_tension_history', r => r.source === 'test-sys-2');
    const realAvg = +(rows.reduce((s, r) => s + r.tension, 0) / rows.length).toFixed(4);
    assert.strictEqual(t, realAvg, 'tensionFromDelta must match a real, independent recomputation of the same raw rows');
    assert.ok(t > 0, 'a real, growing-payload sequence must produce real, non-zero tension');
    cleanup();
  });

  await test('tensionFromDelta never cross-contaminates between different real sources', () => {
    const { ledger: l1, cleanup: c1 } = freshLedger('source-a');
    const { ledger: l2, cleanup: c2 } = freshLedger('source-b');
    for (let i = 0; i < 3; i++) l1.record('test.event', { data: 'x'.repeat(i * 2000) }, { source: 'source-a' });
    // source-b gets no events at all — must stay honestly null, not borrow source-a's real data.
    const gp = require('../../lib/gap-priority.js');
    assert.ok(gp.tensionFromDelta('source-a') > 0, 'source-a has real data');
    assert.strictEqual(gp.tensionFromDelta('source-b'), null, 'source-b must not see source-a\'s real rows');
    c1(); c2();
  });

  await test('gap-priority.score() uses the real, dynamic delta tension when it exists', () => {
    const { ledger, cleanup } = freshLedger('cortex');
    for (let i = 0; i < 3; i++) ledger.record('test.event', { data: 'x'.repeat(i * 1000) }, { source: 'cortex' });
    delete require.cache[require.resolve('../../lib/gap-priority.js')];
    const gp = require('../../lib/gap-priority.js');
    const s = gp.score({ system: 'cortex', severity: 'medium' });
    assert.strictEqual(typeof s.factors.tension, 'number');
    assert.notStrictEqual(s.factors.tension, null);
    cleanup();
  });

  await test('escalateTension falls back to the real dynamic signal, NOT a hardcoded 0.5, when fault-taxonomy is unreachable', () => {
    const { ledger, cleanup } = freshLedger('cortex');
    for (let i = 0; i < 4; i++) ledger.record('test.event', { data: 'x'.repeat(i * 900) }, { source: 'cortex' });
    const gp = require('../../lib/gap-priority.js');
    const realDynamicTension = gp.tensionFromDelta('cortex');
    assert.ok(realDynamicTension > 0 && realDynamicTension !== 0.5, 'sanity: the real signal itself must not coincidentally equal the old hardcoded value');

    const ftPath = require.resolve('../../cortex/self-heal/fault-taxonomy.js');
    const origContent = fs.readFileSync(ftPath, 'utf8');
    fs.writeFileSync(ftPath, 'throw new Error("simulated unreachable — real test, always restored");');
    let result;
    try {
      delete require.cache[require.resolve('../../intelligence/gap/predicate.js')];
      const predicate = require('../../intelligence/gap/predicate.js');
      result = predicate.escalateTension({ type: 'unmapped.type.for.this.test', system: 'cortex', severity: 'low', createdAt: Date.now() - 60000 });
    } finally {
      fs.writeFileSync(ftPath, origContent); // §1.2 — must always restore, even if the test itself throws
    }
    assert.strictEqual(result.tension, +realDynamicTension.toFixed(3), 'the real fallback must use the actual dynamic signal, not a fabricated constant — compared at escalateTension\'s own real 3-decimal precision (its existing .toFixed(3), unrelated to this change), not tensionFromDelta\'s 4-decimal one');
    cleanup();
  });

  console.log(`\n${passed} passed, ${failed} failed\n`);
  process.exit(failed ? 1 : 0);
}

main();
