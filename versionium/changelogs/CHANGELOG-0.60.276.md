# 0.60.276 — sovereignty in the axioms (§5.15); read the axioms first, every session

James, 2026-10-29: "Remember sovereignty. Add that to the axioms and then add it to the claude.md to read the axioms in the docs"

## The axioms (`docs/AXIOMS-v3.1.md`)
- **§5.15 Sovereignty Is Kept, Not Just Declared**, in Group 5C beside §5.9 "Every system is sovereign". It has four rules:
  1. **One owner per kind of data.** The owner is its only writer and its canonical reader; the others go through its contract, never its
     files, tables or folders.
  2. **Placement is ownership.** A thing in a system's folder belongs to that system, which must serve it.
  3. **One system's outage breaks no other.** If it would, the piece is in the wrong place, and it moves.
  4. **Checked at every placement.** The owner and the way in are named before code is written.
- **Where it comes from.**
  - His words: "rememeber each system is sovereign" (2026-10-25) and "Remember sovereignty" (2026-10-29).
  - From the handoffs: the 2026-09-19 handoff's rule from him that if cortex going down breaks something, it gets moved; and the
    2026-09-23 handoff's "each system owns writing/storing its own data".
  - The wording of rules 1 and 3 is the coder's, and the law says so.
- A dated addendum at the top says what changed and why. One quick-reference line was added. Checked by script: 101 laws in the body and
  101 quick-reference lines, matching both ways.

## CLAUDE.md
- The root `CLAUDE.md` now opens with **"Read the axioms first, every session: docs/AXIOMS-v3.1.md"**: at least Part IV, and Group 5C in
  full.
- `docs/CLAUDE.md` has a dated addendum saying how, with sovereignty checked at every placement.

## The first check under it
0.60.274 breaks §5.15. lib reads `versionium/changelogs/` directly, in six readers, and Idearium reads it through lib. Asking Versionium
over HTTP instead would break rule 3: the release checks would fail whenever Versionium is down. That conflict is his to settle. Both ways
out are in `docs/2026-10-07-versionium-releases-phasemap.spec`:
- (a) the release logic moves into Versionium;
- (b) the files go back to a place Nexus's root owns, and Versionium keeps the release records it already keeps. This is the coder's
  recommendation.

Nothing has moved yet.

## Proof
- Script check: §-laws in the body against Part IV, 101/101 both ways.
- test-nexus-atlas-and-glass 10/10 and test-b1-synthesize-contract 13/13. Both read the axioms file.
