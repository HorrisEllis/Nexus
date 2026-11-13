# Benchmarks — his framework, Nexus, and Emerge coding

James, 2026-11-06: "keep note of benchmarks of my framework, nexus, and emerge coding, with the framework, date and time, quotes, and what became
from it, method, code, speed." One row per measured run. Every number names its benchmark (AXIOMS §17.11). Runs that lose are logged too.
The rows will be written and read by `emerge/emerge/lang/cie/bench.eg` (EQ2, docs/2026-11-06-emerge-is-the-replacement-phasemap.spec). Until
then they are written by hand.





## 2026-11-13 — each system's map from its own folder, in Emerge (SW1 slice a, 0.60.503)
- **Measured:** Emerge. One capability in one file (`pillar/map/map.eg`) maps any system's code: routes, events, crossings, command nodes.
- **His words:** "Basically looms map but per system and it's in charge of its own map." · "Each primitive/capabity should be its own file."
- **Method:** Emerge `test` blocks (4 cases on a built tree); then the real tree, every system mapped twice; then checked against a grep,
  the scorecard (SW0) and the census (lib/system-boundary.js).
- **Code:** 119 lines of `.eg` (map.eg), 60 of test, 1 builtin (`is_dir`) added to Emerge's runtime.
- **Result:** 14 of 14 systems give the same fingerprint twice; the whole tree in under 8 s. Versionium's routes equal a grep (19);
  Guardian's command nodes (49) and its reaches into Intelligence (10) equal the scorecard and the census.
- **Failed runs and what each taught:**
  - Emerge had no way to tell a folder from a file: `is_dir` added (a missing capability goes into Emerge).
  - Crossings first counted every require line (lib 15); the census counts each file-to-file pair once (lib 10). Changed to agree.
  - `{}` inside an Emerge string is interpolation: the test's sample code had to write `{{}}`.
  - A CLI command that called the module directly broke Pillar's rule (every command sends to a hook): `map` became an in hook.
- **Gaps found:** no capturing regular expression in Emerge (routes matched by a regex are not seen); 160 reaches between systems against
  the census's 150 the same morning, not traced.
## 2026-11-13 — Emerge: processes natively (CIE13 slice c, 0.60.512)
- **Measured:** Emerge coding. His words: "So we can stop using JavaScript" · "Next."
- **Method:** five builtins in rt.eg by syscall; the interpreter's by /proc; one 12-line program compared both ways.
- **Wall time:** native suite 1 min 37 s (117 cases).
- **Lines:** .eg +128 (rt.eg), +2 (codegen.eg); JavaScript +22 (runtime.js), +4 (native.test.js). Emerge's JavaScript after: about 14,430.
- **Tests:** native 117/117; self.test.eg 3/3; the compiler at a fixpoint.
- **Failed runs before the pass:** none. fork, execve with the parent's environment, the pipe and the wait were right on the first run.
- **Gaps found in Emerge:** the interpreter cannot block on a child (Node gives exit codes only through its event loop), so its
  proc_wait reads /proc/<pid>/stat: Linux only, and one more reason the interpreter is retired, not ported. No stderr capture. A
  builtin with an optional argument cannot be declared natively without its own handling (proc_signal takes both).
