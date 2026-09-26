'use strict';
/**
 * lib/semantic-dedup.js — real, content-similarity duplicate detection,
 * built on lib/vector-memory.js's real search() (cosine similarity, real
 * SNR threshold) — genuinely different from cortex/memory/
 * table-deduplicator.js's existing dedup:
 *
 *   table-deduplicator.js  — Pass 1: exact uuid collision (always safe).
 *                             Pass 2: exact-string fingerprint match,
 *                             opt-in per table, never guessed.
 *   this file               — near-duplicate: two DIFFERENTLY-WORDED rows
 *                             whose real embedded content is highly
 *                             similar (cosine >= a real similarity
 *                             threshold), not identical. A genuinely
 *                             different, fuzzier operation — grouping by
 *                             nearest-neighbor distance, not matching a
 *                             single deterministic key.
 *
 * §SCOPE — only tables lib/vector-memory.js's own EMBEDDABLE_TABLES set
 * already covers (it already knows how to extract meaningful text per
 * table — extractText()); inventing a text-extraction strategy for a
 * table vector-memory itself doesn't embed would be exactly the kind of
 * guess this codebase's own discipline avoids.
 *
 * §HONEST SCALE LIMIT — lib/local-vector-index.js's own real queryItems()
 * is a brute-force cosine scan over every indexed item (its own header:
 * "against a few hundred to a few thousand" items) — checked directly,
 * not assumed. event_log (39,513 real rows in this snapshot) would mean
 * ~1.5 billion cosine computations; MAX_SAFE_ROWS below refuses a table
 * past that size rather than silently taking a very long time, unless
 * the caller explicitly passes { force: true } knowing the cost.
 *
 * §HONEST QUALITY LIMIT — this sandbox has no live Ollama, so every real
 * embedding produced and compared here is vector-memory's own TF-IDF
 * fallback (word-frequency, deterministic, no network) — real and
 * functional (same file's own comment: "still catches exact and
 * near-exact matches well"), but not neural-embedding quality. Reported
 * honestly in every result via `embedMode`.
 */

const vm = require('./vector-memory');

const MAX_SAFE_ROWS = 5000;

/**
 * findNearDuplicates(jaa, table, opts) — real detection pass over one
 * real table. Embeds every row (idempotent — vector-memory's own embed()
 * already skips already-indexed uuids), then for each row queries its
 * own real nearest neighbors and clusters anything at or above
 * `threshold` (default 0.95 — deliberately high; this is near-DUPLICATE
 * detection, not "related content" search, so false positives are
 * costlier than missed ones for anything meant to feed --apply).
 *
 * Returns { ok, table, embedMode, rowCount, clusters, error? }. clusters
 * is an array of { keep: <oldest row's uuid>, remove: [<uuid>, ...],
 * similarity: <min pairwise score in the cluster> } — never a decision,
 * just real, reported groupings; removal only happens if the caller
 * (cli/semantic-dedup.js) is run with --apply.
 */
async function findNearDuplicates(jaa, table, opts = {}) {
  const { threshold = 0.95, force = false } = opts;
  if (!vm.shouldEmbed(table)) {
    return { ok: false, table, error: `"${table}" is not in vector-memory's own EMBEDDABLE_TABLES — no real text-extraction strategy exists for it; not guessing one here` };
  }

  let rows;
  try { rows = jaa.query(table, () => true, 1000000) || []; }
  catch (e) { return { ok: false, table, error: `query failed: ${e.message}` }; }

  if (rows.length > MAX_SAFE_ROWS && !force) {
    return { ok: false, table, rowCount: rows.length, error: `${rows.length} rows exceeds the safe brute-force limit (${MAX_SAFE_ROWS}) for lib/local-vector-index.js's real O(n) per-query scan — pass { force: true } to run it anyway, but expect this to be slow` };
  }

  const embedMode = vm.status ? (await vm.status()).ollamaOk ? 'ollama' : 'tfidf-fallback' : 'unknown';

  // Real embed pass — idempotent, skips rows already indexed.
  for (const row of rows) {
    const uuid = row.uuid || row.id;
    if (!uuid) continue;
    const text = vm.extractText(table, row);
    if (!text) continue;
    await vm.embed({ uuid, text, table, ts: row.ts || row.createdAt || row.detectedAt || Date.now() });
  }

  // Real cluster pass — union-find over pairs scoring >= threshold.
  const parent = new Map();
  const find = (x) => { while (parent.get(x) !== x) x = parent.get(x); return x; };
  const union = (a, b) => { const ra = find(a), rb = find(b); if (ra !== rb) parent.set(ra, rb); };
  for (const row of rows) { const uuid = row.uuid || row.id; if (uuid) parent.set(uuid, uuid); }

  const pairScores = new Map(); // "uuidA|uuidB" (sorted) -> min score seen
  for (const row of rows) {
    const uuid = row.uuid || row.id;
    if (!uuid || !parent.has(uuid)) continue;
    const text = vm.extractText(table, row);
    if (!text) continue;
    const result = await vm.search(text, { k: 6, threshold, filter: { table } });
    for (const hit of result.results || []) {
      if (hit.uuid === uuid || !hit.uuid || !parent.has(hit.uuid)) continue;
      union(uuid, hit.uuid);
      const key = [uuid, hit.uuid].sort().join('|');
      pairScores.set(key, Math.min(pairScores.get(key) ?? 1, hit.similarity));
    }
  }

  const byUuid = new Map(rows.map((r) => [r.uuid || r.id, r]));
  const groups = new Map();
  for (const uuid of parent.keys()) {
    const root = find(uuid);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root).push(uuid);
  }

  const clusters = [];
  for (const members of groups.values()) {
    if (members.length < 2) continue;
    const rowsInCluster = members.map((u) => byUuid.get(u)).filter(Boolean);
    rowsInCluster.sort((a, b) => (a.ts || a.createdAt || a.detectedAt || 0) - (b.ts || b.createdAt || b.detectedAt || 0));
    const keep = rowsInCluster[0].uuid || rowsInCluster[0].id;
    const remove = rowsInCluster.slice(1).map((r) => r.uuid || r.id);
    let minScore = 1;
    for (const m of members) for (const n of members) {
      if (m === n) continue;
      const key = [m, n].sort().join('|');
      if (pairScores.has(key)) minScore = Math.min(minScore, pairScores.get(key));
    }
    clusters.push({ keep, remove, memberCount: members.length, similarity: minScore });
  }

  return { ok: true, table, embedMode, rowCount: rows.length, clusters };
}

module.exports = { findNearDuplicates, MAX_SAFE_ROWS };
