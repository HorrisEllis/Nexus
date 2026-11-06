# 0.60.422 — PIL1: Pillar stands, in Emerge

James, 2026-11-06: "Emerge first then fiverr maybe? I’m struggling. Emerge is the highest leverage." · on the kernel (EAS_D8): "One kernel, merged".

The idea and the order are his: one kernel of primitives, Pillar, written in Emerge (PIL_D3), a library with a CLI until he decides
whether it gets a process (PIL_D2). The code is the coder's.

## Built (docs/2026-11-06-pillar-phasemap.spec PIL1_pillar_stands, pillar/spec/pillar.spec MOD-PIL-SYSTEM)
- `pillar/pillar.eg`: version, `contracts()`, `contract(id)`. `check` and `identity_of` answer `ok: false` with the phase that builds them
  (PIL3, PIL4). The contract list is empty until PIL2, and says so (§1.2).
- `pillar/registry.eg`: Pillar's own component registry (§5.16), with its exports and commands.
- `pillar/cli.eg`: `eg run pillar/cli.eg version|contracts|contract <id>|check <c> <impl>|conform|registry`. An unknown command is refused and
  the commands are listed.
- `pillar/test/pillar.test.eg`: 3 tests, `eg test` (3 passed, 0 failed).
- `lib/nexus-self/systems.js`: `pillar` owns `pillar/` (entry null, port null).
- `tests/modules/test-pillar.test.js` PI-01..05, 5/5, registered in run-all. PI-02 checks the registry against pillar.eg both ways. A
  planted public function with no registry entry failed it.

## Found
- An Emerge module is not a map (`has` and `keys` refuse it), so a .eg test cannot list what a module exports. The two-way check runs in
  PI-02 with Emerge's own parser. Names starting with `_` are internal.
- Emerge has no if-expression, `!` or `||`. Use `not` and `or`.

## Drift, said
- PIL1's phase graph was written after its code, not before. The graphs for PIL2–PIL6 exist now, ahead of their code.
- The 12 tests that read the systems table give the same results before and after adding pillar. Four were already failing on main
  (test-loom-phasemap, test-nexus-atlas-refs, test-readme-generate, test-registry-draft).

## Next, bottom-up
PIL2 needs Emerge's `contract { … }` block (CIE-EG MOD-CONTRACT, D7) and schema (MOD-STORE, D8) built into the language first.
