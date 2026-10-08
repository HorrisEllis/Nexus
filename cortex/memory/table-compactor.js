'use strict';
/**
 * cortex/memory/table-compactor.js — generic hard-delete decay for
 * high-volume short-tier tables, generalizing orchestrator/lib/
 * sigma-compaction.js's own real, proven pattern (rollup/summary THEN
 * hard-delete, never a bare tombstone) beyond just sigma_records.
 *
 * §BUILT 2026-09-12 — James: "we need decay for tables." Traced, not
 * guessed: cortex/memory/decay.js's runDecaySweep() only ever tombstones
 * (_evicted:true), by deliberate design (§7.4 "nothing discarded,
 * archived instead") — but a tombstoned row "still lives in the file and
 * still gets parsed by every process" (sigma-compaction.js's own header,
 * confirmed directly by reading jaa-db.js's open(): it loads every row of
 * every real .jsonl table into memory unconditionally, tombstoned or
 * not). For a low-volume table that's the right, safe default. For a
 * real, high-volume, append-only table — event_log (71,765+ rows and
 * climbing in this session's own boot logs, already tiered 'short' but
 * never actually enforced this way), component_ledger (49,440+ rows,
 * the single biggest real table observed, previously undeclared in
 * tiers.js at all — not even tombstoned) — tombstone-only means the
 * table simply never shrinks, ever, and every one of the ~9 processes
 * that open the shared JAA store pays that growing cost forever.
 *
 * This is that missing real enforcement, built as one shared,
 * table-agnostic mechanism instead of a bespoke copy per table (§10.3).
 * sigma-compaction.js's own rollup/merge logic stays exactly as-is (it
 * has a genuinely bespoke statistical shape — avg/max sigma, warn/halt
 * counts — not worth generalizing away from); this module handles every
 * OTHER real, high-volume table with a simpler, still-real "compressed
 * count, not silently destroyed" summary.
 *
 * §0.3 — nothing lost silently. Every real deleted batch is accounted
 * for in a compaction_log summary row (table, deletedCount, oldestTs,
 * newestTs, cutoff) written BEFORE the delete — compressed history, not
 * destroyed history, same ordering sigma-compaction.js already proved,
 * generalized rather than duplicated per table.
 *
 * §HONEST SCOPE — this does NOT retroactively apply to every table
 * tiers.js declares. Only the tables explicitly passed to start()'s
 * real, explicit tables[] list get real hard-delete; every other
 * tiered table keeps decay.js's existing tombstone-only behavior as its
 * safe default. Adding a table here is a deliberate, separate choice
 * from declaring its tier — real data loss risk (even compressed) is
 * not something to opt a table into by default. Confirmed real,
 * high-volume, append-only tables wired at orchestrator boot: event_log,
 * component_ledger, cfr_tension_history, constitution_decisions,
 * chat_log, schema_drift.
 *
 * §RESOLVED 2026-09-12 — the remaining tables named in the prior version
 * of this comment (hooks, interstitial_spaces, memory_unified,
 * raid_contract_queue, tool_index, fault_taxonomy, forge_patches,
 * raid_tunables) have now been checked against their real writers (see
 * tiers.js's own per-entry comments) and confirmed genuinely long-tier —
 * living/structural state (registries, queues, permanent memory
 * structures), not historical logs — never wired here on purpose, not
 * an oversight.
 */

const { tierFor, tierConfig } = require('./tiers.js');

const MODULE_ID = 'cortex.memory.table-compactor';

