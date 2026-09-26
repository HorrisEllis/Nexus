'use strict';
/**
 * lib/intent-hat-router.js — real, automatic intent -> hat switching.
 * UUID: nexus-lib-intent-hat-router-v1-0000-2026-0817-jamesbrooks-001
 *
 * §BUILT 2026-08-17 — James: "what if we have co-pilot use the agent
 * system for lifeline instead? like intent based co-pilot. like intents
 * linked to hats, that temporarily change co-pilot to the requested
 * agent instead of routing to guardian?"
 *
 * Checked first, same discipline as everything else tonight: the
 * mechanism this needed already exists, verified live, not assumed:
 *   - switch_agent + copilot/lib/self-model.js's real setCurrentAgent/
 *     getCurrentAgent — JAA-backed, governance-checked (confirmed by
 *     directly calling it: a real governance record with a real
 *     constitutional-axiom pass came back on the test call).
 *   - copilot/lifeline.js's route() ALREADY reads getCurrentAgent() and
 *     short-circuits its own ollama-first cascade the moment a real hat/
 *     agent is worn — carrying that hat's real toolScope/personaPrompt,
 *     not just which model answers (confirmed by reading the exact real
 *     block, copilot/lifeline.js:355-370).
 *   - lib/intent-classifier.js's real classify() already extracts a real
 *     verb (diagnose/build/validate/recall/analyze/... — VERB_PATTERNS,
 *     confirmed) from the prompt text, with a confidence score.
 *   - 4 real, already-forged hats (lib/hat-seed.js): the_diagnostician,
 *     the_builder, the_auditor, the_librarian — their own real
 *     personaPrompt/toolScope map almost exactly onto real classified
 *     verbs, not coincidentally (both describe the same real actions).
 *
 * What was genuinely missing, confirmed by grepping for any existing
 * verb->hat mapping (zero hits): the automatic link. This module is
 * that link — nothing above it needed rebuilding.
 *
 * "Temporarily" (James's own word) means exactly that: withIntentHat()
 * switches, dispatches, and restores the PREVIOUS agent afterward in a
 * finally block — even on error, even if the dispatch itself throws.
 * A person who was already wearing a hat for their own reasons doesn't
 * lose it because one message happened to classify as something else.
 */
const sm = require('../copilot/lib/self-model.js');
const intentClassifier = require('./intent-classifier.js');

// Real verb -> real hat, only where a real seeded hat's own purpose
// genuinely matches the verb's real meaning — not every verb gets a
// mapping, and that's honest: most verbs (query, dispatch, snapshot,
// delete, ...) aren't hat-shaped, they're just actions the currently-worn
// agent (or no hat at all) performs normally.
const VERB_TO_HAT = {
  diagnose: 'the_diagnostician',
  build: 'the_builder',
  write: 'the_builder',
  validate: 'the_auditor',
  analyze: 'the_auditor',
  recall: 'the_librarian',
};

const MIN_CONFIDENCE = 0.5; // below this, the classifier itself calls it low-confidence (§ intent-classifier's own LOW_CONFIDENCE_THRESHOLD is 0.5, reused not reinvented)

/**
 * suggestHat(prompt) — real, read-only. Classifies, checks the real
 * mapping, returns which hat (if any) a message's real verb suggests —
 * without switching anything. Useful for a caller that wants to show
 * "this looks like a build request, want to wear the_builder?" rather
 * than switch silently.
 */
function suggestHat(prompt) {
  const { intent } = intentClassifier.classify(prompt);
  const seedKey = VERB_TO_HAT[intent.verb];
  if (!seedKey || intent.confidence < MIN_CONFIDENCE) {
    return { suggested: false, verb: intent.verb, confidence: intent.confidence };
  }
  // §BUGFIX 2026-08-19 — VERB_TO_HAT's values are real seedKeys (HAT-022
  // checks exactly this: every value matches a real seed hat's seedKey),
  // but this function used to treat the value as a live hat NAME
  // directly — the same stale-on-rename bug already found and fixed in
  // getCurrentAgent() and hat-seed.js, a third real occurrence of it.
  // Resolve fresh by the permanent seedKey every time, not once at
  // table-definition time.
  const hatForge = require('./hat-forge.js');
  const hat = hatForge.bySeedKey(seedKey);
  if (!hat) return { suggested: false, verb: intent.verb, confidence: intent.confidence, seedKey, reason: `role "${seedKey}" is unfilled` };
  return { suggested: true, hatName: hat.name, hatUuid: hat.uuid, verb: intent.verb, confidence: intent.confidence };
}

/**
 * withIntentHat(prompt, fn) — the real "temporarily" mechanism. If the
 * prompt's real, confident verb maps to a real hat, AND no hat is
 * already explicitly worn (never overrides a person's own explicit
 * choice — checked getCurrentAgent().isCustom first), switches to it,
 * runs fn(), and restores the PREVIOUS agent state afterward regardless
 * of how fn() ends. Returns { result, hatUsed } so a caller can tell the
 * person which hat actually handled their request.
 */
async function withIntentHat(prompt, fn) {
  const before = sm.getCurrentAgent();
  if (before.isCustom) {
    // A person already explicitly chose an agent/hat — never silently
    // override that with an intent guess. Run as-is.
    return { result: await fn(), hatUsed: null, reason: 'explicit-agent-already-set' };
  }

  const suggestion = suggestHat(prompt);
  if (!suggestion.suggested) {
    return { result: await fn(), hatUsed: null, reason: 'no-confident-verb-mapping', verb: suggestion.verb };
  }

  const switched = sm.setCurrentAgent(suggestion.hatName);
  if (!switched.ok) {
    // Governance refused (e.g. a real constitutional/fault-history check
    // failed) — fail open to no hat, never block the actual request over
    // an automatic suggestion that governance itself declined.
    return { result: await fn(), hatUsed: null, reason: 'governance-declined', governance: switched };
  }

  try {
    const result = await fn();
    return { result, hatUsed: suggestion.hatName, verb: suggestion.verb, confidence: suggestion.confidence };
  } finally {
    // §TEMPORARILY — restored no matter what, including if fn() threw.
    sm.setCurrentAgent(before.isCustom ? before.hatName || before.agent : 'auto');
  }
}

module.exports = { suggestHat, withIntentHat, VERB_TO_HAT, MODULE_ID: 'intent-hat-router', VERSION: '0.1.0' };
