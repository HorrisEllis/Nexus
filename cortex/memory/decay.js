'use strict';
/**
 * cortex/memory/decay.js — Tier-based decay/eviction
 * UUID: nexus-cortex-memory-decay-v1-0000-2026-0712-jamesbrooks-001
 * Version: 1.0.0
 *
 * §BUILT 2026-07-12 — the real MEMORY_TIERS behavior cortex.spec has
 * declared since v3.2.0. `/api/memory/working` was a flat object —
 * `{...working, ...body}` — with no expiry at all. This is what actually
 * ages working/short-tier rows out, on a real schedule, against the real
 * shared store (guardian/jaa-store.js via cortex/memory/jaa-db.js), not a
 * second in-memory structure competing with it.
 *
 * Tombstone, not delete — matches this codebase's own §7.4 (nothing
 * discarded, archived instead). An evicted row gets `_evicted: true` +
 * `_evictedAt`, and stays queryable via jaaDB.query(table, {_evicted:true})
 * for anyone doing forensics later; it's excluded from normal reads by
 * every caller that filters on `_evicted` not being true (query call sites
 * updated where relevant — see boot.js's memory routes).
 *
 * Every eviction cycle writes one summary row to `decay_log` (tier: long,
 * per tiers.js — the log of decay must never itself decay) — same
 * observability principle as everything else in this codebase: memory
 * pressure and eviction volume should be visible, not inferred.
 */

const { jaaDB } = require('./jaa-db.js');
const { TABLE_TIERS, tierConfig, tierFor } = require('./tiers.js');

const MODULE_ID = 'cortex.memory.decay';

/**
 * runDecaySweep() — one pass over every table that has a finite
 * evictAfterMs. Synchronous, cheap (in-memory store, no real I/O beyond
 * the store's own JSONL append), safe to call on a timer or on demand
 * (tests call it directly rather than waiting on a real interval).
 *
 * @returns {{ cycleId: string, ts: number, evicted: Record<string, number>, totalEvicted: number }}
 */
function runDecaySweep() {
  const cycleId = require('crypto').randomUUID();
  const now = Date.now();
  const evicted = {};
  let totalEvicted = 0;

  for (const [table, tierName] of Object.entries(TABLE_TIERS)) {
    const config = tierConfig(tierName);
    if (!config || config.evictAfterMs == null) continue; // long-term: no eviction

    let rows;
    try { rows = jaaDB.query(table, {}); }
    catch (e) {
      // A table that doesn't exist yet (nothing has written to it) is not
      // an error — it just has nothing to evict.
      continue;
    }

    let evictedCount = 0;
    for (const row of rows) {
      if (row._evicted) continue; // already tombstoned
      const rowTs = row.ts || row.crystallisedAt || row.createdAt;
      if (rowTs == null) continue; // no age signal — leave it, don't guess
      const age = now - rowTs;
      if (age < config.evictAfterMs) continue;

      try {
        jaaDB.update(table, { id: row.id }, { _evicted: true, _evictedAt: now });
        evictedCount++;
      } catch (e) {
        console.warn(`[${MODULE_ID}] eviction write failed for ${table}/${row.id}: ${e.message}`);
      }
    }

    if (evictedCount > 0) {
      evicted[table] = evictedCount;
      totalEvicted += evictedCount;
    }
  }

  const summary = { cycleId, ts: now, evicted, totalEvicted };

  // §1.2 — the sweep itself is logged even when it evicts nothing, so a
  // gap in decay_log is distinguishable from "the ticker stopped running"
  // versus "nothing happened to be old enough."
  try {
    jaaDB.insert('decay_log', { ...summary, uuid: cycleId });
  } catch (e) {
    console.warn(`[${MODULE_ID}] decay_log write failed: ${e.message}`);
  }

  return summary;
}

let _timer = null;

/**
 * startDecayTicker(intervalMs) — begins the real periodic sweep. unref()'d
 * so it never keeps the process alive on its own, matching the pattern
 * this codebase already uses elsewhere for background tickers. Idempotent
 * — calling it twice doesn't double the ticker.
 */
function startDecayTicker(intervalMs = 5 * 60 * 1000) {
  if (_timer) return _timer;
  _timer = setInterval(runDecaySweep, intervalMs);
  _timer.unref();
  return _timer;
}