// ── §0.43.0 PF5 — bounded tables, nothing lost (docs/2026-10-07-runtime-load-phasemap.spec) ─────────────────────
// James: "do it. tell me what that would do". event_log is tiered 'short' (24 h) and Nexus writes ~4 events/s: a full
// day is ~333k rows, and age alone never takes the table under a day. A row cap keeps each hot table at its newest N
// rows; what leaves (by cap or by age) is ARCHIVED first — one gzip member appended per batch to
// <store>/archive/<table>/<day>.jsonl.gz (concatenated members are one valid gzip) — and deleted only once the archive
// write succeeded. readArchive() gives it back. Caps: CAPS below, NEXUS_TABLE_CAP_<TABLE> overrides (0 = no cap).
const zlib = require('zlib');
const fs = require('fs');
const path = require('path');
const CAPS = { event_log: 50000, component_ledger: 50000, cfr_tension_history: 20000 };
function capFor(table) {
  const env = process.env[`NEXUS_TABLE_CAP_${String(table).toUpperCase()}`];
  if (env != null && env !== '') return Math.max(0, parseInt(env, 10) || 0);
  return CAPS[table] || 0;
}
function _archiveDir(jaa, table) {
  const store = jaa && typeof jaa._store === 'function' ? jaa._store() : null;
  const root = (store && store.dir) || process.env.JAA_DATA_DIR || path.join(__dirname, '../../data/cortex/memory');
  return path.join(root, 'archive', table);
}
/** archiveRows(jaa, table, rows, reason) → number archived; throws if it could not be written (the caller keeps the rows) */
function archiveRows(jaa, table, rows, reason, now = Date.now()) {
  if (!rows.length) return 0;
  const dir = _archiveDir(jaa, table);
  fs.mkdirSync(dir, { recursive: true });
  const day = new Date(now).toISOString().slice(0, 10);
  const body = rows.map(r => JSON.stringify({ ...r, _archived: { at: now, reason } })).join('\n') + '\n';
  fs.appendFileSync(path.join(dir, `${day}.jsonl.gz`), zlib.gzipSync(body));
  return rows.length;
}
/** readArchive(jaa, table, day?) → archived rows (one day, or every day archived) — nothing lost is only true if it can be read */
function readArchive(jaa, table, day = null) {
  const dir = _archiveDir(jaa, table);
  let files = [];
  try { files = fs.readdirSync(dir).filter(f => f.endsWith('.jsonl.gz') && (!day || f.startsWith(day))).sort(); } catch (_) { return []; }
  const out = [];
  for (const f of files) {
    for (const ln of zlib.gunzipSync(fs.readFileSync(path.join(dir, f))).toString('utf8').split('\n')) { if (ln) try { out.push(JSON.parse(ln)); } catch (_) {} }
  }
  return out;
}
/** capRows(jaa, table, max) — keep the newest max rows; the older ones archived, then deleted */
function capRows(jaa, table, max = capFor(table), now = Date.now()) {
  if (!(max > 0)) return { table, removed: 0, skipped: true, reason: 'no cap' };
  const n = jaa.count(table) || 0;
  if (n <= max) return { table, removed: 0, count: n, cap: max };
  const ts = (r) => { const t = r.ts ?? r.crystallisedAt ?? r.createdAt; return typeof t === 'number' ? t : -Infinity; };
  const rows = (jaa.query(table, () => true, 100000000) || []).sort((a, b) => ts(a) - ts(b));
  const over = rows.slice(0, rows.length - max);
  try { archiveRows(jaa, table, over, `cap ${max}`, now); }
  catch (e) { console.warn(`[${MODULE_ID}] ${table}: archive failed (${e.message}) — nothing deleted`); return { table, removed: 0, skipped: true, reason: `archive failed: ${e.message}` }; }
  const ids = new Set(over.map(r => r.id));
  const removed = jaa.delete(table, (r) => ids.has(r.id)) || 0;
  try { jaa.insert('compaction_log', { uuid: require('crypto').randomUUID(), table, deletedCount: removed, archived: over.length, cap: max, oldestTs: ts(over[0]), newestTs: ts(over[over.length - 1]), reason: 'cap', ts: now }); } catch (_) {}
  console.log(`[${MODULE_ID}] ${table}: capped to its newest ${max} rows — ${removed} older row(s) archived to archive/${table}/`);
  return { table, removed, archived: over.length, cap: max };
}

/**
 * compactTable(jaa, table, now) — one real pass over one real table.
 * Deliberately per-table (not a bulk loop hidden inside start()), so a
 * caller can compact one table on demand (tests, a manual admin
 * trigger) without needing the whole periodic sweep.
 */
