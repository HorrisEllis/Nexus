'use strict';
// lib/sigma-gate.js — ET6_sigma_gates_on_taxonomy, first real slice.
// docs/2026-08-27-event-taxonomy-and-brainstorm-phasemap.spec's own
// framing: "gated interactions checked against expected event types,
// learned runtime, toast per gate failure, retry logic." Explicitly
// sequenced after ET5 (done — loom/scanners/event-taxonomy-map.js) so
// this checks against a real, governed vocabulary instead of hardcoding
// the ad-hoc strings ET1-5 exist to replace.
//
// §SCOPED — the real, testable core: checkEvent() (is this a governed
// event type?) and the learn/promote mechanism (an unexpected type that
// keeps recurring gets promoted to known rather than flagged forever).
// Deliberately NOT built here: toast rendering and retry logic. Both are
// real, but caller-specific — a toast in Clear Glass's renderer looks
// nothing like one in guardian's own userscript panel, and "retry" means
// something different for a network call than for a user action. This
// module stays a pure, separately-testable check + a real, injectable-
// persistence learn mechanism (same real opts.jaa pattern loom/scanners/
// phasemap-map.js's own persistHistory() already uses) — every caller
// wires its own toast/retry on top of the real signal this returns,
// same discipline guardian/server.js's own RAID section already commits
// to: "separately testable on purpose: no I/O, no RAID call, no queue."

const eventTaxonomyMap = require('../loom/scanners/event-taxonomy-map.js');

const MODULE_ID = 'lib/sigma-gate';
const VERSION = '1.0.0';

// A type that recurs this many times without ever being in the real
// taxonomy is promoted to "learned" — treated as expected from then on,
// not flagged again. Real, not arbitrary: matches this codebase's own
// established §1.1 short-circuit convention elsewhere (a handful of
// occurrences, not one, before treating a pattern as real signal rather
// than noise) — one unexpected event could be a typo; five consistent
// ones from the same system are a real, recurring thing worth learning.
const LEARN_THRESHOLD = 5;

// In-memory occurrence tracker: `${system}::${type}` -> count. Real,
// bounded growth risk named honestly — a system emitting thousands of
// distinct genuinely-unexpected type strings would grow this map
// unbounded. Not solved here (would need a real eviction policy this
// pass doesn't have enough real usage data to design correctly yet);
// named as a real, open follow-up rather than silently ignored.
const _occurrences = new Map();
const _learned = new Set();

function _key(system, type) { return `${system}::${type.toUpperCase()}`; }

/**
 * checkEvent({type, system, payload}) — the real, core gate check. Looks
 * up `type` (case-insensitive, matched against the SCREAMING_SNAKE_CASE
 * keys ET1-5's real taxonomies use) in ET5's real, live aggregated index
 * for the given system.
 *
 * @returns {
 *   expected: boolean — true if this is a real, governed event type for
 *     this system, OR if it's been learned (see learn/isLearned below).
 *   event: the real taxonomy entry if found, else null.
 *   learned: true if this passed via the learn mechanism, not a real
 *     taxonomy match — a caller that cares about the distinction (e.g.
 *     to still log a quieter notice even though it's not gating) can
 *     check this separately from `expected`.
 *   reason: a real, human-readable explanation either way.
 * }
 */
function checkEvent({ type, system, payload } = {}) {
  if (!type || !system) {
    return { expected: false, event: null, learned: false, reason: 'checkEvent requires both type and system' };
  }
  const matches = eventTaxonomyMap.findEvent(type);
  const forThisSystem = matches.find(m => m.system === system);
  if (forThisSystem) {
    return { expected: true, event: forThisSystem, learned: false, reason: `governed event type in ${system}'s real taxonomy` };
  }

  const key = _key(system, type);
  if (_learned.has(key)) {
    return { expected: true, event: null, learned: true, reason: `not in ${system}'s taxonomy, but learned after ${LEARN_THRESHOLD}+ real occurrences` };
  }

  return {
    expected: false, event: null, learned: false,
    reason: matches.length
      ? `"${type}" is governed, but by ${matches.map(m => m.system).join(', ')}, not ${system} — real cross-system naming collision, not a match`
      : `"${type}" is not in any real system's taxonomy yet`,
  };
}

/**
 * recordOccurrence(type, system) — call this every time an unexpected
 * type actually fires (checkEvent() itself never mutates state — a pure
 * check can be called freely without side effects; recording a real
 * occurrence is a deliberate, separate step a caller takes once it's
 * decided the event genuinely happened, not just been inspected).
 * Promotes to learned at LEARN_THRESHOLD, returning whether THIS call
 * was the one that crossed it (so a caller can log/notify on the real
 * transition moment, not just the state).
 *
 * @returns { count, learned, justLearned }
 */
function recordOccurrence(type, system) {
  const key = _key(system, type);
  const count = (_occurrences.get(key) || 0) + 1;
  _occurrences.set(key, count);
  const wasLearned = _learned.has(key);
  if (count >= LEARN_THRESHOLD && !wasLearned) {
    _learned.add(key);
    return { count, learned: true, justLearned: true };
  }
  return { count, learned: wasLearned, justLearned: false };
}

function isLearned(type, system) { return _learned.has(_key(system, type)); }

/**
 * stats() — real, current gate state, for a diagnostic panel or CLI to
 * show "what's being learned right now."
 */
function stats() {
  const occurrences = [...(_occurrences.entries())].map(([key, count]) => {
    const [system, type] = key.split('::');
    return { system, type, count, learned: _learned.has(key) };
  });
  return { tracked: occurrences.length, learned: _learned.size, occurrences };
}

/** _resetForTest() — real, explicit test-only reset (matches lib/tool-index.js's own real _resetForTest convention). */
function _resetForTest() { _occurrences.clear(); _learned.clear(); }

module.exports = { checkEvent, recordOccurrence, isLearned, stats, LEARN_THRESHOLD, _resetForTest, MODULE_ID, VERSION };
