# 0.60.155 — 2026-10-18

James: "okay lets finish the gating, or next steps. look at all of the phases that mention gates." · then: "need to get them
done bottom up. really need it all working."

75 phases that are not done name a gate, across 20 maps. Each was checked against the source, not its status line. The census
and the order are in `docs/2026-10-18-gating-census-phasemap.spec`. Bottom up starts with the record itself, because a status
that lies sends the build to the wrong place.

## Layer 0: the record tells the truth

- **A scanner defect, fixed.** loom's phasemap scanner never read the status of a phase written inline, such as
  `PE3: {status: BUILT-0.60.75, …}`. Six built phases read as pending: PE1–PE4, MB1 and MB5. The fix is one condition in
  `loom/scanners/phasemap-map.js`, and test PM-INLINE in `tests/modules/test-loom-phasemap.js` covers it.
- **Stale statuses, corrected in their own maps.** The old text is kept as "Was: …".

  | Phase | Corrected to | Evidence |
  |---|---|---|
  | AM6 | BUILT | `contract-intake.js` §AM6-CLOSED |
  | RQ24 | folded into GT1 and GS1 | its leftovers are carried by layer 2 |
  | CX0 | superseded by CX1 | |
  | PF0 | folded into ID1 | |

- **Ids that collide across maps.** CHANGELOG hits for RD0/RD1, CS1, CT2 and SF2–SF4 belong to other maps' phases with the same
  id. The phases in these maps are not built. An id is unique only inside its map.

## One of each, where several maps mapped the same thing

- **The gate record:** GM1 = GW3's open half = GW27 = TL2/TL3. It is built over the contract ledger.
- **The rewind:** TL4 = GW7's rewind = CV3 = DBG5 = DP7.
- **The precommit gate:** V9 = S3 = B4 = RF2, built in `promoteTested`.
- **The context:** GM5 = GW24 = CX1 = GA1 = B3.
- **The listener:** SF4 = GW10 = GM5's StreamLog.

## Decided by his axioms (D15–D23)

Under his rule "come to me for problems, else use the axioms", nine questions were waiting on a yes to a technical
recommendation: GW0b, GW0c, GW0e, GW0f, GW0g, GW0h, GW0i, TL0a and TL0b. They are decided by his axioms, with the axiom each one
rests on, in `docs/2026-10-17-decisions-by-the-axioms.spec` addendum (c). Their maps now read DECIDED, and he can overturn any one
of them.

## Still his

- **GM0a:** what "the precommit compartment" is. It blocks GM1, and through it five more phases.
- **GW0d:** his failing log.
- **D10 vs D13.**
- **His live runs.**

## The order

- **L0:** the record. Done.
- **L1:** primitives that need no decision. These are the GM5 context stream, the GM4 node lattice, LM0 stable wire ids, GW5
  tool parity, the QA1 runners and RAID's own contract and commands.
- **L2:** one of each: the timeline and the rewind, the precommit gate, the sandbox door and what stands on it.
- **L3:** the gate record and what needs it, which waits on GM0a.
- **L4:** the rest.

## Proof

- Test PM-INLINE passes, and `test-loom-phasemap` is 8/8.
- The census map is registered in `docs/SPEC-REGISTRY.spec`.