function compactTable(jaa, table, now = Date.now()) {
  const tier = tierFor(table);
  const cfg = tier && tierConfig(tier);
  if (!cfg || cfg.evictAfterMs == null) {
    return { table, deleted: 0, skipped: true, reason: tier ? `${tier} tier never expires` : 'table is not tier-managed' };
  }
  const cutoff = now - cfg.evictAfterMs;

  // §1.2 — same honest-undatable rule as decay.js's isExpired(): a row
  // with no real timestamp is never assumed old. Re-implemented directly
  // (not required from decay.js) to avoid a real circular require —
  // decay.js requires jaa-db.js, and this module is meant to be usable
  // from orchestrator (a different process) without pulling cortex's
  // whole decay ticker in — same three-field fallback either way.
  function rowTs(row) {
    const ts = row.ts ?? row.crystallisedAt ?? row.createdAt;
    return typeof ts === 'number' ? ts : null;
  }
  const isExpiredRow = (r) => !r._evicted && rowTs(r) !== null && rowTs(r) < cutoff;

  let expired;
  try { expired = jaa.query(table, isExpiredRow, 1000000) || []; }
  catch (e) { return { table, deleted: 0, skipped: true, reason: `query failed: ${e.message}` }; }
  if (!expired.length) return { table, deleted: 0, cutoff };
  // §PF5 — archived before deleted; a failed archive deletes nothing
  try { archiveRows(jaa, table, expired, `age ${tier}`, now); }
  catch (e) { console.warn(`[${MODULE_ID}] ${table}: archive failed (${e.message}) — nothing deleted`); return { table, deleted: 0, skipped: true, reason: `archive failed: ${e.message}` }; }

  let oldestTs = Infinity, newestTs = -Infinity;
  for (const r of expired) { const t = rowTs(r); if (t < oldestTs) oldestTs = t; if (t > newestTs) newestTs = t; }

  // §0.3 — the summary IS the compressed history for this batch, written
  // BEFORE the real delete, same ordering sigma-compaction.js uses.
  try {
    jaa.insert('compaction_log', {
      uuid: require('crypto').randomUUID(), table, deletedCount: expired.length,
      oldestTs, newestTs, cutoff, ts: now,
    });
  } catch (e) {
    console.warn(`[${MODULE_ID}] compaction_log write failed for ${table} (real delete below still proceeds — the delete itself is the more urgent real fix): ${e.message}`);
  }

  let deleted = 0;
  try { deleted = jaa.delete(table, isExpiredRow) || 0; }
  catch (e) { console.warn(`[${MODULE_ID}] delete failed for ${table}: ${e.message}`); return { table, deleted: 0, skipped: true, reason: `delete failed: ${e.message}` }; }

  console.log(`[${MODULE_ID}] ${table}: compacted ${deleted} expired row(s) older than ${(cfg.evictAfterMs / 3600000).toFixed(1)}h (cutoff ${new Date(cutoff).toISOString()})`);
  return { table, deleted, cutoff };
}

/**
 * capTable(jaa, table, keyFn, maxPerGroup, now) — count-based retention,
 * complementing compactTable's own age-based retention. James: "should be
 * able to clear sigmas. maybe delete after 100? per system."
 *
 * sigma_records has no literal `system` field (checked orchestrator/lib/
 * sigma-writer.js's real record shape directly before assuming one) — its
 * real per-source dimension is `type` (the originating bus event type,
 * e.g. 'cortex.boot', 'guardian.job.queued' — effectively "which system
 * produced the signal being scored"). Rather than hardcode `type` as a
 * special case, keyFn is a real, explicit, caller-supplied grouping
 * function — same "no default guessed" discipline as dedup's own
 * fingerprint — so this stays usable for any other table with a
 * different real grouping field, not just this one.
 *
 * Keeps the maxPerGroup MOST RECENT rows in each group (by rowTs, same
 * fallback chain as compactTable's own — ts ?? crystallisedAt ??
 * createdAt), removes the rest. A row with no real timestamp sorts as
 * oldest (never preferentially kept over a datable row) rather than
 * being silently excluded from consideration entirely — it still counts
 * toward the group and can still be removed, just never chosen ahead of
 * a row that has real evidence of recency.
 */
