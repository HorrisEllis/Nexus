# docs/2026-11-07-phases-are-ideas-phasemap.spec — the phase cleaning: an open phase outside the focus is an idea, kept and owing nothing;
# what can give proof is kept and logged as proof. His pending call of 2026-11-03 ("we also need to clean the phases at some point"), made today.
# The calls are James's (quoted); the measure, the mechanism and the cut are the coder's, by his axioms.

origin: >-
  James, 2026-11-07, shown that 1,522 phases were open: "Look at the phases. Those are all top of my head ideas" · then, offered the cleaning
  (an idea owes nothing; a phase is work picked up; one spec per idea, not one map per time it was said; the door's maps first): "Yes. Anything
  that can give proof needs to be archived and logged in the proof of compentency". Before it, the same day: "All of what I say to you is what's
  immediately on my mind. Emerges" · "I've always done that. Since the beginning." And on 2026-11-03: "Okay we also need to clean the phases at
  some point."

measured_2026_11_07:
  # lib/phasemap-parse.js over every docs/*-phasemap.spec, not from memory
  - "2,756 phases: 1,160 done (102 of them closed as superseded 51, folded 43, done-elsewhere 4, retracted 2, retired 2); 555 already shelved by
     the 2026-10-09 declutter (his: \"we also need to declutter the roadmap.\"); 1,041 open and not shelved."
  - "The ledger (idearium/spec-engine/phase-ledger.cjs) said 1,522 open: it counts the shelf as open, because lib/phase-dag.js does not carry the
     parser's shelf flag through. A misreport, found here; PIC2."
  - "The door, under ten names: 24 maps from 2026-08-30 to 2026-11-05 hold the idea he first said on 2026-07-09 (Q0004: \"no hardwiring. I need
     to be able to remove any system and swap in another. They use the API and the orchestrator as a hub for each connection.\"). Ten of them hold
     147 open, unshelved phases; none is a dependency of any phase in the focus (CIE, the field, WARP 2, Pillar, ERAVOS, Fiverr's gated flows)."

decisions:
  PIC_D0_an_idea_owes_nothing:
    status: "DECIDED 2026-11-07 (his)"
    james: '"Look at the phases. Those are all top of my head ideas" · "Yes."'
    chosen: >-
      Two kinds of entry. An idea is what he said, quoted and dated, and owes nothing. A phase is work picked up. Every open phase outside the
      focus is an idea: shelved, never deleted, its words and its map kept (§0.3). An idea becomes a phase again when it is picked up, by his
      process (T8): end-state conditions, then the spec from them, then the primitives and their chunks, each with a contract. One spec per idea,
      not one map per time it was said.

  PIC_D1_proof_is_kept_and_logged:
    status: "DECIDED 2026-11-07 (his); a reading to confirm"
    james: '"Anything that can give proof needs to be archived and logged in the proof of compentency"'
    chosen: >-
      What can give proof is what runs: a built phase with a test that passes today. It is kept (the map stays where it is, with its built
      phases), and the run is logged: the tests, their counts, the date, in docs/PROOF-OF-COMPETENCY.md, one entry per idea with its numbers (the
      0.60.287 rule: fewer, stronger entries, nothing a stranger cannot run). A built phase whose test fails today is said, not hidden.
    reading_to_confirm: >-
      "archived" read as kept where it is, shelved and recorded, not moved to _archive/: lib/phase-dag.js reads only docs/*-phasemap.spec, so a
      moved map would leave every phase that depends on it dangling. To confirm.

  PIC_D3_no_central_door:
    status: "DECIDED 2026-11-07 (his)"
    james: '"Each system is sovereign. Each is responsible for their own door"'
    context: >-
      Said after the coder had written "the door spec" and "the one door spec" (here, in T8, in the shelved phases' tag), as if one spec built
      every system's door. Corrected: there is no central door. Each system writes, owns and serves its own door; what is shared is only
      genesis's template and the entry schema (his PL_D9, 2026-11-03: "The door's code lives inside each system (from genesis's template), only
      the entry schema shared"). The shelved phases' tag retagged the same day.
    by_the_axioms: "§5.9, §5.15, §5.16"

  PIC_D2_the_shelf_not_a_new_status:
    status: "DECIDED 2026-11-07 by his axioms (§8.6 reuse before build, §0.3)"
    chosen: >-
      The shelf his 2026-10-09 declutter built (lib/phasemap-parse.js): a map's meta line `roadmap: later — why` shelves every phase not done; a
      phase's own status starting LATER shelves that phase. Reversible, one line; the phase's old status kept beside it. No new status.

phases:
  PIC0_the_door_maps:
    status: "BUILT 2026-11-07 — 143 phases shelved in 10 maps (the parser counted 147: 4 drawbridge entries are artifacts, not phases); 65 tests run, 56 pass; docs/cleaning/2026-11-07-the-door.md"
    depends_on: [PIC_D0_an_idea_owes_nothing, PIC_D1_proof_is_kept_and_logged, PIC_D2_the_shelf_not_a_new_status]
    files: [docs/2026-09-11-sovereign-node-architecture-phasemap.spec, docs/2026-10-12-request-spine-phasemap.spec, docs/2026-10-13-nexus-memory-gates-and-contract-phasemap.spec,
            docs/2026-10-15-one-contract-raid-releases-phasemap.spec, docs/2026-10-17-system-drawbridge-phasemap.spec, docs/2026-10-19-infrastructure-spine-phasemap.spec,
            docs/2026-10-23-cos-spine-phasemap.spec, docs/2026-10-24-sovereign-systems-phasemap.spec, docs/2026-10-31-system-doors-phasemap.spec,
            docs/2026-11-05-sovereignty-phasemap.spec, docs/cleaning/2026-11-07-the-door.md, docs/PROOF-OF-COMPETENCY.md]
    requires: [node]
    prerequisites: []
    does: >-
      The ten door maps with open phases (each holds one of the door's four parts, T8: register, contract, gate, ledger): their 143 open phases
      shelved as ideas pointing at T8, each picked up by the system that owns it (his, 2026-11-07: "Each system is sovereign. Each is responsible for their own door"); the built phases of all 24 door maps matched to the tests
      that cite them, the tests run, the result written in docs/cleaning/2026-11-07-the-door.md and, where it holds, in the proof doc.
    proof: "the parser counts 0 open unshelved phases in the ten maps; every phase that was open there is on the shelf with its old status kept; the DAG check finds nothing new dangling"

  PIC1_the_rest:
    status: OPEN
    depends_on: [PIC0_the_door_maps]
    files: [docs/*-phasemap.spec, docs/cleaning/]
    requires: [node]
    prerequisites: ["PIC0 seen by him; the idea groups after the door named with him"]
    does: "the other 894 open, unshelved phases, an idea at a time (the same idea under many names grouped first), the same way as PIC0"
    proof: "open unshelved phases outside the focus: 0; the focus's phases untouched"

  PIC2_the_ledger_counts_the_shelf:
    status: OPEN
    depends_on: [PIC_D2_the_shelf_not_a_new_status]
    files: [lib/phase-dag.js, idearium/spec-engine/phase-ledger.cjs, tests/modules/test-phase-ledger.test.js]
    requires: [node]
    prerequisites: ["his word on §17.13: these two files are JavaScript and Emerge cannot read YAML yet (CIE8's prerequisite), so the fix is a few lines of the existing JS or waits"]
    does: "the DAG carries the parser's shelf flag; the ledger counts done, shelved and open apart (today it reports 1,522 open where 1,041 are)"
    proof: "phases ledger reports the parser's three numbers; a planted shelf line moves a phase from open to shelved"
