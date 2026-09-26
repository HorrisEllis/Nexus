'use strict';
/**
 * tests/modules/contract-intake-tangible-file.test.js
 *
 * James, repeated, explicit, across this whole session: "all of the
 * contracts are supposed to be tangible files that move in the file
 * system with the actual contract... each system has a input folder."
 *
 * This file's own real header (cortex/core/raid/contract-intake.js)
 * already documented the JAA-vs-files decision explicitly: "a literal
 * folder-drop is a real, different, equally valid interpretation if
 * that's specifically wanted instead." Purely additive — the existing
 * JAA-backed queue is untouched, still the real, working drain/retry
 * mechanism; this just confirms every contract ALSO gets a real,
 * tangible .contract file.
 *
 * Same real, established mock-JAA pattern this exact module's own
 * tests/modules/contract-intake-dependency-graph.test.js already uses
 * (require.cache injection, zero real filesystem/JAA touching for the
 * queue side) — extended with a real, isolated temp directory for
 * RAID_INPUT_DIR, since that part genuinely does real file I/O.
 */

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

let passed = 0, failed = 0;
async function test(id, desc, fn) {
  try { await fn(); console.log(`  ✓ ${id} ${desc}`); passed++; }
  catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${e.message}`); failed++; }
}

const _raidInputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'raid-input-test-'));
process.env.RAID_INPUT_DIR = _raidInputDir;
process.on('exit', () => { try { fs.rmSync(_raidInputDir, { recursive: true, force: true }); } catch (_) {} });

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

const intake = require('../../cortex/core/raid/contract-intake.js');
const { importFromFile } = require('../../lib/node-export.js');

(async () => {

await test('T-001', 'submitContract() writes a real, tangible .contract file, not just a JAA row', async () => {
  resetStore();
  const { queueId } = intake.submitContract({ content: 'do the real thing', title: 'test contract' }, { source: 'test', intention: 'build' });

  const filePath = path.join(_raidInputDir, `${queueId}.contract`);
  assert.ok(fs.existsSync(filePath), `expected a real file at ${filePath}`);

  const doc = importFromFile(filePath);
  assert.strictEqual(doc.type, 'contract');
  assert.strictEqual(doc.id, queueId);
  assert.strictEqual(doc.system, null); // row.system defaults null when not given — honest, not fabricated
  assert.strictEqual(doc.intent, 'build');
  assert.strictEqual(doc.payload.contract.content, 'do the real thing');
});

await test('T-002', 'the real, existing JAA-backed queue is completely unaffected — purely additive, not a replacement', async () => {
  resetStore();
  const { queueId, status } = intake.submitContract({ content: 'x' }, { source: 'test' });
  assert.strictEqual(status, intake.STATUS.QUEUED);
  const rows = intake.listQueue();
  assert.strictEqual(rows.length, 1);
  assert.strictEqual(rows[0].uuid, queueId);
});

await test('T-003', 'a real file-write failure never blocks the real, working queue submission itself', async () => {
  resetStore();
  const badDir = '/nonexistent-parent-dir-that-cannot-be-created/deeply/nested/path';
  process.env.RAID_INPUT_DIR = badDir;
  delete require.cache[require.resolve('../../cortex/core/raid/contract-intake.js')];
  const intake2 = require('../../cortex/core/raid/contract-intake.js');
  let threw = false;
  let result;
  try { result = intake2.submitContract({ content: 'still queues even if the file write fails' }, { source: 'test' }); }
  catch (_) { threw = true; }
  assert.strictEqual(threw, false, 'submitContract must never throw just because the tangible-file write failed');
  assert.ok(result && result.queueId, 'the real queue submission must still succeed');
  process.env.RAID_INPUT_DIR = _raidInputDir;
  delete require.cache[require.resolve('../../cortex/core/raid/contract-intake.js')];
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exitCode = failed ? 1 : 0;
})();
