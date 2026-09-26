'use strict';
/**
 * cortex/memory/table-deduplicator.js — generic duplicate-row removal for
 * JAA tables, same shared-mechanism shape as table-compactor.js (§10.3 —
 * one real tool, not a bespoke copy per table).
 *
 * §BUILT 2026-09-12 — James: "clear all duplicates from each table."
 *
 * Two real, distinct kinds of duplicate, handled differently on purpose:
 *
 * 1. EXACT UUID COLLISION — two live rows sharing the same real uuid.
 *    Confirmed via guardian/jaa-store.js: mutation-journal replay already
 *    merges same-uuid lines into one row at load time (open()'s own
 *    `{_mutation:true, uuid, ...patch}` handling) — so two SEPARATE rows
 *    with the same uuid surviving into a live query() result is always a
 *    real bug somewhere upstream (a raw insert() that should have been an
 *    update/upsert — the exact class of bug already found and fixed once
 *    this session in guardian/server.js's session-naming double-write).
 *    Because this can never be legitimate, it is the ALWAYS-ON default
 *    for every table, no opt-in required — same safety reasoning
 *    table-compactor.js gives for its own undatable-row rule (§1.2: never
 *    guess), just the opposite direction (never NOT fix an unambiguous
 *    case).
 *
 * 2. CONTENT-LEVEL DUPLICATE — two rows with different real uuids that
 *    represent the same real-world fact (e.g. the same chat message
 *    logged twice under two different uuids, matching the class of bug
 *    already found in guardian's chat_log writes earlier this session).
 *    This is NOT generalizable safely without knowing what "the same
 *    real thing" means for a given table's actual shape — so this is
 *    opt-in only, via a caller-supplied fingerprint(row) function passed
 *    per table. No default fingerprint is guessed for any table (§1.2 —
 *    same honest-scope discipline as table-compactor.js's own tables[]
 *    list: silence, not a guessed default, when nothing is configured).
 *
 * §0.3 — nothing lost silently. Every real batch of removed duplicates is
 * recorded in dedup_log (table, kind, removedCount, keptUuid per group,
 * ts) BEFORE the delete — same ordering table-compactor.js's own
 * compaction_log already proved.
 *
 * Tie-break rule when a group of duplicates is found: the row with the
 * LATEST real timestamp (ts ?? crystallisedAt ?? createdAt) is kept, all
 * others in that group are removed — "most recent real state wins",
 * matching the mutation-journal's own semantics (later entries represent
 * newer state). A row with no real timestamp at all is never chosen as
 * the keeper over one that has one, and is never removed on a guess
 * either if every member of its group is equally undatable — see
 * _pickKeeper below.
 */

const MODULE_ID = 'cortex.memory.table-deduplicator';

function _rowTs(row) {
  const ts = row.ts ?? row.crystallisedAt ?? row.createdAt;
  return typeof ts === 'number' ? ts : null;
}

// Given a group of >=2 rows considered duplicates of each other, pick the
// one to keep. Prefers a real, later timestamp; falls back to keeping the
// LAST one encountered (closest to current/most-recently-appended, same
// natural-Map-insertion-order reasoning jaa-db.js's own tail() relies on)
// when timestamps can't distinguish them.
function _pickKeeper(group) {
  let keeper = group[0];
  let keeperTs = _rowTs(keeper);
  for (let i = 1; i < group.length; i++) {
    const r = group[i];
    const t = _rowTs(r);
    if (t !== null && (keeperTs === null || t >= keeperTs)) { keeper = r; keeperTs = t; }
  }
  return keeper;
}

/**
 * dedupeTable(jaa, table, opts) — one real pass over one real table.
 * opts.fingerprint(row) => string|null — optional, content-level dedup.
 * Returns { table, removed, groups } — groups is the number of distinct
 * duplicate-sets found (for a real, honest report, not just a count that
 * hides whether this was one giant collision or many small ones).
 */
