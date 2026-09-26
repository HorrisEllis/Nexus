'use strict';
/**
 * orchestrator/lib/sigma-compaction.js — sigma_records rollup + eviction
 * UUID: nexus-orch-sigma-compaction-v1-0000-2026-0720-001
 * Version: 1.0.0
 *
 * §THE PROBLEM, measured, not guessed: sigma_records grew 13,329 → 13,944
 * in one short live run (2026-07-20 boot logs), every one of six processes
 * parses the whole table at boot, and the file never shrinks — the direct
 * driver of the memory pressure that OOM-killed the gemini renderer and
 * preceded the 0xC0000409 guardian/orchestrator double crash.
 *
 * Why the existing decay system didn't already handle this:
 *   1. sigma_records was declared 'short' tier in tiers.js all along, but
 *      decay's tombstone update was one of the string-where silent no-ops
 *      fixed 2026-07-20 in jaa-store _matches() — it never actually ran.
 *   2. Even working, decay only tombstones (_evicted:true). Tombstoned rows
 *      still live in the file and still get parsed by every process.
 *
 * §0.3 — nothing lost silently: expired rows are rolled up into hourly
 * sigma_rollups (long tier — count, avg/max sigma, warn/halt counts, top
 * event types) BEFORE deletion. Compressed history, not destroyed history.
 * Every reader in this tree wants only recent rows (boot.js tail(200),
 * intelligence last-200, autonomous-loop latest-1 — checked, not assumed;
 * the 30-day macro-compiler in lib/version.js's notes belongs to a
 * different session's tree and does not exist here).
 *
 * §10.1 — sigma-writer is the sole writer of sigma_records; compaction is
 * part of that same write authority and runs in the SAME PROCESS
 * (orchestrator). This matters for multi-process safety: JaaStore's flush
 * only skips resurrection for rows deleted BY THIS PROCESS
 * (_pendingDeletes, the 2026-07-18 fix). Deleting from any other process
 * would race the writer's own in-memory copy. Cortex never inserts or
 * updates sigma_records (verified by grep), so it never dirties/flushes
 * the table and cannot resurrect deletes.
 *
 * Retention: tiers.js short tier — evictAfterMs 24h. Read from the single
 * tier authority, not duplicated here (§10.1).
 */

const { MEMORY_TIERS } = require('../../cortex/memory/tiers.js');

const MODULE_ID = 'orchestrator/sigma-compaction';
const VERSION = '1.0.0';

const RETENTION_MS = MEMORY_TIERS.short.evictAfterMs; // 24h — the tier sigma_records was always declared as
const BUCKET_MS = 60 * 60 * 1000; // hourly rollups
const COMPACT_INTERVAL_MS = 10 * 60 * 1000;
const WARN_SIGMA = 0.5;
const HALT_SIGMA = 0.7;

// ── Pure (§14.2): rows → hourly rollup aggregates ─────────────────────────────
function rollup(rows, bucketMs = BUCKET_MS) {
  const buckets = new Map();
  for (const r of rows) {
    const ts = r.ts || 0;
    const bucket = Math.floor(ts / bucketMs) * bucketMs;
    let b = buckets.get(bucket);
    if (!b) {
      b = { bucket, count: 0, sumSigma: 0, maxSigma: 0, warnCount: 0, haltCount: 0, types: {} };
      buckets.set(bucket, b);
    }
    const sigma = typeof r.sigma === 'number' ? r.sigma : 0;
    b.count++;
    b.sumSigma += sigma;
    if (sigma > b.maxSigma) b.maxSigma = sigma;
    if (sigma >= HALT_SIGMA) b.haltCount++;
    else if (sigma >= WARN_SIGMA) b.warnCount++;
    if (r.type) b.types[r.type] = (b.types[r.type] || 0) + 1;
  }
  return [...buckets.values()].map(b => ({
    bucket: b.bucket,
    count: b.count,
    avgSigma: +(b.sumSigma / b.count).toFixed(4),
    maxSigma: +b.maxSigma.toFixed(4),
    warnCount: b.warnCount,
    haltCount: b.haltCount,
    topTypes: Object.entries(b.types).sort(([, a], [, z]) => z - a).slice(0, 5)
      .map(([type, count]) => ({ type, count })),
  })).sort((a, z) => a.bucket - z.bucket);
}

// ── Pure: merge a new rollup into an existing one for the same bucket ─────────
// Needed for idempotency: a crash between rollup-write and delete means the
// next run re-rolls the same still-present rows; merging by summed counts and
// recomputed weighted average never double-loses and never fabricates.
function mergeRollups(existing, fresh) {
  const count = existing.count + fresh.count;
  const types = {};
  for (const t of [...(existing.topTypes || []), ...(fresh.topTypes || [])]) {
    types[t.type] = (types[t.type] || 0) + t.count;
  }
  return {
    bucket: existing.bucket,
    count,
    avgSigma: +(((existing.avgSigma * existing.count) + (fresh.avgSigma * fresh.count)) / count).toFixed(4),
    maxSigma: Math.max(existing.maxSigma, fresh.maxSigma),
    warnCount: existing.warnCount + fresh.warnCount,
    haltCount: existing.haltCount + fresh.haltCount,
    topTypes: Object.entries(types).sort(([, a], [, z]) => z - a).slice(0, 5)
      .map(([type, c]) => ({ type, count: c })),
  };
}

// ── compact — roll up then hard-delete expired rows ───────────────────────────
function compact(jaa, now = Date.now()) {
  const cutoff = now - RETENTION_MS;
  const expired = jaa.query('sigma_records', r => (r.ts || 0) < cutoff);
  if (!expired.length) return { deleted: 0, rollups: 0, cutoff };

  const fresh = rollup(expired);
  for (const roll of fresh) {
    const key = `sigma-rollup-${roll.bucket}`;
    const existing = jaa.get('sigma_rollups', { rollupKey: key });
    const row = existing
      ? { ...mergeRollups(existing, roll), rollupKey: key, uuid: existing.uuid, ts: now }
      : { ...roll, rollupKey: key, uuid: key, ts: now };
    jaa.upsert('sigma_rollups', row, 'rollupKey');
  }

  // Hard delete — real removal, not a tombstone. Same-process flush
  // (_pendingDeletes) persists this to disk without resurrection.
  const deleted = jaa.delete('sigma_records', r => (r.ts || 0) < cutoff);
  console.log(`[${MODULE_ID}] compacted: ${deleted} expired rows → ${fresh.length} hourly rollup(s) (cutoff ${new Date(cutoff).toISOString()})`);
  return { deleted, rollups: fresh.length, cutoff };
}

let _timer = null;

function start(jaa, intervalMs = COMPACT_INTERVAL_MS) {
  compact(jaa); // boot compaction clears the accumulated backlog immediately
  _timer = setInterval(() => {
    try { compact(jaa); }
    catch (e) { console.warn(`[${MODULE_ID}] compaction tick failed: ${e.message}`); }
  }, intervalMs);
  if (_timer.unref) _timer.unref();
  console.log(`[${MODULE_ID}] v${VERSION} — retention ${RETENTION_MS / 3600000}h (tiers.js short), compacting every ${intervalMs / 60000}min`);
  return { ok: true };
}

function stop() {
  if (_timer) { clearInterval(_timer); _timer = null; }
}

module.exports = { MODULE_ID, VERSION, RETENTION_MS, BUCKET_MS, rollup, mergeRollups, compact, start, stop };
