# Self-awareness — made in the spec workshop (idearium)
# Written 2026-10-10 from docs/2026-10-10-self-awareness-phasemap.spec AW0–AW5 and docs/2026-10-10-shape-of-nexus-phasemap.spec
# EP1 EP2. To be opened in the workshop (nexus/intelligence → intelligence/spec) and built through Idearium. Decisions as
# choices [A] [B] [C] [custom], recommendation marked; "chosen:" open until James picks. Nothing here is built yet.
spec:
  name: Self-awareness
  ambition: 4 — novel
  source: "maps: self-awareness AW0–AW5 · shape-of-nexus EP1 EP2 · parents: sovereign-node P19–P22"
  owner: intelligence (cfr graph, field, lattice, rfr2) · cortex (memory, the catalog) · guardian (its own nodes) · copilot (the door reads the lattice)
  status: specced 2026-10-10, not built
  james: >-
    "look at the causal graph. also the data nodes arent a reflection of guardian. which means there is blind spots" ·
    "also connecting it to the associative lattice" · "maybe like epistomology, and using the cos as empirical"
sections:
  - id: purpose
    title: Purpose
    body: |
      Nexus knows what it is doing, why, and how it knows — with no guessed causes. Guardian's live state is visible as
      nodes, every cross-system call says who asked, the field learns from the whole job lifecycle, routing reads the
      relationships that are turbulent, and every claim shown says how it is known; a claim becomes verified only by an
      experiment in COS.

      Evidence (2026-10-10): the causal graph links events 2 s apart as causes (observed treated as causal); guardian's
      jobs, tabs and agents are not nodes (only provider and response); idearium → copilot → guardian calls carry no
      causedBy, so the lattice never forms those pairs; the field's nudge table does not know accepted, pickup failure,
      cancelled, economy hold or needs-you. RFR2 already types edges (explicit, rule, adapter, observational).

  - id: primitives
    title: Primitives
    body: |
      edge kind     (rule)    explicit (causedBy) · rule · adapter (a lifecycle pair) · observed — only the first three are walked for root cause
      live node     (thing)   .job (gates, attempts, who asked) · .tab (provider, account, chat, heartbeat) · .agent (SD4)
      causedBy      (thing)   carried on every cross-system call and onto the ledgers it writes
      nudge         (rule)    per event type: how it moves resonance / friction on its pair; declared beside the event's taxonomy entry
      claim status  (rule)    stated · derived · proposed · observed · verified — with its evidence (EP1)
      experiment    (action)  a COS compartment + a workload + a measurement (rfr2 delta/sigma) + a verdict (EP2)

  - id: axioms
    title: Axioms
    body: |
      AX1  No guessed causes: an observed edge is drawn, never walked for root cause (AW0).
      AX2  Each system writes its own nodes; awareness reads them, never writes another system's state.
      AX3  A new event cannot be added without its nudge (the taxonomy check fails).
      AX4  The lattice informs routing order; it never decides alone, and the reason is said on the hop (AW4).
      AX5  Nothing is "done" or "true" without saying how it is known (EP1); "verified" only through an experiment (EP2).

  - id: build_order
    title: Build order
    body: |
      1 AW0 edge kinds in the causal graph   2 AW2 causedBy on every cross-system call   3 AW1 guardian's live nodes
      4 AW3 nudges for the whole lifecycle   5 AW4 the door reads the lattice   6 AW5 a node's face in the UI
      7 EP1 one claim status everywhere   8 EP2 experiments in COS (needs the torture chamber's runner, cos/spec/torture-chamber.spec)

      choices — the claim status vocabulary:
        [A] five: stated · derived · proposed · observed · verified  ← recommended (covers RFR2's kinds, the spec relations, loom's declared/served, the roadmap)
        [B] three: claimed · inferred · verified — simpler, loses "proposed" (an agent's suggestion awaiting yes)
        [C] keep each system's own words, map them in one table
        [custom] ____
      chosen: open

  - id: tests
    title: Tests
    body: |
      T1 two unrelated jobs 1 s apart are not each other's cause; a job's error still walks to the prompt that made it
      T2 after one repo-agent message the lattice has a copilot→guardian edge moved by that job, its node naming the Idearium run
      T3 with a job running, guardian's node registry lists the job, its tab and its agent
      T4 an event with no nudge fails the taxonomy check
      T5 with chatgpt's pair turbulent, auto tries the next agent first and says why
      T6 the claim "a 60 s pickup window loses no real jobs" comes back verified or refuted from an experiment over recorded jobs
