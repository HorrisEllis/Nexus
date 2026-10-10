# Each system's architecture — made in the spec workshop (idearium)
# Written 2026-10-10 from docs/architecture-spec/architecture-spec.spec THE_STACK (0.11.0) and its "found against the tree"
# count, docs/atlases/ (17 system atlases, generated 2026-10-05), loom, and the RAID one-engine map. To be opened in the
# workshop (nexus/core → docs) and built through Idearium. Decisions as choices [A] [B] [C] [custom], recommendation
# marked; "chosen:" open until he picks.
spec:
  name: Each system's architecture
  ambition: 3 — outside the box
  source: "docs/architecture-spec/architecture-spec.spec THE_STACK · docs/atlases/* · docs/2026-09-11-sovereign-node-architecture-phasemap.spec · docs/2026-10-09-one-model-engine-phasemap.spec"
  owner: core (architecture-spec, the fitness check) · loom (the graph it reads) · every system (its own layers)
  status: specced 2026-10-10, not built
  james: >-
    "do the loom engine, raid stuff. like we need to architecture for each system, i feel like that would help it. what
    do you think?" · "im saying all systems are supposed to be like guardian with the nodes."
sections:
  - id: purpose
    title: Purpose
    body: |
      Make each system's architecture a measured fact, not a document that drifts: for every system, which layers of
      THE_STACK it has, which it lacks, and the one next step — generated from the tree, checked on every run.

      Evidence: the architecture already exists as a target (THE_STACK, seven layers) and as a hand count (2026-10-10:
      interaction contract 15/16, event taxonomy 8/16, component registry 12/16, a running node registry 1/16 — only
      guardian; cortex's store holds other systems' tables). Seventeen atlases describe each system but do not measure it
      against THE_STACK. Writing seventeen new architecture documents would add a third description; this adds a check.

  - id: primitives
    title: Primitives
    body: |
      layer        (rule)     one of THE_STACK's seven: ui · contract · component registry · event bus · event ledger · node registry · own store
      evidence     (rule)     how a layer is known present: a file (interaction-contract.json), a running thing (GET /nodes answers), a count (tables in its own store)
      conformance  (thing)    system × layer → present | partial | missing, with its evidence and the date
      step         (thing)    the one next move for a system (the lowest missing layer), linked to the phase that owns it
      fitness check (action)  a test that recomputes the table and fails when a system loses a layer it had (a ratchet)

  - id: axioms
    title: Axioms
    body: |
      AX1  Measured, not declared: a layer is present only with evidence from the tree or a running service.
      AX2  A ratchet: losing a layer fails the check; gaining one is recorded. Nothing forces every system to move at once.
      AX3  One description per system: the table is a section of that system's atlas, generated, not a new document.
      AX4  Each system's data is its own (NODE_SYSTEM): a table in cortex's store that belongs to another system is counted as that system's "own store: partial".

  - id: schema
    title: Schema
    body: |
      lib/architecture-fitness.js    computes the table (reads the tree, the ports block, each running system's /nodes)
      docs/atlases/<system>-atlas.md + "## Architecture (generated)" section — the system's row with evidence and its next step
      contracts/architecture-baseline.json   the ratchet's baseline (like contracts/event-contract-baseline.json)

  - id: loom_and_raid
    title: Loom and RAID
    body: |
      Loom: its registry rebuild has ended "STILL UNRESOLVED: 114" for many releases — it keeps a second registry and
      reports the same gap each time. RAID: the one-model-engine map counts 8 choosers, 7 learners and 3 drainers
      (docs/2026-10-09-one-model-engine-phasemap.spec ME0–ME15, open).

      choices — loom's future:
        [A] loom becomes checks over one computed graph (the require/HTTP graph it already scans), its registry a cache  ← recommended (removes a second source of truth; the 114 becomes a list of real defects to close or accept)
        [B] keep loom as the registry and close the 114 by hand
        [C] retire loom's registry; the fitness check and the code graph are enough
        [custom] ____
      chosen: open

      choices — RAID:
        [A] build ME0–ME3 (inventory proved, one failure list, caller policy, one engine one budget) right after a real agent builds a phase  ← recommended (it decides which agent a real build goes to)
        [B] start now, before the real run
        [C] leave routing as is until the torture chamber can measure agents (SN4)
        [custom] ____
      chosen: open

  - id: one_home
    title: One home for every concept (SH1)
    body: |
      The same concept lives in two or three places — evidence from this week: three branch mechanisms, three palettes,
      two sigma and two delta (CFR and RFR2), two configs (idearium's and env vars), loom's wires and the computed graph,
      browser.js and browser.html. docs/one-home.yaml names each concept's single home and its archived alternatives; the
      fitness check fails when a second implementation of a listed concept appears (a second chunker, a second router).

      choices — how the duplicates found so far are resolved:
        [A] one at a time, each behind its own phase (SN0 for branching, DS0 for palettes, ME for routing)  ← recommended
        [B] list them all now, resolve later; the check only stops new ones
        [custom] ____
      chosen: open

  - id: build_order
    title: Build order
    body: |
      1  AF1  lib/architecture-fitness.js: the table from the tree (contract, taxonomy, registry, nodes dir, own-store tables)
      2  AF2  live evidence: each running system's node registry answers (guardian today)
      3  AF3  the atlas section generated; the ratchet test with its baseline
      4  AF4  loom's 114 listed as defects in the same report (the choice above decides what happens to them)
      5  then the sovereign-node phases (P2–P6, P8, P13, P19–P22, P33–P37) move systems up the table, one system at a time

      choices — which system climbs first:
        [A] idearium — it is the one being made solid, and most of the clump in cortex is its tables  ← recommended
        [B] copilot — the door every agent call takes
        [C] cortex — untangle the clump at its source
        [custom] ____
      chosen: open

  - id: tests
    title: Tests
    body: |
      T1  the table for guardian shows a running node registry (evidence: GET /nodes); for eravos, no interaction contract
      T2  deleting a system's event-taxonomy.js in a branch fails the ratchet, naming the system and the layer
      T3  every atlas has a generated Architecture section that matches the table
      T4  idearium tables in cortex's store are counted as idearium's own store: partial
