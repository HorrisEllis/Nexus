'use strict';
/**
 * tests/modules/test-nex-system-state.test.js
 *
 * Two real things, tested together because the second was found while
 * building the first:
 *
 *   1. §BUGFIX 2026-08-25 — cortex_state_hash was content-blind at the row
 *      level. JSON.stringify's array-replacer form filters property names
 *      at EVERY level of nesting, and the old formula's allowlist
 *      (Object.keys(tables).sort()) only ever contained table NAMES —
 *      never a real row field. Two tables with genuinely different row
 *      data hashed identically. The existing snapshot-integrity.test.js's
 *      own T-006 never caught this because its "tampering" added a whole
 *      new table (changing the key set, which the old bug still caught),
 *      never a row's own field.
 *
 *   2. §UPGRADE 2026-08-25 — James: "upgrade .nex with state snapshots?
 *      like clear-glass?" registerStateProvider() lets any real system
 *      define what "its own state" means (matching ClearGlass's own
 *      rewind engine defining cookies+storage+scroll as browser state),
 *      captured into and restored from the same real .nex file alongside
 *      jaaDB table data.
 */
const assert = require('assert');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');

let passed = 0, failed = 0;
async function test(id, name, fn) {
  try { await fn(); passed++; console.log(`  \u2713 ${id} ${name}`); }
  catch (e) { failed++; console.log(`  \u2717 ${id} ${name}\n    ${e.message}`); }
}

async function main() {
  process.env.JAA_DATA_DIR = path.join(require('os').tmpdir(), `nex-state-test-${Date.now()}`);
  const snap = require(path.join(ROOT, 'cortex/snapshot/index.js'));
  const jaa = require(path.join(ROOT, 'cortex/memory/jaa-db.js')).jaaDB;

  // ── §BUGFIX: real, content-complete hashing ──────────────────────────
  await test('NS-001', 'BUGFIX: real row-content tampering is now caught (was silently missed)', async () => {
    jaa.insert('gaps', { uuid: 'g1', severity: 'high', ts: 1000 });
    const s = snap.create({ type: 'manual' });
    const nex = snap.load(s.snapId);
    const tampered = { ...nex, tables: { ...nex.tables, gaps: [{ uuid: 'g1', severity: 'LOW-CHANGED', ts: 1000 }] } };
    const result = snap.verifySnapshotIntegrity(tampered);
    assert.strictEqual(result.valid, false, 'a changed row field must fail integrity — this is the exact bug that was silently missed');
    assert.ok(/hash mismatch/.test(result.reason));
  });

  await test('NS-002', 'a genuinely untampered snapshot still verifies as valid under the new formula', async () => {
    jaa.insert('gaps', { uuid: 'g2', severity: 'medium', ts: 2000 });
    const s = snap.create({ type: 'manual' });
    const nex = snap.load(s.snapId);
    const result = snap.verifySnapshotIntegrity(nex);
    assert.strictEqual(result.valid, true);
  });

  await test('NS-003', 'BACKWARD-COMPAT: an old-format snapshot (no hashVersion) still verifies under the OLD formula, not the corrected one', async () => {
    const crypto = require('crypto');
    const tables = { gaps: [{ uuid: 'g3' }] };
    const oldHash = crypto.createHash('sha256').update(JSON.stringify(tables, Object.keys(tables).sort())).digest('hex');
    const oldFormatSnapshot = { format: 'NEX-SNAP/1.0', tables, cortex_state_hash: oldHash }; // no hashVersion field — a real, pre-fix snapshot
    const result = snap.verifySnapshotIntegrity(oldFormatSnapshot);
    assert.strictEqual(result.valid, true, 'an honest, pre-fix snapshot must not start failing integrity just because the formula improved after it existed');
  });

  await test('NS-004', 'new snapshots are created with hashVersion:2, the real, content-complete formula', async () => {
    jaa.insert('gaps', { uuid: 'g4' });
    const s = snap.create({ type: 'manual' });
    const nex = snap.load(s.snapId);
    assert.strictEqual(nex.hashVersion, 2);
  });

  // ── §UPGRADE: system-state snapshots ─────────────────────────────────
  await test('NS-005', 'a system with no registered provider is captured as a real, honest error, not silently skipped', async () => {
    const s = snap.create({ type: 'manual', systemIds: ['never-registered'] });
    const nex = snap.load(s.snapId);
    assert.ok(nex.systemStates['never-registered'].error);
  });

  await test('NS-006', 'a real, registered provider\u2019s capture() output round-trips through the real .nex file', async () => {
    snap.registerStateProvider('sys-a', {
      capture: () => ({ port: 9999, files: ['x.json'] }),
      restore: () => ({}),
    });
    const s = snap.create({ type: 'manual', systemIds: ['sys-a'] });
    const nex = snap.load(s.snapId);
    assert.deepStrictEqual(nex.systemStates['sys-a'], { ok: true, state: { port: 9999, files: ['x.json'] } });
  });

  await test('NS-007', 'rollback() calls the real, registered restore() with the real captured state', async () => {
    let restoredWith = null;
    snap.registerStateProvider('sys-b', {
      capture: () => ({ marker: 'real-value-42' }),
      restore: (state) => { restoredWith = state; return { ok: true }; },
    });
    const s = snap.create({ type: 'manual', systemIds: ['sys-b'] });
    const r = snap.rollback(s.snapId);
    assert.deepStrictEqual(restoredWith, { marker: 'real-value-42' });
    assert.strictEqual(r.restoredSystems['sys-b'].ok, true);
  });

  await test('NS-008', 'a capture() that throws is recorded as a real, honest failure, not silently dropped', async () => {
    snap.registerStateProvider('sys-fail', { capture: () => { throw new Error('real capture failure'); }, restore: () => {} });
    const s = snap.create({ type: 'manual', systemIds: ['sys-fail'] });
    const nex = snap.load(s.snapId);
    assert.strictEqual(nex.systemStates['sys-fail'].ok, false);
    assert.ok(/real capture failure/.test(nex.systemStates['sys-fail'].error));
  });

  await test('NS-009', 'a snapshot with NO systemIds requested has no systemStates field at all — unaffected callers see zero real change', async () => {
    jaa.insert('gaps', { uuid: 'g9' });
    const s = snap.create({ type: 'manual' });
    const nex = snap.load(s.snapId);
    assert.ok(!('systemStates' in nex), 'a caller that never asked for system state must not even see the field');
  });

  await test('NS-010', 'registerStateProvider refuses a non-function capture/restore, loud not silent', async () => {
    assert.throws(() => snap.registerStateProvider('bad', { capture: 'not-a-function', restore: () => {} }));
  });

  console.log(`\n${passed} passed, ${failed} failed\n`);
  process.exit(failed ? 1 : 0);
}

main();