- **Tension meter:** JavaScript in Emerge rose by 26 lines this slice (the interpreter's side). Primitives: 127, 125 both ways.
- **What came of it:** Emerge has what a supervisor is made of: start a system, time it, know it died, stop it. COS's manager can now
  be written in Emerge once the door (a socket, CIE10) is.

## 2026-11-13 — Emerge: the wraps and the ledger proofs natively; 6 not native down to 1 (0.60.511)
- **Measured:** Emerge coding. His words: "It’s meant to be self aware." · "Okay."
- **Method:** three builtins in rt.eg; two functions in the world written in Emerge with their lowering; one program compared both ways.
- **Lines:** .eg +36 (rt.eg 18, world.eg 22 with comments, lower.eg 3, codegen.eg 1); JavaScript +3 (two cases in native.test.js).
- **Tests:** native 115/115 (1 min 26 s); self.test.eg 3/3; the compiler at a fixpoint.
- **Failed runs before the pass, and what each taught:**
  1. rt.eg called helpers that do not exist (rt_cat2, rt_cat4): the runtime builds text with rt_sb_new / rt_sb_str / rt_sb_done.
  2. Two statements on one line in rt.eg, with two spaces and then with `;`: both refused ("expected end of statement"). In the raw
     runtime a statement ends at the line.
- **Gaps found in Emerge:** `;` between statements is refused in rt.eg though blank() in contract.eg's grammar treats it as a separator
  elsewhere: one rule for it is wanted. The message for a missing runtime helper names front.eg:26, not the helper.
- **Tension meter:** JavaScript in Emerge unchanged. Primitives not native: 6 → 1.
- **What came of it:** a native Emerge program can prove an entry is in its ledger, the piece a contract's evidence rests on.

## 2026-11-13 — Emerge: folders natively; 10 primitives not native down to 6 (CIE13 slice b, 0.60.510)
- **Measured:** Emerge coding. His words: "Continue. Look a the graph substrate. Like emerge should reduce friction between primitives." · "Yeah."
- **Method:** five builtins in rt.eg by syscall; one 17-line program run interpreted and native and compared; Emerge's own map counts the rest.
- **Lines:** .eg +108 (rt.eg), +2 (codegen.eg); JavaScript +2 (one case in native.test.js).
- **Tests:** the folder case the same both ways; self.test.eg 3/3; the compiler at a fixpoint.
- **Failed runs before the pass:** none. The five were right on the first native run (the map and the earlier slice had shown the four
  places a builtin is added).
- **Gaps found in Emerge:** a builtin added to the interpreter is unknown to the native compiler until its environment is regenerated
  by hand (is_dir, added by another session the same day, was): the friction the map exists to show, and the next thing to generate.
- **Tension meter:** JavaScript in Emerge unchanged. Primitives not native: 10 → 6, by Emerge's own count.
- **What came of it:** an Emerge program can keep files in folders natively: what cos/pipeline's requests-as-files and the sovereignty
  card need to run without Node.

## 2026-11-13 — Emerge: its map of itself, in the substrate's shape (CIE14 slice f, 0.60.509)
- **Measured:** Emerge coding, and his framework (negative space: the registry is the shadow, the source is what is present). His words: "Continue. Look a the graph substrate. Like emerge should reduce friction between primitives.   It’s meant to be self aware."
- **Method:** cie/self.eg reads Emerge's own tables and text into blocks and edges; gaps() is what one side has and the other lacks. The
  result was then checked against the real compiler: one one-line program per primitive.
- **Wall time:** the map interpreted 0.2 s; the report compiled natively 10 ms; its 3 tests under 1 s.
- **Lines:** .eg +150 (cie/self.eg 118, self.test.eg 34, lang/self.eg 10, counted with comments); JavaScript 0.
- **Tests:** self.test.eg 3/3.
- **Failed runs before the pass, and what each taught:**
  1. The first map said 26 primitives were interpreter-only, among them print and min: wrong. Natively a primitive is carried out by
     three roads, not one (the table, VARIADIC, and calls the lowering rewrites). The map reads all three now: 10.
- **Checked against the compiler:** the 10 refused, 3 controls compiled. One of the 10 (ledger_check_proof) was refused for the test's
  own argument count, so 9 are confirmed.
- **Gaps found in Emerge:** no way for a program to learn the folder its own file is in (the test is run from emerge/emerge and passes
  "lang"); the lowering's rewrites are found by reading its text, because they are not data.
- **Tension meter:** JavaScript lines in Emerge unchanged (14,404). The work left at the primitive level is now a number Emerge reports
  itself: 10 primitives not native.
- **What came of it:** the worklist for the rest of CIE13 and CIE14 is generated, not remembered.

## 2026-11-13 — Emerge: a clock and a file check natively (CIE13 slice a, 0.60.502)
- **Measured:** Emerge coding. His words: "Working on it in another session. Maybe you can work on finishing emerge. So we can stop using JavaScript"
- **Method:** the three builtins written in rt.eg by syscall; each case run interpreted and native and compared (native.test.js).
- **Wall time:** the native suite 1 min 23 s (112 cases); the compiler built by the interpreter 40 s, by itself 2.1 s (19x); one small
  program compiled by the interpreter-run compiler 8 s.
- **Lines:** .eg +22 (rt.eg), +1 (codegen.eg); JavaScript +3 (runtime.js), +4 (native.test.js). Emerge's totals after: 14,404 lines of
  JavaScript, 13,964 of .eg (generated *_text.eg not counted).
- **Tests:** native 112/112 (109 before, 3 new); Emerge's own suites 31, 14, 6.
- **Failed runs before the pass, and what each taught:**
  1. `"sleep_ms" is not defined` natively: the native compiler checks names against check_env_text.eg, generated from the interpreter's
     builtins. A builtin is added in four places (rt.eg, codegen.eg's table, runtime.js, the regenerated environment), then the compiler
     is rebuilt.
  2. In another file the same day (cos/sovereign/card.eg): `ends_with(f, "x")` refused; it is an infix word, `f ends_with "x"`.
- **Gaps found in Emerge:** adding one builtin takes four edits and two regenerations by hand: a candidate for one table that generates
  the rest (CIE14). No folder listing, making or removing natively yet (next slice). No is-a-folder test in either runtime.
- **Tension meter:** 14,404 lines of JavaScript left in Emerge. This slice removed none; it adds what the removal waits on.
- **What came of it:** an Emerge program can time a step and wait, natively: what the pipeline's baseline, a heartbeat and a supervisor need.

## 2026-11-10 — Nexus's memory at boot, measured, and fitted to his machine (0.60.482)
- **Measured:** Nexus. Each system's resident memory, 25 s after it booted in a fresh sandbox, all 11 at once, each answering its /health.
- **His machine (his Task Manager):** an i3-1215U, 7.7 GB, memory at 91%, disk at 99%.
- **Result (MB):** architect 89, copilot 81, cortex 83, diagnostic 142, guardian 131, idearium 107, intelligence 126, loom 96, ollama 83,
  orchestrator 138, versionium 149. Total 1,225.
- **What it showed:**
  - Nexus at idle is not what fills 7.7 GB;
  - the risk is growth: every system was allowed a 1,024 MB heap, and all started at boot.
- **What came of it:**
  - six systems on demand (about 0.6 GB less at idle);
  - heap limits of 384 or 512 MB, about 3–4x idle;
  - a sleeping system woken through COS on first use.
- **Not measured:** memory under load, or on his machine with his data. That is PR4/PR6's heartbeat, which will carry each system's own deltas.

## 2026-11-10 — each pipeline step measured, RAID's decisions as steps (PC8 slice a, 0.60.481)
- **Measured:** his framework in COS's pipeline: deltas, a baseline, and "three = an invariant" before any sigma.
- **Framework:** end state first (the page showing each step's bar over three runs, through Clear Glass), then backwards to the engine and Emerge.
- **Method:** Emerge's baseline tested alone (4 cases); the engine's timing and RAID's decisions through a real run (OA-11); end to end through
  COS's door (CP-19, three runs); the page in Clear Glass (HB-07, three runs, a screenshot).
- **Result:** all green: baseline 4/4, OA 11/11, CP 20/20, HB 7/7, the automation suites, and the 8 suites that read COS's contract.
- **Failed runs, and what each taught:**
  - Emerge has no `?:` (the test helper rewritten);
  - a `set` step takes `assign`, not name and value;
  - the cockpit forwards only routes declared in the manager's contract (the page saw nothing until the route was declared there);
  - 1 ms steps showed as "0.0 s" (durations under a second now in ms);
  - rewriting two JSON files reflowed them, so the edits were redone as text.
- **Lines:** .eg +93 (baseline.eg 52, its test 41); JavaScript +147 −20 across the engine, door, route, UI and tests (no new JS file; the
  engine is JS until CIE13).
- **Gaps found in Emerge:** still no `?:`; noted, not changed.

## 2026-11-10 — the spec compiler moved out of Emerge (CIE8 slices b–d, 0.60.480)
- **Measured:** Emerge, under his CIE_D7 ("as long as its removed from emerge.").
- **Framework:** end state first. Emerge's own outputs are the oracle: the copy in Idearium must give the same graph and the same files.
- **Method:** kg-builder on every registered spec, both copies, with timestamps stripped (the original differs from itself only there); then
  cie-eg.spec's T0/T1 compile, hashed file by file; then the 8 suites from Idearium; then the callers, then the archive.
- **Result:**
  - 47 of 47 graphs equal;
  - 28 of 28 files equal;
  - the suites at the same counts;
  - the routes answer as Emerge's door did (substrate.spec: 94 ids, 0 black, 78 files);
  - the old door answers 410 with the new route.
- **Failed runs:**
  - the first pass of the callers was lost uncommitted in a container restart, and redone;
  - a stash, popped over a file the audit had rewritten, half-applied and was restored whole.
- **Lines:** Emerge JavaScript 23,026 → 13,213 (9,827 archived, +12 for the stub). The code is moved, not removed.
- **Tension meter, session 1 of 20 (continued):** 13,213 JS lines left (−9,813, by the move); 19 sessions left.

## 2026-11-09 — Emerge's brace trap closed: {{ and }} are literal braces (CIE14, 0.60.473)
- **His words:** "Did it code stably?" · "Yes fix it." (2026-11-09)
- **Measured first, from the day's own runs:** writing about 1,000 lines of .eg for cos/pipeline, about nine mistakes were caught by Emerge's
  checker with line and column, none got through to a wrong result at run time; the brace in a string was the top one (4 of the 9).
- **Method:** the rule in both lexers (lang/lexer.js, native/front.eg) so the interpreter and the native compiler agree; the native compiler
  rebuilt with itself until it reproduced itself.
- **Code:** lexer.js +4 lines; front.eg +12 lines (.eg); error messages say how to write a literal brace; README.
- **Counts:** lang 168/168 (+2), native 109/109, differential 19/19, selfhost 16/16, bootstrap 11/11; stage 2 = stage 3.
- **Failed runs, and what each taught:** none in the change itself; one bootstrap care: the compiler's new source had to use \{ only, because the
  old compiler builds it.
- **What came of it:** JSON and templates read as written in Emerge strings; the most common trap for him and for small models is gone.

## 2026-11-09 — the pipeline module in Emerge: gates that learn, requests kept as files (PC5 slice a, 0.60.466)
- **His words:** "Gates can hold context, test, verify, gates would do a lot. But not the same everytime." · "This needs to be a module." · "Needs to
  use actual physical files in the backend, the steps." · "follow claude.md i thought we chose to move on and use .eg, emerge for code?" (2026-11-09)
- **Framework:** his gates (a gate after every step; a gap is a build request) and his rule that new code is Emerge (§17.13).
- **When:** 2026-11-09, about 03:00–08:30 UTC, across a worker restart.
- **Method:** the logic written in Emerge and proved by its own test blocks; then through COS's real routes with stand-in systems for a test runner
  and Emerge's handoff (tests/modules/test-cos-pipeline.test.js).
- **Code:** cos/pipeline/: box.eg (moved, +dag hook), gate.eg 239, runs.eg 298, cli.eg 139, tests 266 (.eg lines added about 840). JavaScript:
  index.js 115 (the one door), replacing cos/manager/boxes.js 50; a 94-line gates.js and a 150-line runs.js written the same day in JavaScript
  were rewritten in Emerge after his reminder. Emerge grew 5 builtins (runtime.js +30 JS lines: Emerge's own interpreter, CIE4–CIE12's to remove).
- **Speed and counts:** eg tests box 10/10, gate 7/7, runs 4/4 (each about 0.1 s); test-cos-pipeline 8/8 in 11.0 s (every request write and gate
  is one Emerge process, about 80 ms; a gate that asks first is two). Emerge's own suites: lang 166/166, differential 19/19, selfhost 16/16, native
  as run in the release. The native compiler rebuilt itself: stage 1 = stage 2.
- **Failed runs, and what each taught:** (1) `{{` in an Emerge string is interpolation (write `\{`); (2) `starts_with`, `matches` and `skip` are
  keywords; (3) the test's "broken" contains "ok"; (4) the set step takes `assign`; (5) the door looked for Emerge under COS's data root; (6) a read
  after a resume raced the queued event (reads now wait their turn); (7) the native checker's environment drifted from the runtime (regenerated).
- **Gaps found in Emerge:** no folders (built: list_dir, path_exists, make_dir, move_path, remove_path); no callable prefix or pattern match; no clock
  (time comes in from the caller, CIE13).
- **What came of it:** a gate decides open, closed or gap and learns across requests through the step files (closed, closed, gap: CP-04); a
  request's files exist before it runs and stay until its contract is met (CP-02, CP-03); a resume does not re-run what was met (CP-03); a gap hands
  Emerge the build with its why (CP-05).

## 2026-11-08 — a Nexus pipeline on ERAVOS's own canvas (PC4 slice a, 0.60.456)
- **Measured:** Emerge coding, and ERAVOS as Nexus's build surface.
- **His words:** "eravos is the build surface for nexus. that way if something needs to be built, we can make a tool for eravos. not rebuild it."
- **Code:**
  - Nexus: `box.eg` gains `to_erv` and `depth_of`, and `cli.eg` gains the `erv` command. That is +50 lines of .eg, and 0 lines of Emerge's
    JavaScript removed.
  - ERAVOS: the Orchestration domain and its Box tool, in ERAVOS's own JavaScript (its v1 contract).
- **Result:**
  - eg test 9/9 and test-pipeline-box 5/5.
  - ERAVOS's real canvas opens Nexus's `fiverr-gig.erv` as 3 boxes and 2 wires, with no faults.
  - In ERAVOS: Box tool contract 4/4, its own tests 3/3, boundary 10/10, and 259 manifests valid.
- **Failed runs before the pass:** 3.
  1. My first preview was a hand-made canvas. He said "not rebuild it", and it was thrown away.
  2. The template's sample presets named settings a box has none of; the validator caught it.
  3. The registry test's list of hooks had to gain `erv`.
- **Gaps found in Emerge:** none. JSON is YAML, so no YAML writer was needed for `.erv`.

## 2026-11-08 — the box shape reached through COS (PC1, 0.60.454)
- **Measured:** Emerge coding. The box shape (`box.eg`) is now used by COS for real: its route, its command rows, and the cockpit's page.
- **His words:** "cli commands, agent tools, copilot commands, inject nodes to agents. keep going. i want this built and added to cos ui."
- **Code:** `cos/automation/cli.eg`, where `boxes` now reads both kinds (+8 lines of .eg). The JavaScript is COS's door and page, by COS's
  contract: `cos/manager/boxes.js` (45 lines) and `cos/ui/pipelines/` (page.js 87 lines). 0 lines of Emerge's JavaScript removed.
- **Speed:** test-pipeline-box 5/5. Each box shape that COS asks for spawns one Emerge run. Per-call time is still to be measured, which is PC6's sigma, his "measure the time it takes pipeliness".
- **Failed runs before the pass:** 3.
  1. The fixture's step settings belonged under `config`.
  2. The cockpit refused the automation route. It was a real bug from AE6: a `|` method list matched as one word.
  3. CU-02 had the same exact match.
- **Gaps found in Emerge:** none new.
## 2026-11-08 — Pillar's conformance: the first finding (PIL3 slice a, 0.60.454)
- **Measured:** Emerge coding and his framework. The contract becomes the end state, and an implementation is held to it from outside.
- **His words:** "Continue." · "Focus on primitives. Build using emerge right?"
- **Method:**
  - 7 cases derived from pillar:constraint's contract, as Emerge data;
  - Emerge's JS core answered them through its own harness;
  - Pillar's judge, in Emerge, decided.
- **Result:**
  - 6 of 7 pass;
  - one finding: the JS core treats a null field as present, where the contract and Emerge's language say it is a gap;
  - conform.test.eg 5/5, test-pillar-conform 3/3.
- **Lines:** .eg +~110 (conform.eg ~70, constraint.eg ~20, the test ~40). JS: one harness (~50), which the phase names. It is the only code that can
  call the JS core. Run-all: +1 line.
- **Failed runs:** `expect` is a keyword and can't be a parameter name (the known keyword gap). It still works as a map key, so the case schema's
  field name was kept.
- **What came of it:** the contract caught a disagreement between Emerge's two implementations of one primitive. It is said, not hidden.

## 2026-11-08 — Pillar's contracts, in Emerge (PIL2, 0.60.453)
- **Measured:** Emerge coding. The one kernel's contracts, written as Emerge data with an Emerge validator and test.
- **His words:** "Focus on primitives. Build using emerge right? And any tools or my framework to reduce tokens. Own."
- **Framework:** end state first; the code as the oracle. Each contract's meaning, inputs, outputs and failures are extracted from the file that
  implements it: header lines, signatures and throw messages, read by grep, not by reading whole files.
- **Result:**
  - 15 contracts and 1 open gap (Relation: ERAVOS's spec is not here);
  - contracts.test.eg 5/5 on its first run;
  - pillar.test.eg 4/4 and test-pillar 5/5 after two fixes.
- **Lines:** .eg +~190 (contracts.eg ~150, the test ~40, pillar.eg +10). JS: +1 line (PI-02's filter), 0 removed.
- **Failed runs, and what each taught:**
  1. Emerge's ledger refused "≥" in a contract (D5). The ledger's subset holds the kernel's own text too.
  2. PI-02 counted a `use` line as a second definition. A module import is composition, not a definition.
  3. PIL1's test "no contracts yet" ended with PIL2. The test followed the new truth, and its old name is kept in a comment.
- **What came of it:** Pillar answers with real contracts. PIL3 (conformance cases) and the blind bench (T7) have something to stand on.

## 2026-11-08 — one box shape, in Emerge (PC1, 0.60.448)
- **Measured:** Emerge coding, with his framework's pipeline canvas. The box shape for every step is written in Emerge, and every real
  `.pipeline` and `.procedure` node in the tree is round-tripped through it.
- **His words:** "steps as boxes, with wires as the flow into the hooks of gates as compartments" · "using emerge as the language" · "also show me
  the preview for the ui before building it but bottom up, first."
- **Method:** Emerge's own `test` blocks, plus test-pipeline-box in the Nexus suite. The suite test is a temporary JavaScript harness that converts
  the tree's YAML nodes to JSON, because Emerge has no YAML reader yet (CIE14).
- **Code:** `cos/automation/box.eg` (170 lines), `cos/automation/cli.eg` (42), `cos/automation/test/box.test.eg` (89). That is 301 lines of .eg
  added and 0 lines of Emerge's JavaScript removed. The suite harness is 55 lines of JavaScript.
- **Speed:** eg test 8/8 in 0.12 s wall; test-pipeline-box 4/4 in 0.54 s wall.
- **Result:** both real nodes round-trip unchanged:
  - fiverr-gig.pipeline: 3 boxes, 2 wires;
  - update-nexus.procedure: 5 boxes, 4 wires.

  Refused and named: an unknown kind, an id used twice, a ref that names nothing, a wire to a missing hook, and a cycle.
- **Failed runs before the pass:** 2.
  1. `state` cannot be a variable name. This is the known keyword gap (CIE14).
  2. A hook's payload is read-only, a lens. Changing it needs `clone()`. That is by design, not a gap.
- **Gaps found in Emerge:**
  - no YAML reader (every node file is YAML);
  - no folder listing (CIE13's sys_file).

  Both are logged on CIE14.
- **What came of it:** the canvas and the engine share one file. A wire drawn on a canvas is a `depends_on` in the `.pipeline`.

## 2026-11-07 — the spec compiler asks Emerge by its command line (CIE8 slice a, 0.60.444)
- **Measured:** Emerge coding, the first cut toward his CIE_D7 ("as long as its removed from emerge.").
- **Framework:** end state first. The old in-process answers are the oracle: the new check must give the same message for the same source.
- **Method:** four probes compared, old against new; then target.test and build-spec.test, before and after.
- **Result:**
  - the same messages, word for word;
  - target 11/11 and build-spec 18/18, as before;
  - the first cut failed 5 tests (Emerge's command line not found, unchecked code emitted), and was fixed before merge.
- **Speed (a loss, logged):**
  - build-spec.test: 0.7 s → 27 s;
  - target.test: 0.1 s → 7 s;
  - 74 checks at about 95 ms each.

  Slice b's fix is named: the running door over HTTP, and the probes batched.
- **Lines:** JavaScript 22,951 → 22,993 (+42, the adapter; it moves to Idearium with the compiler). .eg +0.
- **Tension meter, session 1 of 20 (continued):** 22,993 JS lines left (+42); 19 sessions left. The compiler's move (slice d) will take about 7,000
  out of Emerge's count. That is code moved, not removed.

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
- **Tension meter, session 1 of 20 (continued, 2026-11-07 14:31Z, the evidence matrix):** 22,951 JS lines left (+0); 19 sessions left. No code changed; measured for `docs/EVIDENCE-MATRIX.md` E10.

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
