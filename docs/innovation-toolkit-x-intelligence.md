# The Innovation Toolkit × the intelligence system — a cross-reference (2026-11-04)

James, 2026-11-04: "Look for the dot framework." · ".framework" · "cross-reference the framework with the rest of the intelligence system."

The framework is `docs/innovation-toolkit.framework` (his, 2026-10-24; read, never rewritten: IF-TOOLKIT in idearium/spec/agent-control.spec).
The intelligence system is `intelligence/` (its own system, :3753). Each row says where a part of the framework lives in code, how close the fit
is, and the test that shows it, run on 2026-11-04 on main 0.60.390. The fit is the coder's reading of his text against the code; a row
marked **partial** or **not built** is a gap, not a verdict on the framework.

Fit: **direct** = the code does what the text says · **partial** = part of it, or a different formula · **not built** = nothing does it.

## 1. What the framework says about itself ("Where this lives in Nexus"), checked

| His claim | Found | Evidence |
|---|---|---|
| liminal/interstitial space → intelligence/liminal-space | yes: the Liminal Space Organ, five interstitial spaces (L0∩L2 constitutional threshold, L1∩L3 pattern-causality membrane, L2∩L4 velocity field, …) | test-liminal-space 16/16 |
| finding/naming the gap → gap-field-engine; SL8 | yes, moved to `lib/emerge/compiler/gap-field-engine.js` (2026-10-24, RF2): invariant violations + the knowledge graph → semantic gaps, "derived, never authored" | lib/emerge/test/gap-field.test.js 27/29 (corrected 2026-11-05: the first version cited test-gap-field 18/18, which tests intelligence/gap-field.js, not this engine; the 2 failures are a stale event count and a fixture path) |
| sigmas/deltas, three gaps = invariant → sigma, CFR field, invariants | yes: `intelligence/rfr2/delta` (pure measurement, "no judgment") and `rfr2/sigma` (the judgment layer); `intelligence/baseline.js` (deviation scored by sigma → gap.found); the crystallizer's three-and-lift gate (below) | test-rfr2-cjs 31/31, baseline 50/50, intelligence F1–F5 |
| signal = alignment + fidelity + expansion → the SNR gate | **partial**: `intelligence/topo-kernel/snr.js`, eight gates (entropy, variance, consistency, fidelity, causality, pattern, implicit memory, Bayesian trust). Fidelity is there; alignment (serves the purpose) and expansion (grows understanding) are not gates | test-snr-filter 10/10 |
| hostile verification → verify-first, the proof gate, RAID TRUTH_OVER_COHERENCE | yes, and in intelligence: `adversarial.js` ("contradiction between the two = gap") | adversarial 11/11 |

## 2. The framework, part by part

