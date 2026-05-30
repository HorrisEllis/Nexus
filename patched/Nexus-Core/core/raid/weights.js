// ═══════════════════════════════════════════════════
// NEXUS — RAID Weights
// core/raid/weights.js
//
// Initial weights — overwritten by learner over time.
// Law I: ollama always has costTier: 0 (free, local).
// ═══════════════════════════════════════════════════

'use strict';

const weights = {
  agents: {
    ollama: {
      baseCapability: 0.85,
      costTier:       0.0,    // free, local — Law I
      taskAffinities: {
        orchestration: 0.95, manifest_gen: 0.95,
        code:          0.90, schema_gen:   0.95,
        test_gen:      0.88, quick_fix:    0.95,
        review:        0.82, large_file:   0.70,
        adversarial:   0.55,
      },
    },
    chatgpt: {
      baseCapability: 0.82,
      costTier:       0.6,
      taskAffinities: {
        code:          0.88, quick_fix:    0.90,
        review:        0.80, test_gen:     0.78,
        schema_gen:    0.72, large_file:   0.65,
        adversarial:   0.70, orchestration:0.40,
      },
    },
    claude: {
      baseCapability: 0.88,
      costTier:       0.8,
      taskAffinities: {
        large_file:    0.95, review:       0.94,
        reasoning:     0.92, code:         0.84,
        schema_gen:    0.80, test_gen:     0.76,
        adversarial:   0.76, quick_fix:    0.72,
      },
    },
    gemini: {
      baseCapability: 0.72,
      costTier:       0.5,
      taskAffinities: {
        adversarial:   0.95, test_gen:     0.85,
        code:          0.70, review:       0.65,
        schema_gen:    0.68, large_file:   0.58,
        quick_fix:     0.68, orchestration:0.35,
      },
    },
  },
};

module.exports = { weights };
