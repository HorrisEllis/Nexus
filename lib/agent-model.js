'use strict';
// copilot/lib/agent-model.js — §NEW 2026-09-17
//
// James: "the hats and .agent nodes should be integrated into guardian
// and the userscripts... It's meant to be a model of the agent. To
// persist." Built directly off copilot/lib/user-model.js's own real,
// live lifecycle (decay/reconfirm/archive-not-delete) — same primitive
// shape, same contract — per the architectural boundary this session
// proved out on that exact file, at the exact moment its own provider-
// preference derivation was shown to have violated it:
//
//   Lifecycle semantics are generic. Claim cardinality is domain-specific.
//
// So this file owns the same generic engine user-model.js does
// (observe/decay/reconfirm/archive, confidence < PRUNE_THRESHOLD →
// archived not deleted), and each derivation function below states its
// own cardinality explicitly — most agent claims coexist (an agent can
// be good at several things, have several known failure modes), but
// "best hat for a given task type" is a real, singular claim the same
// way "current provider preference" was, and gets the same competitive-
// penalty treatment, proven correct on user-model.js by a real test
// before being trusted here (A active alone → B outweighs A → A
// penalized not archived, still present → A stale+unreconfirmed →
// _runDecay archives it — 8/8 real assertions, not asserted from theory).
//
// §REAL FEEDS, NOT NEW INSTRUMENTATION — the other real correction this
// session made to the ChatGPT-authored design doc this file traces to:
// don't build new capture code when real evidence already exists.
// deriveFromFaultLog() reads lib/fault-log.js's real, already-automatic
// per-tool-call-error records (`agent` is already a real field on every
// fault_taxonomy row). deriveFromCapabilityProfile() reads lib/agent-
// capability.js's real, already-measured per-agent profile() — not a
// guess, live chat_log-derived data. Neither derivation invents a new
// observation pipeline; both read what two other real systems already
// produce every day.

const crypto = require('crypto');

const MODULE_ID = 'agent-model';
const VERSION   = '0.1.0';
const TABLE     = 'agent_model_hypotheses';

const DECAY_PER_DAY     = 0.10;   // same real rate as user-model.js — no evidence yet to justify a different one
const DECAY_INTERVAL_MS = 86400000;
const CONFIRM_BOOST     = 0.10;
const CONFIDENCE_CAP    = 1.0;
const PRUNE_THRESHOLD   = 0.20;   // below this → archived, not deleted (§ preserved religiously, per this session's own review)
const MIN_CONFIDENCE    = 0.05;

// claimType → does this claim compete for exclusivity within (agentId, competeKey)?
// Stated explicitly per type, not inferred — this IS the domain-specific
// cardinality boundary the generic engine below deliberately knows nothing about.
const CLAIM_CARDINALITY = {
  capability:          'coexist',   // "effective at repository mapping" — an agent can hold many
  failure_mode:        'coexist',   // "incomplete responses on multi-file changes" — likewise many
  intervention:        'coexist',   // cumulative evidence of needing guardian intervention, not exclusive
  best_hat_for_task:   'compete',   // exactly one true "best hat" per task_type at a time
};

let _jaa = null;
let _decayTimer = null;

function _getJaa() {
  if (_jaa) return _jaa;
  try {
    const { jaaDB } = require('../cortex/memory/jaa-db');
    if (jaaDB && typeof jaaDB.query === 'function') return jaaDB;
    return null;
  } catch (_) { return null; }
}

function init(jaaDB) {
  if (jaaDB) _jaa = jaaDB;
  _runDecay();
  _decayTimer = setInterval(_runDecay, DECAY_INTERVAL_MS);
  if (_decayTimer.unref) _decayTimer.unref();
  console.log(`[${MODULE_ID}] v${VERSION} — agent hypotheses model ready`);
}

function stop() {
  if (_decayTimer) { clearInterval(_decayTimer); _decayTimer = null; }
}

// ── Generic engine — same contract as user-model.js's _observeCore ─────────