function stopDecayTicker() {
  if (_timer) { clearInterval(_timer); _timer = null; }
}


// ── READ-TIME EXPIRY — the design that does not need a ticker ───────────────
// §2026-08-09 (James): "every memory is supposed to be stored with a timestamp,
// by date and exact time, so that the case still works without the ticker."
//
// Correct, and the data already supports it. Checked across every populated
// tier-managed table: gaps 99/99, event_log 11393/11393, sigma_rollups 8/8,
// crystals 7/7, bep_patterns 128/128, decay_log 32/32 all carry `ts`. Only
// `settings` and `components` lack one, and both are infra/never-decay.
//
// A sweeper is a LIVENESS dependency: it can stop, and this one did — 32 cycles,
// all on 2026-07-16, all evicting nothing, while boot.js:1261 swallows a start
// failure into a console.warn. Age computed from a stored timestamp cannot stop.
// The sweep remains useful for reclaiming space; it is no longer what makes
// expiry TRUE.
//
// NOT applied to reads by default. Turning this on silently would drop 11,393
// event_log rows out from under every consumer that has been reading full
// history for a month (§17.10 — verify before promote). isExpired/expiryReport
// make the truth computable NOW; switching reads over is a separate, measured
// change.
function _rowTs(row) {
  for (const f of ['ts', 'timestamp', 'createdAt', 'at', 'time']) {
    const v = row && row[f];
    if (Number.isFinite(v)) return v;
    if (typeof v === 'string') { const d = Date.parse(v); if (!Number.isNaN(d)) return d; }
  }
  return null;
}

/**
 * isExpired(table, row, now) -> { expired, ageMs, tier, reason }
 * Pure. No clock of its own beyond `now`, no state, no side effects.
 * A row with NO timestamp is never expired — it is UNDATABLE, and guessing an
 * age for it would delete data on the strength of a guess (§1.2).
 */
function isExpired(table, row, now = Date.now()) {
  const tier = tierFor(table);
  if (!tier) return { expired: false, tier: null, reason: 'table is not tier-managed' };
  const cfg = tierConfig(tier);
  if (!cfg || !cfg.evictAfterMs) return { expired: false, tier, reason: `${tier} tier never expires` };
  const ts = _rowTs(row);
  if (ts === null) return { expired: false, tier, reason: 'row carries no timestamp — UNDATABLE, never expired on a guess' };
  const ageMs = now - ts;
  return { expired: ageMs > cfg.evictAfterMs, ageMs, tier,
           reason: ageMs > cfg.evictAfterMs ? `${(ageMs / 3600000).toFixed(1)}h old, ${tier} tier evicts after ${(cfg.evictAfterMs / 3600000)}h` : 'within tier window' };
}

/** liveRows(table, rows, now) — the same predicate, applied. */
function liveRows(table, rows, now = Date.now()) {
  return (rows || []).filter(r => !r._evicted && !isExpired(table, r, now).expired);
}

/**
 * expiryReport(jaaDB, now) — what read-time expiry WOULD hide, per table.
 * Report before enforce. A change that removes 11k rows from every consumer
 * should be seen as a number before it is seen as an outage.
 */
function expiryReport(jaaDB, now = Date.now()) {
  const out = { ok: true, now, tables: [], totalExpired: 0, totalUndatable: 0 };
  for (const table of Object.keys(TABLE_TIERS)) {
    let rows;
    try { rows = jaaDB.query(table, () => true, 1000000) || []; } catch (_) { continue; }
    if (!rows.length) continue;
    let expired = 0, undatable = 0;
    for (const r of rows) {
      const v = isExpired(table, r, now);
      if (v.expired) expired++;
      else if (/UNDATABLE/.test(v.reason)) undatable++;
    }
    out.tables.push({ table, tier: tierFor(table), rows: rows.length, expired, undatable,
                      live: rows.length - expired });
    out.totalExpired += expired; out.totalUndatable += undatable;
  }
  return out;
}

module.exports = { runDecaySweep, startDecayTicker, stopDecayTicker, isExpired, liveRows, expiryReport, _rowTs };
