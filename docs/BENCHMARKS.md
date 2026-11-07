# Benchmarks — his framework, Nexus, and Emerge coding

James, 2026-11-06: "keep note of benchmarks of my framework, nexus, and emerge coding, with the framework, date and time, quotes, and what became
from it, method, code, speed." One row per measured run. Every number names its benchmark (AXIOMS §17.11). Runs that lose are logged too.
The rows will be written and read by `emerge/emerge/lang/cie/bench.eg` (EQ2, docs/2026-11-06-emerge-is-the-replacement-phasemap.spec). Until
then they are written by hand.

## 2026-11-07 — the debugger in Emerge, judged by Emerge (CIE7 slice b, 0.60.443)
- **Measured:** Emerge coding. 180 lines of the JS debugger (`observe/debug.js`) written again in Emerge, under his rule: no new JS unless it
  replaces JS.
- **His words:** "spec it. then lets continue emerge" · "Okay so don’t create js unless you have to and that’s only to replace it."
- **Framework:** end state first, two oracles, no new code outside Emerge:
  - the interpreter's own `ledger_why()` (the JS) for `why`, and `observe()` read mid-run for `at`, on real runs;
  - the expected answers already written in `test/debug.test.js`, carried over as `expect` lines, for what no builtin exposes.
- **Method:** 7 real-run scenarios (every entry's `why` compared, `at` compared at 21 recorded points) and 11 carried-over cases; then a hostile
  check: 13 mistakes planted in the port, one at a time.
- **Result:**
  - the judge 18/18; `ledger_why()` and `json()` native, each equal to the interpreter; `examples/debug.eg` equal natively;
  - native.test 109/109 (13 examples natively), selfhost 16/16 (stage 0 = 1 = 2), bootstrap 11/11, lang 166/166, differential 19/19.
- **Speed:**
  - the Emerge judge: 1.31 s interpreted (the JS test: 0.11 s);
  - stage 0: ~25 s (was ~17 s at slice a); stages 1 and 2: ~1.2 s each;
  - native.test: ~67 s.
- **Lines:** .eg +~800:
  - debug.eg 376, the judge 306, the example 31;
  - rt.eg +59 (`json`), lower.eg +21, emerge.eg +2, codegen.eg +1; debug_text.eg (generated).

  JS: 0 added, 0 removed. `debug.js` stays until CIE11, since the interpreter's `ledger_why()` calls it.
- **Failed runs before the pass, and what each taught:**
  1. `on` is a keyword and cannot be a state field (a gap known since 2026-11-06).
  2. Natively, the builtin `json` did not exist. Built into the native runtime instead of avoided (§17.13).
  3. Natively, a function declared inside a block is refused. The port's two were lifted to the top level.
  4. Natively, the judge cannot run: a module fn with defaults called through its module, and a module as a value, are both refused
     (known). Native equality is proven by the example and by direct comparisons, as slice a did.
  5. **The judge was blind to a real mistake.** The consequences list capped at 4 instead of 5 passed all 16 scenarios; none gave an entry
     more than 5 consequences. A scenario was added (seven refusals); the plant now fails. Three other plants pass and are shown
     unobservable, not hidden.

  The port matched the oracle on its first full run.
- **Gaps:** closed, `json` native. Found and said: a fn inside a block is not native; the `emerge.cos` lock takes in untracked and gitignored
  files from the disk that writes it.
- **What came of it:** Emerge debugs a run from its own ledger, natively. With slice a, CIE7's observer and debugger are both in Emerge.
- **Tension meter, session 1 of 20 (continued):** 22,951 JS lines left (+0); 19 sessions left.

## 2026-11-07 — the observer in Emerge, judged by Emerge (CIE7 slice a, 0.60.442)
- **Measured:** Emerge coding. 471 lines of the JS observer written again in Emerge, under his new rule: no new JS unless it replaces JS.
- **His words:** "lets continue." · "Okay so don’t create js unless you have to and that’s only to replace it." · "You gotta think dialectically".
- **Framework:** end state first, with the oracle chosen dialectically. Three options were laid side by side:
  - port observe.test's hand-built chains (needs the JS observer as a library: new JS);
  - a shell diff (non-Emerge);
  - real Emerge programs, each calling the interpreter's `observe()` builtin (the JS, as it already exists) beside the port.

  The third needs no new code outside Emerge, and was chosen.
- **Method:**
  - 16 scenarios in `lang/test/world/observe.eg`, compared in canonical form (ledger.eg's ecf).
  - Then a hostile check: each scenario's regimes printed, and mistakes planted in the port.
- **Result:**
  - 16/16 equal;
  - `observe()` native, with the example identical natively;
  - native.test 109/109, bootstrap 11/11, differential 19/19, selfhost 16/16, lang 166/166.
- **Speed:**
  - the judge: 0.68 s for 16 scenarios, interpreted;
  - stage 0: ~17 s; stages 1 and 2: under 1 s each;
  - native.test: ~39 s.
- **Lines:** .eg +~670:
  - observe.eg 535, the judge 179, the example 32;
  - prelude +33, lower +30, world +5, emerge.eg +3.

  JS: +3 (the bootstrap test's copy), 0 removed.
- **Failed runs before the pass, and what each taught:**
  1. `gap` is a keyword and can't be a variable (a gap known since 2026-11-06).
  2. The test compartment's initial state broke its own constraint. Emerge refused it.
  3. `hex` lives in the prelude, not in ledger.eg; the coder's grep had mixed the two files.
  4. **The judge was blind to two mistakes.** A reversed tie-break and an oscillation threshold off by one passed all 14 scenarios, because none
     reached a tie or oscillation. Two scenarios were added; both mistakes now fail. *A judge that passes is not yet a judge that sees.*
  5. Natively, a module is not a value. The lowering hands the observer a map of the three primitive sections.
  6. `log2` changed the builtins, so the compiler's checker environment drifted. native.test's drift check caught it.
  7. The bootstrap test's tree lacked `observe/`. It was a latent gap, revealed by the new example.

  The port itself matched all 14 scenarios on its first run after the name fixes.
- **Gaps:** found and closed, Emerge had no logarithm (`log2`) and `observe()` was not native. Found and said, a module is not a value natively.
- **What came of it:**
  - Emerge observes itself natively.
  - The observer CF1 needs is in Emerge, and it already measures sigma as he decided.
- **Tension meter, session 1 of 20 (continued):** 22,951 JS lines left (+3); 19 sessions left.

## 2026-11-07 — Emerge checks its own code when it compiles (CIE6 slice b, 0.60.441)
- **Measured:** Emerge coding. The native compiler made to run the checker written in Emerge, so Emerge debugs its own code when compiling.
- **His words:** "its meant to debug it's own code when compiling. so that js harness is only temporary until emerge can also do it." · "okay.
  lets continue."
- **Framework:** end state first. Two contracts were fixed before any code changed:
  1. `front.eg`'s tree equals `parser.js`'s tree, field for field, on the 211-program corpus;
  2. the compiler refuses every corpus program that has errors with `eg native`'s exact messages.

  The baseline was measured first: 129 of 211 equal, 70 crashing inside `check.eg`, 12 different. The differences were then listed by node type
  and field, and closed one by one.
- **Method:** a judge in Emerge (`front.eg` → `check.eg`, interpreted) and a tree diff, both against `parser.js` and `checker.js` as oracles.
  Then the refusal judged through the built compiler alone.
- **Result:**
  - trees: 211/211 equal;
  - refusals: 72/72 identical, exit 1, no executable;
  - native.test 109/109 (4 new), differential 19/19, selfhost 16/16, lang 166/166.
- **Speed:**
  - stage 0 (the interpreter compiles the compiler): 17.0 s;
  - stages 1 and 2 (the compiler compiles itself): 0.90 s and 0.83 s;
  - the corpus judge, interpreted: 1.6 s;
  - native.test: 38.6 s.
- **Lines:**
  - .eg: about +73 net (front.eg +41, emerge.eg +17, lower.eg +8, rt.eg +6, codegen.eg +1), plus the generated `check_env_text.eg`;
  - JS: +83 (runtime.js +11 for `exit` and `eprint`, native.test +72 for the four proofs), 0 removed.

  The JavaScript harness grew this slice; it goes at CIE9 and CIE11.
- **Failed runs before the pass, and what each taught:**
  1. The coder's judge wrote `catch`, which isn't Emerge. Emerge says `else e`, and a `try` with no handler is refused (NO_SILENT_DROP).
  2. `components.eg` crashed `check.eg` at line 840 after the corpus matched. The `Contract` node's shape wasn't in the corpus, and native.test
     caught it. This was a semantic mismatch, caught by the end state before merge.
  3. differential failed: `lang/MAP.md` was stale after `exit` and `eprint` were added. The generated map caught it.
  4. A `.json` file had been added (`check_env.json`), against his rule "no .json files. only nodes". The coder caught it by rereading his
     rule, and replaced it with Emerge text.
- **Gaps:**
  - found and closed: native stderr (`eprint`); `exit` for programs (it existed only as a hidden `__exit` for test runs); the let-write gap
    (CIE14 c);
  - found and said: sending to an instance's hook is not native.
- **What came of it:** the compiler refuses bad code by itself, with no Node. The JS checker is now only a test oracle.
- **Tension meter, session 1 of 20:** 22,948 JS lines left (22,865 at session 0, +83 this slice); 19 sessions left. Method, the same as
  session 0's: every `.js` file under `emerge/emerge`, leaving out `node_modules`, `data/`, `_archive/`, `output/` and `build/`
  (`find . -name '*.js' -not -path '*/node_modules/*' -not -path './data/*' -not -path '*/_archive/*' -not -path '*/output/*' -not -path
  '*/build/*' | xargs cat | wc -l`).
  - *Corrected the same day:* this line first said 25,176 and that the session-0 scope couldn't be reproduced. It was found in the session's
    own transcript, after James said "I can find it in the chat". The first wording is kept here (§0.3), and 25,176 was that wider count.

## 2026-11-07 — his framework applied to his 20-session constraint (CIE_D6, proposed): a re-estimate, not a run
- **Measured:** his framework, applied by the coder to a planning problem: removing Emerge's JavaScript in less time.
- **His words:** "what if we constrain it to 20 sessions, and then you use the framework to try to find a way around the contraint. like
  creating a open loop, until it's done. like tension building as creative fuel." · "make sure to log it in the ledger. what your approach was,
  and how my framework helped you."
- **Framework:** the Innovation Toolkit, three of its steps.
  - Section 4, constraints and deconstruct: the JavaScript measured by kind.
  - Section 3, find the gap: what needn't be ported at all.
  - Section 6, map the leverage: the loop that needs no coder in the middle.
- **Method:** the 22,865 JS lines split into what they are:
  - the interpreter core: 4,295;
  - the spec compiler: 6,197;
  - the tests: 5,618;
  - the door and tools: the rest.

  Each bucket gets its cheapest path: retire, relocate, port by agents against an oracle, or wait on native sockets and processes.
- **What the framework changed:**
  - The interpreter core is retired, not ported, because native already replaces it.
  - The spec compiler's home becomes a question rather than a cost.
  - The checker's port (harvest, oracle, port, diff) becomes a loop Idearium's agents can run.
- **Result:**
  - An estimate, not a measurement: about 15 sessions down to about 8–10 for the JS removal.
  - The coder's first guesses at the bucket sizes were wrong (~5,500 and ~7,000; measured 4,295 and 5,618). Corrected.
- **What came of it:**
  - A proposal (CIE_D6) awaiting his three calls.
  - A tension meter from here on: JS lines left against sessions left, logged every session.
- **Tension meter, session 0 of 20:** 22,865 JS lines left; 20 sessions left.

## 2026-11-07 — the checker in Emerge: 211 programs, every diagnostic equal (CIE6 slice a, 0.60.440)
- **Measured:** Emerge coding. The language's checker (575 lines of JS) written again in Emerge.
- **His words:** "continue"
- **Framework:** contract first, with a harvested end state.
  1. Every program `lang.test.js` checks or runs was recorded (227 programs).
  2. `checker.js`'s answers on them became the expected output.
  3. `check.eg` was held to those answers, interpreted and native.
- **Method:** the JS parser's trees passed to `check.eg` as JSON, with the builtin arities, primitives and signals given as data. The outputs
  compared byte for byte.
- **Result:**
  - 211 programs (the 16 others are parse errors, the parser's): 75 errors and 43 warnings identical, interpreted and native.
  - native 105/105, selfhost 16/16 (6ecb02c7…), lang 166/166, differential 19/19.
- **Speed:** native, the checker checks all 211 programs in 0.17 s. Compiling the judge natively took 0.40 s. Stage 0 took 13.3 s; stage 1
  took 0.65 s.
- **Lines:** `check.eg` is ~600 lines of .eg. JS removed: 0, since `checker.js` goes with the interpreter at CIE11.
- **Failed runs before the pass:**
  1. The coder's corpus harvester dropped its own output path.
  2. Missing context flags were `null`, not `false`, and Emerge's `or` needs real booleans; read through a `_flag` helper now.
  3. `parse_json` was not native. Lowered onto `json.eg`; a gap built.

  The port itself matched every diagnostic on its first full run.
- **What came of it:** the checker no longer needs JavaScript to exist. Slice b makes the native compiler run it.

## 2026-11-07 — optional parameters; sort_by into the Emerge prelude; the first JavaScript deleted (0.60.439)
- **Measured:** Emerge coding, and his framework: a decision of his built through every backend the same day.
- **His words:** "I feel optional parameter's is always good."
- **Method:**
  1. A default-parameter program run through `eg run`, `eg build` and native.
  2. `sort_by` moved into the prelude.
  3. The JS `sort_by` deleted.
  4. The language rebuilt (bootstrap, build 16), and every suite run.
- **Result:**
  - `eg build` equals `eg run`, and native equals `eg run`, including a default that uses an earlier parameter (`fn area(w, h = w)`).
  - native 104/104, selfhost 16/16 (2b88c78e…), lang 166/166, differential 19/19. The bootstrap is identical in both backends.
- **Speed:** stage 0 took 15.8 s; stage 1 took 0.76 s.
- **Lines, honestly:**
  - JavaScript deleted for good: 12 lines (`def('sort_by')` and `cmpSort`).
  - JavaScript added: 30 lines, teaching the parser, checker, interpreter and emitter optional parameters. Those go with the interpreter at
    CIE11.
  - Emerge's JS total is 22,832.
  - .eg added: the prelude's `sort_by` (+~55), `native/defaults.eg` (~95), `front.eg` (+~15).
  - Archived: `cie/sort.eg` and its embedded copy, now duplicates.
- **Failed runs before the pass:** 2.
  1. The test had a lambda with a default, which native refuses by name.
  2. The emitter's top-level functions used a second arity path.
- **Gaps found:** natively, lambdas with defaults, and module functions with defaults called through their module with fewer arguments.
- **What came of it:** the first JavaScript removed from Emerge, made possible by his decision.

## 2026-11-07 — every example natively: a regex engine and sort_by in Emerge (CIE15 built, 0.60.438)
- **Measured:** Emerge coding. A regular-expression engine and `sort_by` written in Emerge.
- **His words:** "continue" · "Please continue from where you left off."
- **Framework:** contract first. The judge for the regex engine is JavaScript's own RegExp on 92 cases. For everything else it is `eg run`.
- **Method:**
  1. Generate the cases, with each answer computed by JavaScript.
  2. Run `regex.eg` on them, interpreted and native.
  3. Run every example and `sort_by.eg` natively against `eg run`.
- **Result:**
  - 92 of 92 regex cases equal, interpreted and native.
  - All 10 programs (8 examples, `modules/main`, `sort_by.eg`) natively equal `eg run`.
  - native 104/104, selfhost 16/16 (b523adc4…), lang 166/166, differential 19/19.
  - The census went 2 → 3 → 4 → 5 → 6 → 7 → 9 of 9 over two days.
- **Speed:** stage 0 took 18.2 s; stage 1 (native) took 1.03 s. The compiler grew by the regex and sort modules it carries. native.test took
  50 s.
- **Lines:** .eg +~330 (`regex.eg`), +~70 (`sort.eg`), plus the lowering. JS 0 removed.
- **Failed runs before the pass:** 2.
  1. `test` is a keyword, so the engine's entry point is `search`.
  2. The coder's test generator didn't escape braces in Emerge strings.

  The engine itself matched JavaScript on its first run.
- **Gaps found:** modules were named by basename natively (fixed, now relative to the main file).
- **What came of it:** CIE15 is built. Every program in the language's examples compiles to a native executable and behaves exactly as the
  interpreter does. The road to deleting the interpreter (CIE11) now runs through the checker (CIE6), observe (CIE7), the spec compiler (CIE8),
  the tests in .eg (CIE9) and the system primitives (CIE13, CIE10).

## 2026-11-06 — kinds, templates, spawn and despawn natively (CIE15 fifth slice, 0.60.437)
- **Measured:** Emerge coding. His dynamic primitives natively: kinds, templates, spawn, despawn, and instances wired at run time.
- **His words:** "Please continue from where you left off." · "continue"
- **Method:** `examples/primitives.eg` run both ways. Then the same file with its ledger printed. Census rerun.
- **Result:**
  - Line for line equal, and 22 of 22 ledger entries hash for hash (despawn, unwire, whatif, register, wire, transition), on the first
    native run.
  - native 102/102, selfhost 16/16 (523aec34…), lang 166/166, differential 19/19.
  - Census: 7 of 9 (primitives added).
- **Speed:** stage 0 took 16.2 s; stage 1 (native) took 0.94 s. native.test took 42 s.
- **Failed runs before the pass:** 0 for the program. 3 check errors on the way: `template` and `state` are keywords and can't be variable
  names (twice), and a placeholder branch left in `front.eg`.
- **Gaps found:** a field read on a non-map is worded differently by the two backends.
- **What came of it:** only two features stand between the native compiler and every example: a regex engine, and `sort_by` (optional
  parameters).

## 2026-11-06 — test blocks natively (CIE5, 0.60.436)
- **Measured:** Emerge coding. `test` blocks natively, with `emerge prog.eg --test`.
- **His words:** "okay. so are you removing it when you're finisged?" · "continue"
- **Method:** `examples/tests.eg` (one test fails on purpose) through `eg test` and through the native binary with `--test`. Stdout, stderr and
  exit status compared. Run mode checked to skip the tests, as `eg run` does.
- **Result:**
  - All three equal, the failing test's own line (`tests.eg:42`) included.
  - native 101/101, selfhost 16/16 (5b2b49f3…), lang 166/166, differential 19/19.
  - Census: 6 of 9 in run mode (tests added).
- **Speed:** stage 0 took 15.4 s. native.test took 41 s.
- **Failed runs before the pass:** 1. The first runner caught errors inside the world, which stamps the caller's line, so the failure said
  line 3. Each test's `try` now sits in the program itself.
- **Gap found:** an error inside a `whatif` expression names the `whatif`'s line. Logged in CIE14.
- **What came of it:** CIE5 is built. The tests themselves can now be written in Emerge (CIE9) and run natively.

## 2026-11-06 — whatif natively (CIE15 fourth slice, 0.60.435)
- **Measured:** Emerge coding. Speculative branches (`whatif`), natively.
- **His words:** "just keep going."
- **Method:** `examples/whatif.eg` run both ways. `language.eg` gets a branch that records and draws before its ledger printout.
- **Result:**
  - `whatif.eg` equal on the first native run.
  - The branch's draw equals the world's next draw (the generator was restored), and the `whatif` entry matches hash for hash.
  - native 100/100, selfhost 16/16 (c9a09bf1…), lang 166/166, differential 19/19.
- **Speed:** stage 0 took 15.6 s. native.test took 41 s.
- **Failed runs before the pass:** 0.
- **Census:** 5 of 9 examples equal. A correction, the coder's: earlier rows said "of 8", but the census always counted 9. The real line
  today is 2, 3, 4, 5 of 9.

## 2026-11-06 — axioms natively; stdout, stderr and exit status equal (CIE15 third slice, 0.60.434)
- **Measured:** Emerge coding. His framework's program-wide axiom check, natively.
- **His words:** "just keep going."
- **Method:** `examples/axioms.eg` run both ways, comparing stdout, stderr and the exit status. Census rerun.
- **Result:**
  - All three equal, including the violation at the caller's line (`axioms.eg:33`).
  - native 100/100, selfhost 16/16 (1c45b69e…), lang 166/166, differential 19/19.
  - Census: 4 of 8 examples equal (was 3).
- **Speed:** stage 0 took 15.7 s. native.test took 41 s.
- **Failed runs before the pass:** 2.
  1. `axiom` is a keyword and can't be a function name.
  2. Native reported the error inside `world.eg`. The embedded world is now `no_loc`, like the prelude, which fixes every world error, not
     only this one.
- **What came of it:** the null-field constraint gap is now native. That is his "gap is first class" axiom at work: a check that can't be
  evaluated opens a gap rather than failing.

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
  - Census: 2 of 9 (said "of 8" at the time, corrected 0.60.435) examples equal natively. The other 7 are refused by name: `..`, `expect`, `record`, `axiom`, `kind`, `whatif`.
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
