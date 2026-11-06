# Benchmarks — his framework, Nexus, and Emerge coding

James, 2026-11-06: "keep note of benchmarks of my framework, nexus, and emerge coding, with the framework, date and time, quotes, and what became
from it, method, code, speed." One row per measured run. Every number names its benchmark (AXIOMS §17.11). Runs that lose are logged too.
The rows will be written and read by `emerge/emerge/lang/cie/bench.eg` (EQ2, docs/2026-11-06-emerge-is-the-replacement-phasemap.spec). Until
then they are written by hand.

## 2026-11-06 — the world in Emerge, hash for hash (CIE4 slice a, 0.60.426)
- **Measured:** Emerge coding. Emerge's world (compartments, constraints, signals, ledger), rewritten from the interpreter's JavaScript into
  .eg.
- **His words:** "actaully keep remove js from emerge." · "lets code what we can using emerge, that way we can have a good test."
- **Framework:** contract first. The interpreter's own ledger is the end state, and the new code is accepted only when it matches it hash for
  hash.
- **Method:** one program run three ways (the interpreter on `lang/test/world/counter.eg`; `world.eg` on `counter.world.eg`, interpreted; the
  same compiled native), and every output line and ledger hash compared.
- **Code:** `emerge/emerge/lang/cie/world.eg`, commit 707c7f380; the test is `lang/test/native.test.js` 'world'.
- **Result:** 10 of 10 ledger entries equal across all three runs. native.test 94 passed, 0 failed.
- **Speed:** not measured in this run. The next row times the three runs.
- **What came of it:** the world needs no JavaScript to run natively. The next step (slice b) is the compiler accepting `compartment` and
  `on` as written.

## 2026-11-06 — Pillar stands, in Emerge (PIL1, 0.60.422)
- **Measured:** his framework. Pillar is a component in Emerge's own registry, reached only through its hooks (CIE-EG §5).
- **His words:** "why not just use compartments for modules? That's fucking stupid. It's already a primitive." · "it's supposed to be the
  component registry. Look at CIE-EG."
- **Method:** Emerge's own `test` blocks, plus test-pillar run in the Nexus suite.
- **Code:** `pillar/pillar.eg` and `pillar/cli.eg`, commit f8ef0e3c8.
- **Result:** eg test 4/4, test-pillar 5/5. A hook added without a command was caught.
- **What came of it:** the hand-written registry file was deleted. The list lives once, in Emerge's registry.
