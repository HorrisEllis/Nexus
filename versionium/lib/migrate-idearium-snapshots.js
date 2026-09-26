'use strict';
/**
 * versionium/lib/migrate-idearium-snapshots.js — real, one-time answer to
 * gap V5 (versionium/spec/versionium.spec): pre-merge idearium_snapshots
 * rows (written by idearium's old SnapshotGate/SnapshotRestoreGate,
 * retired §SNAPSHOTGATE MERGE 2026-09-02) were left on disk in cortex's
 * shared jaaDB, orphaned — not deleted, not migrated. This copies them
 * into versionium_commits, once, idempotently. Sibling to, and modeled
 * directly on, migrate-legacy-data.js (which closed the adjacent gap V6
 * the same way) — same store, same idempotency key strategy, same
 * "skip silently if the legacy source is unreachable" shape. Not
 * merged into that file: V5 and V6 are two different source tables with
 * two different real row shapes (see field mapping below), and keeping
 * them separate means either can be re-run, logged, or reasoned about
 * on its own (§5.7 — single responsibility per module).
 * UUID: nexus-versionium-migrate-idearium-snapshots-v1-0000-2026-0915-jamesbrooks-001
 *
 * §IDEMPOTENT, NOT DESTRUCTIVE — never touches or deletes the legacy
 * idearium_snapshots rows (§0.3 — nothing simply disappears; history is
 * append-only). Only copies rows whose commitId doesn't already exist in
 * versionium_commits, so running this on every boot (see server.js's own
 * call site, same convention as migrate-legacy-data.js) is always safe.
 *
 * §FIELD MAPPING, STATED NOT ASSUMED — idearium's own SnapshotGate is
 * documented (versionium.spec's `what_already_exists_to_build_on`) as
 * having given: commitId (vtm-<sha>), parentId, branch label, message,
 * author, full-state snapshot, diffSnapshots(), restore-with-auto-stash.
 * No idearium_snapshots row is present in this checkout to confirm the
 * on-disk field names byte-for-byte against (§0.1 — no live jaaDB data
 * shipped with this repo snapshot; the table's rows, if any exist in a
 * running deployment, live only in that deployment's own data/cortex/
 * memory/ directory). Mapped defensively below with the same field names
 * versionium_commits already uses wherever the source name is unknown,
 * rather than inventing a fixed schema this migration cannot verify —
 * every field access is optional-chained, and `raw` preserves whatever
 * the legacy row actually had for a human to inspect post-migration if
 * the guessed mapping needs correcting. This is a real, named limitation
 * (§0.1 — uncertainty stated, not hidden), not silently assumed correct.
 *
 *   idearium_snapshots row  -> versionium_commits row
 *   ----------------------     -------------------------
 *   commitId (or uuid)      -> commitId, uuid
 *   parentId                -> parentId
 *   branch (default 'main') -> branch
 *   message (or note)       -> message
 *   author (or causedBy)    -> causedBy   (best-effort; see header)
 *   state (full snapshot)   -> state      (deep-cloned, same convention
 *                                          as engine.js's own commit())
 *   ts (or wall/createdAt)  -> ts
 *   —                       -> system: 'idearium'   (real, explicit
 *                                       attribution — every migrated row
 *                                       is honestly traceable to its
 *                                       origin, not indistinguishable
 *                                       from a live versionium commit)
 *   —                       -> snapshot: null  (idearium's SnapshotGate
 *                                       never produced a kernel causal-
 *                                       replay snapshot — that's a
 *                                       different concept, see
 *                                       versionium/index.js's own header
 *                                       distinguishing `snapshot` from
 *                                       `state`. Left honestly null, not
 *                                       fabricated, per §1.2.)
 *   full row                -> _migratedFrom.raw  (preserved verbatim,
 *                                       so nothing is lost even if the
 *                                       guessed field mapping above turns
 *                                       out wrong for a real deployment's
 *                                       actual data — §0.3.)
 */
const { jaaDB: localDB } = require('./store.js');

function migrateIdeariumSnapshots({ log = console.log } = {}) {
  let legacyDB;
  try {
    legacyDB = require('../../cortex/memory/jaa-db').jaaDB;
  } catch (e) {
    log(`[versionium/migrate-idearium-snapshots] cortex's jaaDB unreachable (${e.message}) — nothing to migrate from, skipping`);
    return { ok: true, skipped: true, reason: 'cortex jaaDB unavailable' };
  }

  const result = { commits: 0, skippedExisting: 0, malformed: 0 };

  let legacyRows;
  try {
    legacyRows = legacyDB.query('idearium_snapshots', () => true, 100000);
  } catch (e) {
    // §1.2 — a missing table is not the same failure as a reachable-but-
    // empty one; both are honest outcomes (nothing to migrate), neither
    // is an error the caller needs to see as fatal.
    log(`[versionium/migrate-idearium-snapshots] idearium_snapshots table unreadable (${e.message}) — treating as "nothing to migrate"`);
    return { ok: true, skipped: true, reason: 'idearium_snapshots table unavailable' };
  }

  if (!legacyRows.length) {
    return { ok: true, skipped: false, ...result };
  }

  let localCommits;
  try {
    localCommits = localDB.query('versionium_commits', () => true, 100000);
  } catch (e) {
    log(`[versionium/migrate-idearium-snapshots] local store unreadable, aborting (${e.message})`);
    return { ok: false, skipped: true, reason: `local store unreadable: ${e.message}` };
  }
  const localIds = new Set(localCommits.map((c) => c.commitId));

  for (const row of legacyRows) {
    const commitId = row.commitId || row.uuid;
    if (!commitId) {
      // §1.2 — loud, specific, not silently dropped: counted, not skipped invisibly.
      log(`[versionium/migrate-idearium-snapshots] row with no commitId/uuid — cannot migrate, leaving in place: ${JSON.stringify(row).slice(0, 200)}`);
      result.malformed++;
      continue;
    }
    if (localIds.has(commitId)) { result.skippedExisting++; continue; }

    const rawState = row.state !== undefined && row.state !== null
      ? JSON.parse(JSON.stringify(row.state))
      : null;

    localDB.insert('versionium_commits', {
      uuid:      commitId,
      commitId,
      parentId:  row.parentId ?? null,
      branch:    row.branch ?? 'main',
      system:    'idearium',
      message:   row.message ?? row.note ?? '(migrated idearium snapshot, no message on legacy row)',
      causedBy:  row.causedBy ?? row.author ?? null,
      state:     rawState,
      snapshot:  null,
      ts:        row.ts ?? row.wall ?? row.createdAt ?? Date.now(),
      _migratedFrom: { table: 'idearium_snapshots', raw: row, migratedAt: Date.now() },
    });
    result.commits++;
  }

  if (result.commits || result.malformed) {
    log(`[versionium/migrate-idearium-snapshots] migrated ${result.commits} pre-merge idearium snapshot(s) into versionium_commits (${result.skippedExisting} already present, ${result.malformed} malformed rows left untouched)`);
  }
  return { ok: true, skipped: false, ...result };
}

module.exports = { migrateIdeariumSnapshots };