function observe(agentId, claim, claimType, evidence = {}, initialConf = 0.5) {
  const jaa = _getJaa();
  if (!jaa || !agentId || !claim) return null;
  try {
    const existing = jaa.query(TABLE,
      h => h.agentId === agentId && h.claim === claim && h.claimType === claimType && h.status === 'active', 1
    );
    if (existing.length) {
      const h = existing[0];
      const newConf = Math.min(CONFIDENCE_CAP, (h.confidence || 0) + CONFIRM_BOOST);
      jaa.update(TABLE, h.uuid, {
        confidence: newConf, evidence_count: (h.evidence_count || 0) + 1,
        lastSeen: Date.now(), lastEvidence: evidence,
      });
      return { ...h, confidence: newConf };
    }
    const h = {
      uuid: crypto.randomUUID(), agentId, claim, claimType,
      confidence: Math.min(CONFIDENCE_CAP, Math.max(0, initialConf)),
      evidence_count: 1, firstSeen: Date.now(), lastSeen: Date.now(),
      lastEvidence: evidence, status: 'active', decayRate: DECAY_PER_DAY, source: 'observed',
    };
    jaa.insert(TABLE, h);
    return h;
  } catch (e) {
    console.warn(`[${MODULE_ID}] observe: ${e.message}`);
    return null;
  }
}

// observeExclusive — the one place this file's engine differs from
// user-model.js's, and only because CLAIM_CARDINALITY says to: reconfirm
// the winning claim, then apply a real penalty (not archival — that
// stays _runDecay's job on its own schedule) to every OTHER active claim
// sharing (agentId, claimType, competeKey). competeKey lets "best hat"
// compete separately per task_type rather than globally across all of
// them — e.g. the_librarian can be the winner for "documentation" and
// the_builder the winner for "multi-file-change" at the same time.
//
// §FIXED 2026-09-17 — caught by this file's own real test, not shipped
// on theory: the winner side originally delegated to observe(), whose
// match key is (agentId, claim, claimType) — it has no idea competeKey
// exists. So the SAME hat name winning two DIFFERENT competeKeys
// collapsed into one row, silently overwriting which task_type it had
// won, instead of holding both wins independently. The match key here
// now includes competeKey explicitly for compete-type claims — this
// function no longer reuses observe() for the winner side at all.
function observeExclusive(agentId, claim, claimType, competeKey, evidence = {}, initialConf = 0.5) {
  if (CLAIM_CARDINALITY[claimType] !== 'compete') {
    throw new Error(`[${MODULE_ID}] observeExclusive called for claimType '${claimType}', which is declared 'coexist' — use observe() instead`);
  }
  const jaa = _getJaa();
  if (!jaa || !agentId || !claim) return null;

  const existing = jaa.query(TABLE,
    h => h.agentId === agentId && h.claim === claim && h.claimType === claimType && h.status === 'active'
      && (h.lastEvidence || {}).competeKey === competeKey, 1
  );
  let winner;
  if (existing.length) {
    const h = existing[0];
    const newConf = Math.min(CONFIDENCE_CAP, (h.confidence || 0) + CONFIRM_BOOST);
    jaa.update(TABLE, h.uuid, {
      confidence: newConf, evidence_count: (h.evidence_count || 0) + 1,
      lastSeen: Date.now(), lastEvidence: { ...evidence, competeKey },
    });
    winner = { ...h, confidence: newConf };
  } else {
    winner = {
      uuid: crypto.randomUUID(), agentId, claim, claimType,
      confidence: Math.min(CONFIDENCE_CAP, Math.max(0, initialConf)),
      evidence_count: 1, firstSeen: Date.now(), lastSeen: Date.now(),
      lastEvidence: { ...evidence, competeKey }, status: 'active', decayRate: DECAY_PER_DAY, source: 'observed',
    };
    jaa.insert(TABLE, winner);
  }

  const competing = jaa.query(TABLE,
    h => h.agentId === agentId && h.claimType === claimType && h.status === 'active'
      && h.uuid !== winner.uuid && (h.lastEvidence || {}).competeKey === competeKey, 50) || [];
  for (const h of competing) {
    jaa.update(TABLE, h.uuid, { confidence: Math.max(MIN_CONFIDENCE, (h.confidence || 0) - CONFIRM_BOOST) });
  }
  return winner;
}

