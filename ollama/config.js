'use strict';
/**
 * ollama/config.js — real, distinct config, not inline constants scattered
 * across ollama/server.js and every other file that independently hardcodes
 * a model tag. Matches the shape already established by
 * intelligence/config.js — same pattern, same reasoning: a real, single
 * file a person can open and change, not a value to grep for across a
 * dozen files and hope none were missed.
 *
 * §HISTORY worth keeping visible, not just in a commit message: on
 * 2026-07-04 this bridge's own model constants were wrong (requesting a
 * tag that was never pulled), and the real fix required FIVE separate
 * files to independently agree on the correct one — because there was no
 * single place to fix. On 2026-08-23, changing the model again meant
 * re-discovering that same list by hand. This file exists so the next
 * change is one line, in one place, not an archaeology exercise.
 *
 * Every real value below is env-overridable, matching the convention
 * already used throughout this codebase (INTELLIGENCE_PORT,
 * OLLAMA_MAX_CONCURRENT, etc.) — a person can override any single setting
 * for one run without editing this file, or change the real default here
 * for good.
 */
const path = require('path');

module.exports = {
  // ── Network ────────────────────────────────────────────────────────────
  PORT: parseInt(process.env.OLLAMA_BRIDGE_PORT || '3749', 10),
  OLLAMA_HOST: (() => {
    const raw = process.env.OLLAMA_HOST || '127.0.0.1:11434';
    return raw.startsWith('http') ? raw : `http://${raw}`;
  })(),
  ORCH_URL: process.env.ORCHESTRATOR_URL || 'http://127.0.0.1:9000',
  CX_URL:   process.env.CORTEX_URL || 'http://127.0.0.1:3748',

  // ── Storage ────────────────────────────────────────────────────────────
  DATA_DIR: path.join(__dirname, '..', 'data', 'ollama'),

  // ── Models — the one real place this codebase's model tags live ──────────
  // James, 2026-08-23: "now using huihui_ai/qwen2.5-coder-abliterate:3b for
  // ollama/co-pilot." Real tag, verified against ollama.com before it was
  // ever written down (1.9GB, Q4_K_M, real arch qwen2).
  DEFAULT_MODEL:  process.env.OLLAMA_DEFAULT_MODEL  || 'huihui_ai/qwen2.5-coder-abliterate:3b',
  // §FIX 2026-09-03 — James, from a real screenshot of his own Ollama
  // model list: "no mistral." FALLBACK_MODEL was never updated in the
  // 2026-08-23 change above — DEFAULT_MODEL got the real, actually-pulled
  // model; this one was left at the old 'mistral:7b-instruct-q4_K_M',
  // which does not exist in his real install at all (confirmed directly
  // against the screenshot: glm-5.3(:cloud), deepseek-v4-flash:cloud,
  // gemma4:31b-cloud/26b, huihui_ai/qwen2.5-coder-abliterate,
  // huihui_ai/qwen3-abliterated — no mistral anywhere in the list).
  // Real fallback needs to be a DIFFERENT real, locally-runnable model
  // than DEFAULT_MODEL (a fallback that's identical to the primary isn't
  // a real fallback) — huihui_ai/qwen3-abliterated is the other real,
  // non-cloud model actually present in his install.
  // §UPDATED 2026-09-08 — James confirmed the new models are done
  // downloading. Real mapping, not arbitrary: idearium/agent-suite/
  // index.js's generateWithOllama() defaults to THIS constant
  // (FALLBACK_MODEL, not DEFAULT_MODEL — checked directly), and
  // idearium's real use case (async spec-chunk writing) is exactly
  // where the earlier real tradeoff discussion favored the 7B —
  // "handling multi-file reasoning and refactoring far better than 3B
  // models" matters more than latency for a one-shot chunk write.
  // DEFAULT_MODEL stays the 3B — copilot/lifeline.js's own real,
  // historical bugfix comment confirms copilot defers to THIS constant
  // (never hardcodes a model), and copilot's interactive tool loop is
  // where the earlier latency tradeoff favored staying fast.
  FALLBACK_MODEL: process.env.OLLAMA_FALLBACK_MODEL || 'huihui_ai/qwen2.5-coder-abliterate:7b',

  // ── Concurrency ────────────────────────────────────────────────────────
  // 1 is the honest default for a single-GPU/single-box install: it
  // serialises rather than thrashing, and the real queue already absorbs
  // the wait. The number was never measured, it was assumed — raise it
  // deliberately once there's real headroom to raise it INTO.
  MAX_CONCURRENT: parseInt(process.env.OLLAMA_MAX_CONCURRENT || '1', 10),

  // ── Timeouts — every real magic number that was living inline in
  // ollama/server.js, now with a name and an env override ─────────────────
  CHAT_TOOLS_TIMEOUT_MS:   parseInt(process.env.OLLAMA_CHAT_TOOLS_TIMEOUT_MS   || '60000', 10),
  RAW_GENERATE_TIMEOUT_MS: parseInt(process.env.OLLAMA_RAW_GENERATE_TIMEOUT_MS || '45000', 10),
  DEFAULT_JOB_TIMEOUT_MS:  parseInt(process.env.OLLAMA_JOB_TIMEOUT_MS         || '45000', 10),
  HEALTH_CHECK_TIMEOUT_MS: parseInt(process.env.OLLAMA_HEALTH_TIMEOUT_MS      || '3000', 10),
  DEFAULT_MAX_TOKENS:      parseInt(process.env.OLLAMA_DEFAULT_MAX_TOKENS     || '4096', 10),   // §0.39.289 was 2048: a file longer than ~2k tokens was cut every time; past this, the reply is continued
  // §0.39.289 — RAW_GENERATE_TIMEOUT_MS is now an IDLE timeout (no token for that long); this caps the whole generation
  RAW_GENERATE_TOTAL_MS:   parseInt(process.env.OLLAMA_RAW_GENERATE_TOTAL_MS  || '600000', 10),
  CONTINUE_MAX_ROUNDS:     parseInt(process.env.OLLAMA_CONTINUE_MAX_ROUNDS    || '3', 10),

  // ── Identity (not tunable — real, fixed values, kept here so a reader
  // checking "what does this bridge think it is" has one place to look,
  // not two) ─────────────────────────────────────────────────────────────
  SYSTEM_ID: 'ollama',
  VERSION:   '1.0.0',
};
