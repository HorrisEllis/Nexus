'use strict';
/**
 * tests/modules/mco6-reconcile-on-boot.test.js
 *
 * §MCO6/IC9 2026-09-13 — fast, mock-JAA unit coverage for
 * reconcileOnBoot()'s three real dispositions (resume/retry/escalate).
 * scripts/mco6-ic9-kill-and-restart.js is the slow, real, end-to-end
 * proof (actual child process, actual SIGKILL, actual restart) — this
 * file exists so CI gets fast, repeatable coverage of the same decision
 * logic without spawning real processes on every run.
 */

const assert = require('assert');
let passed = 0, failed = 0;

async function test(id, desc, fn) {
  try { await fn(); console.log(`  ✓ ${id} ${desc}`); passed++; }
  catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${e.stack || e.message}`); failed++; }
}

let _store = {};
function resetStore() { _store = { raid_contract_queue: [] }; }
resetStore();

require.cache[require.resolve('../../cortex/memory/jaa-db')] = {
  id: '../memory/jaa-db', filename: '../memory/jaa-db', loaded: true,
  exports: {
    uid: () => require('crypto').randomUUID(),
    jaaDB: {
      query:  (t, fn, n) => (_store[t] || []).filter(fn).slice(0, n || 999),
      insert: (t, r) => { (_store[t] = _store[t] || []).push(r); return r; },
      update: (t, id, patch) => {
        const row = (_store[t] || []).find(r => r.uuid === id);
        if (row) Object.assign(row, patch);
        return row;
      },
      delete: (t, id) => { _store[t] = (_store[t] || []).filter(r => r.uuid !== id); },
    },
  },
};

const fs = require('fs');
const os = require('os');
const path = require('path');
const _in  = fs.mkdtempSync(path.join(os.tmpdir(), 'ic9-mock-in-'));
const _out = fs.mkdtempSync(path.join(os.tmpdir(), 'ic9-mock-out-'));
process.env.RAID_INPUT_DIR = _in;
process.env.RAID_OUTPUT_DIR = _out;
process.on('exit', () => {
  try { fs.rmSync(_in, { recursive: true, force: true }); } catch (_) {}
  try { fs.rmSync(_out, { recursive: true, force: true }); } catch (_) {}
});

const intake = require('../../cortex/core/raid/contract-intake.js');

(async () => {

await test('IC9-001', 'a row at RUNNING/PROCESSING with no real output and a retryable onFail is retried', async () => {
  resetStore();
  const { queueId } = intake.submitContract({ content: 'x' }, { source: 'test', onFail: { action: 'retry', maxRetries: 2 } });
  // simulate the exact real crash window: processNext() got as far as
  // RUNNING/PROCESSING and never came back.
  const row = _store.raid_contract_queue.find(r => r.uuid === queueId);
  Object.assign(row, { status: intake.STATUS.RUNNING, stage: intake.STAGE.PROCESSING });

  const result = intake.reconcileOnBoot();
  assert.strictEqual(result.checked, 1);
  assert.strictEqual(result.retried.length, 1);
  assert.strictEqual(result.retried[0].queueId, queueId);

  const after = intake.listQueue().find(r => r.uuid === queueId);
  assert.strictEqual(after.status, intake.STATUS.QUEUED);
  assert.strictEqual(after.retryCount, 1);
});

await test('IC9-002', 'a row at RUNNING with no real output and onFail:halt is escalated, not retried', async () => {
  resetStore();
  const { queueId } = intake.submitContract({ content: 'x' }, { source: 'test', onFail: { action: 'halt' } });
  const row = _store.raid_contract_queue.find(r => r.uuid === queueId);
  Object.assign(row, { status: intake.STATUS.RUNNING, stage: intake.STAGE.PROCESSING });

  const result = intake.reconcileOnBoot();
  assert.strictEqual(result.escalated.length, 1);
  const after = intake.listQueue().find(r => r.uuid === queueId);
  assert.strictEqual(after.status, intake.STATUS.FAIL);
  assert.ok(after.blockReason.includes('orphaned by a prior process death'));
});

await test('IC9-003', 'a row that already claims PASS but has no real output artifact is escalated, not trusted', async () => {
  resetStore();
  const { queueId } = intake.submitContract({ content: 'x' }, { source: 'test' });
  const row = _store.raid_contract_queue.find(r => r.uuid === queueId);
  // the exact real gap this function was corrected for while building it:
  // status already terminal, stage never reached QC_PENDING, no real
  // output artifact exists at all.
  Object.assign(row, { status: intake.STATUS.PASS, stage: intake.STAGE.OUTPUT_FOLDER, outputArtifactPath: null });

  const result = intake.reconcileOnBoot();
  assert.strictEqual(result.escalated.length, 1, 'a claimed PASS with no real backing artifact must not be silently trusted');
  const after = intake.listQueue().find(r => r.uuid === queueId);
  assert.strictEqual(after.status, intake.STATUS.FAIL);
});

await test('IC9-004', 'a row with a genuine real output artifact but stage stuck below QC_PENDING is resumed from the artifact, not re-run', async () => {
  resetStore();
  const { queueId } = intake.submitContract({ content: 'x' }, { source: 'test' });
  const row = _store.raid_contract_queue.find(r => r.uuid === queueId);

  const { exportToFile } = require('../../lib/node-export.js');
  const outputPath = exportToFile('contract', queueId, { queueId, status: intake.STATUS.PASS, verdict: 'PASS' }, { system: null }, _out);
  Object.assign(row, { status: intake.STATUS.PASS, stage: intake.STAGE.OUTPUT_FOLDER, outputArtifactPath: outputPath });

  const result = intake.reconcileOnBoot();
  assert.strictEqual(result.resumed.length, 1, 'a real, readable output artifact must be trusted and resumed from, not escalated');
  const after = intake.listQueue().find(r => r.uuid === queueId);
  assert.strictEqual(after.stage, intake.STAGE.QC_PENDING);
  assert.strictEqual(after.status, intake.STATUS.PASS);
});

await test('IC9-005', 'a row already at QC_PENDING is never touched by reconcileOnBoot', async () => {
  resetStore();
  const { queueId } = intake.submitContract({ content: 'x' }, { source: 'test' });
  const row = _store.raid_contract_queue.find(r => r.uuid === queueId);
  Object.assign(row, { status: intake.STATUS.PASS, stage: intake.STAGE.QC_PENDING });

  const result = intake.reconcileOnBoot();
  assert.strictEqual(result.checked, 0, 'a genuinely complete row must not be re-examined');
});

await test('IC9-006', 'a row still genuinely QUEUED (never dispatched) is left alone, not treated as an orphan', async () => {
  resetStore();
  intake.submitContract({ content: 'x' }, { source: 'test' });
  const result = intake.reconcileOnBoot();
  assert.strictEqual(result.checked, 0, 'a row that never started is not a crash victim');
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exitCode = failed ? 1 : 0;
})();
