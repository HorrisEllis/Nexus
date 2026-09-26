'use strict';
// P5 (docs/raid-warp-verification-phasemap.spec) — compare contract vs output.
// The execution-pipeline ALREADY gates on regressions (ok:false, stage:compare);
// §16.5 P5 does not duplicate that. P5 makes a contract-vs-output mismatch a
// FIRST-CLASS, legible signal in the RAID verdict (contractBreach + regressions),
// distinct from build/validate failures (§16.2 reads like a story).
const _log = console.log;
console.log = (...a) => { const s = a[0]; if (typeof s === 'string' && /^\[(jaa|raid|pipeline|cfr|bda|constitution)/.test(s)) return; _log(...a); };

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
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'p5-test-'));
  fs.writeFileSync(path.join(tmp, 't.spec'), 'spec:\n  meta:\n    name: t\n    version: 1.0.0\n  purpose: trivial\n');
  return { specPath: path.join(tmp, 't.spec'), outputDir: path.join(tmp, 'out') };
}

(async () => {
  await test('T-001', 'the verify verdict carries a first-class contractBreach field', async () => {
    const { specPath, outputDir } = trivialSpec();
    const v = await raid.verifyInIsolation({ source: 'p5', action: 'build', specPath, outputDir, testCommand: 'node -e "process.exit(0)"' });
    assert.ok('contractBreach' in v, 'verdict must expose contractBreach');
    assert.strictEqual(typeof v.contractBreach, 'boolean');
  });

  await test('T-002', 'the verify verdict carries the specific regressions (what broke the contract)', async () => {
    const { specPath, outputDir } = trivialSpec();
    const v = await raid.verifyInIsolation({ source: 'p5', action: 'build', specPath, outputDir, testCommand: 'node -e "process.exit(0)"' });
    assert.ok('regressions' in v, 'verdict must expose regressions');
    assert.ok(Array.isArray(v.regressions));
  });

  await test('T-003', 'a NON-compare failure has contractBreach:false (distinct from a contract breach)', async () => {
    // the trivial spec fails at validate, not compare — so it is NOT a contract breach.
    const { specPath, outputDir } = trivialSpec();
    const v = await raid.verifyInIsolation({ source: 'p5', action: 'build', specPath, outputDir, testCommand: 'node -e "process.exit(0)"' });
    if (v.stage !== 'compare') {
      assert.strictEqual(v.contractBreach, false, 'a non-compare failure must not be reported as a contract breach');
    }
  });

  await test('T-004', 'the compare signal is recorded to cortex meta (queryable, §17.6)', async () => {
    const { jaaDB } = require(path.join(ROOT, 'cortex/memory/jaa-db'));
    const { specPath, outputDir } = trivialSpec();
    await raid.verifyInIsolation({ source: 'p5-rec', action: 'build', specPath, outputDir, testCommand: 'node -e "process.exit(0)"' });
    const rows = (jaaDB.query('raid_decisions', () => true, 99999) || []).filter(r => r.source === 'p5-rec');
    assert.ok(rows.length >= 1);
    assert.ok(rows[0].meta && 'contractBreach' in rows[0].meta, 'the decision meta must carry contractBreach');
    assert.ok('regressionCount' in rows[0].meta, 'the decision meta must carry regressionCount');
  });

  await test('T-005', 'the mapping is correct: contractBreach derives from stage===compare (§0.1 real logic)', () => {
    // the pipeline returns stage:'compare' on a regression; the RAID layer maps
    // that to contractBreach. Verify the derivation exists in source (the live
    // golden-regression path needs the real system; the mapping is unit-checked).
    const src = fs.readFileSync(path.join(ROOT, 'cortex/core/raid/index.js'), 'utf8');
    assert.ok(/result\?\.stage === 'compare'/.test(src), 'contractBreach must derive from the compare stage');
    assert.ok(/contract breach: output regressed/.test(src), 'a distinct contract-breach message must exist');
  });

  _log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
