'use strict';
/**
 * copilot/lib/lifeline-contracts.js — what lifeline is asking, and what a
 * valid answer looks like
 * UUID: nexus-lifeline-contracts-v1-0000-2026-0812-001
 *
 * James: "each time it uses lifeline it needs to know what it's asking and
 * how to receive it... probably a contract or schema, right? a way to
 * interact with each agent?"
 *
 * §THE REAL GAP, checked before building — copilot/lifeline.js's route()
 * already passes an `intent` through to every provider call (opts.intent,
 * default 'ask'), but nothing on the way BACK checks the response against
 * what that intent actually needs. Confidence is estimated post-hoc from
 * heuristics on the raw text (_estimateConfidence) — a guess about quality,
 * not a check against a declared expectation. Worse: a genuine provider
 * failure (_tryOllama's `status.job.status === 'failed'` path) returns null
 * and silently falls through to Guardian — no gap-field report, ever.
 *
 * §NOT lib/gemini-toolbox/agent-contracts.js — checked that file first
 * (it's real, working, well-designed) but it's a DIFFERENT axis: role-based
 * scoping WITHIN gemini (code-architect vs refactorer vs test-writer, each
 * with a restricted toolbox to prevent hallucination in code generation).
 * This is PROVIDER-level: what does a valid answer to THIS kind of request
 * look like, regardless of which agent answered it. Complementary, not
 * competing — different question, same "distinct contract to prevent drift"
 * philosophy.
 *
 * §REAL VOCABULARY, not invented — the intent tags used are exactly the ones
 * already passed as opts.intent across copilot's own code (ask, build,
 * action, navigate, note, diagnose, status, general, greeting, lookup).
 * An unrecognized intent gets the loosest validator (non-empty text), never
 * treated as automatically invalid — §1.1, don't manufacture a failure out
 * of not knowing the shape yet.
 */

const CONTRACTS = Object.freeze({
  ask:      { expects: 'freeform prose answering the question', validate: (t) => _nonEmpty(t) },
  general:  { expects: 'freeform prose', validate: (t) => _nonEmpty(t) },
  greeting: { expects: 'a short conversational reply', validate: (t) => _nonEmpty(t) },
  build:    { expects: 'code or a structured build description (code fence, or file/step references)', validate: (t) => _hasAny(t, [/```/, /\bfunction\b/, /\bconst\b/, /\bclass\b/, /\.(js|py|ts|json)\b/]) },
  action:   { expects: 'a clear statement of what action will be taken (or was taken)', validate: (t) => _nonEmpty(t) },
  navigate: { expects: 'a location, path, or route reference', validate: (t) => _hasAny(t, [/\//, /\bat\b/, /\bto\b/, /:\d+/]) },
  note:     { expects: 'freeform prose to be recorded', validate: (t) => _nonEmpty(t) },
  diagnose: { expects: 'a finding — what is wrong, or a statement that nothing is', validate: (t) => _hasAny(t, [/\b(is|are|found|no|none|clean|broken|failing|working)\b/i]) },
  status:   { expects: 'a state description (up/down/percentage/count/summary)', validate: (t) => _hasAny(t, [/\b(up|down|ok|online|offline|running|stopped)\b/i, /\d/]) },
  lookup:   { expects: 'the requested fact or a clear "not found"', validate: (t) => _nonEmpty(t) },
  yes_no:   { expects: 'a yes/no or true/false answer', validate: (t) => _hasAny(t, [/\b(yes|no|true|false|correct|incorrect)\b/i]) },
  json:     { expects: 'valid JSON', validate: (t) => _isJson(t) },
});

function _nonEmpty(t) { const ok = !!t && t.trim().length > 0; return { valid: ok, reason: ok ? null : 'empty response' }; }
function _hasAny(t, patterns) { const s = t || ''; const ok = patterns.some(re => re.test(s)); return { valid: ok, reason: ok ? null : `response doesn't match the expected shape for this intent` }; }
function _isJson(t) {
  try { JSON.parse((t || '').match(/\{[\s\S]*\}|\[[\s\S]*\]/)?.[0] || t); return { valid: true, reason: null }; }
  catch (e) { return { valid: false, reason: `not valid JSON: ${e.message}` }; }
}

/** getContract(intent) — the contract for a known intent, or the loosest fallback for an unknown one. */
function getContract(intent) {
  return CONTRACTS[intent] || { expects: `unrecognized intent "${intent}" — falling back to non-empty check, not treated as automatically invalid`, validate: _nonEmpty };
}

/**
 * validateResponse(intent, text, meta) — check a real response against its
 * contract. On failure, reports a real gap (James: "log every failure mode
 * to cortex") — this is the wire that closes the silent-null gap in
 * _tryOllama's failure path AND the "nothing checks the answer" gap in
 * route().
 */
function validateResponse(intent, text, meta = {}) {
  const contract = getContract(intent);
  const result = contract.validate(text || '');
  if (!result.valid) {
    try {
      const gapField = meta.gapField || require('../../lib/gap-field');
      gapField.report({
        type: 'lifeline.contract-violation',
        body: `intent "${intent}" expected ${contract.expects} — got: "${(text || '').slice(0, 120)}" (${result.reason})`,
        source: meta.provider || 'lifeline',
        domain: 'system', severity: 'medium',
        meta: { intent, provider: meta.provider, requestId: meta.requestId, reason: result.reason },
      });
    } catch (_) {}
  }
  return { ...result, expects: contract.expects, intent };
}

module.exports = { CONTRACTS, getContract, validateResponse, MODULE_ID: 'lifeline-contracts', VERSION: '1.0.0' };