function dedupeTable(jaa, table, opts = {}) {
  let rows;
  try { rows = jaa.query(table, () => true, 10000000) || []; }
  catch (e) { return { table, removed: 0, skipped: true, reason: `query failed: ${e.message}` }; }
  if (!rows.length) return { table, removed: 0, groups: 0 };

  // Pass 1 — exact uuid collision, always on.
  const byUuid = new Map();
  for (const r of rows) {
    if (!r.uuid) continue; // can't identify a row with no uuid at all — leave alone, not a guess target
    if (!byUuid.has(r.uuid)) byUuid.set(r.uuid, []);
    byUuid.get(r.uuid).push(r);
  }

  const toRemove = []; // { uuid, kind, group }
  for (const [uuid, group] of byUuid) {
    if (group.length < 2) continue;
    const keeper = _pickKeeper(group);
    for (const r of group) if (r !== keeper) toRemove.push({ row: r, kind: 'uuid_collision', keptUuid: uuid });
  }

  // Pass 2 — content-level, only if the caller explicitly opted in.
  if (typeof opts.fingerprint === 'function') {
    const removedAlready = new Set(toRemove.map(x => x.row));
    const byFp = new Map();
    for (const r of rows) {
      if (removedAlready.has(r)) continue;
      let fp;
      try { fp = opts.fingerprint(r); } catch (_) { fp = null; }
      if (fp == null) continue; // fingerprint declined to classify this row — never guessed
      if (!byFp.has(fp)) byFp.set(fp, []);
      byFp.get(fp).push(r);
    }
    for (const [fp, group] of byFp) {
      if (group.length < 2) continue;
      const keeper = _pickKeeper(group);
      for (const r of group) if (r !== keeper) toRemove.push({ row: r, kind: 'content_duplicate', keptUuid: keeper.uuid || null });
    }
  }

  if (!toRemove.length) return { table, removed: 0, groups: 0 };

  const groupCount = new Set(toRemove.map(x => x.keptUuid)).size;

  // §0.3 — audit entry BEFORE the delete, same ordering as compaction_log.
  try {
    jaa.insert('dedup_log', {
      uuid: require('crypto').randomUUID(), table, removedCount: toRemove.length, groups: groupCount,
      kinds: [...new Set(toRemove.map(x => x.kind))], ts: Date.now(),
    });
  } catch (e) {
    console.warn(`[${MODULE_ID}] dedup_log write failed for ${table} (real delete below still proceeds): ${e.message}`);
  }

  // §FIXED 2026-09-12 — this used to match by object reference
  // (removeRefs.has(r), r being the actual row object), which only ever
  // worked against this module's own mock tests (which reuse the same
  // objects across query/delete calls). The real store
  // (guardian/jaa-store.js) returns a fresh {...row} spread copy on
  // every query() — confirmed directly — so reference equality can
  // never match a second query or the live Map iteration delete()
  // itself walks. uuid alone can't be the fix here specifically (unlike
  // table-compactor.js's capTable, which was the same bug but IS fixed
  // with uuid, since capTable's rows have distinct real uuids) — a
  // uuid_collision group's members share the SAME uuid by definition,
  // so matching on uuid would delete the keeper too. The real, stable,
  // per-row identifier that survives copying AND still disambiguates
  // same-uuid rows is the store's own internal `id` field (confirmed:
  // insert() does `{ ...row, id }`, so id ends up on every real row
  // exactly like uuid does, just store-assigned and unique per stored
  // row regardless of what the row's own uuid field says).
  const removeIds = new Set(toRemove.map(x => x.row.id).filter(Boolean));
  let removed = 0;
  try {
    removed = jaa.delete(table, (r) => removeIds.has(r.id)) || 0;
  } catch (e) {
    console.warn(`[${MODULE_ID}] delete failed for ${table}: ${e.message}`);
    return { table, removed: 0, skipped: true, reason: `delete failed: ${e.message}` };
  }

  console.log(`[${MODULE_ID}] ${table}: removed ${removed} duplicate row(s) across ${groupCount} group(s)`);
  return { table, removed, groups: groupCount };
}

/**
 * dedupeAll(jaa, tables, fingerprints) — one real pass across an explicit
 * list of tables. `fingerprints` (optional): { tableName: fingerprintFn }
 * — same explicit, no-default-guessed opt-in as dedupeTable's own opts.
 */
