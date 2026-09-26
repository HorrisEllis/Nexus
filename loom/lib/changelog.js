'use strict';
// loom/lib/changelog.js — a real, durable, per-version changelog.
//
// §MCO05 2026-09-18 — James: "can you have a changelog per version in
// loom." Real, confirmed gap: loom already tracks component/wire
// MOVEMENT (componentLedger, /api/history) and per-system phasemap
// history, but nothing recorded "version X.Y.Z shipped on this date
// with these real changes" as its own durable, queryable record. This
// is that record — one real JAA row per version, append-only (a
// version, once recorded, is a historical fact — it is never edited or
// removed, only superseded by a newer version's entry).

const TABLE = 'loom_changelog';

function _getJAA() {
  try { return require('../../cortex/memory/jaa-db').jaaDB; }
  catch (e) { console.warn(`[loom/changelog] jaa-db unreachable: ${e.message}`); return null; }
}

/**
 * recordVersion({version, changes, releasedAt}) — real, append-only.
 * Refuses (not throws) a duplicate version — a version string is
 * recorded once; if you need to add to it, that's a new version.
 */
function recordVersion({ version, changes = [], releasedAt = Date.now() } = {}) {
  if (!version || typeof version !== 'string') return { ok: false, reason: 'version (string) is required' };
  if (!Array.isArray(changes) || changes.length === 0) return { ok: false, reason: 'changes must be a real, non-empty array of change descriptions' };
  const jaa = _getJAA();
  if (!jaa) return { ok: false, reason: 'JAA unreachable — cannot durably record a changelog entry' };

  const existing = jaa.query(TABLE, r => r.version === version, 1);
  if (existing.length) return { ok: false, reason: `version "${version}" is already recorded — versions are append-only, not editable` };

  const row = { uuid: require('crypto').randomUUID(), version, changes, releasedAt, recordedAt: Date.now() };
  jaa.insert(TABLE, row);
  return { ok: true, entry: row };
}

/** getChangelog(opts) — real, newest-first. */
function getChangelog({ limit = 200 } = {}) {
  const jaa = _getJAA();
  if (!jaa) return [];
  return jaa.query(TABLE, () => true, limit).sort((a, b) => b.releasedAt - a.releasedAt);
}

/** getVersion(version) — real single lookup, or null. */
function getVersion(version) {
  const jaa = _getJAA();
  if (!jaa) return null;
  const rows = jaa.query(TABLE, r => r.version === version, 1);
  return rows[0] || null;
}

module.exports = { recordVersion, getChangelog, getVersion, TABLE };
