# Benchmarks — his framework, Nexus, and Emerge coding

James, 2026-11-06: "keep note of benchmarks of my framework, nexus, and emerge coding, with the framework, date and time, quotes, and what became
from it, method, code, speed." One row per measured run. Every number names its benchmark (AXIOMS §17.11). Runs that lose are logged too.
The rows will be written and read by `emerge/emerge/lang/cie/bench.eg` (EQ2, docs/2026-11-06-emerge-is-the-replacement-phasemap.spec). Until
then they are written by hand.

## 2026-11-06 — frozen lenses natively; the compiler 18× faster native than interpreted (CIE14 a, 0.60.430)
- **Measured:** Emerge coding. A new builtin, `freeze`, in both backends; lenses frozen natively.
- **His words:** "yes. get emerge complete. js removed completely."
- **Method:** run `examples/counter.eg` both ways and diff the output; rebuild the compiler with itself and time each stage; run Emerge's six
  suites.
- **Code:** `lang/native/rt.eg` (rt_b_freeze, rt_check_writable, the kind word masked in four reads), `lang/native/codegen.eg` (the builtin
  row), `lang/runtime.js` (one `def` line), `lang/cie/world.eg` (`state_of` returns `freeze(clone(…))`).
- **Result:**
  - `examples/counter.eg` natively equals the interpreter line for line, the read-only lens error included.
  - native 96/96, selfhost 16/16, lang 166/166, differential 19/19, ledger 21/21, contract 8/8.
- **Speed:** the compiler compiling itself took 15.2 s interpreted (stage 0), 0.84 s native (stage 1) and 0.71 s native (stage 2): about
  18× faster native. native.test took 41 s, selfhost 29 s.
- **Lines:** +31 of .eg in rt.eg; +1 builtin row; +1 line of JS (a `def` the interpreter needs until CIE11 retires it, the parity condition
  §17.13 allows).
- **Failed runs before the pass:** 2.
  1. A frozen list reported itself as `fn`: `rt_type_name` read the kind word without the mask.
  2. Equality, printing and the type name each read it directly too.

  All four reads are masked now.
- **What came of it:** the one line that differed is closed. Two gaps were moved to where they belong: the let-write refusal to CIE6 (the
  checker in Emerge), and stderr to CIE11.

## 2026-11-06 — compartments compile natively, as written (CIE4 slice b, 0.60.428)
- **Measured:** Emerge coding. The native compiler, written in Emerge, now accepts `compartment`, `on` and `emit`.
- **His words:** "the moment js is removed from emerge it becomes the replacement. focus on that first. no more js, we focus on .eg" ·
  "next. how much more?"
- **Framework:** contract first again. The interpreter's output and ledger are the end state.
- **Method:** compile `lang/test/world/counter_ledger.eg` natively, run it, and compare with `eg run`. Then rebuild the compiler with itself
  (stages 0, 1 and 2) and compare the bytes.
- **Code:** `lang/native/front.eg`, `lower.eg` and `emerge.eg`, plus the embedded `world_text.eg`.
- **Result:**
  - 9 of 9 ledger entries equal to the interpreter's, and identical output.
  - native.test 95/95; selfhost 16/16; stages 0, 1 and 2 byte-identical (sha256 7d094db6…).
  - `examples/counter.eg` differs in one line, the read-only lens error (a gap).
- **Speed:** stage 0 (the interpreter running the compiler on itself) took 15.9 s of wall time. Stages 1 and 2 (native) were not timed
  separately. Compiling counter.eg with the stage-0 compiler took about 4.7 s.
- **Lines:** .eg added: `front.eg` +95, `lower.eg` 146 new, `emerge.eg` +12. JS removed: 0 (this slice adds the native path; the JS it
  replaces goes at CIE11). Emerge before: 22,694 lines of JS, 9,099 of .eg.
- **Failed runs before the pass:** 1. The embedded path `<cie>/world.eg` was resolved against the program's folder; embedded paths now
  count as absolute.
- **Gaps found:** lenses are not frozen natively; no stderr natively.
- **What came of it:** an ordinary compartment program builds to a native executable with no Node. Next: frozen lenses, then components.

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
- **Speed:** not measured in this run.
- **Lines:** `world.eg` 210 new lines of .eg. JS removed: 0.
- **Failed runs before the pass:** 7. Each taught something about Emerge:
  1. `state` can't be a parameter;
  2. it can't be a variable either;
  3. newlines inside a map literal run a lambda's lines together;
  4. an escaped quote inside an interpolation is refused;
  5. `compartment`, `on`, `emit` and `state` can't be function names;
  6. the checker refuses changing a map through a `let` or a parameter;
  7. the unrouted notice belongs on stderr, not in the world.
- **Gaps found:** items 1, 2, 3 and 5 are language limits. Item 6 is a native-versus-checker difference.
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
