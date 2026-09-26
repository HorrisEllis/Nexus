'use strict';
/**
 * tests/modules/contract-intake-dependency-graph.test.js
 * UUID: test-contract-intake-dep-graph-v1-0000-0000-000000000001
 *
 * §GAP CLOSED 2026-08-30 — the uploaded 2026-08-29 audit found this
 * directly and correctly: RAID's real dependsOn/onFail dependency graph
 * (cortex/core/raid/contract-intake.js) had genuine, working logic —
 * proven this session via ad-hoc, ephemeral `node -e` scripts — but
 * ZERO permanent test coverage anywhere in tests/. The audit's own
 * words: "not 'untested' in the unit-test sense, but never run once
 * outside its own file." That gap is real even after the ad-hoc
 * verification; this file is the actual, re-runnable fix.
 *
 * Covers: dependency gating (a contract with an unmet dependency
 * correctly blocks, not runs), failure propagation (a failed dependency
 * correctly BLOCKs everything downstream), the positive path (a PASSed
 * dependency correctly unblocks its dependent), retry (onFail:retry
 * re-queues and a later success is recorded correctly), and
 * fallbackAgent (onFail:fallbackAgent correctly swaps the real agent
 * and re-queues).
 */

const assert = require('assert');
let passed = 0, failed = 0;

async function test(id, desc, fn) {
  try { await fn(); console.log(`  ✓ ${id} ${desc}`); passed++; }
  catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${e.message}`); failed++; }
}

// ── Mock JAA — same real pattern as case-library.test.js ────────────────────
let _store = {};
function resetStore() { _store = { raid_contract_queue: [] }; }
resetStore();

require.cache[require.resolve('../../cortex/memory/jaa-db')] = {
  id: '../memory/jaa-db', filename: '../memory/jaa-db', loaded: true,
  exports: {
    uid: () => require('crypto').randomUUID(), // real, contract-intake.js destructures this alongside jaaDB
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
const _raidInputIsolated6 = fs.mkdtempSync(path.join(os.tmpdir(), 'raid-input-depgraph-'));
process.env.RAID_INPUT_DIR = _raidInputIsolated6;
process.on('exit', () => { try { fs.rmSync(_raidInputIsolated6, { recursive: true, force: true }); } catch (_) {} });
const intake = require('../../cortex/core/raid/contract-intake.js');

(async () => {

// ── §A: basic dependency gating ──────────────────────────────────────────────
await test('T-001', 'a contract with an unmet dependency does not run', async () => {
  resetStore();
  // §UPDATED 2026-09-03 — contract-intake.js now gives every contract a
  // real default retry policy when none is declared (James: "we need
  // all files in raids drainer with a retry logic if it fails"). This
  // test's own real intent is dependency-BLOCKING, a separate concern
  // from retry — explicit onFail:halt isolates that, same real contract
  // shape T-002 below still expects (one real failure, no retry, then
  // genuinely 'blocked'), not a side effect of the new default.
  const a = intake.submitContract({ content: 'A' }, { source: 'test', onFail: { action: 'halt' } });
  const b = intake.submitContract({ content: 'B' }, { source: 'test', dependsOn: [a.queueId] });
  const r = await intake.processNext(async () => ({ text: '' })); // runs A (oldest, unblocked), fails it
  assert.strictEqual(r.queueId, a.queueId);
  assert.strictEqual(r.status, 'fail');
  const r2 = await intake.processNext(async () => ({ text: 'unused' }));
  assert.ok(r2 === null || r2.blocked === true);
});

// ── §B: failure propagation ───────────────────────────────────────────────────
await test('T-002', 'a failed dependency permanently BLOCKs its dependent', async () => {
  const bRow = intake.listQueue().find(r => r.contract.content === 'B');
  assert.strictEqual(bRow.status, 'blocked');
});

// ── §C: the positive path ─────────────────────────────────────────────────────
await test('T-003', 'a PASSed dependency correctly unblocks its dependent', async () => {
  resetStore();
  const c = intake.submitContract({ content: 'C' }, { source: 'test' });
  const d = intake.submitContract({ content: 'D' }, { source: 'test', dependsOn: [c.queueId] });
  const rc = await intake.processNext(async () => ({ text: 'ack.\n\nSEAM VERDICT: PASS' }));
  assert.strictEqual(rc.status, 'pass');
  const rd = await intake.processNext(async () => ({ text: 'ack.\n\nSEAM VERDICT: PASS' }));
  assert.strictEqual(rd.queueId, d.queueId);
  assert.strictEqual(rd.status, 'pass');
});

// ── §D: retry ──────────────────────────────────────────────────────────────────
await test('T-004', 'onFail:retry re-queues and a later success is recorded correctly', async () => {
  resetStore();
  intake.submitContract({ content: 'E' }, { source: 'test', onFail: { action: 'retry', maxRetries: 2 } });
  let attempts = 0;
  const exec = async () => { attempts++; return attempts < 2 ? { text: '' } : { text: 'ack.\n\nSEAM VERDICT: PASS' }; };
  const r1 = await intake.processNext(exec);
  assert.strictEqual(r1.status, 'retrying');
  assert.strictEqual(r1.attempt, 1);
  const r2 = await intake.processNext(exec);
  assert.strictEqual(r2.status, 'pass');
  assert.strictEqual(attempts, 2);
});

// ── §E: fallbackAgent ─────────────────────────────────────────────────────────
await test('T-005', 'onFail:fallbackAgent swaps the real agent and re-queues', async () => {
  resetStore();
  intake.submitContract({ content: 'F', forAgent: 'chatgpt' }, {
    source: 'test', forAgent: 'chatgpt', onFail: { action: 'fallbackAgent', agent: 'claude' },
  });
  const r1 = await intake.processNext(async () => ({ text: '' }));
  assert.strictEqual(r1.status, 'retrying_with_fallback_agent');
  assert.strictEqual(r1.fallbackAgent, 'claude');
  const row = intake.listQueue().find(r => r.contract.content === 'F');
  assert.strictEqual(row.forAgent, 'claude');
  const r2 = await intake.processNext(async () => ({ text: 'ack.\n\nSEAM VERDICT: PASS' }));
  assert.strictEqual(r2.status, 'pass');
});

// ── §F: empty queue ────────────────────────────────────────────────────────────
await test('T-006', 'processNext() on a genuinely empty queue returns null, not an error', async () => {
  resetStore();
  const r = await intake.processNext(async () => ({ text: 'unused' }));
  assert.strictEqual(r, null);
});

})().then(() => {
  console.log(`\n${passed} passed  ${failed} failed`);
  if (failed > 0) process.exitCode = 1;
});

module.exports = { passed, failed };
