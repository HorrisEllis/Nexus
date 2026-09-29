'use strict';
/**
 * lib/opportunity/stages.js — the gated states an opportunity moves through, and who may move it.
 * comp_id: nexus.lib.opportunity.stages
 * Version: 1.0.0
 *
 * Pure. The compartment model (QUEUED → … → VERIFIED | FAILED → RETRYING) applied to a job/gig/lead:
 *
 *   DISCOVERED ─score→ SCORED ─→ SHORTLISTED ─draft→ DRAFTED ─(James)→ APPROVED ─prepare→ PREPARING
 *        │                 └──→ DISMISSED                                                  │
 *        │                                                  NEEDS_LOGIN / NEEDS_INPUT ←────┤
 *        │                                                                                 ↓
 *        │                                              READY ─submit→ SUBMITTED ─→ RESPONDED → INTERVIEW → OFFER
 *        │                                                                  │                         └→ REJECTED
 *        │                                                                  └→ FOLLOW_UP_DUE ─→ SUBMITTED (followed up)
 *        └ any stage → ARCHIVED;  PREPARING/READY → FAILED → (retry) PREPARING
 *
 * THE ONE HARD GATE: APPROVED is James's. An agent can find, score, draft and fill, but it cannot approve its own
 * work — `by` must be 'user' (same rule as copilot/routes/person-model.js accept, and lib/idea-provenance.js review).
 * Collision is a hard error: an illegal transition throws, it is never silently coerced.
 */

const STAGES = Object.freeze([
  'DISCOVERED', 'SCORED', 'SHORTLISTED', 'DISMISSED', 'DRAFTED', 'APPROVED', 'PREPARING', 'NEEDS_LOGIN', 'NEEDS_INPUT',
  'READY', 'SUBMITTED', 'FOLLOW_UP_DUE', 'RESPONDED', 'INTERVIEW', 'OFFER', 'REJECTED', 'FAILED', 'ARCHIVED',
]);

// from → allowed next stages
const NEXT = Object.freeze({
  DISCOVERED:   ['SCORED', 'DISMISSED', 'ARCHIVED'],
  SCORED:       ['SHORTLISTED', 'DISMISSED', 'ARCHIVED', 'SCORED'],
  SHORTLISTED:  ['DRAFTED', 'APPROVED', 'DISMISSED', 'ARCHIVED', 'SCORED'],
  DISMISSED:    ['SHORTLISTED', 'ARCHIVED'],
  DRAFTED:      ['APPROVED', 'DRAFTED', 'DISMISSED', 'ARCHIVED'],
  APPROVED:     ['PREPARING', 'SUBMITTED', 'DRAFTED', 'ARCHIVED'],
  PREPARING:    ['READY', 'NEEDS_LOGIN', 'NEEDS_INPUT', 'FAILED', 'SUBMITTED'],
  NEEDS_LOGIN:  ['PREPARING', 'ARCHIVED', 'SUBMITTED'],
  NEEDS_INPUT:  ['PREPARING', 'READY', 'ARCHIVED', 'SUBMITTED', 'FAILED'],
  READY:        ['SUBMITTED', 'PREPARING', 'FAILED', 'ARCHIVED'],
  SUBMITTED:    ['RESPONDED', 'INTERVIEW', 'REJECTED', 'OFFER', 'FOLLOW_UP_DUE', 'ARCHIVED'],
  FOLLOW_UP_DUE:['SUBMITTED', 'RESPONDED', 'INTERVIEW', 'REJECTED', 'ARCHIVED'],
  RESPONDED:    ['INTERVIEW', 'REJECTED', 'OFFER', 'ARCHIVED'],
  INTERVIEW:    ['OFFER', 'REJECTED', 'INTERVIEW', 'ARCHIVED'],
  OFFER:        ['ARCHIVED'],
  REJECTED:     ['ARCHIVED'],
  FAILED:       ['PREPARING', 'ARCHIVED', 'SUBMITTED'],
  ARCHIVED:     ['SHORTLISTED'],
});

// Transitions only James may make. Everything else an agent/system may do.
const USER_ONLY = Object.freeze({
  APPROVED: 'approval is James\'s — an agent cannot approve its own application',
  OFFER: 'only James records an offer',
});

// Stages that are waiting on James (surfaced by status().needsYou and copilot's L8 layer).
const NEEDS_YOU = Object.freeze(['SHORTLISTED', 'DRAFTED', 'NEEDS_LOGIN', 'NEEDS_INPUT', 'READY', 'FOLLOW_UP_DUE', 'INTERVIEW', 'RESPONDED']);

/** check(from, to, by) → { ok, error? } — pure. */
function check(from, to, by = 'agent') {
  if (!STAGES.includes(to)) return { ok: false, error: `unknown stage "${to}" — one of: ${STAGES.join(', ')}` };
  if (from && !STAGES.includes(from)) return { ok: false, error: `unknown current stage "${from}"` };
  if (from && !(NEXT[from] || []).includes(to)) return { ok: false, error: `${from} → ${to} is not a legal move (from ${from}: ${(NEXT[from] || []).join(', ') || 'nothing'})` };
  if (USER_ONLY[to] && by !== 'user') return { ok: false, error: USER_ONLY[to], userOnly: true };
  return { ok: true };
}

module.exports = { STAGES, NEXT, USER_ONLY, NEEDS_YOU, check };
