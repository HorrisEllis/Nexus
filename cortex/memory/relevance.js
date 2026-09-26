'use strict';
/**
 * cortex/memory/relevance.js — what a memory is WORTH keeping, measured.
 * comp_id: nexus.cortex.memory.relevance
 * UUID: nexus-memory-relevance-v1-0000-2026-0810-001
 * Version: 0.1.0
 *
 * WHY (James, 2026-08-10): "not just supposed to use a ticker. Could use sigmas
 * or deltas to measure the distance as a more quantifiable and measurable
 * method for decay."
 *
 * RELEVANCE IS NOT AGE. That is the whole idea and it is right. A 30-day-old
 * event that is the ROOT of a live causal chain matters more than a one-hour-old
 * heartbeat with no edges. Clock decay evicts the root and keeps the noise —
 * and then the chain that depended on it dangles, which is exactly the state
 * event_log is in today (see CAUSAL MEASUREMENT below).
 *
 * ── FOUR TERMS, EACH MEASURED FROM SOMETHING THAT ALREADY EXISTS ────────────
 *   causal      does anything descend from this? is it a chain root?
 *                 — meta/cfr/graph.js edges, meta/rfr2/causality traceToRoot
 *   sigma       was it anomalous? an anomaly is the memory worth keeping
 *                 — meta/cfr/sigma.js, sigma_rollups
 *   recurrence  is it part of a crystallised pattern?
 *                 — bep_patterns, crystals
 *   age         a TIEBREAKER between equals, never the criterion
 *
 * The ring buffer already proves the shape: meta/rfr2/kernel evicts by CAPACITY
 * and prunes edges on eviction (H-1), so its graph stays bounded and coherent.
 * What it does not do is choose WHICH event leaves — it takes the oldest. This
 * gives that choice a measurement.
 *
 * ── CAUSAL MEASUREMENT IS CURRENTLY BROKEN, AND THAT IS REPORTED, NOT FIXED ─
 * Measured 2026-08-10 against the live event_log: 11,393 events, 753 carry
 * `causedBy`, and those 753 point at exactly THREE distinct values —
 * "guardian" (188), "liminal" (564), "intelligence" (1). Those are SYSTEM
 * NAMES, not event ids. Not one resolves to a row.
 *
 * So `causedBy` is presently holding provenance-of-source in a field the causal
 * graph reads as causation. meta/cfr/graph.js turns each into a `causal` edge
 * and meta/cfr/kernel-surface.js asserts each as EDGE_CAUSAL_EXPLICIT. 753
 * declared causal edges refer to something that is not an event.
 *
 * This module therefore SEPARATES the two and refuses to score on the bad half:
 * a `causedBy` that is not a UUID is counted as `unresolvableRefs`, never as a
 * descendant. Scoring centrality on system-name edges would make heartbeats
 * from a chatty system look like causal hubs — and that is precisely the memory
 * you would then protect from decay.
 */

