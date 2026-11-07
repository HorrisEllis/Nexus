# Evidence matrix — his framework, Emerge, Nexus

James, 2026-11-07: "i need a evidence matrix. merge with main". Before that, 2026-11-07: "no point in claiming without grounding in actual
evidence." · 2026-11-06: "Log all evidence with timestamps. Quotes. Dates. What came from it".

Each row is one claim. The columns give his words with their date, the evidence and its number, the status, and the command a stranger runs to
check it. The narrative behind each row is in `docs/PROOF-OF-COMPETENCY.md` (the date in the row names the entry). Measured runs are in
`docs/BENCHMARKS.md`, the idea-to-proof threads in `docs/FRAMEWORK-THREADS.md`, and the counts of the whole project in `docs/PROOF-INDEX.md`.

**Re-run on 2026-11-07 at 14:31Z, on main at `49706af7`.** Every "now" count below came from that run. Older counts are as recorded, with
their date.

**Status:**

| Status | Means |
|---|---|
| **Proven** | A check a stranger can run, with its count; it passes today. |
| **Signal** | A real run, but small (one model, few trials) or with no control; it points somewhere, it does not settle it. |
| **Not yet** | Specced or mapped, not measured. A claim, kept apart from proof. |
| **Against** | Evidence that cuts against the claim. Kept, because it is data (TRUTH_OVER_COHERENCE). |

## 1. His framework (`docs/innovation-toolkit.framework`, and his words since)

| # | Claim | His words (date) | Evidence | Status | Check |
|---|---|---|---|---|---|
| F1 | The end state first: the contract is the end state | "contract is the end state." (2026-11-06) | 13 slices of Emerge's native work (0.60.426–0.60.440) each fixed their end state first. 29 failed runs: 24 technical, 5 semantic, and all 5 semantic ones were caught by the end state before merge. 8 of 13 matched on their first runnable build. The checker's port matched 211 programs and 118 diagnostics on its first full run. | **Proven** (no control run: the escape rate without it is unknown) | `node emerge/emerge/lang/test/native.test.js`: now 109/109 |
| F2 | Reverse end-state reasoning, both directions | "Each problem needs to build a dag using reverse end state reasoning." · "Yes the same way I reason. Bidirectional causal changing." (2026-10-29) | IF-05 refuses a change that forward-only planning would have turned into a contract. | **Proven** | `node tests/modules/test-intent-flow.test.js`: now 5/5 |
| F3 | Small pieces with gates let a small model do what it cannot do whole | "everything can be broken down into smaller pieces, with gates between." (2026-10-13) · "proof of concept for the framework." (2026-10-31) | The UTF-8 decoder: the whole at once 0/3; unit by unit, 13/16 units passed, and the one-rule units 12/12, mostly on the first try. | **Signal** (one model, three trials) | `bench/chunks.js` with `bench/chunks/utf8_decode/chunks.spec` (Emerge repo); needs a local model |
| F4 | "Three = an invariant (not a fact)" | "One gap = anomaly. Two = coincidence. Three = an invariant (not a fact)." (framework, Part 3; tested 2026-11-04) | F2 and F3 refuse what a count-only rule of three would crystallise; F1 still lets a real pattern through. | **Proven** | `node tests/modules/intelligence.test.js`: now 15/15 |
| F4− | His slope rule and formulas | f(slope) "amplifies leverage up to a threshold, then inverts" (framework) | `intelligence/friction.js` only amplifies. The Priority and Weighting formulas, Section 0's gate and the idea vectors have no code. | **Against / untested** | `docs/innovation-toolkit-x-intelligence.md` |
| F5 | Deterministic first, probabilistic built off it | "Deterministic building from there. Probabilistic variables off of deterministic." (2026-11-05) | genesis is the template (7/7). Agent verbs are parsed and routed with no model call, and near-misses refused (AD-04). | **Proven where built** | `node tests/modules/test-genesis-and-architecture-spec.test.js`: now 7/7 · `node tests/modules/test-cg-agent-doors.test.js`: now 7/7 |
| F5− | The systems build from genesis | (the same) | Six systems have no server.js. Guardian has 35 loose root files against his example's 3. Genesis 1.6.0 is mapped, not applied. | **Against / not yet** | `docs/PROOF-OF-COMPETENCY.md` 2026-11-05 |
| F6 | The framework locates real defects | "look at raid and the signal to noise section of the framework…" (2026-10-24) | The crystallizer's threshold flaw was found through the framework and fixed (his "b, tighten the crystallizer threshold"). | **Proven** (see the entry) | `docs/PROOF-OF-COMPETENCY.md` 2026-10-24, "The crystallizer gate" |
| F7 | A constraint field, shaped by invariants, generates code | "im saying to generate code. using primitives or invariants to define the shape of the field…" (2026-11-06 10:23Z) | `field.spec` compiles at full depth. The field itself is not built (RF1, CF1, CB1 open). Known in computer science as constraint propagation plus program synthesis; his words are dated before the coder named it. | **Not yet** | `node tests/modules/test-substrate-spec.test.js`: now 3/3 (the spec only) |
| F8 | RAID runs his framework (contract = end state, DAG = conditions, compartment), with fewer tokens and better code | "im saying raid does my framework. end state first compartment. dag is the conditions. contract is the end state." (2026-11-06 17:18Z) · "how much does that save. also it would empiracally validate it." (17:23Z) | Mapped: `docs/2026-11-06-agents-build-in-his-framework-phasemap.spec`. No saving measured. The test that decides it: the same tasks, plain against framework, on three codebases (an expansion of PIL6). | **Not yet** | none until the benchmark runs |
| F9 | One door: the registry is the bus, the contract and the bridge | "The drawbridge is the the component registry, which is also the event bus, and interaction contract and bridge into the compartment." (2026-11-03) | Census: 4,772 lines describe one set of components three ways (11 registries, 13 contracts, 8 taxonomies), run by ten central files. That proves the duplication he named. The merge is in progress. | **Proven (the problem)** · **Not yet (the merged door)** | `docs/PROOF-OF-COMPETENCY.md` 2026-11-03 and 2026-11-07, "One idea since July" |

