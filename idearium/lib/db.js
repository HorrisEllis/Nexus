/**
 * idearium/lib/db.js — idearium's connection to cortex's shared database
 * UUID: idearium-lib-db-v1-0000-4000-0000-000000000001
 *
 * §DB-MIGRATION 2026-07-14 — "idearium needs to use a database, in cortex."
 *
 * idearium was the one subsystem in NEXUS still on ad-hoc flat-file JSON
 * (idearium.json rewritten whole on every single mutation, idearium-repos.json
 * likewise) while every other module — orchestrator, guardian, cos, copilot,
 * meta, cortex itself — already shares one real store: guardian/jaa-store.js
 * (tables-as-Maps, per-table debounced disk flush), fronted by cortex's
 * cortex/memory/jaa-db.js adapter. That adapter is a thin, deliberate seam
 * ("all modules that require it get the same live store — single writer,
 * multiple readers, zero duplication") — this file plugs idearium into that
 * exact same seam rather than inventing a second database.
 *
 * idearium is an ESM-only tree (its own package.json declares type:module);
 * jaa-db.js is CJS, same as the rest of NEXUS's un-typed root. createRequire
 * is the existing, already-used bridge for that boundary in this codebase
 * (see index.js's own cfr-ledger require) — reused here, not reinvented.
 *
 * Table naming: idearium_<key>, kept out of cortex's own table namespace
 * (artifacts/gaps/ledger_entries/settings/...) so nothing collides. Cortex's
 * own gap-detection tables are a DIFFERENT thing from idearium's idea-gaps —
 * same word, two owners, hence the prefix rather than sharing 'gaps'.
 *
 * Row identity: every idearium row already carries a stable `.uuid` — reused
 * directly as the store's `id` (jaa-store's actual primary key) rather than
 * minting a second identifier.
 *
 * Ordering: jaa-store rows live in a Map — insertion order, not array
 * position. idearium relies on array position for real semantics in a few
 * places (snapshots[0] is "most recent", via unshift). `_ord` is written on
 * every sync and read back to resort on load, so position survives a
 * process restart intact.
 *
 * §1.2 nothing silently fails — a jaa-db load failure here throws, it does
 * not fall back to a silently-empty table.
 * §7.4 nothing discarded — see migrateOnce() below: the pre-existing flat
 * files are read once, folded into the DB, and then left on disk untouched
 * (archive, not delete).
 */

import { createRequire } from 'module';
import path from 'path';
import { fileURLToPath } from 'url';

const __dir = path.dirname(fileURLToPath(import.meta.url));
const _require = createRequire(import.meta.url);

// idearium/lib -> .. -> idearium -> .. -> nexus -> cortex/memory/jaa-db
const { jaaDB } = _require('../../cortex/memory/jaa-db');

/** Read a whole table back out, ordered by the position it was last synced at. */
export function loadTable(table) {
  const rows = jaaDB.query(table);
  return rows
    .slice()
    .sort((a, b) => (a._ord ?? 0) - (b._ord ?? 0))
    // `id` and `_ord` are store bookkeeping (id duplicates `.uuid`, _ord is
    // position) — strip both so callers get back exactly the row shape they
    // put in, not a superset with jaa-store's fingerprints on it.
    .map(({ id, _ord, ...rest }) => rest);
}

