'use strict';
/**
 * lib/agent-build-learning.js — which agent tends to succeed at building
 * UUID: nexus-agent-build-learning-v1-0000-2026-0811-001
 *
 * James: "need to try them all, unless it's a system failure... order still
 * matters, use the same Bayesian pattern as tonight."
 *
 * §REUSE — same exact math as copilot/lib/intent-learning.js (+0.10 confirm,
 * -0.15 reject, capped [0.05, 1.0]), applied to a third subject now: not
 * "what do we believe about James" (user-model.js), not "how sure is
 * co-pilot about a phrasing" (intent-learning.js), but "which agent tends to
 * actually produce a working build." Three models, one math, because the
 * math was already right — §8.6, not reinvented a third time.
 *
 * §PRIOR, not a blank slate — lib/agent-router.js's DEFAULT_FALLBACK already
 * encodes James's own reasoning about agent strengths (perplexity for
 * data, claude "last resort" for large code, etc). A never-seen agent
 * starts at DEFAULT_FALLBACK's position-based prior, not a flat 0.5 —
 * ordering that already reflects real judgment shouldn't be thrown away
 * just because nothing's been recorded yet.
 */

const CONFIRM_BOOST = 0.10;
const REJECT_PENALTY = 0.15;
const CONFIDENCE_CAP = 1.0;
const CONFIDENCE_FLOOR = 0.05;
const TABLE = 'agent_build_confidence';

let _fallbackOrder = null;
function _defaultFallback() {
  if (_fallbackOrder) return _fallbackOrder;
  try { _fallbackOrder = require('./agent-router').DEFAULT_FALLBACK || []; } catch (_) { _fallbackOrder = []; }
  return _fallbackOrder;
}

function _priorFor(agent) {
  const order = _defaultFallback();
  const idx = order.indexOf(agent);
  if (idx === -1) return 0.5;
  // Earlier in DEFAULT_FALLBACK = higher prior. Spread evenly above 0.5 down to 0.5.
  return 0.5 + (order.length - idx) * (0.15 / order.length);
}

function _jaa() { try { return require('../cortex/memory/jaa-db').jaaDB; } catch (_) { return null; } }

/** getConfidence(agent) — current confidence, or DEFAULT_FALLBACK's position-based prior if never recorded. */
function getConfidence(agent) {
  const jaa = _jaa(); if (!jaa) return _priorFor(agent);
  try {
    const rows = jaa.query(TABLE, r => r.agent === agent, 1);
    return rows.length ? rows[0].confidence : _priorFor(agent);
  } catch (_) { return _priorFor(agent); }
}

/** orderedAgents(candidates) — candidates sorted by current confidence, highest first. */
function orderedAgents(candidates) {
  const list = candidates && candidates.length ? candidates : _defaultFallback();
  return list.slice().sort((a, b) => getConfidence(b) - getConfidence(a));
}

/** recordOutcome(agent, outcome) — outcome: 'confirmed' | 'rejected'. Same reconfirm-or-create shape as the other two learning modules. */
function recordOutcome(agent, outcome) {
  const jaa = _jaa(); if (!jaa || !agent) return null;
  const delta = outcome === 'confirmed' ? CONFIRM_BOOST : -REJECT_PENALTY;
  try {
    const existing = jaa.query(TABLE, r => r.agent === agent, 1);
    if (existing.length) {
      const row = existing[0];
      const newConf = Math.min(CONFIDENCE_CAP, Math.max(CONFIDENCE_FLOOR, (row.confidence || _priorFor(agent)) + delta));
      const update = {
        confidence: newConf,
        successes: (row.successes || 0) + (outcome === 'confirmed' ? 1 : 0),
        failures: (row.failures || 0) + (outcome === 'rejected' ? 1 : 0),
        lastOutcome: outcome, lastSeen: Date.now(),
      };
      jaa.update(TABLE, { id: row.id }, update);
      return { ...row, ...update };
    }
    const row = {
      agent, confidence: Math.min(CONFIDENCE_CAP, Math.max(CONFIDENCE_FLOOR, _priorFor(agent) + delta)),
      successes: outcome === 'confirmed' ? 1 : 0, failures: outcome === 'rejected' ? 1 : 0,
      lastOutcome: outcome, firstSeen: Date.now(), lastSeen: Date.now(),
    };
    jaa.insert(TABLE, row);
    return row;
  } catch (_) { return null; }
}

function allAgents() {
  const jaa = _jaa(); if (!jaa) return [];
  try { return jaa.query(TABLE, () => true, 1000) || []; } catch (_) { return []; }
}

module.exports = { getConfidence, orderedAgents, recordOutcome, allAgents, TABLE, MODULE_ID: 'agent-build-learning', VERSION: '1.0.0' };
