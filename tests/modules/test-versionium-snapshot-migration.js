'use strict';
/**
 * tests/modules/test-versionium-snapshot-migration.js — real tests for
 * D3: the snapshot engine's move from cortex to versionium.
 * UUID: nexus-test-versionium-snapshot-migration-v1-0000-2026-0919-001
 *
 * §ISOLATION FIRST, BEFORE ANY require() — D5's own precedent
 * (docs/2026-09-15-versionium-cortex-snapshot-migration-decision.md):
 * test-versionium-sovereign.js had a real, silent bug where a test
 * wrote to the production data path because JAA_DATA_DIR was set after
 * a require() had already resolved it. Both stores are redirected here
 * at the top of the file, before anything is required, for exactly that
 * reason. This suite caught the same class of mistake in its own first
 * draft: VERSIONIUM_DATA_DIR was initially left unset and the run wrote
 * real rows into data/versionium/ — found by reading the store's own
 * "Store ready" boot line, not by the tests failing (they passed).
 *
 * What these actually prove, beyond "it loads": that the §ROLE SPLIT is
 * real in both directions. D3-004 asserts the snapshot INDEX lands in
 * versionium's own store AND does not leak into cortex's; D3-005 and
 * D3-007 assert the SUBJECT captured and restored is still cortex's
 * live tables. A move that got either half backwards would pass a
 * naive smoke test and silently make every snapshot worthless.
 */

const os = require('os'), fsx = require('fs'), pathx = require('path');
const TMP = fsx.mkdtempSync(pathx.join(os.tmpdir(), 'vsnap-'));
process.env.JAA_DATA_DIR       = pathx.join(TMP, 'cortex');   // subject store isolation
process.env.NEXUS_SNAP_DIR     = pathx.join(TMP, 'snapdir');
process.env.VERSIONIUM_DATA_DIR = pathx.join(TMP, 'versionium');
const assert = require('assert');
const fs = require('fs'), path = require('path');

const snap = require('../../versionium/lib/snapshot.js');
const subject = snap._subjectJaa();
let pass = 0, fail = 0;
const t = (n, f) => { try { f(); console.log('  ✓', n); pass++; }
                      catch (e) { console.log('  ✗', n, '—', e.message); fail++; } };

t('D3-001 engine identity is versionium, not cortex', () => {
  assert.strictEqual(snap.MODULE_ID, 'versionium-snapshot');
});

// seed real subject data
subject.insert('gaps', { id: 'g1', body: 'real row before snapshot' });

let snapId;
t('D3-002 create() writes a real .nex file', () => {
  const r = snap.create({ type: 'test', message: 'D3 migration' });
  snapId = r.snapId;
  assert.ok(snapId, 'no snapId returned');
  assert.ok(r.cortex_state_hash, 'no state hash');
});

t('D3-003 the .nex file lands in the snapshot dir', () => {
  const files = fs.readdirSync(process.env.NEXUS_SNAP_DIR);
  assert.ok(files.length >= 1, 'no snapshot file on disk');
});

t('D3-004 the INDEX row lives in versionium\'s own store, not cortex\'s', () => {
  const own = require('../../versionium/lib/store.js').jaaDB;
  const rows = own.query('backup_records', () => true, 100) || [];
  assert.ok(rows.some(r => r.snapId === snapId),
    'backup_records row not found in versionium store');
  const cortexRows = subject.query('backup_records', () => true, 100) || [];
  assert.ok(!cortexRows.some(r => r.snapId === snapId),
    'LEAK: index row also written to cortex store');
});

t('D3-005 the SUBJECT captured is cortex\'s real tables', () => {
  const nex = snap.load(snapId);
  assert.ok(nex, 'load() returned null');
  assert.ok(nex.tables.gaps, 'cortex gaps table not captured');
  assert.strictEqual(nex.tables.gaps[0].body, 'real row before snapshot');
});

t('D3-006 integrity check passes on the fresh chain', () => {
  const rep = snap.checkChainIntegrity();
  assert.strictEqual(rep.corrupt.length, 0, 'corrupt entries: ' + rep.corrupt.length);
  assert.strictEqual(rep.chainBreaks.length, 0, 'chain breaks');
});

t('D3-007 rollback restores into the SUBJECT store', () => {
  subject.delete('gaps', () => true);
  subject.insert('gaps', { id: 'g2', body: 'written after the snapshot' });
  const r = snap.rollback(snapId);
  assert.ok(r.ok, 'rollback failed: ' + r.reason);
  const rows = subject.query('gaps', () => true, 100) || [];
  assert.strictEqual(rows.length, 1, 'expected 1 restored row, got ' + rows.length);
  assert.strictEqual(rows[0].body, 'real row before snapshot', 'wrong row restored');
});

t('D3-008 the shim returns the SAME engine (registry not split)', () => {
  const via = require('../../cortex/snapshot/index.js');
  assert.strictEqual(via, snap);
  let called = false;
  via.registerStateProvider('probe', { capture: () => { called = true; return {}; }, restore: () => ({}) });
  snap.create({ type: 'test', systemIds: ['probe'] });
  assert.ok(called, 'provider registered via shim not seen by versionium engine');
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