## 2. Emerge (his language: `emerge/emerge`, `cie-eg.spec`)

| # | Claim | His words (date) | Evidence | Status | Check |
|---|---|---|---|---|---|
| E1 | Emerge compiles itself, with no Node | "Emerge is complete invented using cie-eg" (2026-11-06) | Stages 0, 1 and 2 are byte-identical. | **Proven** | `node emerge/emerge/lang/test/selfhost.test.js`: now 16/16 |
| E2 | The end state is one contract block | "New contract block" (D7, 2026-11-06 05:57Z) | The contract's hash is in the genesis entry and every checkpoint. The gate's limits come from the contract (CT-02 stops at 3, not 100,000). The `.eg` and scaffold implementations agree byte for byte (CT-08). | **Proven** | `node emerge/emerge/lang/test/contract.test.js`: now 8/8 |
| E3 | No invented crypto: SHA-256 from the CPU or the OS | CIE-004 (his) · "Remove the last of the JavaScript" (2026-11-06 16:48Z) | Natively: FIPS 180-4's five vectors (the million a's among them) and 14 padding boundaries, equal to Node's own SHA-256. | **Proven** | `native.test.js` case `sha256` (in 109/109) |
| E3− | It runs on every CPU | (the same) | The refusal on a CPU without SHA-NI is untested (this CPU has it). Intel desktop CPUs before Ice Lake / Rocket Lake are refused until the OS source (CIE12). | **Against / open** | — |
| E4 | The ledger in Emerge is the same as the JavaScript one | "emerge, first" (2026-11-06 17:09Z) | Natively: `ledger.test`'s independent known answers (from a separate Python implementation); a real run's 24 entries re-verified; a forged entry caught at seq 3. | **Proven** | `native.test.js` case `ledger` · `node emerge/emerge/lang/test/ledger.test.js`: now 21/21 |
| E5 | The world runs in Emerge, hash for hash with the interpreter | "the moment js is removed from emerge it becomes the replacement." (2026-11-06) | Components, hooks, wires, the contract, compartments, lenses, test blocks, whatif, axioms, kinds, templates and spawn natively, from 0.60.426 to 0.60.437. | **Proven** | `native.test.js`: now 109/109 · `docs/BENCHMARKS.md` 2026-11-06 rows |
| E6 | Emerge checks its own code | "no more js, we focus on .eg" (2026-11-06) | The checker in Emerge: 211 programs, every diagnostic equal (0.60.440). It checks its own code when it compiles (0.60.441). | **Proven** | `docs/BENCHMARKS.md` 2026-11-07 (CIE6 a and b) |
| E7 | The observer in Emerge | "Okay so don’t create js unless you have to and that’s only to replace it." (2026-11-07) | 16/16 scenarios equal to the JavaScript `observe()`, natively too (0.60.442). | **Proven** | `emerge/emerge/lang/test/world/observe.eg` · `docs/BENCHMARKS.md` 2026-11-07 |
| E8 | Native is faster | — | The compiler runs 18 times faster natively than interpreted (0.60.430). | **Proven (one machine)** | `docs/BENCHMARKS.md` 2026-11-06 (CIE14 a) |
| E9 | His words in, code out, no AI | "To make coding easy for me using my own language. Ai is additive." (2026-10-31) | `eg say` writes the same bytes from the same sentence; a lever in the node file changes the program with no code change. | **Proven** | `node emerge/emerge/lang/test/say.test.js`: 16/16 |
| E10 | Emerge with no JavaScript | "Remove the last of the JavaScript" (2026-11-06) | By the tension meter's method (`docs/BENCHMARKS.md`): 22,951 JS lines now, against 22,865 at session 0. That is **up 86**, mostly test harnesses written while their Emerge replacements land; one JavaScript function deleted (`sort_by`, 0.60.439). Emerge's own code grew to 13,155 `.eg` lines. *Corrected before merge:* this row first compared 23,525 with 24,135, two counts by a different method (`git ls-files`, which includes build output). | **Against / not yet** | in `emerge/emerge`: `find . -name '*.js' -not -path '*/node_modules/*' -not -path './data/*' -not -path '*/_archive/*' -not -path '*/output/*' -not -path '*/build/*' \| xargs cat \| wc -l` |

