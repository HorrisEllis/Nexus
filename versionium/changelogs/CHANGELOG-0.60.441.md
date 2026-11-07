# 0.60.441 — CIE6 slice b: Emerge checks its own code when it compiles

James, 2026-11-07: "its meant to debug it's own code when compiling. so that js harness is only temporary until emerge can also do it." · "okay.
lets continue."

- **The native compiler checks before it builds.** `native/bin/emerge` runs `lang/cie/check.eg`, the checker written in Emerge (0.60.440), on
  the main program. If there are errors, it prints them as `eg native`'s check does (`file:line:col: error: message`), exits 1 and writes no
  executable. No Node is in the loop.
  - Proof: 72 of 72 corpus programs with errors are refused with identical messages.
- **`front.eg` builds `lang/parser.js`'s tree, field for field.** Proof: 211 of 211 corpus programs. The starting point was 129 of 211.
  - Kinds are now parsed in full: requires, ins, outs, typed state, boundary_count and fns.
  - Compartments: the kind, the id's position, a state declared twice refused, and each state field, constraint and hook with its position.
  - A constraint's cost is null until given, as in the interpreter. Its type's default is 1 for every type in `primitives.eg`.
  - `state` is a `State` node, as in `parser.js`. `lower.eg` binds it inside a compartment.
  - Wire ends, emits and gap types now carry their positions.
  - The contract is normalised by `lang/cie/contract.eg`, with each road's position.
  - Columns are counted as JavaScript counts them: a multi-byte character is one column, and a 4-byte one is two.
- **`exit(n)` and `eprint(…)`, in both backends.**
  - They were built so the compiler could refuse properly; this closes the stderr gap found 2026-11-06.
  - `try` does not catch `exit`.
  - Out-of-range values are refused with the same message in both backends.
- **The `let`-write gap (CIE14 c) is closed natively.** Writing through a `let` or a parameter is now refused by the compiler itself.
- **The checker's environment** (builtin arities, primitives, signals) is carried as Emerge text, `native/check_env_text.eg`, never as a
  `.json` file. That is his rule for Emerge, 2026-11-01: "no .json files. only nodes". `native.test` fails if it drifts from
  `lang/runtime.js`.
- **Found and said:** sending to an instance's hook (`send inst.h`) is not native yet. `lower.eg` now refuses it by name instead of failing on
  a missing field.
- **Suites:**
  - Emerge: native 109/109 (4 new), differential 19/19, selfhost 16/16, lang 166/166, bootstrap 11/11, contract 8/8, ledger 21/21,
    ide 7/7, learn 6/6, say 16/16.
  - Nexus: test-emerge-in-nexus 5/5, test-pillar 5/5, test-substrate-spec 3/3.
- **Self-host:** three stages byte-identical (0cb3a1b1…). `lang/MAP.md` regenerated: it lists `eprint/0+` and `exit/1`.
