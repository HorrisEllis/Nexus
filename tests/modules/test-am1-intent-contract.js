'use strict';
/**
 * tests/modules/test-am1-intent-contract.js — real, isolated tests for
 * AM1 (docs/2026-09-02-agent-mesh-full-map-phasemap.spec): per-agent
 * intent contracts, the real RAID handshake gate, and the build-phase
 * contract primitive.
 *
 * §ISOLATION — same convention as test-hat-forge.js: writes real rows
 * to an isolated JAA_DATA_DIR, never production data.
 */
const assert = require('assert');
const path   = require('path');
const fs     = require('fs');
const os     = require('os');

const ROOT = path.join(__dirname, '../..');
const TMP  = fs.mkdtempSync(path.join(os.tmpdir(), 'am1-test-'));
const PRIOR_DIR = process.env.JAA_DATA_DIR;
process.env.JAA_DATA_DIR = TMP;

let passed = 0, failed = 0;
async function test(id, desc, fn) {
  try { await fn(); console.log(`  ✓ ${id} ${desc}`); passed++; }
  catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${e.stack}`); failed++; }
}

const hatSeed = require(path.join(ROOT, 'lib/hat-seed.js'));
hatSeed.seedHats();
const { checkAgentIntentContract } = require(path.join(ROOT, 'lib/agent-intent-contract.js'));
const _raidInputIsolated3 = fs.mkdtempSync(path.join(os.tmpdir(), 'raid-input-am1-'));
process.env.RAID_INPUT_DIR = _raidInputIsolated3;
process.on('exit', () => { try { fs.rmSync(_raidInputIsolated3, { recursive: true, force: true }); } catch (_) {} });
const raidIntake = require(path.join(ROOT, 'cortex/core/raid/contract-intake.js'));

(async () => {

  // ── Part 1: the seeded hats carry real allowedIntents ──────────────────
  const hatForge = require(path.join(ROOT, 'lib/hat-forge.js'));
  await test('AM1-001', 'the_builder carries real allowedIntents matching its own persona', () => {
    const hat = hatForge.get('the_builder');
    assert.ok(hat);
    assert.deepStrictEqual(hat.allowedIntents, ['build', 'write', 'forge']);
  });

  // ── Part 2: checkAgentIntentContract — the real gate logic ─────────────
  await test('AM1-002', 'chatgpt (via the_builder) is allowed a build intent', () => {
    const r = checkAgentIntentContract('chatgpt', 'build');
    assert.strictEqual(r.ok, true);
    assert.strictEqual(r.matchedHat, 'the_builder');
  });

  await test('AM1-003', 'chatgpt (no hat allows chatgpt+delete) is refused a delete intent', () => {
    const r = checkAgentIntentContract('chatgpt', 'delete');
    assert.strictEqual(r.ok, false);
    assert.ok(r.reason.includes('delete'));
    assert.ok(Array.isArray(r.checkedHats) && r.checkedHats.length >= 1);
  });

  await test('AM1-004', 'an agent no hat has ever named is unrestricted, not refused', () => {
    const r = checkAgentIntentContract('mistral', 'delete');
    assert.strictEqual(r.ok, true);
    assert.strictEqual(r.matchedHat, null);
  });

  await test('AM1-005', 'a real invalid base agent is a real error, not a crash', () => {
    const r = checkAgentIntentContract('not_a_real_agent', 'build');
    assert.strictEqual(r.ok, false);
  });

  // ── Part 3: the real RAID acknowledge() gate ────────────────────────────
  await test('AM1-006', 'a build-phase contract to chatgpt is queued and can be acknowledged', () => {
    const { queueId } = raidIntake.submitBuildPhaseContract({
      name: 'test-phase',
      does: 'Write a small real test file to prove the pipeline.',
      forAgent: 'chatgpt',
    });
    const ack = raidIntake.acknowledge(queueId, { system: 'test' });
    assert.strictEqual(ack.ok, true);
    assert.strictEqual(ack.stage, raidIntake.STAGE.HANDSHAKE_VERIFIED);
  });

  await test('AM1-007', 'a contract naming a refused agent+intent combo is blocked at acknowledge(), not silently allowed', () => {
    const { queueId } = raidIntake.submitContract(
      { content: 'delete everything' },
      { source: 'test', forAgent: 'chatgpt', intention: 'delete' },
    );
    const ack = raidIntake.acknowledge(queueId, { system: 'test' });
    assert.strictEqual(ack.ok, false);
    assert.ok(ack.error.includes('intent contract refused'));
    const rows = raidIntake.listQueue();
    const row = rows.find(r => r.uuid === queueId);
    assert.strictEqual(row.status, raidIntake.STATUS.BLOCKED);
  });

  await test('AM1-008', 'submitBuildPhaseContract refuses a phase with no forAgent', () => {
    assert.throws(() => raidIntake.submitBuildPhaseContract({ does: 'do something' }));
  });

  await test('AM1-009', 'submitBuildPhaseContract refuses a phase with no real does text', () => {
    assert.throws(() => raidIntake.submitBuildPhaseContract({ forAgent: 'chatgpt' }));
  });

  // ── Part 4: real artifact-linkage provenance fields (lib/intake.js) ────
  const intake = require(path.join(ROOT, 'lib/intake.js'));
  await test('AM1-010', 'lib/intake.js stage() records jobId/raidQueueId when supplied', () => {
    const tmpFile = path.join(TMP, 'artifact.txt');
    fs.writeFileSync(tmpFile, 'real content');
    const r = intake.stage({
      source: tmpFile,
      intakeDir: path.join(TMP, 'intake'),
      root: TMP,
      provenance: { provider: 'chatgpt', jobId: 'job-123', raidQueueId: 'queue-456' },
    });
    assert.strictEqual(r.ok, true);
    assert.strictEqual(r.contract.provenance.jobId, 'job-123');
    assert.strictEqual(r.contract.provenance.raidQueueId, 'queue-456');
  });

  await test('AM1-011', 'lib/intake.js stage() honestly records null when no correlation was found', () => {
    const tmpFile = path.join(TMP, 'artifact2.txt');
    fs.writeFileSync(tmpFile, 'real content 2');
    const r = intake.stage({
      source: tmpFile,
      intakeDir: path.join(TMP, 'intake2'),
      root: TMP,
      provenance: { provider: 'chatgpt' },
    });
    assert.strictEqual(r.ok, true);
    assert.strictEqual(r.contract.provenance.jobId, null);
    assert.strictEqual(r.contract.provenance.raidQueueId, null);
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  if (PRIOR_DIR === undefined) delete process.env.JAA_DATA_DIR; else process.env.JAA_DATA_DIR = PRIOR_DIR;
  process.exitCode = failed ? 1 : 0;
})();