## 3. Nexus (the systems around it)

| # | Claim | His words (date) | Evidence | Status | Check |
|---|---|---|---|---|---|
| N1 | Specs complete enough to rebuild from | "everything needs  to be speccced before built,so it can be rebuilt if lost." (2026-10-20) | The registered specs compile at full depth, with every phase tied to its spec. | **Proven** | `node tests/modules/test-substrate-spec.test.js`: now 3/3 |
| N2 | A kernel in his language, standalone | "One kernel, merged" (EAS_D8) · "Pillar isn’t meant to be JavaScript." (2026-11-06 10:00Z) | Pillar stands in Emerge, with no `.js` in `pillar/`. | **Proven** | `node tests/modules/test-pillar.test.js`: now 5/5 |
| N3 | Emerge as one system, and a system of systems | "needs to be one" (2026-10-31) | Emerge's door, and three levels of nesting on the first run (0.60.336). | **Proven (as recorded 2026-10-31)** | Emerge's `npm run test:system` |
| N4 | Agents build any codebase from specs, with his framework, Emerge and RAID | "Any language, from specs" · "end state first. using my framework. emerge. and raid" (2026-11-06) | End state mapped only. | **Not yet** | — |

## What the matrix says, plainly

- **Proven today:** where his framework fixed the end state first (F1, E2–E7), the work came out right and the mistakes were caught before they
  landed. That is checkable by anyone, with the counts above.
- **The two big claims are not yet proven:** that his framework, run by RAID, saves tokens and writes better code with any agent (F8, N4), and
  that a constraint field generates code (F7). One benchmark run would move F8 from "not yet" to proven, or to "against".
- **The evidence against is real and stays in:**
  - the slope rule has no code (F4−);
  - the systems do not build from genesis yet (F5−);
  - SHA-256 is not proved on older CPUs (E3−);
  - Emerge's JavaScript is up 86 lines since session 0 while the removal runs (E10).
