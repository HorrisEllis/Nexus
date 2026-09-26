'use strict';
/**
 * ollama/abliterated-catalog.js — real, categorized index of abliterated
 * (uncensored) Ollama models, filtered to what actually fits real,
 * measured hardware, not a wish list.
 *
 * James's real machine, from his own Task Manager screenshots, 2026-08-23:
 *   GPU:  NVIDIA GeForce GTX 1650 — 4.0 GB dedicated VRAM, 8.0 GB shared
 *   CPU:  AMD Ryzen 7 3700X, 8-core / 16-thread
 *   RAM:  15.9 GB total, ~48% used at idle (~8 GB free)
 *
 * §HONEST SIZING — not a spec sheet copy. Ollama loads a model fully
 * resident in VRAM when it fits; past that, it offloads layers to system
 * RAM, which works but is genuinely slower per token — sometimes 5-10x.
 * TIER below is about what's REALISTIC to run, not what will merely load
 * without crashing:
 *
 *   TIER 1 'fast'    — fits fully in the real 4GB dedicated VRAM at Q4.
 *                       Full GPU speed. ≤ ~3B params, ~2.5GB file or less.
 *   TIER 2 'workable'— spills into shared GPU memory / light CPU offload.
 *                       Noticeably slower than TIER 1 but usable
 *                       interactively. ~4-5B params, ~3-4GB file.
 *   TIER 3 'slow'    — meaningful CPU offload against the real ~8GB free
 *                       system RAM. Workable for non-interactive/batch
 *                       use, a real wait for interactive chat. ~7-9B
 *                       params, ~4.5-6GB file.
 *
 * Anything past TIER 3 (14B+) is NOT listed here — not because it
 * doesn't exist (huihui_ai publishes up to 754B), but because it
 * genuinely will not run acceptably on this real hardware. §1.2 — an
 * honest "doesn't fit" beats a technically-loadable model that thrashes
 * the one real machine this runs on.
 *
 * Every tag below was checked against a real, live ollama.com listing
 * before being written here (2026-08-23) — not guessed from a naming
 * convention. Sizes are the real, reported GGUF file size, not a
 * parameter-count estimate.
 */

