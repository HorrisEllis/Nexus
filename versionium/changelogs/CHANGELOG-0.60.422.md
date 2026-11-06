# 0.60.422 — PIL1: Pillar stands, in Emerge

James, 2026-11-06: "Emerge first then fiverr maybe? I’m struggling. Emerge is the highest leverage." · on the kernel (EAS_D8): "One kernel, merged".

The idea and the order are his: one kernel of primitives, Pillar, written in Emerge (PIL_D3), a library with a CLI until he decides
whether it gets a process (PIL_D2). The code is the coder's.

## Built (docs/2026-11-06-pillar-phasemap.spec PIL1_pillar_stands, pillar/spec/pillar.spec MOD-PIL-SYSTEM)
- `pillar/pillar.eg`: one `component Pillar` (id `pillar.kernel`). Its record is in Emerge's component registry (`components()`, CIE-EG §5),
  and it is reached only through its in hooks (§5.2): `contracts`, `contract`, `check`, `identity_of`, answering on its out hook `answer`.
  `check` and `identity_of` answer `ok: false` with the phase that builds them (PIL3, PIL4). No contracts until PIL2, and it says so (§1.2).
  James: "why not just use compartments for modules? That's fucking stupid. It's already a primitive." · "Yeah, the component can be." ·
  "it's supposed to be the component registry. Look at CIE-EG." The first cut kept a hand-written `pillar/registry.eg`; it is removed, a
  duplicate of what Emerge's registry already holds.
- `pillar/cli.eg`: `eg run pillar/cli.eg version|registry|contracts|contract <id>|check <c> <impl>|identity_of <c> <file>|conform`; each command sends to the hook of its name. An unknown command is refused and
  the commands are listed.
- `pillar/test/pillar.test.eg`: 4 tests, `eg test` (4 passed, 0 failed), one of them a wrong payload refused at the seam.
- `lib/nexus-self/systems.js`: `pillar` owns `pillar/` (entry null, port null).
- `tests/modules/test-pillar.test.js` PI-01..05, 5/5, registered in run-all. PI-02 checks Pillar's record and that every in hook
  has a command, and every command sends to a hook. A planted hook with no command failed it.

## Found
- An Emerge module is not a map (`has` and `keys` refuse it). A component lists itself: `Pillar.hooks` and `components()`. Whether every
  module should become a compartment is his, open.
- `emerge check` on a library component warns that its in hooks are never fed (5 warnings). Its users feed them; the check reads one file.
- Emerge has no if-expression, `!` or `||`. Use `not` and `or`.

## Drift, said
- PIL1's phase graph was written after its code, not before. The graphs for PIL2–PIL6 exist now, ahead of their code.
- The 12 tests that read the systems table give the same results before and after adding pillar. Four were already failing on main
  (test-loom-phasemap, test-nexus-atlas-refs, test-readme-generate, test-registry-draft).

## Next, bottom-up
PIL2 needs Emerge's `contract { … }` block (CIE-EG MOD-CONTRACT, D7) and schema (MOD-STORE, D8) built into the language first.
