'use strict';
/**
 * lib/meta/confidence.js — Weakest-Link Confidence Aggregator
 * UUID: nexus-confidence-v1-0000-4000-0000-000000000001
 * Version: 1.0.0
 *
 * Replaces arithmetic-mean confidence aggregation (drift/avgConf/avgConfidence)
 * everywhere it appears in the gap pipeline.
 *
 * Rule (per James, 2026-06-21): overall confidence is defined by the weakest
 * claim, assumption, or point of data — never diluted by averaging against
 * stronger ones. A single unevidenced item caps the whole aggregate.
 *
 * Two layers:
 *   1. effective(item)   — per-item score, discounted if evidence is absent.
 *   2. weakestLink(items)— min() across effective scores. Not mean().
 *
 * §C1: pure functions, no shared state. §1.2: nothing silent — every caller
 * that switches from mean to this module changes behavior, and must say so.
 */

// Score multiplier applied when an item has no evidence object backing it.
// 0.6 is a floor, not a guess: an unevidenced 0.95 (e.g. a hardcoded literal)
// should never outrank an evidenced 0.6 (a real measured metric) once both
// are run through the same scale.
const EVIDENCE_LESS_DISCOUNT = 0.6;

function hasEvidence(item) {
  if (!item) return false;
  // count > 0 is structural evidence — N repeated observations IS evidence.
  if (item.count && item.count > 0) return true;
  const ev = item.evidence;
  return !!ev && typeof ev === 'object' && Object.keys(ev).length > 0;
}

function rawScore(item) {
  if (!item) return 0;
  return item.score ?? item.criticality ?? item.confidence ?? 0;
}

// Per-item effective confidence: raw score, discounted if unevidenced.
function effective(item, opts = {}) {
  const discount = opts.discount ?? EVIDENCE_LESS_DISCOUNT;
  const score = rawScore(item);
  return hasEvidence(item) ? score : score * discount;
}

// Weakest-link aggregate across N items. confidence = min(effective scores).
// Empty input → 0 (no claims, no confidence — not 1, not "neutral").
function weakestLink(items, opts = {}) {
  if (!Array.isArray(items) || items.length === 0) return 0;
  const vals = items.map(i => effective(i, opts));
  return parseFloat(Math.min(...vals).toFixed(3));
}

// Which item is the weakest link — for surfacing in logs/ledger, not just
// the number. "No ambiguity" means showing the bottleneck, not hiding it.
function bottleneck(items, opts = {}) {
  if (!Array.isArray(items) || items.length === 0) return null;
  let worst = null, worstVal = Infinity;
  for (const i of items) {
    const v = effective(i, opts);
    if (v < worstVal) { worstVal = v; worst = i; }
  }
  return worst ? { item: worst, effective: parseFloat(worstVal.toFixed(3)), hasEvidence: hasEvidence(worst) } : null;
}

module.exports = { weakestLink, bottleneck, effective, hasEvidence, rawScore, EVIDENCE_LESS_DISCOUNT };
