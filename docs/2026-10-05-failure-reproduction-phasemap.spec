spec:
  meta:
    name:     failure-reproduction
    version:  1.0.0
    date:     2026-10-05
    release:  0.39.345 (base)
    uuid:     nexus-failure-reproduction-phasemap-v1-0000-2026-1005-jamesbrooks-001
    owner:    lib (ledgers) · intelligence (rfr2, cfr) · diagnostic (the debug system) · cos (the compartment it runs in) · idearium (the Debug tab)
    status:   "MAPPED 2026-10-05, before building"
    voice: >
      The ideas, the direction and the calls are James's. Each phase's `james:` is his, verbatim. `does:` is the coder's
      reading, his to correct. `pushback:` is where the coder thinks the plan as said has a hole — his to decide.
    axioms:   docs/AXIOMS-v3.1.md — §3.3 map before build, §8.6 reuse before build, §1.1 nothing pretends, §1.2 nothing
              silently fails, §0.3 nothing lost.
    origin: >
      James, 2026-10-05: "thats how i want failure mode reports, like creating a macro to reproduce the bug and be able to
      run it cos. what do you think?" · "using the event ledgers, debug system, and intelligence system. interaction
      contracts. each system has a full event ledger. like tracking each event in the system, using rfr2"
    overlaps: >-
      docs/2026-10-02-emerge-field-memory-build-phasemap.spec CF1 (CFR improved with RFR2: typed edges at ingestion, the
      contract verifier reads typed edges); EM2 (WARP 2's causal ledger); docs/2026-10-05-spec-workshop-rebuild-phasemap.spec
      RS1/RS2 (the macro, replay); docs/2026-10-05-announce-pulse-repair-phasemap.spec PR5 (a repair proven by replay).

  found:
    - >-
      Every system already writes a full event ledger: lib/component-ledger.js — data/ledger/{system}/{component}/{day}.jsonl,
      mirrored into JAA (component_ledger), every row with causedBy when its writer knows it; lib/ledger-fanin fans every
      write out to consumers (activity-log, intelligence).
    - >-
      rfr2 is built and nearly unconsumed: intelligence/rfr2/kernel (createKernel · ingest: typed causal edges at
      ingestion, ring buffer, content hash), /causality (causal/explicit · rule · adapter · observational — the last never
      walked for a root cause), /clip (snapshotRange: a bounded causal slice with its entry and exit events and an
      embedded snapshot; restoreClip; a stability profile). One bridge (lib/rfr2-bridge.js) reaches it.
    - >-
      Every system has an interaction contract (EV0: events and routes, held to the code); CF1 maps the contract verifier
      (structural, behavioral, temporal) onto typed edges. The diagnostic raises gaps; the repo's Debug tab shows them.

  pushback:
    - >-
      A row without causedBy is observational: rfr2 will not walk it for a root cause (rule C-1), so a failure in code
      that does not pass causedBy gets a macro with a named hole, not an invented chain. Coverage grows as writers pass it.
    - >-
      Replaying events INTO a system needs an entry point that accepts them — each system a replay route (and the genesis
      skeleton gets one, so every new system has it). Without it, a macro can be read but not run.
    - >-
      The ring buffer forgets: the on-disk ledger is the record; rfr2 indexes it and cuts the clip from the disk, so a
      failure found late can still be reproduced.
    - >-
      A failure that depends on his machine (Windows, the host's QEMU — today's stuck setup) will not reproduce in a Linux
      compartment; the report names the environment it failed in and says when replay could not reproduce it.
    - >-
      Recordings hold real data: secrets (config keys marked secret, tokens) are masked when the macro is cut.

  phases:
    FM1_every_ledger_into_rfr2:
      layer: library
      status: OPEN
      james: '"each system has a full event ledger. like tracking each event in the system, using rfr2"'
      depends_on: []
      files: [lib/ledger-fanin/, intelligence/rfr2/kernel/index.js, intelligence/rfr2/causality/index.js, lib/rfr2-bridge.js]
      does: >-
        One rfr2 kernel per system fed from lib/ledger-fanin: every ledger row ingested with its edge typed at ingestion —
        causedBy → causal/explicit; a step the system's interaction contract declares follows another → causal/rule;
        anything else → observational. The on-disk ledger stays the record; rfr2 is its causal index.
      proof: "a fixture system's rows land in its kernel with the right edge types; a row without causedBy is observational and never in a traced root path"

    FM2_a_failure_is_a_clip:
      layer: library
      status: OPEN
      james: '"creating a macro to reproduce the bug"'
      depends_on: [FM1_every_ledger_into_rfr2]
      files: [intelligence/rfr2/clip/index.js, lib/failure-macro.js, intelligence/cfr/contract-verifier.js]
      does: >-
        A failure — a gap, a contract violation (the verifier), an error row, a broken expectation — becomes a
        reproduction macro: walk back to its root over causal edges, cut the clip from the disk ledger (entry events,
        exit events, what entered from outside: inputs, model outputs, time, the seed), attach the Versionium snapshot
        of the code it ran on, mask secrets. Holes in the chain are named.
      proof: "a fixture failure becomes a macro naming its root, its events and its snapshot; a secret in a row is masked; a missing causedBy is a named hole"

    FM3_run_it_in_cos:
      layer: api
      status: OPEN
      james: '"and be able to run it cos."'
      depends_on: [FM2_a_failure_is_a_clip]
      files: [lib/failure-macro.js, cos/testenv/index.js, lib/shadow-space.js]
      does: >-
        A macro runs in a COS compartment at its snapshot's code: the events replayed into the system through its replay
        route; the failure recurs (reproduced) or does not (said, with what differed). A fix is proven in the shadow space
        by the same macro no longer failing; the macro is kept as a regression test.
      proof: "a fixture macro reproduces its failure in a compartment; with the fix it passes; the macro is in the tests"

    FM4_the_report:
      layer: ui
      status: OPEN
      james: '"thats how i want failure mode reports"'
      depends_on: [FM3_run_it_in_cos]
      files: [idearium/ui/js/app.js, diagnostic/nexus-diagnostic.js, intelligence/index.js]
      does: >-
        A failure mode report in the Debug tab: what failed, its causal chain to the root (from the contracts and the
        ledgers), the systems it crossed, the environment, the macro — with "reproduce in COS" and "prove a fix". The
        intelligence system reads the reports (patterns across failures, CFR); the diagnostic's repair (PR5) is proven
        by the macro.
      proof: "driven in Clear Glass: a report shows the chain and its macro; reproduce runs it in a compartment and says reproduced or not"