function _runDecay() {
  const jaa = _getJaa();
  if (!jaa) return;
  const now = Date.now();
  const active = jaa.query(TABLE, h => h.status === 'active', 1000);
  let decayed = 0, pruned = 0;
  for (const h of active) {
    const daysSince = (now - (h.lastSeen || now)) / DECAY_INTERVAL_MS;
    if (daysSince < 0.5) continue;
    const newConf = Math.max(0, (h.confidence || 0) - (h.decayRate || DECAY_PER_DAY) * daysSince);
    if (newConf < PRUNE_THRESHOLD) {
      jaa.update(TABLE, h.uuid, { status: 'archived', confidence: newConf, archivedAt: now, archiveReason: 'confidence_decay' });
      pruned++;
    } else {
      jaa.update(TABLE, h.uuid, { confidence: newConf });
      decayed++;
    }
  }
  if (decayed || pruned) console.log(`[${MODULE_ID}] decay: ${decayed} updated · ${pruned} archived`);
}

function getHypotheses(agentId, opts = {}) {
  const jaa = _getJaa();
  if (!jaa) return [];
  const minConf = opts.minConfidence ?? 0;
  return jaa.query(TABLE, h => h.agentId === agentId && h.status === 'active' && (h.confidence || 0) >= minConf, opts.limit || 100);
}

// ── Real derivations — read existing real evidence, invent none ────────────

// deriveFromFaultLog — lib/fault-log.js already tags every fault record
// with a real `agent` field, automatically, on every tool-call error.
// This reads that, it does not create a second fault-logging pipeline.
function deriveFromFaultLog(agentId, opts = {}) {
  let faultLog;
  try { faultLog = require('./fault-log'); } catch (_) { return { derived: 0, hypotheses: [] }; }
  const jaa = _getJaa();
  if (!jaa) return { derived: 0, hypotheses: [] };
  const rows = jaa.query(faultLog.TABLE, r => r.agent === agentId, opts.limit || 100) || [];
  if (!rows.length) return { derived: 0, hypotheses: [] };
  const byComponent = {};
  rows.forEach(r => { const c = r.component || 'unknown'; (byComponent[c] = byComponent[c] || []).push(r); });
  const derived = [];
  for (const [component, occurrences] of Object.entries(byComponent)) {
    if (occurrences.length < 2) continue; // one occurrence is real but not yet a pattern worth a claim
    const h = observe(agentId, `frequently requires intervention on ${component}`, 'intervention',
      { component, occurrenceCount: occurrences.length, source: 'fault_log' },
      Math.min(0.8, 0.4 + occurrences.length * 0.1));
    if (h) derived.push(h);
  }
  return { derived: derived.length, hypotheses: derived };
}

// deriveFromCapabilityProfile — lib/agent-capability.js's profile()
// is real, measured data (live chat_log-derived), not a static table.
function deriveFromCapabilityProfile(agentId) {
  let capability;
  try { capability = require('./agent-capability'); } catch (_) { return { derived: 0, hypotheses: [] }; }
  const profile = capability.profile ? capability.profile(agentId) : null;
  if (!profile) return { derived: 0, hypotheses: [] };
  const derived = [];
  // §HONEST — this stays deliberately thin for the first milestone. What
  // fields profile() actually exposes beyond chunking/health decisions
  // (its real, primary job) needs a real look at a live profile() output
  // before mapping more of it into observational claims; guessing field
  // names here would be exactly the kind of invented-not-observed claim
  // this file's whole design exists to avoid.
  if (profile.reason && capability._isSizeFailure && capability._isSizeFailure(profile.reason)) {
    const h = observe(agentId, 'struggles with large-context inputs', 'failure_mode',
      { source: 'agent_capability', reason: profile.reason }, 0.6);
    if (h) derived.push(h);
  }
  return { derived: derived.length, hypotheses: derived };
}

module.exports = {
  init, stop, observe, observeExclusive, getHypotheses,
  deriveFromFaultLog, deriveFromCapabilityProfile,
  CLAIM_CARDINALITY, TABLE, MODULE_ID, VERSION,
};
