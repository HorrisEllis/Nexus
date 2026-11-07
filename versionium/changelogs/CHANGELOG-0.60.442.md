# 0.60.442 — CIE7 slice a: the observer in Emerge

James, 2026-11-07: "lets continue." · on sigma, the same day: "Deltas measure gaps and sigmas measure deviation"

- **`lang/cie/observe.eg`:** Emerge's observer (`observe/*.js`: entry, delta, sigma, field, liminal, gaps, index; 471 lines of JS) written
  again in Emerge, rule for rule.
  - **Delta:** the gap in ticks since the previous entry of the same key.
  - **Sigma:** that gap's deviation from the key's own rolling baseline, read as a regime.
  - **Also ported:** the CFR field fold, the liminal boundaries, and the gap hunter with its evidence, dedup keys and tension.
- **The judge is an Emerge program, and no JavaScript was written for it.** `lang/test/world/observe.eg` runs 16 scenarios, each writing a real
  ledger: steady runs, a silent key, collapsing stress, oscillation, a velocity runaway and recovery, a hot field, crystallising refusals, the
  coherence surface, lost signals, a soft violation, a predicate closure, the hunter's own gaps, an equal-deviation tie, and everything at
  once.
  - Each scenario compares the interpreter's `observe()` builtin (the JS, the end state) with the port, in the ledger's canonical form.
  - Result: 16/16.
  - Planted mistakes are caught. Rounding to 3 places failed 14 scenarios. A reversed tie-break and an oscillation threshold moved from `>=`
    to `>` were at first not caught: the first 14 scenarios never reached oscillation or a tie. The two scenarios were added, and both plants
    now fail.
  - Run with `eg test lang/test/world/observe.eg`; it is part of `npm run test:lang`.
- **`observe()` is native.** `lower.eg` rewrites it onto the port, with `primitives.eg` and the port carried inside the compiler. A contract's
  `gate.block_at` is honoured, as the interpreter's builtin does. `examples/observe.eg` (new) gives the same output natively as interpreted.
- **`log2` built into the prelude**, in both backends (Emerge had no logarithm). It is exact on powers of two and within a few units in the
  last place elsewhere; `log2(3)` is one unit off `Math.log2`. The 16 reports are equal regardless, after rounding to 4 places.
- **Found:** Emerge's own observer already measures sigma the way he decided on 2026-11-07: a gap's deviation from its key's own rolling
  baseline. Its thresholds sit in `primitives.eg`; they are not yet learned from peaks. CF1 grows the one instrument from this port (thread
  T4).
- **Found and fixed:** the bootstrap test copied `lang/` without `observe/`, so no program calling `observe()` could run in its tree. Hidden
  until `examples/observe.eg` became the first example to call it. Three lines in the existing test; no new JS file.
- **Suites:**
  - Emerge: native 109/109 (12 examples natively), bootstrap 11/11, differential 19/19, selfhost 16/16, lang 166/166, observe 31/31,
    debug 14/14, the Emerge judge 16/16.
  - Nexus: emerge-in-nexus, pillar and substrate-spec green.
- **Next, slice b:** the debugger (`why`, `at`, `follow`, `diff`, `blame`, `clip`), judged in Emerge against `ledger_why()` and against
  readings recorded mid-run.
