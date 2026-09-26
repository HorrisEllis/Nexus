'use strict';
/**
 * versionium/lib/migrate-legacy-data.js — VS1's real, one-time answer to
 * gap V6 (versionium/spec/versionium.spec): production versionium_
 * commits/branches/calendar rows that existed in cortex's shared jaaDB
 * before this sovereign migration don't automatically appear in the new
 * store. This copies them over, once, idempotently.
 * UUID: nexus-versionium-migrate-legacy-data-v1-0000-2026-0902-jamesbrooks-001
 *
 * §IDEMPOTENT, NOT DESTRUCTIVE — never deletes anything from cortex's
 * old tables (§0.3 never delete, archive — the old rows stay exactly
 * where they were, readable by the old, now-unrequired cortex/
 * versionium/index.js if anyone ever needs to check). Only copies rows
 * whose commitId doesn't already exist in the new store, so running this
 * twice (or on every boot, which server.js does — see its own call site)
 * is always safe and never duplicates.
 *
 * §HONEST SCOPE — copies versionium_commits, versionium_branches, and
 * versionium_calendar only (the three tables this system actually owns
 * post-migration). Does NOT touch event_log (deliberately shared, see
 * store.js's own header) and does NOT attempt to migrate the separately-
 * flagged, separately-orphaned idearium_snapshots rows (gap V5 — a
 * different, not-yet-decided question).
 */
const { jaaDB: localDB } = require('./store.js');

function migrateLegacyData({ log = console.log } = {}) {
  let legacyDB;
  try {
    legacyDB = require('../../cortex/memory/jaa-db').jaaDB;
  } catch (e) {
    log(`[versionium/migrate-legacy-data] cortex's jaaDB unreachable (${e.message}) — nothing to migrate from, skipping`);
    return { ok: true, skipped: true, reason: 'cortex jaaDB unavailable' };
  }

  const result = { commits: 0, branches: 0, calendar: 0 };

  try {
    const legacyCommits = legacyDB.query('versionium_commits', () => true, 100000);
    const localCommits  = localDB.query('versionium_commits', () => true, 100000);
    const localIds = new Set(localCommits.map(c => c.commitId));
    for (const row of legacyCommits) {
      if (localIds.has(row.commitId)) continue; // already migrated
      const { id, ...rest } = row; // let the local store assign its own real id
      localDB.insert('versionium_commits', rest);
      result.commits++;
    }
  } catch (e) {
    log(`[versionium/migrate-legacy-data] commits migration failed (non-fatal): ${e.message}`);
  }

  try {
    const legacyBranches = legacyDB.query('versionium_branches', () => true, 1000);
    const localBranches  = localDB.query('versionium_branches', () => true, 1000);
    const localBranchNames = new Set(localBranches.map(b => b.branch));
    for (const row of legacyBranches) {
      if (localBranchNames.has(row.branch)) continue; // local branch state wins if both exist
      const { id, ...rest } = row;
      localDB.insert('versionium_branches', rest);
      result.branches++;
    }
  } catch (e) {
    log(`[versionium/migrate-legacy-data] branches migration failed (non-fatal): ${e.message}`);
  }

  try {
    const legacyCalendar = legacyDB.query('versionium_calendar', () => true, 100000);
    const localCalendar  = localDB.query('versionium_calendar', () => true, 100000);
    const localCalIds = new Set(localCalendar.map(c => c.commitId + ':' + c.date));
    for (const row of legacyCalendar) {
      const key = row.commitId + ':' + row.date;
      if (localCalIds.has(key)) continue;
      const { id, ...rest } = row;
      localDB.insert('versionium_calendar', rest);
      result.calendar++;
    }
  } catch (e) {
    log(`[versionium/migrate-legacy-data] calendar migration failed (non-fatal): ${e.message}`);
  }

  if (result.commits || result.branches || result.calendar) {
    log(`[versionium/migrate-legacy-data] migrated ${result.commits} commit(s), ${result.branches} branch(es), ${result.calendar} calendar entr(ies) from cortex's legacy store`);
  }
  return { ok: true, skipped: false, ...result };
}

module.exports = { migrateLegacyData };