const path = require('path');
const ROOT = path.resolve(__dirname, '../..');
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{3,4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function _jaa() {
  try { return require(path.join(ROOT, 'cortex/memory/jaa-db.js')).jaaDB; }
  catch (_) { return null; }
}

/**
 * buildIndex(rows) — one pass, everything the scorer needs.
 * Separates resolvable causal edges from unresolvable references, loudly.
 */
function buildIndex(rows) {
  const byId = new Map();
  for (const r of rows) { const id = r.uuid || r.id; if (id) byId.set(id, r); }

  const children = new Map();          // parentId -> count, RESOLVABLE only
  const unresolvable = new Map();      // bad ref -> count
  let edges = 0;

  for (const r of rows) {
    const p = r.causedBy;
    if (!p) continue;
    if (!UUID_RE.test(String(p)) || !byId.has(String(p))) {
      unresolvable.set(String(p), (unresolvable.get(String(p)) || 0) + 1);
      continue;                        // §1.2 — counted, never treated as an edge
    }
    children.set(p, (children.get(p) || 0) + 1);
    edges++;
  }

  const typeCounts = new Map();
  for (const r of rows) { const t = r.type || '?'; typeCounts.set(t, (typeCounts.get(t) || 0) + 1); }

  return {
    byId, children, typeCounts, edges,
    unresolvableRefs: [...unresolvable.entries()].map(([ref, count]) => ({ ref, count }))
                        .sort((a, b) => b.count - a.count),
    unresolvableTotal: [...unresolvable.values()].reduce((a, b) => a + b, 0),
    total: rows.length,
  };
}

/** Patterns and crystals give the recurrence term real signatures to match. */
function loadRecurrence(jaa) {
  const sigs = new Set();
  if (!jaa) return { sigs, ok: false, reason: 'JAA unavailable — recurrence term will be 0 for every row, which is a BLIND term, not a zero one' };
  try {
    for (const p of jaa.query('bep_patterns', () => true, 10000) || []) {
      if (p.signature) sigs.add(String(p.signature));
      if (p.typeA) sigs.add(String(p.typeA));
      if (p.typeB) sigs.add(String(p.typeB));
    }
    for (const c of jaa.query('crystals', () => true, 1000) || []) {
      if (c.summary) for (const m of String(c.summary).matchAll(/"([a-z0-9._:-]+)"/gi)) sigs.add(m[1]);
    }
    return { sigs, ok: true };
  } catch (e) { return { sigs, ok: false, reason: `pattern tables unreadable: ${e.message}` }; }
}

/**
 * score(row, index, opts) -> { keep, terms, reasons }
 * keep is 0..1 — HIGHER MEANS KEEP. It is not a probability and is not
 * calibrated; it is an ordering. §17.11 — no benchmark is claimed.
 */
function score(row, index, opts = {}) {
  const now = opts.now || Date.now();
  const recurrence = opts.recurrence || { sigs: new Set(), ok: false };
  const id = row.uuid || row.id;
  const reasons = [];

  // ── CAUSAL — descendants, and being a chain root ────────────────────────
  let causal = 0;
  const kids = index.children.get(id) || 0;
  if (kids > 0) {
    causal += Math.min(0.7, 0.25 + Math.log2(kids + 1) * 0.15);
    reasons.push(`${kids} event(s) descend from this`);
    if (!row.causedBy) { causal += 0.3; reasons.push('causal ROOT — nothing above it to reconstruct it from'); }
  }
  causal = Math.min(1, causal);

  // ── SIGMA — anomaly is the memory worth keeping ─────────────────────────
  let sigma = 0;
  const s = Number.isFinite(row.sigma) ? row.sigma : (row.payload && Number.isFinite(row.payload.sigma) ? row.payload.sigma : null);
  if (s !== null) { sigma = Math.max(0, Math.min(1, s)); if (sigma > 0.3) reasons.push(`sigma ${sigma.toFixed(3)}`); }
  else if (/error|fail|violation|reject|halt|breach/i.test(String(row.type || ''))) {
    sigma = 0.6; reasons.push('failure-class event with no sigma recorded — treated as deviation');
  }

  // ── RECURRENCE — part of a crystallised pattern ─────────────────────────
  let recur = 0;
  if (recurrence.ok && row.type && recurrence.sigs.has(String(row.type))) {
    recur = 0.5; reasons.push(`type appears in a crystallised pattern`);
  }

  // ── RARITY — a type seen once is unreconstructable; one seen 5,000 times
  //    is reconstructable from any of its siblings.
  let rarity = 0;
  const seen = index.typeCounts.get(row.type || '?') || 1;
  if (seen <= 3) { rarity = 0.4; reasons.push(`type seen only ${seen}×`); }
  else if (seen > 1000) { rarity = -0.2; reasons.push(`type seen ${seen}× — highly reconstructable`); }

  // ── AGE — TIEBREAKER ONLY. Deliberately the smallest weight. Making age
  //    the criterion is the design being replaced.
  const ageH = (now - (row.ts || now)) / 3600000;
  const ageTerm = Math.max(0, 1 - ageH / (24 * 30));

  const keep = Math.max(0, Math.min(1,
    causal * 0.40 + sigma * 0.25 + recur * 0.15 + rarity * 0.10 + ageTerm * 0.10));

  return {
    id, keep: +keep.toFixed(4),
    terms: { causal: +causal.toFixed(3), sigma: +sigma.toFixed(3), recurrence: recur, rarity, age: +ageTerm.toFixed(3) },
    ageHours: +ageH.toFixed(1),
    reasons: reasons.length ? reasons : ['no retention signal — reconstructable, unreferenced, unremarkable'],
  };
}

/**
 * pressure(table, opts) — what a capacity-bounded eviction WOULD drop, ranked
 * by measured relevance instead of by clock.
 *
 * Reports, never evicts. The ring buffer takes the oldest; this says which the
 * oldest actually are in value terms.
 */
function pressure(table = 'event_log', opts = {}) {
  const jaa = _jaa();
  if (!jaa) return { ok: false, reason: 'JAA unavailable' };
  let rows;
  try { rows = jaa.query(table, () => true, 200000) || []; }
  catch (e) { return { ok: false, reason: `${table} unreadable: ${e.message}` }; }
  if (!rows.length) return { ok: true, table, rows: 0, note: 'table is empty' };

  const index = buildIndex(rows);
  const recurrence = loadRecurrence(jaa);
  const now = opts.now || Date.now();
  const scored = rows.map(r => score(r, index, { now, recurrence }));
  scored.sort((a, b) => a.keep - b.keep);

  const cap = opts.cap || Math.floor(rows.length * 0.8);
  const wouldDrop = Math.max(0, rows.length - cap);

  // The comparison that makes the case: how many rows would clock-decay drop
  // that measured relevance would KEEP?
  const evictAfterH = opts.evictAfterHours || 24;
  const clockDrops = scored.filter(s => s.ageHours > evictAfterH);
  const highValueClockDrops = clockDrops.filter(s => s.keep >= 0.35);

  return {
    ok: true, table, rows: rows.length,
    causal: {
      resolvableEdges: index.edges,
      unresolvableRefs: index.unresolvableTotal,
      offenders: index.unresolvableRefs.slice(0, 5),
      // §0.1 — the causal term cannot be trusted while this is non-zero.
      warning: index.unresolvableTotal
        ? `${index.unresolvableTotal} causedBy values do not resolve to an event (top: ${index.unresolvableRefs.slice(0, 3).map(o => `"${o.ref}"×${o.count}`).join(', ')}). These are counted, NOT scored as descendants — the causal term is measuring only ${index.edges} real edges.`
        : undefined,
    },
    recurrenceTerm: recurrence.ok ? `${recurrence.sigs.size} pattern signatures` : `BLIND — ${recurrence.reason}`,
    lowestValue: scored.slice(0, Math.min(8, wouldDrop || 8)),
    highestValue: scored.slice(-5).reverse(),
    clockComparison: {
      evictAfterHours: evictAfterH,
      clockWouldDrop: clockDrops.length,
      ofWhichHighValue: highValueClockDrops.length,
      verdict: highValueClockDrops.length
        ? `clock decay at ${evictAfterH}h would drop ${highValueClockDrops.length} rows that measure as WORTH KEEPING`
        : `clock decay at ${evictAfterH}h and measured relevance agree on this data`,
      examples: highValueClockDrops.slice(0, 3).map(s => ({ keep: s.keep, ageHours: s.ageHours, reasons: s.reasons })),
    },
  };
}

module.exports = { buildIndex, loadRecurrence, score, pressure, UUID_RE, VERSION: '0.1.0' };
