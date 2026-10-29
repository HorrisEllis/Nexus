# 0.60.289 — the Fiverr dependency graph; each system and what it needs to code; his wiring rule, measured

James, 2026-10-29:
> "Also, make a dependency graph for the fiverr gigs."
>
> "Maybe make a full document of each system and what it needs to get nexus coding."
>
> "Each component needs to be wired to the module component, and ui"

## The Fiverr graph — `docs/2026-10-29-fiverr-income-phasemap.spec`

Built his way: from the end state (money for a delivered order) back to the roots. It has 15 nodes, and `lib/phase-dag.js` finds no
dangling name and no cycle. Each node is one of three kinds:
- **DONE:** built and passing its tests here;
- **OPEN:** not built, or not true yet;
- **his:** publish, the human check, talking to a buyer.

Nothing in it is PROVEN on his PC yet.

What the forward check found:
- His profile (FI2) and gig drafting (FI5) are not on the shortest path, because the 12 gig files already feed the Fill menu.
- Every path to money waits on two roots: FI0 (Nexus runs on his PC) and FI3 (he passes Press & Hold).

## Each system — `docs/NEXUS-SYSTEMS-FOR-CODING.md`, measured by `scripts/systems-report.js`

For each system:
- the measurements: wired, Loom component, Loom wires, spec module, screen or command, tested, open phases;
- its part in the coding loop;
- what it needs, in his order.

The order: Nexus on his PC, then Fiverr live, then the coding loop end to end, then the rest.

## His rule, measured

| What | Measured |
|---|---|
| Loom components | 80–100% of files registered |
| spec modules owning files | 0–36% (this is the gap) |
| Idearium's 484 routes | 383 with a screen, 158 with a command, 68 with neither |

The rule is now in `docs/CLAUDE.md`: held forward on new work, closed backward with the Finish tool, starting with the loop's systems.

## Fixed

`changelog.test.js` had been red since 0.60.209. That release moved the snapshot path to `lib/data-home.js`, and the test's fixture
still rewrote the old line, so the copied file required a lib that wasn't there. Both line shapes are now rewritten. The test passes 5/5.
