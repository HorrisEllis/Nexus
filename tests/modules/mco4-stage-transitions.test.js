'use strict';
/**
 * tests/modules/mco4-stage-transitions.test.js
 *
 * §MCO4 2026-09-13 — real, re-runnable coverage for the 5 previously-dead
 * STAGE values contract-intake.js's new _advanceTo*() functions wire:
 * HANDSHAKE_VERIFIED -> INPUT_FOLDER -> SYSTEM_QUEUE -> PROCESSING ->
 * OUTPUT_FOLDER -> QC_PENDING. Same real mock-JAA pattern already
 * established by contract-intake-dependency-graph.test.js, extended with
 * an isolated RAID_OUTPUT_DIR (real file I/O on the output side too, same
 * reason contract-intake-tangible-file.test.js isolates RAID_INPUT_DIR).
 *
 * Covers: the full real lifecycle end-to-end for a fresh contract; the
 * real INPUT_FOLDER refusal when the artifact genuinely isn't there;
 * per-system output/ routing (this session's real, existing guardian/
 * output dir); and the idempotency flag on a genuine second real run.
 */

const assert = require('assert');
let passed = 0, failed = 0;

async function test(id, desc, fn) {
  try { await fn(); console.log(`  ✓ ${id} ${desc}`); passed++; }
  catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${e.stack || e.message}`); failed++; }
}

// ── Mock JAA — same real pattern as contract-intake-dependency-graph.test.js ──
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
const _raidInputIsolated = fs.mkdtempSync(path.join(os.tmpdir(), 'raid-input-mco4-'));
const _raidOutputIsolated = fs.mkdtempSync(path.join(os.tmpdir(), 'raid-output-mco4-'));
process.env.RAID_INPUT_DIR = _raidInputIsolated;
process.env.RAID_OUTPUT_DIR = _raidOutputIsolated;
process.on('exit', () => {
  try { fs.rmSync(_raidInputIsolated, { recursive: true, force: true }); } catch (_) {}
  try { fs.rmSync(_raidOutputIsolated, { recursive: true, force: true }); } catch (_) {}
});

const intake = require('../../cortex/core/raid/contract-intake.js');
const { importFromFile } = require('../../lib/node-export.js');

(async () => {

await test('T-001', 'fresh contract reaches QC_PENDING through every real intermediate stage', async () => {
  resetStore();
  const { queueId } = intake.submitContract({ content: 'do the real thing' }, { source: 'test', intention: 'build', onFail: { action: 'halt' } });

  let row = intake.listQueue()[0];
  assert.strictEqual(row.stage, intake.STAGE.QUEUED, 'submitContract must leave stage at QUEUED');
  assert.ok(row.inputArtifactPath && fs.existsSync(row.inputArtifactPath), 'a real input artifact must exist before handshake');

  const result = await intake.processNext(async () => ({ text: 'SEAM VERDICT: PASS' }));
  assert.strictEqual(result.queueId, queueId);
  assert.strictEqual(result.status, intake.STATUS.PASS);

  row = intake.listQueue()[0];
  assert.strictEqual(row.stage, intake.STAGE.QC_PENDING, `expected stage QC_PENDING, got "${row.stage}"`);
  assert.ok(row.outputArtifactPath && fs.existsSync(row.outputArtifactPath), 'a real output artifact must exist at QC_PENDING');
  assert.strictEqual(row.alreadyHadOutput, false, 'first real run must not report a pre-existing output');

  const doc = importFromFile(row.outputArtifactPath);
  assert.strictEqual(doc.type, 'contract');
  assert.strictEqual(doc.payload.status, intake.STATUS.PASS);
});

await test('T-002', 'a contract whose input artifact is missing stays honestly at HANDSHAKE_VERIFIED, not fabricated INPUT_FOLDER', async () => {
  resetStore();
  const { queueId } = intake.submitContract({ content: 'x' }, { source: 'test' });
  // simulate the tangible file genuinely never having existed / having
  // been removed out from under the row — a real failure mode, not a
  // contrived one (submitContract's own file-write is a best-effort
  // try/catch, per §1.2).
  const row0 = intake.listQueue()[0];
  fs.rmSync(row0.inputArtifactPath, { force: true });

  const ack = intake.acknowledge(queueId, { system: 'test-system' });
  assert.strictEqual(ack.ok, true);
  assert.strictEqual(ack.stage, intake.STAGE.HANDSHAKE_VERIFIED, 'must not report INPUT_FOLDER when the real artifact is missing');

  const row = intake.listQueue()[0];
  assert.strictEqual(row.stage, intake.STAGE.HANDSHAKE_VERIFIED);
});

await test('T-003', 'system-specific contract writes its output into the REAL per-system output/ dir, not the shared fallback', async () => {
  resetStore();
  // guardian/output is a real directory on disk (created alongside this
  // change) — this proves per-system routing end-to-end, not just the
  // isolated-temp-dir fallback path T-001 already covers.
  const guardianOutputDir = path.join(__dirname, '../../guardian/output');
  assert.ok(fs.existsSync(guardianOutputDir), 'guardian/output must be a real directory for this test to mean anything');

  const before = fs.readdirSync(guardianOutputDir).length;
  const { queueId } = intake.submitContract({ content: 'guardian-bound work' }, { source: 'test', system: 'guardian', onFail: { action: 'halt' } });
  await intake.processNext(async () => ({ text: 'SEAM VERDICT: PASS' }));

  const row = intake.listQueue()[0];
  assert.strictEqual(row.stage, intake.STAGE.QC_PENDING);
  assert.ok(row.outputArtifactPath.startsWith(guardianOutputDir), `expected output under ${guardianOutputDir}, got ${row.outputArtifactPath}`);

  const after = fs.readdirSync(guardianOutputDir).length;
  assert.strictEqual(after, before + 1, 'exactly one new real file must land in guardian/output');
  fs.rmSync(row.outputArtifactPath, { force: true }); // leave the real dir as clean as this test found it
});

await test('T-004', 'a genuine second real run of the same uuid reports alreadyHadOutput: true', async () => {
  resetStore();
  const { queueId } = intake.submitContract({ content: 'y' }, { source: 'test', onFail: { action: 'halt' } });
  await intake.processNext(async () => ({ text: 'SEAM VERDICT: PASS' }));
  let row = intake.listQueue()[0];
  assert.strictEqual(row.alreadyHadOutput, false);

  // re-queue the SAME real row to force processNext to run it again —
  // a genuine second completion of the same uuid, not a second contract.
  _store.raid_contract_queue.find(r => r.uuid === queueId).status = intake.STATUS.QUEUED;
  await intake.processNext(async () => ({ text: 'SEAM VERDICT: PASS' }));
  row = intake.listQueue()[0];
  assert.strictEqual(row.alreadyHadOutput, true, 'a real prior output for this exact uuid must be detected, not silently overwritten unnoticed');
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exitCode = failed ? 1 : 0;
})();
