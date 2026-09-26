'use strict';
// P7 (docs/raid-warp-verification-phasemap.spec) — the ONE fused raid.verify()
// every system calls. Composes P2 constitution gate + P3-P6 isolate/drift/
// compare/rewind into a single unified verdict, recorded (P1). §16.5 composes
// the built pieces, no duplication. §10.3 one spine, every caller.
const _log = console.log;
console.log = (...a) => { const s = a[0]; if (typeof s === 'string' && /^\[(jaa|raid|pipeline|cfr|bda|constitution|replay)/.test(s)) return; _log(...a); };

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
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'p7-test-'));
  fs.writeFileSync(path.join(tmp, 't.spec'), 'spec:\n  meta:\n    name: t\n    version: 1.0.0\n  purpose: trivial\n');
  return { specPath: path.join(tmp, 't.spec'), outputDir: path.join(tmp, 'out') };
}

(async () => {
  await test('T-001', 'raid.verify is exported — the one entry every system calls', () => {
    assert.strictEqual(typeof raid.verify, 'function');
  });

  await test('T-002', 'a constitution BLOCK short-circuits — isolation never runs (§17.10 hard gate first)', async () => {
    // forge with no provider → EXPLAINABILITY block
    const v = await raid.verify({ source: 'copilot', action: 'forge', intent: { action: 'forge', target: 'x' } });
    assert.strictEqual(v.approved, false);
    assert.strictEqual(v.stage, 'constitution');
    assert.strictEqual(v.axiom, 'EXPLAINABILITY');
    assert.ok(!v.verdicts.isolation, 'isolation must NOT run when the constitution gate blocks');
  });

  await test('T-003', 'an ALLOWED non-consequential action passes BOTH gates (approved)', async () => {
    // 'tool' and 'ask' are in copilot's allowed_actions and are non-consequential
    const v = await raid.verify({ source: 'copilot', action: 'tool', intent: { action: 'tool' } });
    assert.strictEqual(v.approved, true, 'an allowed non-consequential action must be approved');
    assert.strictEqual(v.stage, 'approved');
    assert.ok(v.verdicts.constitution && v.verdicts.isolation, 'both gate verdicts must be present');
  });

  await test('T-004', 'a contract-denied action is denied at the gate, no isolation', async () => {
    // 'read' is NOT in copilot's allowed_actions
    const v = await raid.verify({ source: 'copilot', action: 'read', intent: { action: 'read' } });
    assert.strictEqual(v.approved, false);
    assert.strictEqual(v.stage, 'constitution');
  });

  await test('T-005', 'a consequential action flows through isolation and snapshots on fail (P6 fused in)', async () => {
    const { specPath, outputDir } = trivialSpec();
    // 'build' is allowed AND consequential → runs the full isolation chain
    const v = await raid.verify({ source: 'copilot', action: 'build', intent: { action: 'build' }, specPath, outputDir, testCommand: 'node -e "process.exit(0)"' });
    assert.strictEqual(v.approved, false, 'the trivial spec fails isolation');
    assert.ok(v.verdicts.isolation, 'the isolation gate must have run');
    assert.ok(v.snapshotId, 'a failed fused verify must be replayable (P6)');
  });

  await test('T-006', 'the fused verdict carries the per-gate breakdown (§17.6 legible)', async () => {
    const v = await raid.verify({ source: 'copilot', action: 'tool', intent: { action: 'tool' } });
    assert.ok(v.verdicts.constitution, 'constitution verdict present');
    assert.ok('isolation' in v.verdicts, 'isolation verdict present');
  });

  _log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
