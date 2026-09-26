'use strict';
// P11 bridge (capstone) — diagnose + repair on prompt. The user asks, co-pilot
// fixes THROUGH the raid.verify spine (P7): applied ONLY on pass; on fail the
// real target is untouched (§2.1) and the failure is replayable (P6). Disposal
// WITH governance. §8.6 drives the existing raid.verify, builds no new engine.
const assert = require('assert');
const path = require('path');
let passed = 0, failed = 0;
async function test(id, desc, fn) {
  try { await fn(); console.log(`  ✓ ${id} ${desc}`); passed++; }
  catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${e.message}`); failed++; }
}

const ROOT = path.join(__dirname, '../..');
const { createRepairOnPrompt } = require(path.join(ROOT, 'copilot/repair-on-prompt'));

(async () => {
  await test('T-001', 'createRepairOnPrompt requires the raid.verify spine (§1.2)', () => {
    assert.throws(() => createRepairOnPrompt({}), /raidVerify.*required/);
  });

  await test('T-002', 'a verified fix is APPLIED (verify passed → commit)', async () => {
    let applied = false;
    const loop = createRepairOnPrompt({
      diagnose: async () => ({ summary: 'fixed', specPath: '/tmp/fix.spec' }),
      raidVerify: async () => ({ approved: true, stage: 'approved' }),
      applyRepair: async () => { applied = true; return { done: true }; },
    });
    const r = await loop.repair('fix it', {});
    assert.strictEqual(r.applied, true);
    assert.strictEqual(applied, true, 'the fix must actually be applied on pass');
  });

  await test('T-003', 'a fix that FAILS verify is NOT applied — real target untouched (§2.1)', async () => {
    let applied = false;
    const loop = createRepairOnPrompt({
      diagnose: async () => ({ summary: 'crash', specPath: '/tmp/fix.spec' }),
      raidVerify: async () => ({ approved: false, stage: 'compare', contractBreach: true, snapshotId: 'snap-1' }),
      applyRepair: async () => { applied = true; },
    });
    const r = await loop.repair('fix the crash', {});
    assert.strictEqual(r.applied, false);
    assert.strictEqual(applied, false, 'a failing fix must NOT touch the real target');
  });

  await test('T-004', 'a failed repair references its replayable snapshot (P6 fused in)', async () => {
    const loop = createRepairOnPrompt({
      diagnose: async () => ({ summary: 'x', specPath: '/tmp/f.spec' }),
      raidVerify: async () => ({ approved: false, stage: 'validate', snapshotId: 'snap-xyz' }),
    });
    const r = await loop.repair('fix', {});
    assert.ok(/snap-xyz/.test(r.message), 'the failure message must reference the replay snapshot');
  });

  await test('T-005', 'a contract breach is explained distinctly (§P5 legible)', async () => {
    const loop = createRepairOnPrompt({
      diagnose: async () => ({ summary: 'x', specPath: '/tmp/f.spec' }),
      raidVerify: async () => ({ approved: false, stage: 'compare', contractBreach: true }),
    });
    const r = await loop.repair('fix', {});
    assert.ok(/regressed against the contract/.test(r.message), 'a contract breach must be named as such');
  });

  await test('T-006', 'without a verifiable spec, co-pilot REFUSES to apply (won\'t apply unverified — §1.1)', async () => {
    let applied = false;
    const loop = createRepairOnPrompt({
      diagnose: async () => ({ summary: 'vague' }),   // no specPath
      raidVerify: async () => ({ approved: true }),
      applyRepair: async () => { applied = true; },
    });
    const r = await loop.repair('something is off', {});
    assert.strictEqual(r.applied, false);
    assert.strictEqual(applied, false, 'no verifiable fix = no apply, even though verify would pass');
  });

  await test('T-007', 'the repair routes through raid.verify with action "repair" (governed)', async () => {
    let sawDecision = null;
    const loop = createRepairOnPrompt({
      diagnose: async () => ({ summary: 'x', specPath: '/tmp/f.spec' }),
      raidVerify: async (d) => { sawDecision = d; return { approved: true, stage: 'approved' }; },
      applyRepair: async () => ({}),
    });
    await loop.repair('fix', { target: 'handler' });
    assert.strictEqual(sawDecision.action, 'repair', 'the repair must be verified as a repair action');
    assert.ok(sawDecision.specPath, 'the fix spec must be passed to the spine');
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