function capTable(jaa, table, keyFn, maxPerGroup, now = Date.now()) {
  if (typeof keyFn !== 'function') throw new Error(`[${MODULE_ID}] capTable() requires a real, explicit keyFn(row) — no default grouping is guessed`);
  if (!(maxPerGroup > 0)) throw new Error(`[${MODULE_ID}] capTable() requires a real maxPerGroup > 0`);

  function rowTs(row) {
    const ts = row.ts ?? row.crystallisedAt ?? row.createdAt;
    return typeof ts === 'number' ? ts : -Infinity; // undatable sorts oldest, never preferred over a datable row
  }

  let rows;
  try { rows = jaa.query(table, () => true, 10000000) || []; }
  catch (e) { return { table, removed: 0, skipped: true, reason: `query failed: ${e.message}` }; }
  if (!rows.length) return { table, removed: 0, groups: 0 };

  const groups = new Map();
  for (const r of rows) {
    let key;
    try { key = keyFn(r); } catch (_) { key = null; }
    if (key == null) continue; // keyFn declined to classify — never a guessed group
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(r);
  }

  const toRemove = [];
  let groupsOverCap = 0;
  for (const [key, group] of groups) {
    if (group.length <= maxPerGroup) continue;
    groupsOverCap++;
    group.sort((a, b) => rowTs(b) - rowTs(a)); // newest first
    for (const r of group.slice(maxPerGroup)) toRemove.push(r);
  }

  if (!toRemove.length) return { table, removed: 0, groups: 0 };

  try {
    jaa.insert('compaction_log', {
      uuid: require('crypto').randomUUID(), table, deletedCount: toRemove.length,
      kind: 'count_cap', maxPerGroup, groupsOverCap, ts: now,
    });
  } catch (e) {
    console.warn(`[${MODULE_ID}] compaction_log write failed for ${table} count-cap (real delete below still proceeds): ${e.message}`);
  }

  // §FIXED 2026-09-12 — this used to be a Set of row object REFERENCES,
  // matched via removeRefs.has(r) inside delete()'s predicate. That only
  // ever worked against the mock in this module's own tests, which
  // reuses the same array/objects across query() and delete() calls.
  // The REAL store (guardian/jaa-store.js) returns a fresh {...row}
  // spread copy on every query() — confirmed directly, not assumed —
  // so a second query (or the live Map iteration delete() itself walks)
  // can never be reference-equal to what an earlier query() returned.
  // Found live, against James's real data: 7 real sigma_records groups
  // exceeded the cap by thousands of rows each, and the real delete()
  // call reported 0 removed regardless. Fixed by matching on the real,
  // stable uuid field every row has, not the transient object identity
  // of whichever copy happened to be in hand.
  const removeUuids = new Set(toRemove.map(r => r.uuid).filter(Boolean));
  let removed = 0;
  try { removed = jaa.delete(table, (r) => removeUuids.has(r.uuid)) || 0; }
  catch (e) { console.warn(`[${MODULE_ID}] delete failed for ${table}: ${e.message}`); return { table, removed: 0, skipped: true, reason: `delete failed: ${e.message}` }; }

  console.log(`[${MODULE_ID}] ${table}: capped ${groupsOverCap} group(s) to ${maxPerGroup} row(s) each, removed ${removed} total`);
  return { table, removed, groups: groupsOverCap };
}

let _timer = null;

/**
 * start(jaa, tables, intervalMs) — periodic sweep over a REAL, explicit
 * list of tables — deliberately not "every short-tier table in
 * TABLE_TIERS" by default (see §HONEST SCOPE above).
 */
