# Benchmarks — his framework, Nexus, and Emerge coding

James, 2026-11-06: "keep note of benchmarks of my framework, nexus, and emerge coding, with the framework, date and time, quotes, and what became
from it, method, code, speed." One row per measured run. Every number names its benchmark (AXIOMS §17.11). Runs that lose are logged too.
The rows will be written and read by `emerge/emerge/lang/cie/bench.eg` (EQ2, docs/2026-11-06-emerge-is-the-replacement-phasemap.spec). Until
then they are written by hand.

## 2026-11-06 — record, gap, promote and the seeded generator natively (CIE15 second slice, 0.60.433)
- **Measured:** Emerge coding. The seeded generator and the statements built on it.
- **His words:** "just keep going. how are the benchmarks so fatr?"
- **Method:** `test/world/language.eg` prints `random()`, two `uid()`s and the gap ids, then every ledger hash. Native must equal `eg run`.
  Census rerun.
- **Result:**
  - The same random number (0.26642920868471265), the same uids and gap ids, and 7 of 7 ledger hashes equal natively.
  - `examples/idearium.eg` natively equals the interpreter.
  - native 99/99, selfhost 16/16 (69a576f8…), lang 166/166, differential 19/19.
- **Speed:** stage 0 took 15.9 s. native.test took 44 s.
- **Failed runs before the pass:** 5, each one a gap:
  1. an escaped quote inside an interpolation (again);
  2. `record`, `gap` and `promote` are keywords and can't be function names;
  3. the lowering lowered the world itself, which made a use cycle;
  4. `wrap_mul` is not native, so the 32-bit multiply is built from 16-bit halves;
  5. a missing reference file in the test setup (the coder's).
- **Census:** 3 of 8 examples equal natively (was 2).
- **What came of it:** promotion and gaps, which carry his framework's "gap is first class" axiom, run natively with the interpreter's ids.

## 2026-11-06 — .., expect, upper and lower natively (CIE15 first slice, 0.60.432)
- **Measured:** Emerge coding. Four more language features natively.
- **His words:** "yes. get emerge complete. js removed completely."
- **Method:** each feature written into the native compiler (front.eg, codegen.eg, rt.eg), then held to `eg run` by
  `test/world/language.eg`. The examples census rerun.
- **Result:**
  - `language.eg` natively equals the interpreter line for line, including its three `expect` messages.
  - native 99/99, selfhost 16/16 (stages byte-identical, e9db36b9…), lang 166/166, differential 19/19.
- **Speed:** stage 0 took 16.2 s. native.test took 42 s.
- **Lines:** .eg +~70 (front.eg, codegen.eg, rt.eg). JS 0 removed.
- **Failed runs before the pass:** 0. Each example went on to its next refusal, which is the list below.
- **Gaps found:**
  - `matches` needs a regular-expression engine in Emerge.
  - `promote`.
  - `sort_by` natively needs optional parameters.
  - `upper` and `lower` beyond ASCII need the Unicode case tables.
- **What came of it:** 2 of 8 examples are still equal; each of the six others now stops one feature later.

## 2026-11-06 — components, hooks, wires and the contract natively (CIE4 slice c, 0.60.431)
- **Measured:** Emerge coding. Components, in and out hooks with shapes, `send`, `emit out`, wires, the contract and its roads, `components()`,
  all natively.
- **His words:** "yes. get emerge complete. js removed completely."
- **Framework:** contract first. The interpreter's ledger is the end state. The component world was first written by hand on `world.eg`
  (`components.world.eg`) and proved there. Only then was the compiler taught the syntax.
- **Method:** the reference run three ways (interpreter, `world.eg` interpreted, native). Then `components.eg` and `examples/components.eg`
  compiled as written. Then a census of every example.
- **Code:** `world.eg` +278/−19, `front.eg` +192/−10, `lower.eg` +96/−6, `contract.eg` +15/−16, `emerge.eg` +4/−3. New fixtures
  `test/world/components.eg` and `components.world.eg`.
- **Result:**
  - 10 of 10 ledger entries equal across the three runs.
  - `examples/components.eg` natively equals the interpreter line for line.
  - native 98/98, selfhost 16/16, lang 166/166, differential 19/19, ledger 21/21, contract 8/8.
  - Census: 2 of 8 examples equal natively. The other 6 are refused by name: `..`, `expect`, `record`, `axiom`, `kind`, `whatif`.
- **Speed:** the compiler compiling itself: 15.9 s interpreted, 0.74 s native (stage 1), 0.82 s (stage 2). The hand-written component world
  compiled natively in 0.49 s. native.test took 41 s.
- **Lines:** Emerge's totals went from 22,694 JS and 9,099 .eg (start of the day) to 22,736 JS and 10,006 .eg. JS removed so far: 0. It grew
  by 42 lines: new native.test cases and one `def`. The JS falls only when the native path replaces the interpreter (CIE11).
- **Failed runs before the pass:** 4, each one a gap:
  1. `sort_by` not native (contract.eg);
  2. `json` not native (contract.eg);
  3. `Sensor.version` not lowered;
  4. `components()` not native.

  Gaps 1 and 2 went to the prelude's `sort` and the ledger's `ecf`, which also removed a second writer of the canonical form. Gaps 3 and 4
  were built (`member_of`, `components_graph`). The hand-written component world matched on its first run.
- **One mistake of the coder's, on the way:** a stale local copy of main made the branch start from 0.60.429, and the stash conflicted. It was
  recovered without losing anything: conflicts resolved with the stashed versions, then main merged in. Each conflicting file was checked equal
  to 0.60.430 on main's side, and the suites were rerun green.
- **Gaps found:** Emerge has no optional parameters (`sort_by`'s third argument), so `sort_by` can't move to the prelude. `send` and `wire` are
  keywords too (the world's calls are `send_in` and `connect`).
- **What came of it:** CIE4 is built. The rest of the language natively is CIE15.

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
