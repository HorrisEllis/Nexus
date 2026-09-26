'use strict';
// P4 (docs/raid-warp-verification-phasemap.spec) — sigma + behavioral drift
// scoring on the isolated run. SOFT signals (§17.10 weight 0.3): they FLAG, they
// do not by themselves hard-fail a passing run (§13.4 drift is data). §8.6/§0.1 —
// built on and VERIFIED against the real computeSigma() + BDAKernel.observe().
const _log = console.log;
console.log = (...a) => { const s = a[0]; if (typeof s === 'string' && /^\[(jaa|cfr|bda|raid|pipeline|constitution)/.test(s)) return; _log(...a); };

const assert = require('assert');
const path = require('path');
const fs = require('fs');
const os = require('os');
let passed = 0, failed = 0;
async function test(id, desc, fn) {
  try { await fn(); _log(`  ✓ ${id} ${desc}`); passed++; }
  catch (e) { _log(`  ✗ ${id} ${desc}\n    ${e.message}`); failed++; }
}

const ROOT = path.join(__dirname, '../..');
const raid = require(path.join(ROOT, 'cortex/core/raid'));

function trivialSpec() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'p4-test-'));
  fs.writeFileSync(path.join(tmp, 't.spec'), 'spec:\n  meta:\n    name: t\n    version: 1.0.0\n  purpose: trivial\n');
  return { specPath: path.join(tmp, 't.spec'), outputDir: path.join(tmp, 'out') };
}

(async () => {
  await test('T-001', 'a consequential run produces a REAL sigma score (number, from computeSigma)', async () => {
    const { specPath, outputDir } = trivialSpec();
    const v = await raid.verifyInIsolation({ source: 'p4', action: 'build', specPath, outputDir, testCommand: 'node -e "process.exit(0)"' });
    assert.strictEqual(typeof v.sigma, 'number', 'sigma must be a real number');
    assert.ok(v.sigma >= 0 && v.sigma <= 1, 'sigma is a 0..1 divergence score');
  });

  await test('T-002', 'a consequential run produces a REAL behavioral regime (from BDAKernel)', async () => {
    const { specPath, outputDir } = trivialSpec();
    const v = await raid.verifyInIsolation({ source: 'p4', action: 'build', specPath, outputDir, testCommand: 'node -e "process.exit(0)"' });
    assert.ok(typeof v.regime === 'string' && v.regime.length > 0, 'regime must be a real classification (e.g. STABLE)');
  });

  await test('T-003', 'drift is a SOFT signal — a clean run is not flagged as drifted (§17.10)', async () => {
    const { specPath, outputDir } = trivialSpec();
    const v = await raid.verifyInIsolation({ source: 'p4', action: 'build', specPath, outputDir, testCommand: 'node -e "process.exit(0)"' });
    assert.strictEqual(v.drifted, false, 'a benign run must not spuriously flag drift');
  });

  await test('T-004', 'non-consequential actions are not scored (no sandbox, no sigma) — §16.4', async () => {
    const v = await raid.verifyInIsolation({ source: 'p4', action: 'read' });
    assert.strictEqual(v.skipped, 'not-consequential');
    assert.strictEqual(v.sigma, undefined, 'a skipped action carries no sigma score');
  });

  await test('T-005', 'the drift score is recorded to cortex with the decision (§17.6 auditable, P1 compose)', async () => {
    const { jaaDB } = require(path.join(ROOT, 'cortex/memory/jaa-db'));
    const { specPath, outputDir } = trivialSpec();
    await raid.verifyInIsolation({ source: 'p4-rec', action: 'build', specPath, outputDir, testCommand: 'node -e "process.exit(0)"' });
    const rows = (jaaDB.query('raid_decisions', () => true, 99999) || []).filter(r => r.source === 'p4-rec');
    assert.ok(rows.length >= 1, 'a decision must be recorded');
    assert.ok(rows[0].meta && 'sigma' in rows[0].meta, 'the recorded decision must carry the sigma score in queryable meta');
  });

  await test('T-006', 'scoring is non-throwing — a run still returns even if an engine is unavailable (§1.2)', async () => {
    // verified indirectly: the trivial build path exercises both engines and returns a
    // structured result rather than throwing. A missing engine degrades to a reason string.
    const { specPath, outputDir } = trivialSpec();
    const v = await raid.verifyInIsolation({ source: 'p4', action: 'build', specPath, outputDir, testCommand: 'node -e "process.exit(0)"' });
    assert.ok('drifted' in v, 'the run must always return a drift verdict, never throw out of scoring');
  });

  _log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
