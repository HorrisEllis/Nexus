spec:
  meta:
    name:     infrastructure-migration
    version:  1.0.0
    date:     2026-10-17
    release:  "0.60.132 (mapped)"
    uuid:     nexus-infrastructure-migration-phasemap-v1-0000-2026-1017-jamesbrooks-001
    owner:    "every system · lib (the kernel) · cos (the compartments) · the specs (architecture-spec, genesis, the system template)"
    status:   "MAPPED 2026-10-17. IM1 BUILT 0.60.133; IM5 begun (nexus-healer sovereign); IM6 its tool built (lib/system-store.js). His words: 'Soon' — after the templates (0.60.132). IM0 is his to decide first."
    voice: >-
      The ideas, the direction and the calls are James's. `james:` is his, verbatim. `does:` is the coder's reading, his to
      correct. `pushback:` is where the coder thinks the plan as said has a hole — his to decide.
    origin: >-
      James, 2026-10-17: "Update the genesis template. And the system template skeleton. Then when we are done. Should work
      on the infrastructure. Soon. Migrating to what the architecture spec states. The system spec template. Clean the
      redundant files,  phase, wire what's existing, first principles nexus."
    axioms: "docs/AXIOMS-v3.1.md — §3.3 map before build, §8.6 reuse before build, §0.3 nothing lost unless redundant (archive, never delete), §1.1 nothing is real until proven, §1.2 nothing fails silently"
    target: >-
      What the architecture spec states (docs/architecture-spec/architecture-spec.spec 0.12.0: THE_STACK, NODE_SYSTEM,
      DRAWBRIDGE, SOVEREIGN_COMPARTMENT, FILES_WITH_THEIR_SYSTEM), in the shape of the system template
      (idearium/spec-engine/templates/architecture-spec.template.yaml) and genesis 1.5.0, built as the skeleton
      cos/archetype/nexus-system. Every existing system ends in that shape, in its own compartment.

  # ── First principles (the coder's reading of "first principles nexus", to confirm) ─────────────────────────
  first_principles:
    - "Measure before moving: every phase starts from a census the tree answers, never from memory (§1.1)."
    - "One owner per thing: a file lives in the system it serves; what every system uses is the kernel's; a store has one writer."
    - "The registry is the door: what a system offers is declared there, reached through its routes and CLI, and checked (the ratchet only shrinks)."
    - "Least depended-on first: a system nothing needs moves without breaking anything; the most depended-on (cortex) moves last."
    - "Nothing lost: redundant means proven redundant (no requirer, no loader by name, no test), and even then archived with the reason (§0.3)."
    - "Each step leaves Nexus running: a moved file leaves a re-export; a phase is done only when its tests and the ratchet hold."

  # ── The census, measured 2026-10-17 (0.60.131), against the template's tree ───────────────────────────────
  census:
    shape_per_system: >-
      registry-components.js / interaction-contract.json / event-taxonomy.js / config.js / compartment.json / schemas/ /
      spec/ / data/nodes / data/node-index / tests/ / cli.js — the full set: none. Closest: guardian and copilot (all but
      tests/). Missing a registry: orchestrator, diagnostic, cos, warp, sentinel. Missing an event taxonomy: idearium,
      architect, diagnostic, ollama, loom, clear-glass, nexus-healer, warp, sentinel. No system has its own tests/: every test
      lives in tests/modules.
    crossings_out_and_in: >-
      (system-to-system + lib/ upward, DB1) orchestrator 38 out/11 in · idearium 37/8 · guardian 32/16 · copilot 28/35 ·
      cortex 21/155 · intelligence 17/89 · clear-glass 14/10 · versionium 11/3 · diagnostic 10/1 · loom 8/34 · architect 6/0 ·
      ollama 6/12 · cos 5/72 · emerge 5/6 · nexus-healer 2/0 · warp 1/39 · sentinel 0/0. cortex is reached 155 times, most of
      them cortex/memory/jaa-db.js (70 files): the shared database living in one system.
    redundancy_candidates:
      - "1,740 tracked files under <system>/data/ and 105 under data/ — state in git, against 'NEVER commit data/**' (IM0a)."
      - "336 CHANGELOG-*.md and 342 *.md at the repo root (IM0b)."
      - "58 files in the shared folders required by no static path (lib/system-boundary.js homes().unused) — each checked
        for a loader by name before anything is said about it."
      - "the JaaStore → node-index adapter written three times (intelligence/lib/domain-nodes.js, copilot/lib/inject-config.js,
        versionium/lib/store.js); lib/node-registry.js storeFor holds it once."
      - "guardian/lib/node-registry.js, superseded by lib/node-registry.js (0.60.131); only the root test-node-index.js uses it."
      - "2 test files at the repo root, outside tests/: test-new-plugins.js and test-node-index.js."
      - "93 files in shared folders that belong to one system (homes(), DB17) — a move, not a removal."

  # ── His decisions, first ─────────────────────────────────────────────────────
  decisions:
    IM0a_state_in_git:
      question: "1,845 tracked files are state (data/**). Untrack them (kept on disk, .gitignore'd, regenerated or migrated at boot), or keep the generated node files tracked as declarations?"
      options:
        - "untrack all data/** (coder's recommendation): his rule 'NEVER commit data/**' as written; the nodes regenerate at boot (lib/system-nodes.js) and the databases are each system's own."
        - "keep data/nodes tracked (they are declarations: capability, command, system), untrack the rest (indexes, ledgers, stores)."
      status: "DECIDED 2026-10-17 by the axioms (the coder, under his rule \"use the axioms in the docs for each disicio nthat doesn't show my competence\") — D4: projections untracked in IM2; other data only after a backup outside git (§10.2, §0.3, §2.2); see docs/2026-10-17-decisions-by-the-axioms.spec"
    IM0b_root_files:
      question: "336 CHANGELOGs at the repo root: move them to docs/changelogs/ (scripts/release-zip.js and the release workflow read CHANGELOG-<version>.md at the root and would follow), or keep them where they are?"
      options: ["move, the release reads the new place (coder's recommendation)", "keep at the root"]
      status: "DECIDED 2026-10-17 by the axioms (the coder, under his rule \"use the axioms in the docs for each disicio nthat doesn't show my competence\") — D5: to docs/changelogs/, the release reads both (FILES_WITH_THEIR_SYSTEM, §0.3, §0.5); see docs/2026-10-17-decisions-by-the-axioms.spec"
    IM0c_tests_with_their_system:
      question: "The template gives each system its own tests/. Move each system's tests into it (tests/modules/run-all.js runs them where they are), or keep the one central folder?"
      options: ["with their system, as the template says — follows FILES_WITH_THEIR_SYSTEM (coder's recommendation)", "central, as today"]
      status: "DECIDED 2026-10-17 by the axioms (the coder, under his rule \"use the axioms in the docs for each disicio nthat doesn't show my competence\") — D6: with their system as it migrates; contract tests stay central (§5.9, §4.1); see docs/2026-10-17-decisions-by-the-axioms.spec"
    IM0d_lib_is_the_kernel:
      question: "DB0a, again, because the migration depends on it: lib/ is the shared kernel mounted into every compartment (coder's recommendation), or a system behind routes?"
      status: "DECIDED 2026-10-17 by the axioms (the coder, under his rule \"use the axioms in the docs for each disicio nthat doesn't show my competence\") — D1: the kernel; see docs/2026-10-17-decisions-by-the-axioms.spec"

  # ── Phases, bottom-up ───────────────────────────────────────────────────────
  phases:
    IM1_the_shape_census_as_a_command:
      status: OPEN
      does: >-
        The census above as a route and a command: each system against the template's tree, its crossings out and in, its
        homed files, its tunnel gaps — one row per system, so every later phase is measured by it. Composes what exists:
        lib/system-boundary.js (scan, homes), lib/drawbridge-registry.js, lib/system-registry.js tunnel. No new scanner.
    IM2_clean_the_redundant:
      status: OPEN
      depends_on: [IM0a, IM0b, IM1]
      does: >-
        Each candidate proven redundant or kept, one at a time, with the evidence (no requirer, no loader by name, no test,
        no doc that names it as current), then archived under _archive/<date>-<reason>/ with a note — never deleted (§0.3).
        The three store adapters move onto lib/node-registry.js storeFor; guardian/lib/node-registry.js is archived once
        test-node-index.js moves to the shared registry; data/** untracked per IM0a; root files per IM0b.
    IM3_wire_what_exists:
      status: OPEN
      owns: "GW23 (docs/2026-10-15-gate-held-work-phasemap.spec) and DB6 (drawbridge map)"
      does: >-
        What is built and unreachable gets its door: command rows for cfr, rfr2, sigma, tension, rca and diagnose (the
        debugging systems he asked for); the 81 commands that reach routes no registry declares get those routes declared
        in their system's registry; the 27 declared routes no source serves are served or removed from the registry, said.
    IM4_the_kernel_boundary:
      status: OPEN
      depends_on: [IM0d]
      owns: "DB17 (files with their system) and DB0a"
      does: >-
        lib/ stops reaching up into systems (255 upward crossings): each module moves to the system it belongs to, or the
        call goes through that system's contract. The 93 homed files move into their systems (re-export left behind). The
        shared database cortex/memory/jaa-db.js (70 requirers) is examined: kernel, or cortex's behind its contract.
    IM5_each_system_to_the_template:
      status: OPEN
      depends_on: [IM1, IM3, IM4]
      owns: "sovereign-node P8/P13/P33-P36, build-from-the-spec SB20/SB22, drawbridge DB2-DB5/DB15/DB16"
      does: >-
        One system at a time, least depended-on first, to the template's shape: registry (with events per command and
        toasts), contract, event taxonomy, config, compartment.json, schemas, spec, data/nodes + its own node database,
        tests/, cli — and its crossings to zero, checked by its own boundary (lib/boundary.js in the skeleton). Order, by
        what depends on it (crossings in, fewest first, measured 0.60.131): sentinel 0, nexus-healer 0, architect 0,
        diagnostic 1, versionium 3, emerge 6, idearium 8, clear-glass 10, orchestrator 11, ollama 12, guardian 16, loom 34,
        copilot 35, warp 39, cos 72, intelligence 89, cortex 155.
      gate: "a system is migrated when IM1 shows its full row and its crossings at zero; then it moves into its compartment (DB11)."
    IM6_cortex_unclumped:
      status: OPEN
      owns: "cli-data-code DS1/DS2, nex-node-store N17"
      does: "Other systems' tables in cortex's one store move to their owners, one system at a time behind a warning shim; cortex keeps the catalog (store nodes), never a copy."
    IM7_the_ui_on_the_registry:
      status: OPEN
      owns: "sovereign-node P37, drawbridge DB7/DB12"
      does: "The UI reads each system's contract (routes, toasts, events) and keeps nothing of its own: disposable."

  build_order: [IM0 (his), IM1, IM2, IM3, IM4, IM5 (per system), IM6, IM7]

  # ── ADDENDUM 2026-10-17 (a) — begun ──────────────────────────────────────────
  # James, 2026-10-17: "need to get the systems soveriegn again like we were talking about"
  # IM0a-d are not answered yet. Built only what needs none of them, treating lib/ as the kernel (IM0d, the coder's
  # recommendation, said, not his decision):
  #   IM1 BUILT 0.60.133 — `system sovereign [<system>]`: each blocker named data / primitive / capability. The primitive
  #       list (nexus-bus, nexus-connect, warp/core, warp/index, siso, hooks/index) is the coder's reading, his to confirm (IM0e).
  #   IM6's tool BUILT 0.60.133 — lib/system-store.js: a system's own store, its tables brought home from cortex's once
  #       (the rows there kept, archived later in IM2).
  #   IM5 begun 0.60.133 — nexus-healer sovereign: its data home, forge through intelligence's route (new: POST
  #       /api/intelligence/rfr2/forge/patch). Ratchet 552 → 540.
  #   Next in IM5's order with the fewest blockers: cockpit (1 data), warp (1 capability), emerge (5), architect (6).
  decisions_added:
    IM0e_what_is_a_primitive:
      question: "Which building blocks are the kernel's (every system uses them) rather than one system's capability? The coder's list: nexus/nexus-bus.js, nexus/nexus-connect.js, warp/core/*, warp/index.js, siso/*, hooks/index.js. RAID, CFR, RFR2, gap and baseline are read as capabilities (cortex's, intelligence's), reached through their routes."
      status: "DECIDED 2026-10-17 by the axioms (the coder, under his rule \"use the axioms in the docs for each disicio nthat doesn't show my competence\") — D7: no state, no lifecycle, no data type owned = primitive (§5.9, §10.1, §5.1, §8.3); see docs/2026-10-17-decisions-by-the-axioms.spec"
  # ── ADDENDUM 2026-10-17 (b) — the compartment template ─────────────────────
  # James, 2026-10-17: "and you know i mean cos compartment right? make a template for it now that loom holds"
  # IM5's gate is now physical: loom/templates/cos-compartment.js (0.60.134) gives each system's compartment a seal that is
  # ready only when the system is sovereign, and an intent COS verifies with the same check. Redundant, found here, for IM2:
  # cli/compartments.js (nexus.compartment/1 manifests, a third copy of the crossing scanner).