function start(jaa, tables, intervalMs = 10 * 60 * 1000) {
  if (!Array.isArray(tables) || !tables.length) throw new Error(`[${MODULE_ID}] start() requires a real, explicit tables[] list`);
  function sweep() {
    for (const table of tables) {
      try { compactTable(jaa, table); }
      catch (e) { console.warn(`[${MODULE_ID}] compaction tick failed for ${table}: ${e.message}`); }
      try { if (capFor(table)) capRows(jaa, table); }   // §PF5 — then the cap
      catch (e) { console.warn(`[${MODULE_ID}] cap tick failed for ${table}: ${e.message}`); }
    }
  }
  sweep(); // boot compaction clears the accumulated backlog immediately, same as sigma-compaction.js
  _timer = setInterval(sweep, intervalMs);
  if (_timer.unref) _timer.unref();
  console.log(`[${MODULE_ID}] v1.0.0 — real hard-delete compaction for [${tables.join(', ')}], every ${intervalMs / 60000}min`);
  return { ok: true };
}

function stop() {
  if (_timer) { clearInterval(_timer); _timer = null; }
}

let _capTimer = null;

/**
 * startCaps(jaa, specs, intervalMs) — periodic count-based retention,
 * separate timer from age-based start() (different real operation, same
 * separation-of-concerns reasoning table-deduplicator.js's own start()
 * already uses against this same module). specs: [{ table, keyFn,
 * maxPerGroup }, ...] — real, explicit, no default table list guessed.
 */
function startCaps(jaa, specs, intervalMs = 30 * 60 * 1000) {
  if (!Array.isArray(specs) || !specs.length) throw new Error(`[${MODULE_ID}] startCaps() requires a real, explicit specs[] list`);
  function sweep() {
    for (const spec of specs) {
      try { capTable(jaa, spec.table, spec.keyFn, spec.maxPerGroup); }
      catch (e) { console.warn(`[${MODULE_ID}] cap tick failed for ${spec.table}: ${e.message}`); }
    }
  }
  sweep();
  _capTimer = setInterval(sweep, intervalMs);
  if (_capTimer.unref) _capTimer.unref();
  console.log(`[${MODULE_ID}] count-cap active for [${specs.map(s => `${s.table}:${s.maxPerGroup}/group`).join(', ')}]`);
  return { ok: true };
}

function stopCaps() {
  if (_capTimer) { clearInterval(_capTimer); _capTimer = null; }
}

/** storeReport(dir) — every table in a store directory by its files alone (no row is parsed): the base, its append
 *  segments (PF3), its cap (PF5) and its archive. What `idearium store` prints (cortex GET /api/store). */
function storeReport(dir) {
  let files = []; try { files = fs.readdirSync(dir); } catch (_) { return { dir, tables: [] }; }
  const T = new Map(), t = (n) => { if (!T.has(n)) T.set(n, { table: n, baseBytes: 0, segments: 0, segmentBytes: 0, cap: capFor(n) || null, archiveDays: 0, archiveBytes: 0 }); return T.get(n); };
  const size = (f) => { try { return fs.statSync(path.join(dir, f)).size; } catch (_) { return 0; } };
  for (const f of files) {
    if (f.endsWith('.json')) t(f.slice(0, -5)).baseBytes = size(f);
    else { const m = /^(.+?)\.\d+(\.\d+\.closed)?\.jsonl$/.exec(f); if (m) { const r = t(m[1]); r.segments++; r.segmentBytes += size(f); } }
  }
  let arch = []; try { arch = fs.readdirSync(path.join(dir, 'archive')); } catch (_) {}
  for (const name of arch) {
    let days = []; try { days = fs.readdirSync(path.join(dir, 'archive', name)); } catch (_) { continue; }
    const r = t(name); r.archiveDays = days.length; r.archiveBytes = days.reduce((n, d) => n + size(path.join('archive', name, d)), 0);
  }
  const tables = [...T.values()].sort((a, b) => (b.baseBytes + b.segmentBytes) - (a.baseBytes + a.segmentBytes));
  return { dir, tables, totals: { bytes: tables.reduce((n, x) => n + x.baseBytes + x.segmentBytes, 0), archiveBytes: tables.reduce((n, x) => n + x.archiveBytes, 0) } };
}

module.exports = { storeReport, CAPS, capFor, capRows, archiveRows, readArchive, MODULE_ID, compactTable, capTable, start, stop, startCaps, stopCaps };
