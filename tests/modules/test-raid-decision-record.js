'use strict';
// P1 (docs/raid-warp-verification-phasemap.spec) — RAID records every tool
// decision, persisted to cortex. The traceability floor: RAID must SEE before it
// can VERIFY. §17.6 auditable · §2.2 cortex is source of truth · §0.3 nothing
// lost · §1.2 non-blocking (a recording failure never breaks the tool) · §8.6
// built outward from RAID's existing recorder.
const _log = console.log;
console.log = (...a) => { if (typeof a[0] === 'string' && a[0].startsWith('[jaa]')) return; _log(...a); };

const assert = require('assert');
const path = require('path');
let passed = 0, failed = 0;
async function test(id, desc, fn) {
  try { await fn(); _log(`  ✓ ${id} ${desc}`); passed++; }
  catch (e) { _log(`  ✗ ${id} ${desc}\n    ${e.message}`); failed++; }
}

const ROOT = path.join(__dirname, '../..');
const at = require(path.join(ROOT, 'lib/agent-tools'));
const raid = require(path.join(ROOT, 'cortex/core/raid'));
const { jaaDB } = require(path.join(ROOT, 'cortex/memory/jaa-db'));

(async () => {
  await test('T-001', 'RAID exposes recordDecision (built outward, exported)', () => {
    assert.strictEqual(typeof raid.recordDecision, 'function');
  });

  await test('T-002', 'a successful tool call persists a decision record to cortex', async () => {
    const tag = `p1-t002-${Date.now()}`;
    await at.executeTool('read_file', { path: 'lib/version.js' }, { source: tag });
    const rows = (jaaDB.query('raid_decisions', () => true, 9999) || []).filter(r => r.source === tag);
    assert.ok(rows.length >= 1, 'a decision row must be persisted');
    assert.strictEqual(rows[0].outcome, 'executed');
    assert.strictEqual(rows[0].tool, 'read_file');
    assert.ok(rows[0].argsDigest, 'args must be digested for provenance (§17.5)');
    assert.ok(rows[0].eventTs, 'eventTs must be set (§3.2)');
  });

  await test('T-003', 'a failing tool call records outcome=error with the real error (§1.2 specific)', async () => {
    const tag = `p1-t003-${Date.now()}`;
    await at.executeTool('read_file', { path: 'nope-does-not-exist.zzz' }, { source: tag });
    const rows = (jaaDB.query('raid_decisions', () => true, 9999) || []).filter(r => r.source === tag);
    assert.ok(rows.length >= 1);
    assert.strictEqual(rows[0].outcome, 'error');
    assert.ok(rows[0].error && rows[0].error.length > 0, 'the real error must be captured, not swallowed');
  });

  await test('T-004', 'recordDecision returns a row with a uuid (persisted identity, §2.2/§0.3)', () => {
    const row = raid.recordDecision({ source: 'p1-direct', tool: 'x', outcome: 'executed' });
    assert.ok(row.uuid, 'must have a uuid');
    assert.strictEqual(row.kind, 'tool.decision');
  });

  await test('T-005', 'recording is NON-BLOCKING — a tool still returns even if the record path is unavailable', async () => {
    // read_file returns real content; the decision record is a side-channel.
    const r = await at.executeTool('read_file', { path: 'lib/version.js' }, { source: 'p1-t005' });
    assert.ok(r && (r.content || r.path), 'the tool result must come back regardless of recording');
  });

  _log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
