'use strict';
/**
 * cortex/core/raid/context-gate.js — gateCandidate(): the in_bounds_check
 * comp_id: cortex.raid.context-gate
 * uuid: nexus-cortex-raid-context-gate-v1-0000-2026-0903-jamesbrooks-001
 * Version: 0.1.0
 *
 * §BUILT 2026-09-03 — docs/contracts/context-candidate.spec's
 * in_bounds_check, made real. Closes the loop: contract-boundary.js
 * resolves a contract's boundary, context-synthesis.js produces a raw
 * candidate stream, this is the missing piece that judges each candidate
 * against that boundary and produces context-synthesis-pipeline.spec's
 * assembly step 3-4 (only in_bounds candidates -> context.matched[]).
 *
 * §HONEST SCOPE — checked warp/core/Axiom.js directly before writing
 * this. Axiom.check(event, gate, streamState) is shaped for warp's own
 * transform-gate pipeline; a context candidate is none of those three
 * things. Fabricating a fake {event, gate, streamState} just to call a
 * real Axiom.check() would be pretending to run a check on data it was
 * never designed to evaluate — exactly the kind of "nothing pretends to
 * work" violation this whole session has been catching. Also checked:
 * every real boundary row in contract-boundary.js's REGISTRY has
 * invariants: [] today — there is nothing to run yet regardless.
 *
 * So, honestly, THIS VERSION checks exactly one real thing:
 *   primitive_match — does the candidate's own text (id/kind/source_tool/
 *   raw content) actually reference the boundary's declared primitive.
 * invariants[] and principles[] are carried through on the verdict as
 * REAL DATA (so a caller can see what was declared) but are NOT
 * evaluated — marked unavailable, not silently treated as passed. When
 * a boundary's invariants[] is ever populated with real Axiom ids, this
 * file needs a real (event,gate,streamState)-shaped adapter built for
 * context candidates specifically — that adapter does not exist yet,
 * named here rather than faked.
 *
 * §KNOWN LIMITATION — found by actually running this against real data,
 * not theorized: plain token-overlap causes false positives on generic
 * tokens. "idearium.spec-engine" vs a real component id containing
 * "spec" (e.g. an unrelated architect module) matched on "spec" alone —
 * confirmed directly, not hypothetical. Not patched here with a stoplist
 * or a length/frequency heuristic — that trades one unproven heuristic
 * for another. Left honest and visible instead: primitive_match:'finding'
 * from this version is a real but weak signal, worth a human or a
 * stronger matcher (embedding similarity, or requiring 2+ token overlap)
 * before this gate's output is trusted unattended for anything
 * consequential.
 */

function _tokens(text) {
  // §BUGFIX 2026-09-03 — caught by actually running this against real
  // data: the original char class kept '/', '.', '#' as part of a token,
  // so "copilot/server.js" became ONE token instead of ["copilot",
  // "server", "js"] — an obvious real match ("copilot" appears in both
  // the primitive string and a real component id) silently failed.
  // Fixed to split on any non-alphanumeric run, same convention
  // cortex/push-recall.js's own _tokenize() already uses.
  return String(text || '').toLowerCase().match(/[a-z0-9_]+/g) || [];
}

function _primitiveMatch(candidate, primitive) {
  // §REVISED 2026-09-03 — any-token-overlap replaced. Checked the
  // originally-planned fix (IDF/term-rarity weighting) against the real
  // 64-component corpus (nexus_map 'graph') before writing this: 'spec'
  // (the false-positive token) has document-frequency 1/64, 'copilot'
  // (the true-positive token) has df 2/64 — statistically indistinguishable.
  // 84% of all 85 distinct tokens in the real corpus have df<=2. The
  // corpus is uniformly sparse; IDF has nothing real to discriminate on
  // at this scale. Confirmed structurally, not patched around.
  //
  // Real fix: primitive strings here are built consistently — they LEAD
  // with the actual identifying module/system name ("idearium" in
  // "idearium.spec-engine", "copilot" in "copilot/server.js"); trailing
  // words ("spec-engine", "server.js /build handler") are descriptive,
  // not identifying, and are exactly where the false match came from.
  // Match on the primitive's own leading token specifically, not
  // any-token-overlap across the whole string.
  const primTokens = _tokens(primitive).filter(t => !['module_id', 'module'].includes(t));
  const leadToken = primTokens[0];
  if (!leadToken || leadToken.length <= 2) return false;
  const candidateText = [
    candidate.id, candidate.kind, candidate.source_tool,
    candidate.raw && (candidate.raw.id || candidate.raw.name || candidate.raw.title),
  ].filter(Boolean).join(' ');
  const candTokens = new Set(_tokens(candidateText));
  return candTokens.has(leadToken);
}

/**
 * §TESTED against both known real cases before shipping (see chat):
 *   idearium:build (lead token "idearium") vs
 *     nexus.architect.src.spec.Blueprint  -> correctly out_of_bounds
 *     (previously a false positive on the shared token "spec")
 *   copilot:build (lead token "copilot") vs
 *     nexus.clear-glass.src.copilot.{bridge,tools} -> correctly in_bounds
 * §HONEST CALIBRATION SIZE — n=2 known real cases. A leading-token match
 * is a stronger structural signal than any-token-overlap, not a proven
 * general solution; primitive strings whose real identifying name is NOT
 * the first token would defeat it. Worth re-checking as more real
 * (source,intention) rows are added to contract-boundary.js's REGISTRY.
 */

/**
 * gateCandidate(candidate, boundary) — one candidate, one contract's
 * declared boundary (from contract-boundary.js's resolveBoundary()).
 *
 * @returns {{ disposition: 'in_bounds'|'out_of_bounds'|'discarded',
 *             primitive_match: 'finding'|'abstain',
 *             invariants_checked: number, invariants_evaluated: false,
 *             principles_carried: string[] }}
 */
function gateCandidate(candidate, boundary) {
  if (!boundary || !boundary.primitive) {
    // §1.2 — no boundary to gate against is real information, not an
    // implicit pass. Discarded, not silently in_bounds.
    return { disposition: 'discarded', primitive_match: 'unavailable', invariants_checked: 0, invariants_evaluated: false, principles_carried: [] };
  }
  const hit = _primitiveMatch(candidate, boundary.primitive);
  return {
    disposition: hit ? 'in_bounds' : 'out_of_bounds',
    primitive_match: hit ? 'finding' : 'abstain',
    invariants_checked: (boundary.invariants || []).length,
    invariants_evaluated: false, // honest — see module header, no real adapter exists yet
    principles_carried: (boundary.principles || []).slice(),
  };
}

/**
 * gateCandidates(candidates, boundary) — runs the gate over a whole
 * stream (e.g. straight from context-synthesis.js's synthesizeContext()),
 * returns only what synthesis-contract.spec#envelope.context.matched[]
 * should hold, plus the full verdict trail for anyone auditing a
 * discard/out_of_bounds decision.
 */
function gateCandidates(candidates, boundary) {
  const matched = [];
  const trail = [];
  for (const c of candidates) {
    const verdict = gateCandidate(c, boundary);
    trail.push({ candidate: c, verdict });
    if (verdict.disposition === 'in_bounds') matched.push(c);
  }
  return { matched, trail };
}

module.exports = { gateCandidate, gateCandidates };
