'use strict';
/**
 * versionium/lib/migrate-cortex-snapshots.js — rebuild the snapshot index
 * for .nex files relocated out of cortex/data/snapshots.
 * UUID: nexus-versionium-migrate-cortex-snapshots-v1-0000-2026-0919-001
 *
 * §D3 FOLLOW-ON 2026-09-19 — James: "cortex is not versionium... there
 * should not be any .nex files generating in cortex." Moving the files
 * was the easy half. The 17 .nex files found in cortex/data/snapshots
 * had NO corresponding `backup_records` rows anywhere in this checkout
 * — confirmed directly, not assumed (data/cortex/memory/ has no
 * backup_records.json at all). They were already orphaned before the
 * move: real snapshots on disk that load() could never find, because
 * load() resolves snapPath through the index, not the filesystem.
 *
 * So this does not "migrate rows" — there are no rows. It rebuilds the
 * index FROM the files, which is possible because a .nex carries its
 * own snapId, cortex_state_hash, prev_snapshot_hash, createdAt and type
 * (§0.3 — the information was never lost, only unreferenced).
 *
 * Sibling to migrate-legacy-data.js and migrate-idearium-snapshots.js,
 * same shape per D2 (separate file, one responsibility, idempotent by
 * key, safe to run on every boot).
 *
 * §IDEMPOTENT — only indexes a snapId that has no backup_records row
 * yet. §NOT DESTRUCTIVE — never writes to or deletes a .nex file.
 *
 * §HONEST FINDING, NOT SILENTLY REPAIRED — several of these .nex files
 * have `tables: {}` and a state hash of 44136fa355b3... , which is the
 * SHA-256 of an empty object. Those are real artifacts of the bug this
 * engine's own header documents under §BUGFIX 2026-08-25 ("create()
 * silently captured {} in actual production"). They are indexed like
 * any other, and flagged with `emptyCapture: true` rather than dropped:
 * a rollback to one would restore nothing, and the operator should be
 * able to see that BEFORE trying it, not discover it afterward. They
 * are not deleted — that is a retention decision, not a migration one.
 */

const fs = require('fs');
const path = require('path');

const TABLE = 'backup_records';
// sha256('{}') — the real empty-capture fingerprint, not a guessed constant.
const EMPTY_HASH_PREFIX = '44136fa355b3';

function _dir() {
  return process.env.NEXUS_SNAP_DIR || path.join(__dirname, '..', 'data', 'snapshots');
}

function migrateCortexSnapshots(opts = {}) {
  const result = { scanned: 0, indexed: 0, alreadyIndexed: 0, emptyCaptures: 0, unreadable: [], ok: true };

  let jaa;
  try { jaa = require('./store').jaaDB; }
  catch (e) { return { ...result, ok: false, reason: `versionium store unreachable: ${e.message}` }; }

  const dir = opts.dir || _dir();
  let files;
  try { files = fs.readdirSync(dir).filter(f => f.endsWith('.nex')); }
  catch (_) { return { ...result, reason: `no snapshot directory at ${dir}` }; }

  let existing;
  try { existing = new Set((jaa.query(TABLE, () => true, 1000000) || []).map(r => r.snapId)); }
  catch (_) { existing = new Set(); }

  for (const f of files) {
    result.scanned++;
    const full = path.join(dir, f);
    let nex;
    try { nex = JSON.parse(fs.readFileSync(full, 'utf8')); }
    catch (e) { result.unreadable.push({ file: f, error: e.message }); continue; }

    const snapId = nex.snapId || path.basename(f, '.nex');
    if (existing.has(snapId)) { result.alreadyIndexed++; continue; }

    const tableCount = nex.tables ? Object.keys(nex.tables).length : 0;
    const emptyCapture = tableCount === 0 ||
      String(nex.cortex_state_hash || '').startsWith(EMPTY_HASH_PREFIX);
    if (emptyCapture) result.emptyCaptures++;

    try {
      jaa.insert(TABLE, {
        snapId,
        snapPath: full,
        cortex_state_hash: nex.cortex_state_hash || null,
        prev_snapshot_hash: nex.prev_snapshot_hash || null,
        createdAt: nex.createdAt || null,
        type: nex.type || 'unknown',
        emptyCapture,
        tableCount,
        // §0.3 — where this came from survives the migration.
        _reindexedFrom: { origin: 'cortex/data/snapshots', at: Date.now() },
      });
      result.indexed++;
      existing.add(snapId);
    } catch (e) {
      result.unreadable.push({ file: f, error: `index write failed: ${e.message}` });
    }
  }
  return result;
}

module.exports = { migrateCortexSnapshots };
