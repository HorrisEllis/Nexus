# 0.39.332 — 2026-10-05

_Released on branch claude/nexus-idearium-overview-yoguem as 0.39.312; main used 0.39.308–0.39.327 for other work meanwhile, so it is renumbered 0.39.332 on merging main. Comments in the code that say §0.39.312 refer to this release._

James: "make sure this is all mapped."

## Every request has a phase
`docs/2026-10-05-cli-data-code-phasemap.spec` 1.1.0 now has a **session inventory**: each of the day's 21 requests, quoted, beside the phase that holds it. Where an older map already held one, it's cited instead of mapped twice: FG1–FG6 for chunk traversal and boundaries, MR1–MR11 for memory and graphs, sovereign-node P5 for data ownership.

## What wasn't mapped, now is
- **BC3:** what a build was sent becomes a `.node`. Your call: widen `.injection`'s schema (today it's copilot's call-model shape) or add a new type.
- **BC4:** `lib/relational-context.js` is required only by its own test, and BC1 does the same upstream walk another way. One should be wired and the other archived, not deleted. The proposal: keep its token-count gate, archive the rest.
- **HG1–HG7: defects found on the way.** All of them pre-date this session's work.

| Phase | Defect |
|---|---|
| HG1 | `docs/2026-09-27-components-store-and-atlases-phasemap.spec` doesn't parse (line 24) |
| HG2 | a from-scratch loom bootstrap gives 460 rejections |
| HG3 | `test-build-verify` BV-09 fails |
| HG4 | scripts under `scripts/` escape the test sandbox unless they set the marker |
| HG5 | every bootstrap rewrites every `registeredAt`, and scanner wire ids renumber |
| HG6 | the scanner reads a "BUILT" status as pending |
| HG7 | AXIOMS §4.1 still names Playwright (your word needed) |

## The maps read correctly in loom
- **Systems declared.** Every phase of the three new maps declares `systems:` (rule E16: declared, not guessed). The guesses had been wrong: VP7 was tagged copilot and warp.
- **Value declared.** Every phase declares `value:` (score, cost, kind, why) so intelligence's synthesis can rank it (E17).
- **Statuses read correctly.** BC1, BC2 and VP7 read **done**. They said "BUILT" and the scanner only counts DONE (that gap is HG6).
- **Every phase is visible.** None was visible on any system's Phasemap tab until it named a system loom knows. `SB0_map` now declares idearium, and HG1, HG4 and HG7 name their owners.
- **Loom loads them.** `loom/scanners/phasemap-map.js` `loadAll()` reads 957 phases, these included.

Also updated: the spec registry rows (1.3.0 / 1.1.0 / 1.1.0) and one line in the idearium atlas pointing at the inventory.

Docs only; no runtime change.
