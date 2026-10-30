# 0.60.305 — crystal memory for Emerge: scan, pattern, graph, confidence, adversary, test, crystallize

James, 2026-10-30:
> "what about adding as much code as possible. like using the intelligence system to scan each ai response, each output. integrating a pattern memory into emerge. a graph for edges, nodes, functions, traversal, gaps, like the relationship between the words. then the confidence scoring, and the adversarial agent to verify it, then it crystalizes. thats how the crystal memory is meant to work. verify, test, crystalized."

## Recorded: EW_D4, his (`docs/2026-10-24-emerge-warp-system-phasemap.spec`)

| Stage | Already exists |
|---|---|
| Scan each output | Emerge's T2 results and `.t2-rejected`; `observe/` (deltas, sigma, field, gap hunt) |
| Pattern memory | `lib/pattern-leverage.js`, `intelligence/mastermind.js`, `bep_pattern`, `pattern_sequence` |
| Graph | Emerge's `kg-builder.js`, `observe/gaps.js`; `intelligence/relational-field.js` (RFR2); CIE-EG §2.5 (a word's identity apart from its uses) |
| Confidence | `lib/agent-confidence-gate.js`, `snr-filter.js`, the crystal's `success_probability` |
| Adversary | `intelligence/adversarial.js`, `lib/meta/adversary-suite.js` (six attack classes) |
| Test | Emerge's checker and tests; behaviour schemas at the hook |
| Crystallize | `schema.crystal`, the WARP crystallizer, the axiom PROOF_REQUIRED_FOR_PROMOTION. **New to Emerge**: CIE-EG has no crystal yet |

## Readings, to confirm
1. **The crystal is what makes the compound build compound.**
   - WARP reuses only an exact digest.
   - A crystal is reused wherever its pattern and conditions match, and it carries its success probability.
2. **"As much code as possible" means bringing in as much of Nexus as possible, on Emerge's own terms (CIE-EG §0):**
   - Nexus's pieces come in as modules of an Emerge spec, built in `.eg`, not copied as JavaScript.
   - The crystal and pattern shapes become Emerge registry records.

Record only. Nothing is built.