const CATALOG = [
  // ── CODING ────────────────────────────────────────────────────────────
  {
    id: 'huihui_ai/qwen2.5-coder-abliterate:0.5b',
    category: 'coding', tier: 1, sizeGB: 0.5, params: '0.5B',
    desc: 'Smallest real coding model in this catalog. Fast completion, limited reasoning depth.',
  },
  {
    id: 'huihui_ai/qwen2.5-coder-abliterate:1.5b',
    category: 'coding', tier: 1, sizeGB: 1.1, params: '1.5B',
    desc: 'Real, fast inline-completion model — same family as the config default at 3b.',
  },
  {
    id: 'huihui_ai/qwen2.5-coder-abliterate:3b',
    category: 'coding', tier: 1, sizeGB: 1.9, params: '3B',
    desc: 'ollama/config.js\'s own real DEFAULT_MODEL as of 2026-08-23 — co-pilot\'s actual dispatch target.',
  },
  {
    id: 'huihui_ai/qwen2.5-coder-abliterate:7b',
    category: 'coding', tier: 3, sizeGB: 4.7, params: '7B',
    desc: 'Real step up in code-gen quality over the 3b — meaningful CPU offload on this hardware, slow for interactive use.',
  },

  // ── GENERAL CHAT / REASONING ─────────────────────────────────────────
  {
    id: 'huihui_ai/qwen3-abliterated:0.6b',
    category: 'chat', tier: 1, sizeGB: 0.5, params: '0.6B',
    desc: 'Smallest Qwen3 abliterated build — thinking-capable, very fast, limited depth.',
  },
  {
    id: 'huihui_ai/qwen3-abliterated:1.7b',
    category: 'chat', tier: 1, sizeGB: 1.3, params: '1.7B',
    desc: 'Real, thinking-capable general chat model, comfortably GPU-resident.',
  },
  {
    id: 'huihui_ai/qwen3-abliterated:4b',
    category: 'chat', tier: 2, sizeGB: 3.0, params: '4B',
    desc: 'Best real balance in this catalog for general reasoning + chat on this hardware.',
  },
  {
    id: 'huihui_ai/qwen3-abliterated:8b',
    category: 'chat', tier: 3, sizeGB: 5.2, params: '8B',
    desc: 'Real, noticeably stronger reasoning — slow on this hardware, workable for non-interactive use.',
  },
  {
    id: 'huihui_ai/smallthinker-abliterated:3b',
    category: 'reasoning', tier: 1, sizeGB: 1.9, params: '3B',
    desc: 'Real, reasoning-focused small model (PowerInfer SmallThinker base) — fits fully in dedicated VRAM.',
  },
  {
    id: 'huihui_ai/llama3.2-abliterate:1b',
    category: 'chat', tier: 1, sizeGB: 0.955, params: '1B',
    desc: 'Real, very fast, small general-purpose chat model. Least capable, most responsive.',
  },
  {
    id: 'huihui_ai/llama3.2-abliterate:3b',
    category: 'chat', tier: 1, sizeGB: 2.2, params: '3B',
    desc: 'Real, solid general-purpose chat model, fully GPU-resident.',
  },

  // ── VISION (text + image) ────────────────────────────────────────────
  {
    id: 'huihui_ai/qwen3-vl-abliterated:2b',
    category: 'vision', tier: 1, sizeGB: 1.9, params: '2B',
    desc: 'Real, small vision+text model — image description/analysis without refusals, GPU-resident.',
  },
  {
    id: 'huihui_ai/qwen3-vl-abliterated:4b',
    category: 'vision', tier: 2, sizeGB: 3.3, params: '4B',
    desc: 'Real, stronger vision+text — meaningful quality step up from the 2b, still workable.',
  },

  // ── MULTILINGUAL ──────────────────────────────────────────────────────
  {
    id: 'huihui_ai/aya-expanse-abliterated',
    category: 'multilingual', tier: 3, sizeGB: 4.9, params: '8B',
    desc: 'Real, Cohere Aya Expanse base — broad real-world language coverage. Slow on this hardware.',
  },

  // ── SPECIALIZED ───────────────────────────────────────────────────────
  {
    id: 'huihui_ai/foundation-sec-8b-abliterated',
    category: 'security', tier: 3, sizeGB: 4.9, params: '8B',
    desc: 'Real, purpose-built cybersecurity foundation model (fdtn-ai/Foundation-Sec-8B base), abliterated. Genuinely relevant to a system doing real gap/vulnerability analysis on itself — slow on this hardware but a real, distinct capability nothing else in this catalog has.',
  },
  {
    id: 'huihui_ai/huihui-moe-abliterated:5b',
    category: 'chat', tier: 2, sizeGB: 3.4, params: '5B (MoE)',
    desc: 'Real Mixture-of-Experts build — fewer active params per token than a dense 5B, worth trying if the dense 4b tier feels thin.',
  },

  // ── COMPACT UTILITY ──────────────────────────────────────────────────────
  {
    id: 'mistral:7b-instruct-q4_K_M',
    category: 'chat', tier: 3, sizeGB: 4.4, params: '7B',
    // §FIX 2026-09-03 — James, from a real screenshot of his own Ollama
    // model list: "no mistral." This entry's own description used to claim
    // it "is the real, existing FALLBACK_MODEL in ollama/config.js" — that
    // was true when written, and is now false: FALLBACK_MODEL was changed
    // to huihui_ai/qwen3-abliterated (the real, other locally-runnable
    // model actually present in his install) because this exact tag does
    // not exist on his real hardware at all. Kept in the catalog for
    // historical/comparison record, not deleted — but no longer described
    // as "the real fallback," which would now be a stale, false claim.
    desc: 'NOT abliterated. Was ollama/config.js\'s real FALLBACK_MODEL until 2026-09-03 — confirmed absent from James\'s real install (screenshot showed no mistral anywhere in his pulled models) and replaced there with huihui_ai/qwen3-abliterated. Left here only as a historical/comparison entry, not a claim that it is present or in use.',
  },
];

/** byCategory(cat) — real, filtered list, sorted fastest-tier first. */
function byCategory(cat) {
  return CATALOG.filter(m => m.category === cat).sort((a, b) => a.tier - b.tier);
}

/** byTier(maxTier) — everything at or below a real, honest tier ceiling. */
function byTier(maxTier) {
  return CATALOG.filter(m => m.tier <= maxTier);
}

const CATEGORIES = [...new Set(CATALOG.map(m => m.category))];

module.exports = { CATALOG, byCategory, byTier, CATEGORIES };