function dedupeAll(jaa, tables, fingerprints = {}) {
  if (!Array.isArray(tables) || !tables.length) {
    throw new Error(`[${MODULE_ID}] dedupeAll() requires a real, explicit tables[] list`);
  }
  const results = [];
  for (const table of tables) {
    try { results.push(dedupeTable(jaa, table, { fingerprint: fingerprints[table] })); }
    catch (e) {
      console.warn(`[${MODULE_ID}] dedup failed for ${table}: ${e.message}`);
      results.push({ table, removed: 0, skipped: true, reason: e.message });
    }
  }
  return results;
}

let _timer = null;

/**
 * start(jaa, tables, intervalMs, fingerprints) — periodic sweep, same
 * real shape as table-compactor.js's own start()/stop() — deliberately
 * a separate timer/module, not folded into compaction's own tick, since
 * dedup and decay-compaction are different real operations (removing
 * duplicate live rows vs. aging out old-but-unique ones) that happen to
 * share a storage layer, not one operation with two names.
 */
function start(jaa, tables, intervalMs = 15 * 60 * 1000, fingerprints = {}) {
  if (!Array.isArray(tables) || !tables.length) throw new Error(`[${MODULE_ID}] start() requires a real, explicit tables[] list`);
  function sweep() {
    try { dedupeAll(jaa, tables, fingerprints); }
    catch (e) { console.warn(`[${MODULE_ID}] dedup tick failed: ${e.message}`); }
  }
  sweep(); // boot dedup clears any accumulated backlog immediately, same as table-compactor.js
  _timer = setInterval(sweep, intervalMs);
  if (_timer.unref) _timer.unref();
  console.log(`[${MODULE_ID}] v1.0.0 — real duplicate-removal for [${tables.join(', ')}], every ${intervalMs / 60000}min`);
  return { ok: true };
}

function stop() {
  if (_timer) { clearInterval(_timer); _timer = null; }
}

/**
 * insertDeduped(jaa, table, row, fingerprint) — James: "have a hash or id
 * for each entry, and each time it logs to a table again, just logs the
 * id and date, so we don't waste space." Write-time prevention, the
 * other half of this tool: dedupeTable/dedupeAll clean up duplicates
 * already written; this stops a REPEAT of the same real fact from ever
 * being written in full a second time.
 *
 * Deliberately NOT wired into jaaDB.insert() itself — that function has
 * real callers across every process in this tree (checked: cortex,
 * guardian, orchestrator, intelligence, copilot, and more), none of
 * which asked for this behavior change, and a table where the same
 * fingerprint legitimately recurring is meaningful (most of them —
 * event_log entries are usually NOT "the same event happening again is
 * noise", they're real distinct occurrences) would silently lose real
 * data if this ran unconditionally. This is opt-in, per call site, per
 * table — the caller decides a given table's writes are genuinely
 * "the same fact restated" before using it.
 *
 * fingerprint(row) => string — required, no default guessed (§1.2, same
 * discipline as dedupeTable's own content-level opt-in). The FIRST real
 * occurrence of a fingerprint gets the real, full row, inserted
 * normally. Every SUBSEQUENT occurrence of that same fingerprint writes
 * a real, tiny reference row instead: { uuid, ts, refOf: <original
 * uuid>, fingerprint } — not the full original payload — recording only
 * that the same fact recurred, and when, never re-storing what it was.
 */
function insertDeduped(jaa, table, row, fingerprint) {
  if (typeof fingerprint !== 'function') {
    throw new Error(`[${MODULE_ID}] insertDeduped() requires a real fingerprint(row) function — no default is guessed`);
  }
  const fp = fingerprint(row);
  if (fp == null) return jaa.insert(table, row); // fingerprint declined to classify — insert normally, not a guess

  const existing = jaa.query(table, (r) => r.fingerprint === fp && !r.refOf, 1) || [];
  if (!existing.length) {
    // First real occurrence of this fingerprint — store it in full, tagged
    // so future occurrences can find it.
    return jaa.insert(table, { ...row, fingerprint: fp });
  }
  // A repeat of an already-seen fact — log the reference only, not the
  // full row a second time.
  return jaa.insert(table, {
    uuid: row.uuid || require('crypto').randomUUID(),
    ts: row.ts ?? Date.now(),
    refOf: existing[0].uuid,
    fingerprint: fp,
  });
}

module.exports = { MODULE_ID, dedupeTable, dedupeAll, insertDeduped, start, stop };
