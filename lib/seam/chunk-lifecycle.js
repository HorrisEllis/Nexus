'use strict';
/**
 * lib/seam/chunk-lifecycle.js — Canonical chunk-lifecycle vocabulary
 * UUID: nexus-chunk-lifecycle-v1-0000-2026-0706-jamesbrooks-001
 * Version: 1.0.0
 *
 * §SCOPE — this is the safe half of consolidating lib/seam/queue.js's
 * SEAMQueue/QueueCompartment and idearium/spec-engine's CHUNK_STATES.
 * Both are confirmed real duplicates of the same underlying problem
 * ("a chunk dispatched to an AI provider, tracked through states until
 * verified or escalated" — SEAMQueue's own header says so in almost
 * those exact words). A full merge would mean either rewriting
 * Idearium's disk-persisted manifest model around QueueCompartment, or
 * extracting a shared behavioral core — both are real, multi-hour
 * refactors touching two systems that currently work, not something to
 * rush at the tail end of a long session.
 *
 * What IS safe and done here: neither system's actual persisted string
 * values change (Idearium's specs on disk already have lowercase
 * `status: "pending"` etc. from past sessions — renaming those breaks
 * every already-saved spec). Instead, this gives both systems one
 * canonical vocabulary to translate INTO, so cross-system reporting
 * (e.g. "how many things are stuck in a queued-equivalent state, across
 * both systems") becomes possible without either system's internals
 * changing at all.
 *
 * The deeper merge — giving Idearium's cruder attempts-based retry logic
 * SEAMQueue's real multi-strategy escalation ladder and Detector-based
 * verification — remains a real, separate, still-open task.
 */

// The canonical vocabulary — SEAMQueue's own names, since it's the more
// complete state machine (has RETRYING as a distinct state; Idearium
// folds that into staying at BUILDING/re-incrementing attempts).
const CANONICAL = Object.freeze({
  QUEUED:     'QUEUED',
  INJECTING:  'INJECTING',
  GENERATING: 'GENERATING',
  DETECTING:  'DETECTING',
  VERIFIED:   'VERIFIED',
  RETRYING:   'RETRYING',
  ESCALATED:  'ESCALATED',
  FAILED:     'FAILED',
});

// ── Mapping tables — documented correspondence, not a guess ────────────────
// SEAMQueue's own STATE object (lib/seam/queue.js) already uses the
// canonical names directly — identity mapping, included for symmetry so
// callers can normalize from either system with the same function.
const FROM_SEAMQUEUE = Object.freeze({
  QUEUED: 'QUEUED', INJECTING: 'INJECTING', GENERATING: 'GENERATING',
  DETECTING: 'DETECTING', VERIFIED: 'VERIFIED', RETRYING: 'RETRYING',
  ESCALATED: 'ESCALATED', FAILED: 'FAILED',
});

// Idearium's CHUNK_STATES (idearium/spec-engine/index.js) — lowercase
// string values, mapped to the canonical vocabulary. BUILDING covers
// both INJECTING and GENERATING (Idearium doesn't distinguish "sent, not
// yet responding" from "actively generating" — one state for both).
// VERIFYING maps to DETECTING (same "checking the response" concept).
// Idearium has no distinct RETRYING state — a failed attempt under the
// retry ceiling just increments `attempts` and stays effectively at
// BUILDING/PENDING depending on where the retry loop re-enters, so a
// literal RETRYING mapping doesn't exist on this side; canonical
// RETRYING has no Idearium equivalent to map FROM, only TO (see below).
const FROM_IDEARIUM = Object.freeze({
  pending:   'QUEUED',
  building:  'GENERATING',   // collapses INJECTING+GENERATING — real limitation, not lost information Idearium tracks and this discards
  verifying: 'DETECTING',
  complete:  'VERIFIED',
  failed:    'FAILED',
  escalated: 'ESCALATED',
});

/**
 * normalizeState(rawState, system) — translate either system's real
 * state value into the canonical vocabulary. Throws on an unrecognized
 * state rather than silently returning something misleading — a state
 * name that doesn't map to anything is a real signal (drift between this
 * mapping and whichever system changed), not something to paper over.
 */
function normalizeState(rawState, system) {
  const table = system === 'seamqueue' ? FROM_SEAMQUEUE
              : system === 'idearium'  ? FROM_IDEARIUM
              : null;
  if (!table) throw new Error(`[chunk-lifecycle] unknown system '${system}' — expected 'seamqueue' or 'idearium'`);
  const canonical = table[rawState];
  if (!canonical) throw new Error(`[chunk-lifecycle] unrecognized ${system} state '${rawState}' — mapping table may be stale`);
  return canonical;
}

/**
 * isTerminal(canonicalState) — true if nothing further happens to a
 * chunk/compartment in this state without external intervention.
 * Shared logic neither system currently expresses as a single check —
 * each hand-rolls `status === 'complete' || status === 'failed' ...`
 * inline at each call site instead.
 */
function isTerminal(canonicalState) {
  return canonicalState === CANONICAL.VERIFIED || canonicalState === CANONICAL.ESCALATED;
}

module.exports = { CANONICAL, normalizeState, isTerminal, FROM_SEAMQUEUE, FROM_IDEARIUM };
