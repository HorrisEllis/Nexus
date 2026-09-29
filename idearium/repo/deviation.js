/**
 * idearium/repo/deviation.js — how far a repo has moved from its baseline, recalculated on every version and on
 * every major file change. §0.39.280 BS3.
 * UUID: nexus-idearium-repo-deviation-v1-0000-2026-0929-jamesbrooks-001
 * Map: docs/2026-09-29-build-surface-phasemap.spec (BS3).
 *
 * James: "baseline deviation needs to recaclute each version or major file change."
 *
 * The baseline is the repo's first snapshot (idearium/repo/import-baseline.js takes exactly one). Deviation compares
 * a file manifest [{path, sha256, bytes}] against it — and, separately, against the last version — so "how much of
 * what was imported is still what was imported" and "how much has moved since the last version" are two numbers,
 * never one composite score.
 *
 *   compare(from, to)          → { added, removed, changed, unchanged, bytesFrom, bytesTo, bytesMoved, fraction }
 *   deviation({ baseline, last, current, reason, at })
 *                              → a record with both comparisons and its provenance (§17.5: which commits, why, when)
 *   isMajor(prevManifest, nextManifest, { files, fraction })
 *                              → a major file change: ≥ `files` files or ≥ `fraction` of the tree moved since the last
 *                                recalculation (defaults 10 files / 0.1 — config: repos.deviation_major_files /
 *                                repos.deviation_major_fraction)
 * Pure. idearium/api/index.js reads the manifests, stores the record, and decides when to call.
 */

export const MAJOR_DEFAULTS = Object.freeze({ files: 10, fraction: 0.1 });
const LISTED = 50;

function byPath(entries) { return new Map((entries || []).map(e => [e.path, e])); }

export function compare(fromEntries, toEntries) {
  const a = byPath(fromEntries), b = byPath(toEntries);
  const added = [], removed = [], changed = [];
  let unchanged = 0, bytesFrom = 0, bytesTo = 0, bytesMoved = 0;
  for (const [p, e] of a) {
    bytesFrom += e.bytes || 0;
    const n = b.get(p);
    if (!n) { removed.push(p); bytesMoved += e.bytes || 0; }
    else if (n.sha256 !== e.sha256) { changed.push(p); bytesMoved += Math.max(e.bytes || 0, n.bytes || 0); }
    else unchanged++;
  }
  for (const [p, n] of b) { bytesTo += n.bytes || 0; if (!a.has(p)) { added.push(p); bytesMoved += n.bytes || 0; } }
  const touched = added.length + removed.length + changed.length;
  const universe = new Set([...a.keys(), ...b.keys()]).size;
  return {
    added: added.length, removed: removed.length, changed: changed.length, unchanged,
    fraction: universe ? +(touched / universe).toFixed(4) : 0,
    bytesFrom, bytesTo, bytesMoved,
    byteFraction: bytesFrom || bytesTo ? +(bytesMoved / Math.max(bytesFrom, bytesTo, 1)).toFixed(4) : 0,
    lists: { added: added.slice(0, LISTED), removed: removed.slice(0, LISTED), changed: changed.slice(0, LISTED), truncated: touched > LISTED * 3 },
  };
}

/** deviation({ baseline:{commitId, entries}|null, last:{commitId, entries}|null, current:[entries], reason, at }) */
export function deviation({ baseline = null, last = null, current = [], reason = 'asked', at = Date.now() } = {}) {
  return {
    schema: 'nexus.repo.deviation/1',
    at, reason,
    files: current.length,
    fromBaseline: baseline ? { commitId: baseline.commitId, ...compare(baseline.entries, current) } : null,
    sinceVersion: last ? { commitId: last.commitId, ...compare(last.entries, current) } : null,
    note: baseline ? null : 'no baseline snapshot yet — the repo\'s first index takes one (import-baseline.js)',
  };
}

export function isMajor(prevEntries, nextEntries, { files = MAJOR_DEFAULTS.files, fraction = MAJOR_DEFAULTS.fraction } = {}) {
  const c = compare(prevEntries, nextEntries);
  const touched = c.added + c.removed + c.changed;
  return { major: touched > 0 && (touched >= files || c.fraction >= fraction), touched, fraction: c.fraction };
}