function _rowsEqual(a, b) {
  // Cheap but sufficient: both sides are always built through the same
  // spread pattern below, so key order — and therefore JSON.stringify
  // output — is stable across saves for genuinely-unchanged rows. Worst
  // case on a false mismatch is one redundant write, never a missed one.
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * Make `table` in the DB contain at least everything in `rows` (keyed by
 * row[idField]) — upserts everything passed in, skips upserts that would
 * be no-ops so unrelated tables don't get marked dirty on every unrelated
 * mutation.
 *
 * §BUG FOUND AND FIXED 2026-07-18 — this used to be a MIRROR sync: it
 * deleted any row in the DB not present in the `rows` array passed in.
 * That is only safe if exactly one process ever holds this table's
 * complete state at once. Proven false by direct reproduction: idearium's
 * API server and a concurrent CLI invocation (idearium/cli/index.js calls
 * getIdeaOS() directly — its own separate process, its own separate
 * JaaStore instance, same directory) each hold their OWN in-memory
 * `db.ideas` array; when either calls syncTable with its own array, the
 * old mirror-delete logic would delete whatever the OTHER process had
 * just added, because from the caller's own point of view "the complete
 * state is X, so anything not in X should not exist" — reloadTable()
 * alone does not fix this, since the caller's own `rows` argument
 * genuinely does not contain the other process's addition no matter how
 * fresh the read is. Reproduced directly: two processes each wrote 2 real
 * rows to idearium_ideas, final state had only 2 of the 4 — the other
 * process's writes were destroyed, not merely delayed.
 *
 * Checked whether any real idearium code path needs true deletion before
 * changing this: grepped every array-filter in index.js/repo/index.js —
 * every one is a filtered VIEW for display/computation (active ideas,
 * non-archived repos), never a reassignment of the tracked array itself.
 * Matches idearium's own stated §M1 policy ("archived in place, nothing
 * deleted") empirically, not just by claim. So: safe to stop deleting on
 * absence. A caller that genuinely needs to remove a row now calls
 * deleteRow() explicitly (below) — same shape as appendRow() already
 * uses for the opposite case (single-row insert bypassing full-table
 * diff) — rather than deletion being an implicit side effect of "this
 * row happened not to be in my array this time."
 */
export function syncTable(table, rows, idField = 'uuid', { allowDelete = false } = {}) {
  if (!Array.isArray(rows)) throw new Error(`[idearium/db] syncTable(${table}): rows must be an array`);
  jaaDB.reloadTable(table); // merge in whatever another process may have written since this process last read this table
  const existing = jaaDB.query(table);
  const existingById = new Map(existing.map(r => [r.id, r]));

  // §BOUNDED-TABLE EXCEPTION — allowDelete restores the old mirror-delete
  // behavior, only for callers that explicitly ask for it. idearium has
  // exactly one real case: the events table is a deliberately-capped
  // retention window (this.db.events = this.db.events.slice(-5000) in
  // index.js), not archived-in-place state — old events genuinely need to
  // leave disk when trimmed from memory, unlike ideas/specs/gaps/links/
  // snapshots/tensions, none of which are ever actually shrunk (checked).
  // Even here, reloadTable() ran first, so the cross-process read is still
  // fresh — the remaining risk is narrower (deletes computed from a
  // still-possibly-incomplete view of adds from another process), not
  // eliminated, and that narrower risk is accepted deliberately for this
  // one bounded, non-authoritative table rather than left unstated.
  if (allowDelete) {
    const currentIds = new Set(rows.map(r => r[idField]));
    for (const id of existingById.keys()) {
      if (!currentIds.has(id)) jaaDB.delete(table, { id });
    }
  }

  rows.forEach((row, i) => {
    const id = row[idField];
    if (id == null) throw new Error(`[idearium/db] syncTable(${table}): row missing ${idField}`);
    const candidate = { ...row, id, _ord: i };
    const prev = existingById.get(id);
    if (prev && _rowsEqual(prev, candidate)) return;
    jaaDB.upsert(table, candidate, 'id');
  });
}

/**
 * Explicit single-row delete — the only way a row leaves a syncTable-
 * managed table now that syncTable itself never deletes on absence. Same
 * shape as appendRow(): a real single-row jaaDB.delete(), not a side
 * effect of what happened to be missing from someone's in-memory array.
 */
export function deleteRow(table, id) {
  if (id == null) throw new Error(`[idearium/db] deleteRow(${table}): id required`);
  return jaaDB.delete(table, { id });
}

/**
 * One-time, non-destructive fold of pre-existing flat-file rows into a DB
 * table — only runs while the table is still empty (i.e. first boot after
 * this migration on a machine that already had data). Never overwrites rows
 * that already made it into the DB, never touches the source flat file.
 */
export function migrateOnce(table, legacyRows, idField = 'uuid') {
  if (jaaDB.count(table) > 0) return { migrated: false, reason: 'table already populated' };
  if (!Array.isArray(legacyRows) || !legacyRows.length) return { migrated: false, reason: 'no legacy rows' };
  syncTable(table, legacyRows, idField);
  return { migrated: true, count: legacyRows.length };
}

/**
 * Append one row to a table without touching the rest of it — a real
 * single-row jaaDB.insert(), not loadTable()+push+syncTable()'s full-table
 * diff. For append-only history (event rows, build artifacts) where nothing
 * is ever mutated or deleted, syncTable's delete-what's-missing semantics do
 * the wrong thing (and cost an O(n) reload) for what is really just "add
 * one row." Row must carry its own `.uuid` — reused as jaaDB's row id.
 */
export function appendRow(table, row) {
  if (row.uuid == null) throw new Error(`[idearium/db] appendRow(${table}): row missing uuid`);
  return jaaDB.insert(table, { ...row, id: row.uuid });
}

export { jaaDB };
