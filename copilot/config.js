'use strict';
/**
 * copilot/config.js — real, distinct config, not inline constants
 * scattered across copilot/server.js. Matches the pattern established
 * by guardian/config.js, intelligence/config.js, and ollama/config.js
 * earlier this session — same shape, same reasoning: a single, real
 * file to change, not a value to grep for across 2400+ lines.
 *
 * §SCOPE — this captures the real, top-level constants copilot/server.js
 * had (checked directly, not guessed): PORT, MAX_STREAM, the recall-
 * context threshold/top-K pair, the correction-detection regex, and
 * session staleness. SYSTEM_ID and VERSION were deliberately left in
 * server.js itself — VERSION is sourced from lib/version.js's real
 * registry (§BUGFIX 2026-07-04, already centralized, not duplicated
 * here), and SYSTEM_ID is a fixed identity string, not a tunable
 * config value. SPOTLIGHT_TARGETS (the list of systems copilot polls)
 * was also left in place — it's a real, structural list of system
 * names, not a numeric/string tunable in the same sense as the rest.
 */

module.exports = {
  // ── Network ────────────────────────────────────────────────────────────
  PORT: parseInt(process.env.COPILOT_PORT || '3750', 10),

  // ── Continuous stream — "the co-pilot's consciousness" (real, original
  // comment preserved — the intent behind the cap matters) ────────────────
  MAX_STREAM: parseInt(process.env.COPILOT_MAX_STREAM || '500', 10),

  // ── Recall-context relevance gate — a score threshold, not a fixed
  // top-K alone: an irrelevant result with a low score is worse than no
  // result at all; injecting it would poison the prompt (original real
  // reasoning preserved from the source) ───────────────────────────────
  RECALL_CONTEXT_SCORE_THRESHOLD: parseFloat(process.env.COPILOT_RECALL_SCORE_THRESHOLD || '0.3'),
  RECALL_CONTEXT_TOP_K: parseInt(process.env.COPILOT_RECALL_TOP_K || '3', 10),

  // ── Correction-detection regex — real, used to detect when the person
  // is correcting a prior answer, not a tunable number but still a real,
  // single-source value worth centralizing rather than inlining ─────────
  CORRECTION_RE: /\b(no,|not what|that'?s wrong|incorrect|actually,|i said|try again|retry|redo that)\b/i,

  // ── Session staleness — an abandoned/orphaned session sits in memory
  // no longer than this before being swept (real, original reasoning
  // preserved) ─────────────────────────────────────────────────────────
  SESSION_STALE_MS: parseInt(process.env.COPILOT_SESSION_STALE_MS || String(30 * 60 * 1000), 10),

  // ── Default provider — James: "copilot is the middle option for
  // whatever is enabled in the programmable configuration file." The
  // real, explicit, changeable-in-one-place value the TV UI's
  // 3-position toggle (ollama | copilot | guardian) resolves to when
  // its middle "copilot" option is selected — not the same as sending
  // no provider at all (which already meant "let lifeline auto-decide,
  // ollama first"), a real, named config value someone can point at
  // 'auto', a specific real agent, or 'ollama' without touching any
  // route-handling code.
  DEFAULT_PROVIDER: process.env.COPILOT_DEFAULT_PROVIDER || 'auto',
};
