spec:
  meta:
    name:     emerge-field-memory-build
    version:  1.1.0
    date:     2026-10-02
    release:  mapped, nothing built — each phase its own patch once built
    uuid:     nexus-emerge-field-memory-build-phasemap-v1-0000-2026-1002-jamesbrooks-001
    owner:    emerge · warp · intelligence (cfr, rfr2) · lib (memory, search, nexstore) · idearium · docs
    status:   "MAPPED 2026-10-02, before building"
    written_against: >-
      main at 0.39.300 (the upload Nexus-main-18.zip; every path below checked to exist there) and the upload
      emergence-6.zip (Emergence 0.1.0 + WARP 1.5.0 — run here: 157/157 Emergence tests, 43/43 WARP tests). This
      branch still sits at 0.39.298; EM0 brings it in line with main first.
    axioms:   >-
      docs/AXIOMS-v3.1.md — §3.3 map before build, §8.6 reuse before build, §0.3 nothing lost, §1.1 nothing pretends,
      §1.2 nothing silently fails, §10.2 projections derived, §10.3 one source of truth. Rheon Kernel v2.1.0 laws as
      written in architect/docs/ARCHITECT-SPEC-v1.1.0.md: §CF "NO ENGINE CONSUMES RAW MEANING. All engines consume
      ConstraintField. Meaning is emergent. Never primitive." · §UNFLATTEN "NEVER COLLAPSE COMPETING STRUCTURES EARLY".
    origin: >-
      James, 2026-10-02 — "im a systems thinker, i want this to help me build systems, but i do the ideas." ·
      "i want the repos to be able to do what im doing right now. talk to you, in a main chat interface and have it map,
      gather context, do what every it can to build what im requesting. maybe make a contract or recursively decompose
      the chunks. like with the graphs we can zoom in, until it can understand, then synthesize what it needs. like only
      what its search finds relevant?" · "spec workshop, reach sectoin needs to be removed. look at emerge, spec
      templates, library, each .spec file is blocks, so what if we eqaute the blocks as parts or components, like the
      minimum, then mods, and components. completely agent assisted. maybe with modes, manual, assisted, stretched?" ·
      "I just make sure its all like builds table of relevant context. what about using cfr instead of events?" ·
      "One source at a time, and then synthesizes at a time. that can mean, building code from synthesis. like adding
      recursive fractal analysis to the chunks. do we need more graphs, fields?" · "analysis, synthesis, can be a
      powerful tool. holy shit the leverage." · "can we make cfr a build logic option?" · "what if we replace warps
      events with cfr" · "okay but siso is taken. by someone. its identicle. i need my own" · "i want it to be called
      emerge." · "what about with the constraint field. wouldnt it be: deterministic variables as the immutable core
      then every probabalisitc builds from there. everything should be this." · "this is litterally first principles.
      relational field" · "no im saying all of it. combine anything thats complimentory or compounds cfr. how would
      that hook into the graphs, agent memory, search, vector, like invent or create anything you think wld compound
      the agents graphs, and all the memory systems.," · "map it all. improve cfr with rfr2, and still i want to make
      warp mine, also. anything else im forgetting from ths conversation." · "economy, tokenizer? shadow space?" ·
      "also i want idearium to be able to code anything i need for fiverr. make it high leverage, enterprise grade,
      and scalable. like cos i want to be a tool box for this also. like i feel like cos and idearium are our
      buildteams" · "guardian is the source of truth for the clearglass agents. make sure each addition is correctly
      mapped to each system, relevant nodes, routes and cli nodes are added, maps ar eupdated, and settings are
      expanded if applicaple."
      The ideas, the direction and the calls are James's. This map lays them out bottom-up against what exists.

  # ── What exists — read, not assumed ───────────────────────────────────────────────────────────────────────────
  found:
    his_kernel: >-
      Rheon Kernel v2.1.0's irreducible kernel, as written in architect/docs/ARCHITECT-SPEC-v1.1.0.md §0: Field
      (possible states) · Constraint (reduces valid future states) · Transition · Observation (evidence) · Lens
      (read-only projection, never modifies the field) · Gap (missing information needed to evaluate a constraint) ·
      History (constraint-consistent transition paths) · Meaning (human interpretation, late-stage, derived). The
      Architect adds Hook, Blueprint, Clip. Layer 0 is the CONSTRAINT FIELD, "external dependency" — no code for it
      exists in the repo (architect/src/constraint-field/ is absent). emerge/emerge.spec names it: cfr =
      constraint_field_runtime, urck = universal_runtime_constraint_kernel.
    emerge_language: >-
      Three copies, divergent — two contracts, surfaced, not collapsed (CLAUDE.md rule 4): emerge/emerge.spec in Nexus
      (868 lines, NEXUS-specific domains); emergence/emerge-language.spec in the upload (728 lines; roots Structure,
      Signal, Observation, Gap, Record, Identity, Lens; ~25 domains incl. field: coherence, entropy, friction,
      pressure, density, tension, stability, resonance, alignment, regime); emergence/emergence.spec (the substrate
      written in Emerge).
    emergence: >-
      The upload's substrate: "observation creates structure that feeds back into observation". rfr2-observer (Lens)
      → feedback-loop-buffer → cfr-creator (Gate; creates TOWARD an explicit target end-state|idea|person with a mass,
      never inferred; vendor/rfr2/cfr-kernel/physics.js attractors + clusters) → associative-lattice (resonance =
      shared invariants, Jaccard) · causal-graph (causal vs observational by measured elapsed time) · event-ledger
      (hash-chained, Jaa persistence ported from PHP). EndStateFirst: on convergence, traceToRoot backwards with the
      invariants at each step. 10 liminal detectors (negative-space, assumption, contrastive, reversal, structural,
      shadow, oscillatory, existential, relational-gaps, bus). pattern-engine (Markov recall + prediction). idea-store
      on WARP gates + hard Axioms. Its own stated gaps: rupture_severity pinned; physics randomness unseeded; an
      attractor's position is a hash of its id, not meaning; the LLM contract is a draft.
    warp: >-
      warp/ in Nexus is 1.4.0; the upload's is 1.5.0. Its Event/Gate/Stream/StreamLog are SISO's shape — warp/core/
      Event.js says so ("Matches SISO's Event shape exactly"); siso/spec/siso.spec credits SISO to Jonathan Bailey.
      Axiom is James's. Stream.emit knows each produced event's parent (the gate's input) and does not record it.
      warp/dispatch/population.js crystallizes a result after 3 independent retentions. idearium/spec-engine/
      warp-build-dispatch.js already makes WARP idearium's build dispatch.
    cfr: >-
      intelligence/cfr — ledger, field (coherence, friction, resonance, entropy → regime stable|resonant|turbulent|
      chaotic), sigma, delta, causal graph, contract verifier (structural, behavioral, temporal). Recorded into by
      idearium, guardian, cortex, the orchestrator; NOT by the build path (chunk-dispatch, warp-build-dispatch).
      intelligence/cfr/graph.js infers 'temporal' edges between any two entries on one system within 2s.
    rfr2: >-
      intelligence/rfr2 (Nexus; causality 5.0.2, kernel 5.0.2, identity, time, sigma, delta, clip, enforcement, forge,
      query, observer, version-gate, adapter) and emergence/vendor/rfr2 (upload; causality 5.0.0, field/relational +
      ALKModule, liminal ×10, ledger, cfr-kernel physics/rewind/render, lattice) + vendor/resonance-v5.1/
      relational-physics.js. RFR2's rule C-1: edge types declared at ingestion, never inferred post-hoc —
      causal/explicit, causal/rule, causal/adapter, observational (never traversed in causal paths). Diamond parents
      rejected (a DAG). Nearly unconsumed in Nexus: lib/rfr2-bridge.js → intelligence/relational-field.js only.
    graphs: >-
      CODE idearium/repo/graph.js (RELATIONS_DECLARED_UNSUPPORTED includes derived_from, generated_from, emits,
      handles, tested_by) · SPEC idearium/repo/spec-graph.js · EXECUTION idearium/repo/runtime-proof.js · MANIFEST
      idearium/spec-engine/manifest/graph.js · CAUSAL intelligence/cfr/graph.js · lattices · loom's wires · the
      Architect canvas idearium/ui/js/arch-canvas.js. Main's docs/2026-10-02-fractal-graph-any-size-agent-phasemap.spec
      (FG1–FG6, WS5, UV1) maps the containment tree, token budgets, summaries, contextFor, recursive build — reused
      here, not duplicated.
    memory: >-
      lib/vector-memory.js (nomic-embed-text 768-dim, SNR-gated) · lib/local-vector-index.js · lib/agent-memory.js
      (the Clear Glass download manager) · lib/repo-hat-memory.js (what the project agent learned) · cortex/memory/
      tiers.js + decay.js + relevance.js ("relevance is not age" — sigma/delta decay) · cortex/memory/causal-lookup.js
      · lib/case-library.js · meta/crystal-lattice.js · lib/context-atlas.js ("one door to every memory system":
      ~70 JAA tables, ~40 writers) · lib/nexstore (main 0.39.300: record, hash-chained log, types, census, writers).
    search: >-
      lib/repo-context.js — deterministic keyword/symbol/path scoring under a character budget; finds what the question
      NAMES. vector-memory finds what is SIMILAR. Nothing finds what is CONNECTED or what is MISSING.
    economy: >-
      lib/economy (0.39.281 EC0–EC11): tokens.js estimates (method 'estimate-v1' — "no vendor tokenizer is bundled")
      and LEARNS each provider's safe input limit from real outcomes; router.js is Thompson sampling over a Beta
      posterior per (jobType, provider), weighted by cost tier and latency; gate.js allow|wait|stop|fallback; policy,
      ledger, store. loom/maps/economy-map.js wires it. No exact token count exists anywhere for any model.
    shadow_space: >-
      lib/shadow.js (0.39.282, N22): before a step runs it DECLARES what must exist afterwards (files, events, fields);
      on settle the difference — negative space — becomes gaps (lib/gap-field.js, absent.<step>.<kind>) and
      liminal-space items (intelligence/liminal-space). The Emergence upload's liminal/shadow.js reads shadow in text.
      cockpit/cockpit.spec names a shadow_layer: a mutable overlay on a .nex sandbox. Three meanings of one idea — the
      space of what should be, beside what is.
    guardian_and_clear_glass: >-
      Guardian keeps the agents' facts: docs/guardian.spec and guardian/spec/guardian.spec (ncp_providers),
      guardian/userscripts.yaml (read by clear-glass/src/userscripts/manager.js), guardian/data/nodes/<type>/ (system,
      command, capability, component, response — the lib/node-export.js envelope), guardian/commands/*.command
      (get-providers among them). Clear Glass keeps a second copy: clear-glass/src/providers/registry.js "mirrors
      guardian.spec ncp_providers exactly" — by hand, so it can drift.
    build_teams: >-
      COS: archetype, blueprint, ci, cli, compartment, foundation, host, nodes (create, branch, compare, destroy,
      events, hooks…), playground(s), testenv (VM setup, detect, provision), vault/vaultd, watchdog, workspace (repo
      desktops). Idearium: the pipeline, the repo agent, spec-engine, emerge's compiler. lib/contract-queue.js,
      lib/hat-forge.js (hats: agent + persona + tool scope + allowed intents), lib/tool-forge.js. Nothing yet takes a
      client's job from brief to delivered, proven, isolated work.
    spec_and_build: >-
      idearium/spec-engine/blocks.yaml — 11 blocks, a default agent each; block `events` ("bus events emitted, bus
      events consumed, payload shapes") is read by nothing after it is written. 10 templates in idearium/spec-engine/
      templates (minimal-kernel.spec is the minimum). emerge/compiler — T0 structure and T1 scaffold with zero LLM,
      T2/T3 per node within a token budget. idearium/lib/workshop.js's AMBITION dial is REACH on the workshop page.
      The repo agent: /api/repos/:uuid/agent/{prompt,tools,graph,memory,history}.

  # ── Invariants — every phase answers to these ─────────────────────────────────────────────────────────────────
  invariants:
    E1: "Deterministic core, probabilistic shell. Field, constraints and history are immutable and deterministic; a model only ever PROPOSES — its output is an Observation, never truth."
    E2: "An Observation becomes a Transition only by passing the constraints, deterministically. Fails → rejected, said. Cannot be evaluated → a Gap, with what is missing."
    E3: "No inferred causal edge. Every edge's type is declared when it is recorded (RFR2 C-1). An inference is an observational edge, and observational edges are never walked for root cause."
    E4: "One relational field. Every graph and every memory view is a Lens over it — no second store of the same truth (§10.2, §10.3)."
    E5: "One write path. Every memory write goes Observation → constraints → Transition → History. Existing stores are written through it, then become its projections."
    E6: "Meaning is James's. Targets (end-state, idea, person) and ideas are given, never inferred; an agent stretches his idea's structure, it does not invent the idea."
    E7: "Seeded. Every source of randomness draws from a recorded seed; any run replays exactly."
    E8: "LEVEL, BUDGET, CONFIDENCE on everything: every node at a level with a rolled-up summary; every transition with its cost; every observation with its confidence and source. Budgets resolved at run time from the agent (nexstore I9), never constants."
    E9: "§UNFLATTEN. Competing structures are kept, linked by `contradicts`, until a constraint or James settles them."
    E10: "Zero dependencies in EMERGE and WARP. NEXUS imports them; they never import NEXUS."
    E12: "Mapped into every system it touches, as it is built — not after: its node records (lib/node-export.js envelope; Guardian's nodes/<type>/<id>.<type> layout; a nexstore type), its routes (with their CAPS) and their .command nodes, its CLI verbs, its loom map with real wires (bootstrapped from empty, rejections at baseline), its settings section where a person would change it, its atlas section. A phase is not DONE until its row in `wiring` below is true."
    E13: "Guardian is the source of truth for the Clear Glass agents. Clear Glass reads providers, userscripts, hats and agent definitions from Guardian; any local copy is a cache carrying Guardian's hash, and a mismatch is a gap — never a silent second truth."
    E11: "Nothing lost (§0.3). SISO and siso_ref stay, attributed; WARP 1.x gates run through an adapter until moved; divergent copies are surfaced, not merged silently."

  # ── Phases — bottom-up ─────────────────────────────────────────────────────────────────────────────────────────
  phases:

    EM0_ground:
      layer: foundation
      status: OPEN — needs James's yes on the branch
      files: [loom/data/registry.json, loom/data/events.json, emergence/, warp/, docs/emerge-copies-divergence.md]
      does: >-
        (1) This branch brought in line with main 0.39.300 (a merge, main's tree wins; this branch's 0.39.298
        Architect stays in history — main's 0.39.299 rebuild supersedes it). (2) loom/data/registry.json regenerated
        from empty on main's maps — main still carries 0.39.262's (2275 components; lib/component-store.js absent).
        (3) The Emergence upload brought in as emergence/ beside emerge/, and WARP 1.5.0 over 1.4.0 (its changelog
        read first; warp's own 43 tests and every Nexus WARP consumer re-run). (4) A divergence report of the three
        Emerge specs and the two RFR2 trees, line by line, for James to decide — nothing merged silently.
      proof: "the branch equals main + this map; the registry offers nexus.lib.component-store; emergence's 157 and warp's 43 tests pass inside Nexus; the divergence report lists every differing definition"

    EM1_emerge_core:
      layer: foundation
      status: OPEN
      depends_on: [EM0_ground]
      files: [emerge/core/field.js, emerge/core/constraint.js, emerge/core/transition.js, emerge/core/observation.js, emerge/core/lens.js, emerge/core/gap.js, emerge/core/history.js, emerge/core/level.js, emerge/core/budget.js, emerge/core/seed.js, emerge/core/index.js, emerge/spec/emerge-core.spec]
      does: >-
        EMERGE's core: James's Rheon primitives as code — the constraint field the Architect spec calls layer 0, built
        at last. Field, Constraint, Transition, Observation (with confidence + source + cost), Lens (read-only by
        construction), Gap, History (append-only, hash-chained like nexstore's log), Meaning left to James. Plus LEVEL
        (every node at a level, parent/children, summary + children's hash), BUDGET (cost of every transition; a
        constraint can bound it) and SEED (E7: one recorded seed per run, every random draw from it). Identity and
        logical time reused from intelligence/rfr2/identity and /time, not rewritten. Zero dependencies (E10).
      proof: "a model proposal that breaks a constraint is rejected with the constraint's id; one that cannot be evaluated is a Gap naming the missing input; a Lens cannot write; two runs with one seed produce byte-identical history"

    EM2_warp_his_own:
      layer: foundation
      status: OPEN
      depends_on: [EM1_emerge_core]
      files: [warp/core/Link.js, warp/core/Expectation.js, warp/core/Engine.js, warp/core/Ledger.js, warp/core/Axiom.js, warp/adapters/siso-gates.js, warp/spec/warp.spec, warp/MANIFEST.json]
      does: >-
        "okay but siso is taken. by someone. its identicle. i need my own" · "still i want to make warp mine". WARP 2,
        written fresh on Emerge's primitives — not edited from the SISO-shaped files. The atom is the LINK (cause →
        effect, carrying its field values), not the message: nothing exists without its cause except a root, marked
        as one. EXPECTATIONS are declared before anything happens ("this must cause that within 2s") and held open
        until fulfilled or broken; the residue is open expectations (gaps with their cause), not unclaimed messages.
        Every link passes the constraints first (EM1); WARP's Axiom stays (it was always James's). The ledger is
        causal by construction — the parent is recorded at the moment it is known. population.js's crystallization
        kept. WARP 1.x gates (cos's 30+, loom's driver) run unchanged through warp/adapters/siso-gates.js, each as a
        link from an unknown cause, until moved one by one. siso/ and siso_ref/ stay, attributed to Jonathan Bailey.
        Naming, as James called it: EMERGE is the language and the law; WARP is its engine; Emergence is the
        substrate built on both — to confirm with him.
      proof: "every link in the ledger has causedBy or root:true; an expectation unmet in its window is a gap naming both ends; every 1.x WARP test and every Nexus WARP consumer passes through the adapter; no file in warp/core carries SISO's shape"

    CF1_cfr_improved_with_rfr2:
      layer: foundation
      status: OPEN
      depends_on: [EM1_emerge_core, EM2_warp_his_own]
      files: [intelligence/cfr/graph.js, intelligence/cfr/ledger.js, intelligence/cfr/field.js, intelligence/cfr/sigma.js, intelligence/cfr/delta.js, intelligence/cfr/contract-verifier.js, intelligence/rfr2/]
      does: >-
        "improve cfr with rfr2". CFR becomes the constraint field runtime its own name says it is, on RFR2's discipline:
        (a) typed edges at ingestion (E3): causedBy → causal/explicit; a deterministic rule → causal/rule; lifecycle
        pairs (running → success|failed) via RFR2's calltoMap → causal/adapter; graph.js's 2-second 'temporal' guess
        becomes observational — still shown, never walked for root cause. (b) RFR2 kernel bounds: ring buffer with
        pruneEdgesFor on eviction, dedup LRU, logical clock, content hash on every entry, hash-chained. (c) One sigma
        and one delta — CFR's and RFR2's two implementations reconciled into one, the other kept as a tested alias.
        (d) The field widened with Emerge's own field domain: pressure, density, tension, stability, alignment beside
        coherence, friction, resonance, entropy. (e) cfr-kernel physics brought in from the upload, seeded (E7):
        attractors (targets with mass) and clusters (convergence: causal | laminar | turb). (f) cfr-kernel rewind:
        replay the field to any entry. (g) The lattice's shared-invariant resonance (Jaccard). (h) The contract
        verifier reads typed edges, so a broken sequence names the broken link. (i) The ten liminal detectors as Lenses.
        The two RFR2 trees reconciled per EM0's report (Nexus causality 5.0.2 is newer than the upload's 5.0.0).
      proof: "a recorded 2s-adjacent pair no longer appears in traceToRoot; a seeded field replays identically; rewind to entry N reproduces the field at N; the verifier names the missing link on a broken sequence; CFR's existing consumers (idearium, guardian, cortex, orchestrator) pass unchanged"

    RF1_relational_field:
      layer: foundation
      status: OPEN
      depends_on: [EM1_emerge_core, CF1_cfr_improved_with_rfr2]
      files: [lib/nexstore/, emerge/core/relation.js, idearium/repo/graph.js, intelligence/cfr/graph.js]
      does: >-
        "relational field". One field of nodes and typed relations, stored in main's node store (lib/nexstore — no new
        database), every node at a LEVEL. Relation families: structural (contains, depends_on), causal (a strict DAG —
        RFR2's diamond rejection), provenance (derived_from, generated_from — many parents allowed, because a synthesis
        has many sources), semantic (similar_to — probabilistic, an Observation until confirmed, with confidence),
        contradiction (contradicts — E9). graph.js's derived_from, generated_from, emits, handles, tested_by move from
        RELATIONS_DECLARED_UNSUPPORTED to supported as they are produced. Every existing graph becomes a Lens (E4): CODE
        and CAUSAL first; SPEC, EXECUTION, MANIFEST, lattices, loom, the Architect canvas listed, each moved in its own
        step with its old reader kept until the Lens matches it.
      proof: "the CODE graph's answers from the old store and from the Lens agree on a fixture repo; a provenance node with five sources is accepted, a causal diamond is rejected; a semantic edge carries its confidence"

    OT1_one_write_path:
      layer: library
      status: OPEN
      depends_on: [RF1_relational_field]
      files: [lib/context-atlas.js, cortex/memory/jaa-db.js, emerge/core/transition.js, docs/nexstore-writers.yaml]
      does: >-
        E5. Every memory write — chat logs, agent memory, hat memory, crystals, fix map, case library, vector memory —
        goes Observation → constraints → Transition → History. Starts as a dual write beside each existing writer
        (the ~40 writers nexstore's census already lists), so nothing breaks; each store then becomes a projection.
        context-atlas becomes the field's one query door.
      proof: "for each migrated writer, the old table and the field's projection agree after a replayed day of writes; a write breaking a table's schema constraint is rejected and said"

    MR1_recall_triad_and_context_table:
      layer: library
      status: OPEN
      depends_on: [OT1_one_write_path]
      files: [lib/repo-context.js, lib/vector-memory.js, lib/recall-triad.js, lib/context-table.js]
      does: >-
        "make sure its all like builds table of relevant context". Three lanes: LEXICAL (repo-context — what is
        named), VECTOR (vector-memory — what is similar), RELATIONAL (a walk of the field — what is connected: causes,
        dependencies, provenance). Each hit is a row: source, lanes that found it, relevance, confidence, hash, tokens,
        why. Lanes that agree raise confidence; a single-lane hit is marked weak. Constraints filter
        deterministically; the table is packed to the agent's budget (E8) with the cut said, and kept with whatever it
        built — what the agent knew, why, and what it left out.
      proof: "a fixture question: a chunk found by all three lanes outranks one found by one; the table persists beside the build and replays; nothing over budget is silently dropped"

    MR2_vector_space_for_the_field:
      layer: library
      status: OPEN
      depends_on: [MR1_recall_triad_and_context_table, CF1_cfr_improved_with_rfr2]
      files: [lib/vector-memory.js, intelligence/cfr/]
      does: >-
        Closes Emergence's stated gap ("an attractor's position is a hash of its id"): targets are placed by their
        embedding, so moving toward a target is moving toward its meaning — a probabilistic Lens with its confidence
        shown. The other direction: the physics gives vector memory dynamics — what is converging, drifting, stuck.
      proof: "two targets close in meaning sit close in the field; convergence toward a target tracks embedding distance on a fixture"

    MR3_gap_driven_search:
      layer: library
      status: OPEN
      depends_on: [MR1_recall_triad_and_context_table]
      files: [lib/gap-search.js, emergence/vendor/rfr2/liminal/negative-space.js, emergence/vendor/rfr2/liminal/relational-gaps.js]
      does: >-
        Search for what is missing. The negative-space and relational-gap detectors find what is absent; Emerge's
        pressure ("significance of missing structure") and density ("generative potential of a gap") order the gaps;
        each gap generates its query; results come back as Observations that close or narrow it. Highest leverage
        first — main's 0.39.300 gap synthesis (/api/intelligence/synthesis*) reused for the ordering.
      proof: "a contract with an unmet requirement: the gap is found, its query run, the gap closed by a real source, all recorded with cause"

    MR4_field_memory:
      layer: library
      status: OPEN
      depends_on: [OT1_one_write_path, CF1_cfr_improved_with_rfr2]
      files: [cortex/memory/relevance.js, cortex/memory/decay.js, cortex/memory/tiers.js]
      does: >-
        "relevance is not age", taken all the way: a memory's survival is its field value — how often it is a cause,
        how much tension it resolves, whether a recipe uses it. Working, short and long become field states, not
        timers; a memory that keeps mattering pulls itself into long. Decay is said, never silent.
      proof: "a memory cited as a cause in three builds survives a sweep that removes an untouched one of the same age"

    MR5_fractal_levels_with_the_field:
      layer: library
      status: OPEN
      depends_on: [RF1_relational_field]
      reuses: [docs/2026-10-02-fractal-graph-any-size-agent-phasemap.spec FG1, FG2, FG3, FG4]
      does: >-
        "like adding recursive fractal analysis to the chunks". Main's FG1–FG4 (containment tree, token budgets,
        summaries up the tree, contextFor) built on the relational field's LEVEL, with the field rolled up: a
        turbulent leaf makes its branch read turbulent, so zoom goes straight to the trouble. The lattice's fractal
        field, never fed (detected:false), fed by it.
      proof: "FG1–FG4's own proofs, plus: one turbulent chunk raises its file's, component's and system's turbulence"

    MR6_contradictions_held:
      layer: library
      status: OPEN
      depends_on: [RF1_relational_field, MR1_recall_triad_and_context_table]
      does: >-
        E9. When recall returns memories or sources that disagree, both are kept, linked `contradicts`, and shown to
        James. His settlement is recorded with its cause — the strongest learning event the system can get, and the
        first in line for MR8.
      proof: "two contradicting sources both reach the context table, marked; settling one records the settlement as a transition caused by James"

    MR7_recipes:
      layer: service
      status: OPEN
      depends_on: [CF1_cfr_improved_with_rfr2, CB1_cfr_build_logic]
      files: [lib/case-library.js, emergence/components/pattern-engine/, lib/repo-hat-memory.js, meta/crystal-lattice.js]
      does: >-
        Every converged build's EndStateFirst trace (the conditions that led there, walked backward) is stored as a
        RECIPE in the case library; a failed chain as an ANTI-RECIPE (crystal-lattice's negative match). The pattern
        engine predicts the next step from recipes; the hat memory learns from them.
      proof: "after a converged fixture build, the next similar request's plan cites the recipe; an anti-recipe's step is flagged before it is retried"

    MR8_crystallization:
      layer: service
      status: OPEN
      depends_on: [MR7_recipes, EM2_warp_his_own]
      files: [warp/dispatch/population.js, emerge/core/constraint.js]
      does: >-
        The boundary moves up. WARP's promote-after-3 generalized: a synthesis, recipe or generated piece that converges
        N times independently (N stated, tunable, never a hidden constant) is promoted INTO the deterministic core — a
        constraint, a template, a component for CODEX (CX0). Nexus gets more deterministic and cheaper as it learns:
        tokens paid once per discovery. A crystal is never silently overwritten; a contradicting outcome re-opens it.
      proof: "the Nth independent convergence promotes; the (N-1)th does not; a promoted crystal answers with zero model calls"

    MR9_liminal_on_the_agents:
      layer: service
      status: OPEN
      depends_on: [CF1_cfr_improved_with_rfr2]
      files: [emergence/vendor/rfr2/liminal/, lib/agent-memory.js]
      does: >-
        RFR2's detectors read every agent reply before it counts: assumption (a claim stated as fact — a hallucination
        signal), reversal (contradicting itself), oscillatory (circling — CFR resonance), negative space (what it
        avoided), relational gaps (said it did what it did not). Each is a Lens; a hit lowers the reply's confidence and
        is shown, never hidden.
      proof: "fixture replies: a stated-as-fact claim with no source is flagged; a reply reversing the previous one is flagged; a clean reply is not"

    MR10_the_field_between_james_and_the_agents:
      layer: service
      status: OPEN
      depends_on: [MR9_liminal_on_the_agents]
      files: [emergence/vendor/rfr2/field/relational.js, lib/repo-hat-memory.js]
      does: >-
        The relational module models "not individuals — the space between them". Pointed at James ↔ each agent:
        meaning, decay, rupture ("I hate that ui you made"), repair ("lets do it"). What each agent learns about how
        James means things goes into its hat memory. Local and sovereign only; his to see, switch off, or clear.
      proof: "a rupture then a repair in a fixture transcript move the field down then up; the hat memory records what was learned, with the lines that caused it"

    MR11_rewind_the_mind:
      layer: service
      status: OPEN
      depends_on: [CF1_cfr_improved_with_rfr2, OT1_one_write_path]
      reuses: [docs/2026-10-02-workshop-codex-rewind-phasemap.spec RW1]
      does: >-
        cfr-kernel rewind + the hash-chained history: any agent's memory and field replayed to any moment. Paired with
        RW1 (the VM rewind) — the OS and the mind rewound together, to the same point.
      proof: "rewind to entry N: the field, the context table and the agent memory read as they did at N"

    CB1_cfr_build_logic:
      layer: service
      status: OPEN
      depends_on: [EM2_warp_his_own, CF1_cfr_improved_with_rfr2, MR1_recall_triad_and_context_table]
      files: [idearium/spec-engine/warp-build-dispatch.js, idearium/spec-engine/chunk-dispatch.js, lib/pipeline-routing.js]
      does: >-
        "can we make cfr a build logic option?" Two build logics, chosen per build: LINEAR (the plan in order — today's)
        and CAUSAL. In CAUSAL every build step is a WARP 2 link caused by its contract, its synthesis and that
        synthesis's sources, and the field steers: STABLE → bigger pieces, faster; RESONANT (the same piece retried) →
        stop, change approach; TURBULENT → decompose deeper (FG5's "retried smaller, not bigger"); CHAOTIC → halt,
        trace back to the source that misled it, show James. The build path finally records into CFR.
      proof: "a fixture build under CAUSAL: an injected repeated failure moves the regime to resonant and changes approach; an injected chaotic run halts with the root source named"

    CB2_analysis_then_synthesis:
      layer: service
      status: OPEN
      depends_on: [MR1_recall_triad_and_context_table, MR5_fractal_levels_with_the_field, CB1_cfr_build_logic]
      reuses: [docs/2026-10-02-fractal-graph-any-size-agent-phasemap.spec FG5]
      does: >-
        "One source at a time, and then synthesizes at a time. that can mean, building code from synthesis." ANALYSIS:
        each source read alone against the question → one row (what it says, relevance, confidence, hash). SYNTHESIS:
        rows combined a few at a time into findings, findings into findings, up the levels, each recording its rows
        (provenance). BUILD: code generated from the synthesis, never from the raw pile. Small enough for a small model
        at every step.
      proof: "every generated file has a provenance chain back to the rows that made it; each analysis step's prompt holds exactly one source"

    CB3_the_causal_spec_block:
      layer: service
      status: OPEN
      depends_on: [EM2_warp_his_own, CF1_cfr_improved_with_rfr2]
      files: [idearium/spec-engine/blocks.yaml, emerge/compiler/index.js, emerge/compiler/emit.js, intelligence/cfr/contract-verifier.js]
      does: >-
        "what about using cfr instead of events?" The `events` block becomes CAUSAL: per event caused_by, must_cause
        <event> within <time>, on_fail, payload, axiom. emerge's T1 (no model) compiles it into WARP 2 links and
        expectations, the payload into the schema, the axiom into an Axiom, the timing into a contract-verifier rule,
        and writes the cause-threading into the scaffold so generated code is born traceable. Every must_cause line is
        also a generated test. Timings start as James's guesses; measured timings come back as proposals for his yes.
      proof: "a fixture spec compiles to links + expectations + tests; the running fixture breaking one must_cause raises a gap naming both events"

    CB4_the_emergence_loop_builds:
      layer: service
      status: OPEN
      depends_on: [CB1_cfr_build_logic, CB2_analysis_then_synthesis, MR2_vector_space_for_the_field]
      files: [emergence/loop.js]
      does: >-
        Emergence's loop aimed at building: observations = analysis rows; the Lens = the relational field over code
        and spec; the target = the contract's end-state, with its mass; convergence = the build closing on the
        contract; EndStateFirst = what led there, every condition, in the report; the record = the ledger and the
        context table. The same loop consolidates memory between builds.
      proof: "a fixture build reports convergence with its end-state trace; with no target set it claims no convergence"

    WS6_workshop_parts_and_modes:
      layer: interface
      status: OPEN
      depends_on: [CB3_the_causal_spec_block]
      reuses: [docs/2026-10-02-fractal-graph-any-size-agent-phasemap.spec WS5]
      files: [idearium/ui/workshop.html, idearium/lib/workshop.js, idearium/spec-engine/blocks.yaml, idearium/spec-engine/templates/]
      does: >-
        "spec workshop, reach sectoin needs to be removed" — REACH (the AMBITION dial) leaves the workshop; the
        creativity dial belongs to the Void, where the ideas are his. The blocks become PARTS in three tiers: MINIMUM
        (what emerge's T0/T1 can build with no model — identity, purpose, data, routes, build order), MODS (CAUSAL,
        integration, failure modes, tests, axioms — added when needed), COMPONENTS (the registry block — each part
        matched to what exists, or new). Templates become kits of parts. Modes: MANUAL (he writes; the agent only
        checks gaps and what is missing to reach MINIMUM), ASSISTED (proposals per block, accept or dismiss),
        STRETCHED (his idea carried through every block and every level as proposals). In every mode nothing enters
        without his yes. Extends main's WS5.
      proof: "the page has no REACH; a spec reaching MINIMUM builds through T0/T1 with zero model calls; STRETCHED's proposals never write a section on their own"

    RC1_the_repo_main_chat:
      layer: interface
      status: OPEN
      depends_on: [CB1_cfr_build_logic, CB2_analysis_then_synthesis, MR3_gap_driven_search]
      files: [idearium/api/index.js, idearium/ui/js/app.js]
      does: >-
        "i want the repos to be able to do what im doing right now." The repo agent's chat
        (/api/repos/:uuid/agent/*) becomes the loop this conversation runs: James asks → a CONTRACT (what done means,
        how it is proved) for his yes → a MAP before building → decompose until each piece fits the agent → the recall
        triad's context table per piece → build → verify against the contract → report what was proved and what was
        not. CAUSAL or LINEAR, his choice.
      proof: "a fixture request in the chat produces a contract, a map, a context table per piece, a build, and a report whose claims each cite their proof"

    LN1_lenses_on_the_canvas:
      layer: interface
      status: OPEN
      depends_on: [RF1_relational_field, MR5_fractal_levels_with_the_field]
      files: [idearium/ui/js/arch-canvas.js, idearium/ui/architect.html]
      does: >-
        The field drawn on main's Architect canvas: the regime as colour, gaps as dashed absences, contradictions as
        crossed links, zoom through every LEVEL; a context-table viewer for any build. The Void's look, capitals.
      proof: "driven in Chromium: zoom from system to chunk, a turbulent leaf visible from the top, a build's context table opens from its node"

    EC6_economy_and_the_tokenizer:
      layer: library
      status: OPEN
      depends_on: [EM1_emerge_core]
      files: [lib/economy/tokens.js, lib/economy/tokenizer/gguf.js, lib/economy/tokenizer/bpe.js, lib/economy/router.js, lib/economy/ledger.js]
      does: >-
        "economy, tokenizer?" BUDGET (EM1) made exact where it can be and honest where it cannot. LOCAL models: the
        exact tokenizer read from the model's own GGUF file (its tokenizer.ggml.tokens / merges metadata) by a
        zero-dependency reader — real counts, method 'gguf-exact'. Remote providers: the estimate stays, calibrated by
        each provider's learned ratio of estimate to its own reported usage where a reply carries it — method
        'estimate-calibrated', with its error band. Every count names its method. The economy then prices the whole
        build: each WARP 2 link carries its cost; the CAUSAL build (CB1) gives small pieces to local models through the
        existing Thompson router; crystallization (MR8) is booked as tokens saved; a job's quote is the sum of its
        pieces' budgets (FV1).
      proof: "a local model's count equals its own tokenizer's on a fixture; a remote estimate states its error band; a build's ledger sums to its pieces; a crystal hit books its saving"

    SH1_shadow_space:
      layer: library
      status: OPEN
      depends_on: [EM2_warp_his_own, CF1_cfr_improved_with_rfr2]
      files: [lib/shadow.js, intelligence/liminal-space/, cos/workspace/, emergence/vendor/rfr2/liminal/shadow.js]
      does: >-
        "shadow space?" One idea, three uses joined. (1) The SHADOW is the expectation: WARP 2's expectations ARE
        lib/shadow.js's declarations — before a step runs it declares what must exist after; negative space on settle
        is the gap. One mechanism, not two. (2) The SHADOW SPACE is where the probabilistic shell acts: a generated
        change runs first in a shadow layer — a COS overlay on the repo's workspace (cockpit's shadow_layer) — and only
        what passes the constraints and its shadow is committed into the real tree. Models never write the real tree
        directly. (3) The shadow READ: the liminal shadow detector on agent replies and briefs (MR9) — what is implied
        and unsaid. Shadow and negative space become a region of the relational field, drawn on the canvas (LN1).
      proof: "a step's declared shadow is its WARP 2 expectation (one record, not two); a generated change that fails its tests never reaches the real tree; the absent file of a step is a gap with the step as cause"

    GA1_guardian_source_of_truth:
      layer: foundation
      status: OPEN
      depends_on: [EM0_ground]
      files: [clear-glass/src/providers/registry.js, clear-glass/src/userscripts/manager.js, guardian/spec/guardian.spec, docs/guardian.spec, guardian/userscripts.yaml, guardian/data/nodes/, guardian/routes/, lib/hat-forge.js]
      does: >-
        E13. Clear Glass stops keeping its own agent facts. Providers, userscripts, hats and agent definitions come
        from Guardian (its nodes and a route — get-providers.command already exists); clear-glass/src/providers/
        registry.js becomes a cache stamped with Guardian's hash, read at boot, refreshed on Guardian's change event,
        and a mismatch raises a gap. The two guardian.spec copies (docs/ and guardian/spec/) surfaced and made one.
        Every agent Clear Glass runs is a Guardian node first.
      proof: "adding a provider in Guardian alone makes it appear in Clear Glass; editing Clear Glass's cache by hand raises a gap on the next boot; with Guardian down, Clear Glass runs on the stamped cache and says so"

    BT1_build_teams:
      layer: service
      status: OPEN
      depends_on: [GA1_guardian_source_of_truth, CB1_cfr_build_logic, SH1_shadow_space]
      files: [cos/, lib/tool-forge.js, lib/hat-forge.js, lib/contract-queue.js, idearium/api/index.js]
      does: >-
        "i feel like cos and idearium are our buildteams". Two teams, one contract queue. IDEARIUM is the design-and-
        build team: spec, architect, decompose, code. COS is the toolbox and the floor: the environments (testenv VMs,
        playgrounds), the workspace and its shadow layer (SH1), CI, the vault for secrets, the watchdog. COS's tools
        become nodes agents can call (tool-forge), each with its CLI verb. Roles are hats (hat-forge) dispatched through
        Guardian (GA1): architect, builder, tester, reviewer. A piece of work moves between the teams as a WARP 2 link
        in lib/contract-queue.js, so every hand-off is traceable.
      proof: "one fixture job: Idearium builds, COS tests it in a VM, the reviewer hat checks it, every hand-off a link in the queue with its cause"

    FV1_client_jobs:
      layer: service
      status: OPEN
      depends_on: [BT1_build_teams, RC1_the_repo_main_chat, EC6_economy_and_the_tokenizer, MR8_crystallization]
      files: [idearium/lib/jobs.js, idearium/ui/jobs.html, cos/workspace/, cos/vault/]
      does: >-
        "i want idearium to be able to code anything i need for fiverr. make it high leverage, enterprise grade, and
        scalable." A client job, brief to delivery. INTAKE: James pastes the brief; it becomes a CONTRACT (scope,
        acceptance, what is out of scope) for his yes — the brief is the client's idea, the contract is his call.
        QUOTE: the economy's budget for the decomposed job (EC6) — tokens, time, risk — before he accepts the gig.
        BUILD: the pipeline in CAUSAL mode, in its own isolated compartment and COS workspace per client (no file,
        memory or secret crosses between clients; secrets in the vault). PROVE: tests, a dependency licence check, a
        security scan, a reproducible seeded build, and a proof report that cites each acceptance line's evidence.
        DELIVER: a clean repo or zip, README, and the report. REVISIONS: each a new contract on the same history.
        KITS: per gig type (web app, API, scraper, bot, automation, data pipeline, browser extension), from templates
        and crystallized recipes, so repeat work gets cheaper. SCALE: jobs in parallel through the contract queue, each
        with its own budget and its own regime. Nothing here touches the Fiverr site or account — intake and delivery
        are by James's hand; Fiverr's own rules on AI-assisted work are his to follow.
      proof: "two fixture jobs in parallel: neither can read the other's files, memory or secrets; each delivers a repo whose proof report cites a passing test for every acceptance line; the second job of a kit costs fewer tokens than the first"

    ST1_settings:
      layer: interface
      status: OPEN
      depends_on: [EM1_emerge_core]
      files: [idearium/ui/settings.html, idearium/api/index.js]
      does: >-
        "settings are expanded if applicaple". Idearium's settings gain, each section only once its phase exists:
        EMERGE (the seed policy; the default build logic LINEAR | CAUSAL; crystallization's N; budgets), MEMORY & SEARCH
        (the recall lanes and their weights; field-memory sweeps; contradictions shown; MR10 on/off), ECONOMY (tokenizer
        method per provider; per-job budgets), SHADOW (shadow layer on/off per repo), BUILD TEAMS (hats per role; COS
        toolbox), CLIENT JOBS (kits; isolation; delivery checklist). Guardian's settings own the agent facts (GA1);
        Clear Glass shows them read-only with a link to Guardian. Every setting has its route and CLI verb (E12).
      proof: "every setting round-trips through UI, route and CLI; a setting for an unbuilt phase does not appear"

  # ── Wiring — E12: each phase into each system it touches. A phase is DONE only when its row is true. ────────────
  # nodes use the lib/node-export.js envelope and Guardian's nodes/<type>/<id>.<type> layout; routes carry CAPS and get a
  # .command node; every CLI verb gets a .command node; loom: the map named, real wires, bootstrapped from empty.
  wiring:
    EM0: { systems: [loom, emerge, warp], loom: "registry.json regenerated; emergence-map.js (new) for the upload's components", settings: none }
    EM1: { systems: [emerge], nodes: "emerge.core.* .component + .hook per primitive; nexstore types field, constraint, transition, observation, gap, history", cli: "emerge core check|replay --seed", loom: "emerge-map.js (new)", settings: "ST1 EMERGE" }
    EM2: { systems: [warp, cos, loom], nodes: "warp.core.link|expectation|engine|ledger .component; warp.adapters.siso-gates", cli: "warp test|adapter list", loom: "warp-map.js (updated: WARP 2 + adapter wires to cos gates and loom's driver)", settings: none }
    CF1: { systems: [intelligence, guardian, cortex, orchestrator, idearium], nodes: "intelligence.cfr.* updated; .event per CFR event type", routes: "/cfr/health, /cfr/trace, /cfr/rewind (new), /cfr/field (new)", cli: "cfr trace|rewind|field", loom: "observability-map.js (updated)", settings: "ST1 EMERGE (field thresholds)" }
    RF1: { systems: [lib/nexstore, idearium, intelligence], nodes: "nexstore types node, relation(structural|causal|provenance|semantic|contradiction)", routes: "/api/field/node, /api/field/relations, /api/field/lens/:name", cli: "field show|lens|relate", loom: "emerge-map.js + idearium-codebase-map.js (graph → lens wires)", settings: none }
    OT1: { systems: [cortex, guardian, idearium, lib], nodes: "a .wire per migrated writer → field", routes: "/api/field/observe", cli: "field observe|writers", loom: "agent-memory-map.js, chat-ledger-map.js (updated)", settings: none }
    MR1: { systems: [lib, idearium, copilot], nodes: "lib.recall-triad, lib.context-table .component; nexstore type context_table", routes: "/api/recall, /api/context-table/:id", cli: "recall <question> [--budget]", loom: "agent-memory-map.js", settings: "ST1 MEMORY & SEARCH" }
    MR2: { systems: [lib, intelligence], loom: "agent-memory-map.js", settings: "ST1 MEMORY & SEARCH" }
    MR3: { systems: [lib, intelligence], routes: "/api/gaps/search", cli: "gaps search", loom: "observability-map.js", settings: none }
    MR4: { systems: [cortex], loom: "agent-memory-map.js", settings: "ST1 MEMORY & SEARCH (sweeps)" }
    MR5: { systems: [idearium, lib], reuses: "FG1–FG4's own wiring", settings: none }
    MR6: { systems: [lib, idearium], routes: "/api/contradictions, /api/contradictions/:id/settle", cli: "contradictions list|settle", settings: "ST1 MEMORY & SEARCH" }
    MR7: { systems: [lib, cortex], routes: "/api/recipes", cli: "recipes list|show", loom: "agent-memory-map.js", settings: none }
    MR8: { systems: [warp, emerge, lib], routes: "/api/crystals", cli: "crystals list|reopen", settings: "ST1 EMERGE (N)" }
    MR9: { systems: [guardian, lib], nodes: ".capability liminal.audit", loom: "copilot-capability-map.js", settings: none }
    MR10: { systems: [lib, guardian], settings: "ST1 MEMORY & SEARCH (on/off — James's call)" }
    MR11: { systems: [intelligence, cos], routes: "/cfr/rewind", cli: "rewind field|mind", settings: none }
    CB1: { systems: [idearium, warp, intelligence], routes: "/api/repos/:uuid/build (logic: linear|causal)", cli: "idearium build --logic causal", loom: "build-surface-map.js", settings: "ST1 EMERGE (default logic)" }
    CB2: { systems: [idearium, lib], loom: "build-surface-map.js", settings: none }
    CB3: { systems: [idearium, emerge], nodes: "block causal in blocks.yaml; .event per declared event in generated repos", cli: "emerge compile --t1", loom: "one-idearium-map.js", settings: none }
    CB4: { systems: [emergence, idearium], loom: "emergence-map.js", settings: none }
    WS6: { systems: [idearium], routes: "/api/workshop/* (mode, parts)", cli: "idearium workshop --mode manual|assisted|stretched", loom: "one-idearium-map.js", settings: none }
    RC1: { systems: [idearium, guardian], routes: "/api/repos/:uuid/agent/{contract,map,run,report}", cli: "idearium repo chat <uuid>", loom: "one-idearium-map.js", settings: none }
    LN1: { systems: [idearium], loom: "ui-map.js", settings: none }
    EC6: { systems: [lib/economy], nodes: ".component lib.economy.tokenizer.gguf|bpe", routes: "/api/economy/tokens (method named)", cli: "economy tokens <text> --provider", loom: "economy-map.js", settings: "ST1 ECONOMY" }
    SH1: { systems: [lib, cos, intelligence], routes: "/api/shadow/:step", cli: "shadow show|settle", loom: "observability-map.js + cos-testenv-map.js", settings: "ST1 SHADOW" }
    GA1: { systems: [guardian, clear-glass], nodes: "every provider, userscript and hat a Guardian node", routes: "guardian /api/providers (hash-stamped), /api/agents", cli: "guardian agents list|verify", loom: "accounts-authority-map.js + copilot-capability-map.js", settings: "Guardian owns them; Clear Glass shows read-only" }
    BT1: { systems: [cos, idearium, guardian, lib], nodes: ".capability per COS tool; hats per role", routes: "/api/teams, cos /api/tools", cli: "cos tools list|run, idearium teams", loom: "cos-testenv-map.js + one-idearium-map.js", settings: "ST1 BUILD TEAMS" }
    FV1: { systems: [idearium, cos, lib/economy, guardian], nodes: "nexstore types job, contract, delivery, proof_report", routes: "/api/jobs, /api/jobs/:id/{contract,quote,build,deliver,revise}", cli: "idearium jobs new|quote|build|deliver|revise", loom: "one-idearium-map.js + cos-testenv-map.js", settings: "ST1 CLIENT JOBS" }
    ST1: { systems: [idearium, guardian, clear-glass], routes: "/api/settings/<section>", cli: "idearium settings get|set <section>.<key>", settings: "is the settings phase" }

  # ── Carried forward, so nothing from this conversation is forgotten ───────────────────────────────────────────
  carried_forward:
    - "Earlier maps, still open: CX0 CODEX (the component store grown — MR8 feeds it), BP1 destroy-and-rebuild blueprint, PL1 one entry point, UI12 retire the old spec builders (archived, not deleted), RW1 rewind engine (MR11 pairs with it), DP1 the desktop popout's options + the Setup Desktop button opening Settings, GD1 guardian supervisor, NX1."
    - "CP1: copilot drives Idearium and talks to its agents (James: \"i want copilot to be able to help with idearium. communicate with the agents,\")."
    - "The Void: the Flow rituals and the quick/full/off depth switch — offered, no answer yet."
    - "The idea workbench's assist has no backend — registerBackend is called nowhere."
    - "Emergence's own stated gaps: rupture_severity pinned (needs alk.latent.update's multimodal producer); the LLM contract is a draft (contracts/LLM_CONTRACT.js)."
    - "Main's own open maps this one reuses rather than repeats: FG1–FG6, WS5, UV1 (docs/2026-10-02-fractal-graph-any-size-agent-phasemap.spec)."
    - "James's voice rule: every version line, changelog and phasemap origin opens with his words, verbatim."

  # ── Decisions that are James's ────────────────────────────────────────────────────────────────────────────────
  decisions_for_james:
    - "EM0: may this branch be brought in line with main (merge, main's tree wins, nothing lost)?"
    - "Names: EMERGE = the language and the law, WARP = its engine (his, rewritten), Emergence = the substrate — as he called them? Or one name for the spine?"
    - "Does Rheon Kernel v2.1.0 exist beyond its definition in the Architect spec? If so, EM1 builds from it."
    - "The three Emerge specs and two RFR2 trees: which definitions win where they differ (EM0's report lists each)."
    - "MR10: on by default, or off until he switches it on?"
    - "FV1: which gig types first, for the kits?"
    - "EC6: which local models to read tokenizers from first (the ones Ollama runs here)?"

  build_order: [EM0, GA1, EM1, ST1, EC6, EM2, CF1, SH1, RF1, OT1, MR1, MR5, CB1, CB2, CB3, WS6, MR3, RC1, BT1, MR2, MR6, MR4, MR7, MR8, FV1, MR9, MR10, MR11, CB4, LN1]
  # Why this order: the deterministic core and his own engine first (EM1, EM2); CFR on RFR2's discipline and the one
  # field on top (CF1, RF1); one write path (OT1); then the recall triad, which improves every agent the day it lands,
  # and the levels it packs to (MR1, MR5); the build logic, synthesis and the causal block (CB1–CB3); the workshop, gap
  # search and the repo chat that use them (WS6, MR3, RC1); then everything that compounds (MR2–MR11, CB4) and the
  # canvas that shows it (LN1). Guardian becomes the agents' one truth early (GA1) because every later phase dispatches
  # through it; settings (ST1) start with EMERGE and grow one section per phase; the tokenizer (EC6) makes BUDGET real
  # before anything is priced; shadow space (SH1) before any model writes code; the build teams (BT1) and client jobs
  # (FV1) once the chat, the build logic and crystallization exist to make them cheap and safe.

## ADDENDUM 2026-10-02 — 1.0.0
# Mapped from the conversation of 2026-10-02, before any building. Written against main 0.39.300 and the Emergence
# upload, with every cited path checked against main. Two findings recorded while mapping: WARP's Event/Gate/Stream
# are SISO's shape (its own file says so), and Stream.emit holds each produced event's parent without recording it;
# CFR's causal graph infers 'temporal' edges between any two entries within 2s, which RFR2's rule C-1 forbids.

## ADDENDUM 2026-10-02 — 1.1.0
# James: "economy, tokenizer? shadow space?" · "i want idearium to be able to code anything i need for fiverr" ·
# "cos and idearium are our buildteams" · "guardian is the source of truth for the clearglass agents. make sure each
# addition is correctly mapped to each system…". Added EC6 (exact local tokenizers from the model's own GGUF; remote
# estimates calibrated, method always named; the economy prices the build), SH1 (lib/shadow.js's declared shadow IS
# WARP 2's expectation; models act in a COS shadow layer and only what passes reaches the real tree), GA1 (Guardian the
# agents' one truth; Clear Glass's hand-kept mirror becomes a hash-stamped cache), BT1 (the two build teams on one
# contract queue), FV1 (client jobs: contract, quote, isolated build, proof report, delivery, revisions, kits — never
# touching the Fiverr site), ST1 (settings, one section per built phase). Invariants E12 (mapped into every system as
# built: nodes, routes + .command nodes, CLI, loom with real wires, settings, atlas) and E13 (Guardian's truth), and a
# wiring row per phase. Found while mapping: clear-glass/src/providers/registry.js "mirrors guardian.spec
# ncp_providers exactly" by hand; guardian.spec exists twice (docs/ and guardian/spec/).
