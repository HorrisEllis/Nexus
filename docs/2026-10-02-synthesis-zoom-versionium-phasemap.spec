spec:
  meta:
    name:     synthesis-zoom-versionium
    version:  1.0.0
    date:     2026-10-02
    release:  0.39.300
    uuid:     nexus-synthesis-zoom-versionium-phasemap-v1-0000-2026-1002-jamesbrooks-001
    owner:    intelligence · idearium · versionium · docs
    status:   "BUILT 0.39.300 (mapped 2026-10-02 before building)"
    axioms:   docs/AXIOMS-v3.1.md — §3.3 map before build, §1.2 nothing silently fails, §8.6 reuse before build, §0.3 nothing
              lost, §16.1 close the nearest gap, §16.5 one canvas one truth, §5.9 every system sovereign.
    origin: >
      James, 2026-10-02 (after 0.39.299): "make sure its enterprise grade, beautiful. need increments of zoom. like each
      system is a node, which zooming in has the components as nodes. also can you debug versionium. i need this all to
      be able to code what i need, expand it and make sure it all interconnects. find spec workshop. synthesize as much
      gaps as possible, and fill the highest amount of leverage first. and then we need to add that to the intelligence
      system . like synthesis needs to be expanded, immensly"

  found:   # read and run, not assumed
    - >-
      VERSIONIUM ITSELF IS HEALTHY: started alone on its own data, /health answers in 1–4 ms; commit, history, branches,
      files, calendar, state and restore answer correctly (6 suites green: sovereign 11, repo-history 7, migration 10,
      snapshot-migration 8, split-brain 5, versionium tab 32).
    - >-
      WHAT BREAKS IS EVERYONE ELSE'S VIEW OF IT. idearium/index.js snapshots() / snapshot() / diffSnapshots() /
      commitSnapshot() / restoreSnapshot() check `rows?.error` — their comments say a failure is "reported as 502, not
      swallowed" — but lib/nexus-client.js THROWS on an unreachable system and on every non-2xx. So with versionium down,
      GET /api/snapshots (called on every idearium page load) is an unhandled 500 ("[API] Unhandled error … versionium
      unreachable"), and a snapshot that does not exist is a 500, not a 404. Reproduced in Chromium.
    - >-
      versionium/server.js logs "orchestrator /cfr/field unreachable" every 3 s, forever, while the orchestrator is down
      (counted: 5 lines in 15 s); a second versionium on a taken port dies with a raw EADDRINUSE stack, not a sentence.
    - >-
      THE SPEC WORKSHOP IS NOT WHERE YOU LOOK FOR IT: Build ▾ lists the retired "Spec Builder" (spec-wizard, to be retired by
      UI12) and no workshop; the workshop is only under Create ▾ and Welcome. Build ▾ › Architect is a "nest" view —
      _syncNestScope sends you back to Repos when no repo is open, so the pipeline's Architect cannot be reached
      outside a repo. The three stations (Void → Workshop → Architect) are never listed together.
    - >-
      NOTHING SYNTHESIZES NEXUS'S OWN GAPS. intelligence/gap (GapHunter, predicates, ledger) scores gaps in AI RESPONSES;
      liminal has domain detectors for text. The system's own gaps live in 71 phasemaps (162 OPEN statuses), the known-gap
      register (tests/known-gaps.yaml), code markers (§KNOWN GAP), loom's registry (orphans) and the idearium gap table —
      read by nobody as one set, never ranked by what fixing one unblocks.

  phases:
    VX1_versionium_degrades_not_crashes:
      layer: foundation
      status: "BUILT 0.39.300 — idearium/index.js vx adapter (a throw becomes {error, status}); snapshot routes 502/404; versionium logs an outage once and the recovery once; a taken port is a sentence and exit 1. Versionium itself was healthy (6 suites green)."
      files: [idearium/index.js, versionium/server.js]
      does: >-
        One adapter for idearium's versionium calls that turns a throw into { error } — the contract the five callers
        were written against; a missing commit is a 404. versionium: the field poll logs once when it goes down and once
        when it comes back (with how long), never every tick; a taken port is said in a sentence and the process exits 1.
      proof: "with versionium down: GET /api/snapshots is a stated 502, GET /api/snapshots/<missing> a 404; the poll logs twice across an outage"

    WS3_the_pipeline_together:
      layer: interface
      status: "BUILT 0.39.300 — Create ▾ lists THE PIPELINE (Void → Spec workshop → Architect, each its own page); Build ▾ has no Spec Builder; Architect opens without a repo; the workshop and architect IDEA stations link to the Void."
      files: [idearium/ui/index.html, idearium/ui/js/app.js]
      does: >-
        "find spec workshop … make sure it all interconnects". Create ▾ lists the three stations in pipeline order — The
        Void, Spec workshop, Architect — each its own page; Build ▾ keeps the repo's build flow and Eravos, and its
        Architect opens without a repo; the retired Spec Builder leaves Build ▾ (UI12: retire from every surface; the view
        itself stays in the file, §0.3). Welcome's pillar names the stations in order.
      proof: "Create ▾ shows Void → Workshop → Architect; Build ▾ has no Spec Builder; Build › Architect opens with no repo open"

    AZ1_semantic_zoom:
      layer: interface
      status: "BUILT 0.39.300 — arch-canvas groupLevels + layoutGrouped; SYSTEMS / COMPONENTS / DETAIL with step increments (buttons, 1·2·3, +/-), system wires summed, double-click opens a system; the repo tab groups by top-level folder."
      depends_on: [AR3_one_architect_canvas]
      files: [idearium/ui/js/arch-canvas.js, idearium/ui/css/arch-canvas.css, idearium/ui/js/app.js]
      does: >-
        "need increments of zoom. like each system is a node, which zooming in has the components as nodes." Three
        increments, each a level of the map: SYSTEMS (far — each system one node: its components, lines, what it needs
        and what needs it, wires between systems summed), COMPONENTS (each system a region, its components inside as
        titles), DETAIL (full cards). Systems are laid out bottom-up by what they need (cycles condensed, so a cycle of
        systems sits on one level); components inside each region bottom-up by layer. The zoom steps between the
        increments (buttons, keys 1·2·3, a level readout); double-click a system to open it. A repo's systems are its
        top-level folders (one folder deeper when there is only one).
      proof: "a pure two-level layout: systems by level, members inside their system's box; Chromium: far shows systems, step in shows components"

    SY1_gap_synthesis_engine:
      layer: engine
      status: "BUILT 0.39.300 — intelligence/synthesis/{sources,engine,index}.js; 579 raw gaps → 567 synthesized over 74 maps (861 phases, 360 open) in ~0.5 s."
      files: [intelligence/synthesis/index.js, intelligence/synthesis/sources.js, intelligence/synthesis/engine.js]
      does: >-
        "synthesize as much gaps as possible, and fill the highest amount of leverage first … add that to the intelligence
        system. like synthesis needs to be expanded, immensly". Intelligence gains a synthesis engine over Nexus's own gaps.
        SOURCES (each a collector, read-only): every phasemap's open phases (with depends_on), the known-gap register, code
        markers, loom's registry (orphans: components nothing wires to), the open idearium gap table, and gaps other
        systems push (POST — the Architect's gaps). OPERATORS (each pure, each its own function): normalise → cluster (the
        same gap said in several places becomes one, its sources kept) → corroborate (more independent sources, more
        weight) → chain (what fixing it unblocks, transitively, across maps) → centrality (how wired-in the files it names
        are, from loom's wires) → leverage (one score from unblocks, corroboration, centrality, kind, age) → theme (per
        system) → plan (for the top ones: the files, the phase, the proof to show). Results persisted; every run kept.
      proof: "a fixture: two maps where A blocks three phases → A ranks first; the same gap in a map and the register clusters into one with two sources"

    SY2_synthesis_surfaces:
      layer: service
      status: "BUILT 0.39.300 — /api/intelligence/synthesis, /run (POST), /ingest, /history, /fill, /themes, /gap/:id; 7 registry entries, 6 commands; the Architect pushes its gaps on save."
      depends_on: [SY1_gap_synthesis_engine]
      files: [intelligence/routes.js, intelligence/registry-components.js, intelligence/commands/]
      does: >-
        GET /api/intelligence/synthesis (the ranked gaps, themes), GET …/synthesis/gap/:id, POST …/synthesis/run, POST
        …/synthesis/ingest (another system's gaps, with its name), GET …/synthesis/history. The registry and command index
        list them.
      proof: "the routes answer on the real intelligence server; ingest adds a source the next run sees"

    LV1_fill_the_highest_leverage:
      layer: practice
      status: "BUILT 0.39.300 — the record below (filled)."
      depends_on: [SY1_gap_synthesis_engine]
      does: >-
        Run the synthesis on this tree; fill the top gaps that can be closed and proven here, in leverage order; say the
        ones that cannot (a live service, a decision of James's) and why. The run is kept in docs as the record.
      proof: "the record names each filled gap, its rank, and its proof"

  build_order: [VX1, WS3, AZ1, SY1, SY2, LV1]

  lv1_record:   # the synthesis's fill order, worked top-down; what was filled, its rank, its proof — and what was not, and why
    filled:
      - "phasemaps made machine-readable: 21 of 30 (scripts/fix-phasemap-yaml.js folds values, every word unchanged; two by hand: quotes, list dashes) — first in the fill order (cheapest, unblocks every reader); proof: the fixer's --check and the synthesis's maps.unreadable 11 → 9"
      - "N0_census (rank 1 at the start) — lib/nexstore/census.js, docs/nexstore-type-catalogue.yaml (303 shapes, 0 unclassified); tests/modules/test-nexstore-census.test.js 3/3"
      - "N1_record_and_log (rank 2 after N0) — lib/nexstore/record.js, log.js; tests/modules/test-nexstore-log.test.js 5/5 (25 SIGKILLs mid-append; every ack survives)"
      - "N2_types_and_gates (rank 1 after N1) — lib/nexstore/types.js on warp/core Axiom; tests/modules/test-nexstore-types.test.js 4/4"
      - "DT1_persistence_census (rank 2 after N2) — PARTIAL: lib/nexstore/writers.js + docs/nexstore-writers.yaml; tests/modules/test-nexstore-writers.test.js 3/3; 209 writers, 60 typed or reasoned, 149 OWED (listed; may not grow)"
    not_filled:
      - "9 phasemaps still unreadable — each breaks in its structure (prose where a key belongs, a stream separator), not in a value; repairing them means rewording or restructuring James's text, which the fixer refuses by design. Lowest leverage of the unreadable set (1.6)."
      - "DT1's 149 owed writers — each needs a decision (a node type, or a reason only the owner can give); listed, ratcheted, not guessed."
      - "N3 onward (projection, kinds, time…) — next in leverage; not started in this release."