| Framework | Intelligence (and where else) | Fit | Evidence |
|---|---|---|---|
| Part 2 — flow = expansion × contraction × balance | the dual cognition: `intuition.js` (fast, associative, pattern-first: expansion) and `mastermind.js` (strategic, causal: contraction); `adversarial.js` probes both | direct in shape; no "balance" measure between them | intuition-upgrade 8/8, mastermind-upgrade 7/7, adversarial 11/11 |
| Part 3 — "intuition must be regulated and grounded"; "One gap = anomaly. Two = coincidence. Three = an invariant (not a fact)" | the crystallizer (`intelligence/index.js` `_groundedCrystallise`): the count floor of three, AND a base-rate lift test, AND no known-noise type; a pair that fails is held as a **hypothesis**, never announced | direct — his "not a fact" is the hypothesis state | intelligence.test.js 15/15 (F1–F5: rare pairs beat base rate; loud pairs at chance and bursts do not) |
| Part 3 — invariants in sigmas, gaps in deltas | `rfr2/delta` (deltas, no thresholds) → `rfr2/sigma` (regimes: stable, degraded, oscillatory, collapsing) → `snapshot-trigger.js` (a snapshot at each sigma, traced to its conditions through RFR2) | direct | test-rfr2-cjs 31/31, test-p2-snapshot-sigma 7/7 |
| Part 3 — vectors (convergence, divergence, oscillation); Idea Vector = Direction × Magnitude | oscillation only: rfr2 sigma's oscillatory regime (sign flips in latency). No idea-vector model; convergence/divergence are not computed | **partial** | — |
| Part 3 — synthesis, the convergence of primitives | `intelligence/synthesis/engine.js`: normalise → chain → cluster → corroborate → centrality → leverage → plan (raw gaps in, ranked synthesized gaps out) | direct in method | test-synthesis-zoom-versionium 6/6 |
| Part 4 — tension as fuel | `intelligence/friction.js` (tension where friction and tension mean one thing), the tension channel, `gap/predicate.js` `escalateTension` from deltas | direct that tension is measured and acted on; "redirect rather than resolve" is not a policy in code | test-friction-home 6/6, test-tension-channel 5/5, test-dynamic-tension 6/6 |
| Part 5 — Signal = alignment + fidelity + expansion | SNR gate (above) | **partial**: fidelity only | test-snr-filter 10/10 |
| Part 6 — Priority = (Efficiency + Effectiveness) / Urgency; Weighting = Urgency × Importance × Fidelity × Slope | nowhere in this form. `lib/gap-priority.js` ranks gaps by tension; synthesis ranks by unblocks · corroboration · centrality · kind | **not built** (his formulas) | — |
| Section 6 — Leverage = Tension × Weight × f(Slope); f(slope) "amplifies leverage up to a threshold, then inverts; optimal slope is just below critical instability" | `friction.js`: monitor tension = friction × (1 + gaps × 0.2) × **(1 + max(0, slope) × 2)** — slope only amplifies, it never inverts | **partial — a real mismatch**: past his threshold the code still grows where his f(slope) turns down | test-friction-home 6/6 (tests the formula as written, not his inversion) |
| Part 7 — interstitial reasoning (spatial void, shadow space, contrast, alchemy, comparative differentials, negative space) | `intelligence/liminal/` — twelve detectors: negativeSpace, shadow, contrastive, oscillatory, reversal, assumption, structural, relational, existential, field, code, music; `liminal-space/` the interstitial organ; `bda/gaps.js` names gaps in text | direct — the detectors carry his names | test-liminal-space 16/16 |
| Section 3 — "probabilistic on top of deterministic = a constraint field … the boundary of the constraint field = the signal" | `gap-field-engine.js` (invariant violations → gaps); `cfr/field.js` (a continuous field: coherence, friction, …) | direct in idea | lib/emerge/test/gap-field.test.js 27/29 (corrected 2026-11-05, as above) |
| Vectors are yarn; memory integrated across referential, episodic, intuitive, experiential | `intelligence/lattice/associative-lattice.js`, `alk/` (every decision recorded), `alk-perception/` (parallel streams → composite states) | partial: associative memory exists; tracing "yarn" between nodes for leverage is not a query | associative-lattice 7/7 |
| Section 10 — hostile verification ("before integrating anything, attack it") | `adversarial.js`; the crystallizer's hypothesis state (nothing is announced until it beats chance) | direct | adversarial 11/11, intelligence F2/F3 |
| Section 17 — failure-mode detection; "document nodes, gaps, delta vectors" | `baseline.js` (failure-mode ledger), `causal/anomaly.js` (expectation mismatches), `intelligence-causal` (RFR2 conditions) | direct | baseline 50/50, test-intelligence-causal 8/8 |
| Section 16 — iterate & integrate; "new data changes the invariants" | the crystallizer's latch and lift are re-measured each scan; snapshots on sigma for revert | direct | intelligence F5, test-p2-snapshot-sigma 7/7 |
| Section 0 — "Is this even a framework problem?" | nothing in intelligence asks it before a loop | **not built** | — |
| Section 11 — somatic validation | a human gate by its nature ("check the body"): no code can do it; the nearest is that the system holds an unproven pattern as a hypothesis for him | not applicable to code — said, not faked | — |

## 3. What the cross-reference finds (the coder's reading, for him to judge)

1. **The strongest proof is Part 3.** "Three = an invariant (not a fact)" and "intuition must be regulated and grounded" are code with a test that
   shows what they catch: intelligence F2/F3 refuse to call a loud coincidence or a burst an invariant, which a count-only rule (three times = a
   pattern) would have announced. That is the framework doing measurable work.
2. **One real mismatch: f(slope).** His leverage turns down past a threshold ("the steepest wave you can still ride"); `friction.js` keeps
   amplifying. Fixing it means choosing the threshold, which is his.
3. **Three parts with no code:** his Priority and Weighting formulas (Part 6), Section 0's "is this a framework problem" gate, and the idea vectors
   (convergence and divergence). Signal's alignment and expansion are missing from the SNR gate.
4. **Somatic validation stays his.** The system cannot feel; it can only refuse to settle what is unproven, which it already does.

None of this changes code. Building any of points 2–3 is a phase, mapped first, and the threshold and formulas are his to set.
