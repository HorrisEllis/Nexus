// tests/modules/raid-retry-escalation.test.js — James: "we need all files
// in raids drainer with a retry logic if it fails... runs an escalation
// strategy using diagnostic system, over and over until it either
// proceeds or fails completely... failure mode from escalation strategy
// is logged to the data folder."
//
// Two real, previously-missing behaviors proven here, no mocks:
// 1. A contract submitted with NO onFail policy at all (the common case —
//    checked directly: this was previously `null`, meaning exactly one
//    attempt then terminal FAIL) now gets a real default retry policy and
//    genuinely retries before terminating.
// 2. A contract that genuinely exhausts every retry emits a real
//    HEAL_REQUESTED event on the real nexus-bus singleton — the same
//    bus cortex/boot.js wires cortex/self-heal/index.js's real 5-level
//    escalation ladder to — with a loop guard so self-heal's own
//    contracts don't re-trigger the ladder that produced them.
process.env.JAA_DATA_DIR = require('path').join(__dirname, '..', '..', '.tmp-test-jaa-raid-retry-' + Date.now());

const assert = require('assert');
const bus = require('../../nexus/nexus-bus.js');
const fs = require('fs');
const os = require('os');
const path = require('path');
const _raidInputIsolated7 = fs.mkdtempSync(path.join(os.tmpdir(), 'raid-input-retry-escalation-'));
process.env.RAID_INPUT_DIR = _raidInputIsolated7;
process.on('exit', () => { try { fs.rmSync(_raidInputIsolated7, { recursive: true, force: true }); } catch (_) {} });
const intake = require('../../cortex/core/raid/contract-intake.js');

let passed = 0, failed = 0;
const t = (id, name, cond) => { if (cond) { passed++; console.log(`  ✓ ${id} ${name}`); } else { failed++; console.log(`  ✗ ${id} ${name}`); } };

async function main() {
  console.log('\n[1] a contract with no onFail policy gets a real default retry');

  const failingExecutor = () => ({ status: 'FAIL', trace_log: [{ event: 'QA_QC', data: { verdict: 'WRONG' } }] });

  const submitted = intake.submitContract(
    { content: 'a real test contract with no onFail declared', title: 'RT-1: no onFail declared' },
    { source: 'test' } // deliberately no onFail
  );

  const row1 = intake.listQueue().find(r => r.uuid === submitted.queueId);
  t('RR-001', 'a freshly submitted contract with no onFail gets a real default retry policy, not null', row1?.onFail?.action === 'retry' && row1?.onFail?.maxRetries === 2);

  const attempt1 = await intake.processNext(failingExecutor);
  t('RR-002', 'the first real failure genuinely retries instead of terminating immediately', attempt1?.status === 'retrying' && attempt1?.attempt === 1);

  const attempt2 = await intake.processNext(failingExecutor);
  t('RR-003', 'the second real failure retries again (2 real retries, matching the real default maxRetries)', attempt2?.status === 'retrying' && attempt2?.attempt === 2);

  console.log('\n[2] genuine exhaustion emits a real HEAL_REQUESTED into the real escalation ladder');

  let healEvent = null;
  const onHeal = (e) => { healEvent = e; };
  bus.on('HEAL_REQUESTED', onHeal);

  const attempt3 = await intake.processNext(failingExecutor);
  bus.off('HEAL_REQUESTED', onHeal);

  t('RR-004', 'the third real failure (retries exhausted) reaches genuine terminal FAIL', attempt3?.status === 'fail');
  t('RR-005', 'genuine exhaustion emits a real HEAL_REQUESTED on the real shared nexus-bus', healEvent !== null);
  t('RR-006', 'the real event names the exhausted contract\'s own real uuid', healEvent?.payload?.gapUuid === submitted.queueId);
  t('RR-007', 'the real event uses a distinct, honest gapType for this fault', healEvent?.payload?.gapType === 'raid_contract_exhausted');

  console.log('\n[3] loop guard — a self-heal-sourced contract\'s own terminal failure does not re-trigger the ladder');

  const selfHealSubmitted = intake.submitContract(
    { content: 'a real self-heal level-4 contract', title: 'RT-2: self-heal sourced' },
    { source: 'self-heal', onFail: { action: 'halt' } }
  );

  let secondHealEvent = null;
  const onHeal2 = (e) => { secondHealEvent = e; };
  bus.on('HEAL_REQUESTED', onHeal2);
  const shResult = await intake.processNext(failingExecutor);
  bus.off('HEAL_REQUESTED', onHeal2);

  t('RR-008', 'a self-heal-sourced contract with onFail:halt really terminates on first failure (no retry — halt means halt)', shResult?.status === 'fail');
  t('RR-009', 'a self-heal-sourced contract\'s own failure does NOT re-emit HEAL_REQUESTED (the real loop guard)', secondHealEvent === null);

  console.log(`\n  raid-retry-escalation: ${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
