'use strict';
/**
 * cortex/intelligence/adversarial.js — ADVERSARIAL faculty
 * UUID: nexus-cortex-adversarial-v1-0000-2026-0706-jamesbrooks-001
 * Spec: docs/cortex-dual-cognition.spec — the spec's own entire content
 * on this faculty is one sentence: "ADVERSARIAL probes both. Contradiction
 * between the two = gap." No scoring concept, no reconciliation concept —
 * checked directly (grepped the whole repo for "contradiction_score" and
 * "reconcil" before writing this) — genuinely not built anywhere before
 * this file. Real, new extension of a one-line spec, not a recall.
 *
 * §NOT meta/adversary-suite.js — that's Phase 25's compartment
 * stress-tester (6 attack classes: syntax/logic/edge-case/state/
 * cross-domain/stress), unrelated, real, and predates this file. Two
 * different things share the word "adversary/adversarial" in this
 * codebase now — this one is reasoning comparison, that one is
 * execution-result stress testing. Do not conflate them.
 *
 * §GENERALIZED 2026-07-06 — compare() no longer knows what "intuition"
 * or "mastermind" are. It operates on a normalized ReasoningResult shape
 * ({ source, domain, intent, confidence, claims, comparable }) so any two
 * reasoning outputs — Guardian vs RAID, a simulation vs telemetry, a
 * human proposal vs a generated plan — can go through the same engine.
 * Cortex's two faculties get their own normalizer functions below, kept
 * separate from the generic core on purpose: the comparison logic
 * shouldn't need to change if Guardian starts using this next.
 */

const COMPARABLE_INTENTS = new Set(['gaps', 'status']);

/**
 * normalizeIntuitionResult — Cortex-specific adapter, not part of the
 * generic contract. Translates intuition.js's native output into a
 * ReasoningResult. Only 'gaps'/'status' intents are comparable to
 * mastermind's territory — a relationship or pattern answer isn't
 * marked non-comparable via a boolean lie, it's just absent from
 * COMPARABLE_INTENTS, same honest scoping as before this refactor.
 */
function normalizeIntuitionResult(result, domain = 'cortex') {
  if (!result) return null;
  if (!COMPARABLE_INTENTS.has(result.intent)) {
    return { source: 'intuition', domain, intent: result.intent || 'unknown', comparable: false };
  }
  const seesIssue = result.intent === 'gaps'
    ? Object.values(result.breakdown || {}).reduce((a, b) => a + b, 0) > 0
    : /regime:\s*(turbulent|resonant)/.test(result.text || '');
  return {
    source: 'intuition', domain, intent: result.intent, confidence: result.confidence,
    claims: [{ type: seesIssue ? 'issue_detected' : 'no_issue', detail: result.text, traced: false }],
    comparable: true,
  };
}

/**
 * normalizeMastermindResult — same idea for mastermind.js's native output.
 * `traced` on the claim carries what used to be a separate tracedCount
 * check — the generic compare() only needs to know "does this claim
 * have a real backing trace," not which faculty produced it.
 */
function normalizeMastermindResult(result, domain = 'cortex') {
  if (!result) return null;
  const seesIssue = (result.gapCount || 0) > 0;
  const hasTrace  = (result.tracedCount || 0) > 0;
  return {
    source: 'mastermind', domain, intent: 'status',
    confidence: hasTrace ? 0.9 : (seesIssue ? 0.5 : 0.85),
    claims: [{ type: seesIssue ? 'issue_detected' : 'no_issue', detail: result.analysis, traced: hasTrace }],
    comparable: true,
  };
}

/**
 * compare — the generic engine. Takes any two ReasoningResults, doesn't
 * care about their source. Deliberately coarse scoring built from real
 * signals present on the normalized claims, not fabricated precision.
 */
function compare({ left, right } = {}) {
  if (!left || !right) {
    return { comparable: false, reason: 'missing result from one or both sides' };
  }
  if (left.comparable === false || right.comparable === false) {
    return {
      comparable: false,
      reason: `not the same territory: '${left.source}' intent '${left.intent}' vs '${right.source}' intent '${right.intent}'`,
    };
  }

  const leftClaim  = left.claims?.[0]  || {};
  const rightClaim = right.claims?.[0] || {};
  const leftIssue  = leftClaim.type  === 'issue_detected';
  const rightIssue = rightClaim.type === 'issue_detected';
  const anyTraced  = !!(leftClaim.traced || rightClaim.traced);
  const bothIssue  = leftIssue && rightIssue;
  const maxConfidence = Math.max(left.confidence || 0, right.confidence || 0);

  let score = 0;
  const reasons = [];

  if (leftIssue !== rightIssue) {
    score += 0.6;
    reasons.push(leftIssue
      ? `${left.source} sees an issue; ${right.source} does not`
      : `${right.source} sees an issue; ${left.source} does not`);
  }
  if (bothIssue && !anyTraced && maxConfidence > 0.85) {
    score += 0.25;
    reasons.push('both sides see an issue, but neither has a traced/backed cause, despite high confidence on one side');
  }
  score = Math.min(1, Number(score.toFixed(2)));

  const result = { comparable: true, contradiction_score: score, reasons, left: left.source, right: right.source };

  if (leftIssue === rightIssue && leftIssue && anyTraced) {
    result.verdict = 'reconciled';
    const tracedClaim = leftClaim.traced ? leftClaim : rightClaim;
    result.reconciled_hypothesis = `Confirmed issue, traced cause available: ${tracedClaim.detail}`;
  } else if (score < 0.3) {
    result.verdict = 'agreement';
  } else {
    result.verdict = 'contradiction';
    result.open_gap = true;
  }
  return result;
}

/**
 * compareCortexFaculties — backward-compatible entry point for
 * boot.js's existing wiring. Normalizes both native results, then runs
 * the generic engine. New callers (Guardian, RAID, LOOM, anything else)
 * should write their own normalizer and call compare({left, right})
 * directly rather than extending this function.
 */
function compareCortexFaculties(intuitionResult, mastermindResult) {
  return compare({
    left:  normalizeIntuitionResult(intuitionResult),
    right: normalizeMastermindResult(mastermindResult),
  });
}

module.exports = { compare, compareCortexFaculties, normalizeIntuitionResult, normalizeMastermindResult };
