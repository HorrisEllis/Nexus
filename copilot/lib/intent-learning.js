'use strict';
/**
 * copilot/lib/intent-learning.js — co-pilot's confidence in its own understanding
 * UUID: nexus-copilot-intent-learning-v1-0000-2026-0809-001
 *
 * James: "it needs to update the models of me and itself. each system needs a
 * model? it needs to learn and update its model. Baysesian updating?"
 *
 * §REUSE, not reinvention — the exact math already exists in copilot/lib/
 * user-model.js's _observeCore(): confirm boosts confidence (+0.1, capped at
 * 1.0), a miss/correction should pull it back down, and unconfirmed patterns
 * decay over time (the same "never a hard fact" philosophy). This file
 * applies that same math to a DIFFERENT subject — not "what do we believe
 * about James," but "how sure are we that THIS phrasing pattern means THIS
 * action" — co-pilot's confidence in its own grammar, which is what "update
 * the model of itself" actually means for the autonomy-router specifically.
 *
 * One row per patternId (e.g. 'ca1.schedule', 'ca6.build-command'):
 *   confidence      — Bayesian-ish: starts at 0.5, +0.1 per confirmation
 *                      (capped 1.0), -0.15 per correction/rejection (a wrong
 *                      match costs more than a right one earns — being
 *                      confidently wrong is worse than a miss, same
 *                      philosophy grammar-router.js's own confidence floor
 *                      is built on).
 *   confirmations / rejections — raw counts, so a confidence number is never
 *                      the only evidence — how much evidence backs it is
 *                      visible too (§1.1 — nothing exists until proven, and
 *                      "proven" needs a count, not just a percentage).
 */

const CONFIRM_BOOST = 0.10;   // matches user-model.js's CONFIRM_BOOST exactly
const REJECT_PENALTY = 0.15;  // steeper than the boost — a confident wrong match costs more
const CONFIDENCE_CAP = 1.0;
const CONFIDENCE_FLOOR = 0.05;
const DEFAULT_CONFIDENCE = 0.5;
const TABLE = 'intent_pattern_confidence';

function _jaa() { try { return require('../../cortex/memory/jaa-db').jaaDB; } catch (_) { return null; } }

/** getConfidence(patternId) — current confidence, 0.5 if never observed. */
function getConfidence(patternId) {
  const jaa = _jaa(); if (!jaa) return DEFAULT_CONFIDENCE;
  try {
    const rows = jaa.query(TABLE, r => r.patternId === patternId, 1);
    return rows.length ? rows[0].confidence : DEFAULT_CONFIDENCE;
  } catch (_) { return DEFAULT_CONFIDENCE; }
}

/**
 * recordOutcome(patternId, outcome) — outcome: 'confirmed' | 'rejected'.
 * Same reconfirm-or-create shape as user-model.js's _observeCore, applied to
 * a pattern instead of a claim about James.
 */
function recordOutcome(patternId, outcome) {
  const jaa = _jaa(); if (!jaa || !patternId) return null;
  const delta = outcome === 'confirmed' ? CONFIRM_BOOST : -REJECT_PENALTY;
  try {
    const existing = jaa.query(TABLE, r => r.patternId === patternId, 1);
    if (existing.length) {
      const row = existing[0];
      const newConf = Math.min(CONFIDENCE_CAP, Math.max(CONFIDENCE_FLOOR, (row.confidence || DEFAULT_CONFIDENCE) + delta));
      const update = {
        confidence: newConf,
        confirmations: (row.confirmations || 0) + (outcome === 'confirmed' ? 1 : 0),
        rejections: (row.rejections || 0) + (outcome === 'rejected' ? 1 : 0),
        lastOutcome: outcome, lastSeen: Date.now(),
      };
      jaa.update(TABLE, { id: row.id }, update);
      return { ...row, ...update };
    }
    const row = {
      patternId, confidence: Math.min(CONFIDENCE_CAP, Math.max(CONFIDENCE_FLOOR, DEFAULT_CONFIDENCE + delta)),
      confirmations: outcome === 'confirmed' ? 1 : 0, rejections: outcome === 'rejected' ? 1 : 0,
      lastOutcome: outcome, firstSeen: Date.now(), lastSeen: Date.now(),
    };
    jaa.insert(TABLE, row);
    return row;
  } catch (_) { return null; }
}

/** allPatterns() — every tracked pattern, for the self-model to summarize. */
function allPatterns() {
  const jaa = _jaa(); if (!jaa) return [];
  try { return jaa.query(TABLE, () => true, 1000) || []; } catch (_) { return []; }
}

module.exports = { getConfidence, recordOutcome, allPatterns, TABLE, MODULE_ID: 'copilot-intent-learning', VERSION: '1.0.0' };
