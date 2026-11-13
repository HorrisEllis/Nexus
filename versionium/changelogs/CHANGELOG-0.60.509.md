# 0.60.509 — Emerge's map of itself

James, 2026-11-13: "Continue. Look a the graph substrate. Like emerge should reduce friction between primitives.   It’s meant to be self aware."

## Read first
`docs/substrate.spec`: one graph shape for every domain (Block, Edge, Observation), every edge with its evidence (discovered, declared or
unknown) and who found it. Specced 2026-10-20; none of it is built.

## Built
`emerge/emerge/lang/cie/self.eg`, in Emerge: Emerge's own sources read into that shape.
- A block for each primitive, and one for each way it is carried out.
- An edge "implements" from each way to its primitive, discovered, naming the file it was read from:
  - the native table (`native/codegen.eg` BUILTINS);
  - any number of arguments (VARIADIC);
  - a call the lowering rewrites into the world written in Emerge (`native/lower.eg`, read from its text);
  - the prelude (`core/prelude.eg`);
  - the interpreter (`native/check_env_text.eg`, generated from `lang/runtime.js`).
- `gaps`: the negative space. What only the interpreter can do, what only native can, and where the two disagree on arity.
- `eg run lang/self.eg` says it in words.

## What it found
- 121 primitives. 110 run interpreted and native.
- 10 only interpreted: `list_dir`, `make_dir`, `move_path`, `remove_path`, `wrap_add`, `wrap_sub`, `wrap_mul`, `ledger_proof`,
  `ledger_check_proof`, `observe_gaps`. Each was given to the real compiler in a one-line program; all ten were refused, and three
  controls (`now_ms`, `uid`, `min`) compiled. (`ledger_check_proof` was refused on the test's own wrong argument count: not confirmed.)
- 1 only native: `__exit` (the native test run's own).
- The two backends agree on every arity.

## Proof
- `lang/cie/test/self.test.eg` 3/3: the first test of Emerge written in Emerge inside Emerge's own tree (CIE9 begins here). It holds a
  ratchet: the count of interpreter-only primitives may only fall from 10.
- `lang/self.eg` compiled by `eg native` gives the same two lines as interpreted, in 10 ms, with no Node.

## What it does not do yet
- It does not yet generate the tables. Adding a builtin is still four edits and two regenerations by hand; the map now shows when one was
  missed. One source that generates the rest is the next step of the same idea.
- The substrate's Observation, traversal and gate are not built; this is one domain read into its shape.

## JavaScript, said
None added. One line of `emerge/emerge/package.json` runs the new test.
