# 0.60.304 — Emerge is the Emerge repo; the compound build; Emerge's IDE in Idearium's work area

James, 2026-10-30:
> "yes, spec compiler. and chunking can be automatic. each line can be fed back in to the previous gate, and the next line can be built by another agent. making it compount, barely any context, what about integrating the worksurface/workarea? from idearium, the diffs? like a fully built ide that emerge has built already."

## Recorded (`docs/2026-10-24-emerge-warp-system-phasemap.spec`)
- **EW_D2, his: Nexus uses Emerge, the spec compiler included, at a pinned version.** `lib/emerge/` is an older copy (21 files differ, 22 exist only in Emerge). It is archived when the switch is built. That "yes, spec compiler" answers this question is a reading, to confirm.
- **EW_D3, his: the compound build.** Each unit is fed back to the gate before it. The next unit is written by another agent, and each holds barely any context.
  - **It stands on:** Emerge's chunk format, its T2 gate, his gate walker, CIE-EG's gate and RULE D.
  - **The coder's shaping, to confirm:**
    - The unit is one statement Emerge's checker accepts in place, because half a line can't be checked.
    - An accepted statement is hashed and reused when the same slot comes up again. That is what makes it compound.
    - It is measured with Emerge's `bench/` before it is adopted.
- **EW4, re-read.** Emerge's own IDE (`lang/ide.js`, `emerge-ide.js`) is the IDE.
  - Idearium's work area hosts it by route; it isn't copied in.
  - The work surface beside it shows each statement live as its gate accepts it: which agent wrote it, the checker's verdict, and the rejected attempts.

Record only. Nothing is built.
