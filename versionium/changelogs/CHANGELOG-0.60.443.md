# 0.60.443 — CIE7 slice b: the debugger in Emerge; the wiring harness specced

James, 2026-11-07: "spec it. then lets continue emerge" · in the other session the same day: "Okay so don’t create js unless you have to and
that’s only to replace it." · "You gotta think dialectically"

## The debugger in Emerge (CIE7 slice b)

- **`lang/cie/debug.eg`:** Emerge's debugger (`observe/debug.js`, 180 lines of JS) written again in Emerge, rule for rule:
  - `why` walks from an entry back to the entry that explains it, every link inferred from structure and saying how;
  - `at` gives the world after an entry: each compartment's state, the open gaps, the field and sigma readings;
  - `follow`, `diff` (where two runs part ways), `blame` (the debugger's "start here") and `clip` (a bounded slice that re-verifies alone),
    with `verify_clip`.
- **The judge is an Emerge program, with no new JavaScript.** `lang/test/world/debug.eg`, 18/18, has two kinds of end state:
  - **The oracle, on 7 real runs:** the port's `why` against the interpreter's `ledger_why()` (the JS) for every entry, in the ledger's
    canonical form; and `at(k)` against `observe()` and each compartment's state read mid-run, when the ledger stood at entry k.
  - **The 11 expected answers of `test/debug.test.js`** (written against `debug.js`), carried over case for case, on ledgers built and
    hashed in Emerge: follow, diff, blame, clip, and the gap and `gap.close` paths.
- **Planted mistakes:** 13. The judge catches 10.
  - The other 3 were shown unobservable, not waved away. Each entry gets at most one edge of each weight, and the 1-weight rules exclude each
    other by kind, so neither the tie-break between parents nor "replace an equal-weight edge" can change an answer. A weight moved from
    0.95 to 0.9 crosses neither the ordering nor the 0.8 threshold, and `why` never prints weights.
  - Before two scenarios were added, the judge missed a real one: the consequences list capped at 4 instead of 5. Now caught.
- **`ledger_why()` is native.** `lower.eg` rewrites it onto the port, which is carried inside the compiler (`native/debug_text.eg`).
- **`json()` is native.** `rt_b_json` in `native/rt.eg`, equal to the interpreter's text: lists and maps without spaces, every key quoted,
  numbers as `str()` writes them, bytes as hex in quotes. A function is refused by name.
- **`examples/debug.eg`** (new): a program debugging its own refusal. Natively it is equal to the interpreter, line for line.
- **The compiler rebuilds itself:** stage 0 equals stage 1 equals stage 2, and selfhost 16/16 reproduces the committed binary byte for byte.
- **Not ported yet:** `observe/cli.js` (`eg debug` on a file), which waits on CIE13 (files and processes natively). `debug.js` stays until
  CIE11, because the interpreter's `ledger_why()` still calls it.

### Gaps found, said
- **Closed:** `json` was not native.
- **Worked around in the port, open in Emerge** (CIE14): a function declared inside a block is not native. The two in the port were lifted
  to the top level, with the same behaviour.
- **Known, still open:** a module function with defaults, called through its module with fewer arguments, is refused natively; and a module
  is not a value natively. Together these keep both judges (observe and debug) interpreted-only.
- **Found:** `emerge.cos`'s lock takes in whatever is on the disk that writes it: untracked run ledgers under `data/` (state, not checked)
  and the gitignored `lang/build/previous/`. Re-locked here for the code files only, with those entries kept as they were.

## The wiring harness, specced

- **`idearium/spec-engine/templates/wiring-harness.spec`:** his "The wiring harness", as Emerge's module spec, at full depth.
  - It has 6 modules, 4 schemas, 5 interfaces and 6 invariants.
  - Four of its modules are built by phases that already existed: DB21, CIE10, CS3, IN5. The first three came off that morning's shelf.
  - Two new phases: WH1 (the conformance test) and WH2 (verified reconstruction coverage).

## Suites

- **Emerge:** native 109/109 (13 examples natively), selfhost 16/16, bootstrap 11/11, lang 166/166, differential 19/19, ledger 21/21,
  contract 8/8, ide 7/7, say 16/16, learn 6/6, debug.test.js 14/14, observe.test.js 31/31, the observe judge 16/16, the debug judge 18/18.
- **Nexus:** emerge-in-nexus 5/5, pillar 5/5, substrate-spec 3/3, phase-dag 8/8, phase-ledger 7/7.
- **JavaScript in Emerge:** 22,951 lines, none added and none removed.
