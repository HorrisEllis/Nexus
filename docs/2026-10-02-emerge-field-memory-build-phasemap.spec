spec:
  meta:
    name:     emerge-field-memory-build
    version:  1.7.7
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
      expanded if applicaple." · "i want to get you to work from inside nexus. that would ne extremelty high
      leverage. then you could use introspect, okay yeah, we need that, then you could do way more than this. also
      hooking the multiple accounts into the agents/providers and settings in idearium." · "okay but all the other
      phases. make sure the yget added to nexus. make sure every system stays relative and adds routes, commands, all
      relative node types, and uses the event contract." · "with these added, can you add a value to the system then
      maybe add all of them to the phasemap?" · "Yes, then I can use idearium to build anything needed. I mean look at
      docs. Also what about shadow space reasoning for the debugging? That's what needs to be prioritized. Idearium. And
      clearglass. This system is meant to build its own capability. Nodes expand. Copilot uses raid to either complete
      the request or have the capability built using idearium. Use cos end state to have agents in a lab to solve
      problems, code. Anything the end states conditions are. Could keep filling the agent with feedback until it solves
      it. … Change your strategies until you can. Iterate the method if you can't find the solution. Mine failure modes.
      Mental simulations."
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
    claude_code_and_nexus: >-
      orchestrator/lib/mcp-stdio.js runs Nexus's MCP server over stdio "so Claude Code can connect"; orchestrator/lib/
      mcp-server.js exposes 17 tools (nexus_status, nexus_gaps, nexus_cfr, nexus_rca, nexus_read_spec, nexus_build,
      nexus_copilot…) — no introspect, no loom, no recall. No .mcp.json in the repo, so no Claude Code session opened
      on it loads them (.claude/ holds only settings.local.json). lib/introspect.js (the co-pilot examines its own last
      answer, on lib/reflection.js) is reached only through copilot's /api/introspect. idearium/repo/work-surface.js is
      the work surface James asked to be "identicle" to Claude Code's.
    accounts: >-
      Clear Glass owns accounts: clear-glass/src/accounts/login-portal.js (a sign-in per account, an accountId each,
      cookies in the sealed vault), GET :7702/accounts/resolve, cg.accounts.* capability and command nodes;
      guardian/lib/cg-account-authority.js asks Clear Glass; loom/maps/accounts-authority-map.js wires it. Idearium is
      account-blind: lib/economy learns limits, latency and success per PROVIDER, the router picks a provider, the repo
      agent routes per provider; settings.html has no accounts section.
    self_model_and_contracts: >-
      loom/scanners/phasemap-map.js reads every docs/*phasemap*.spec into loom — all 33 phases of this map parse, with
      their depends_on. But it GUESSES each phase's systems by matching prose against a fixed list (cortex, guardian,
      orchestrator, loom, copilot, clear-glass, idearium, emerge, architect, raid, intelligence, agent, chunk, replay…):
      cos, warp, emergence, economy and nexstore are not on it, so their phases are invisible per system, and prose
      words ("replay", "chunk", "architect") add false tags. The event contract: lib/event-taxonomy-pattern.js (ET1 —
      each system's own event-taxonomy.js, { EVENT_NAME: { description, payloadShape, severity } }, no cross-system
      requires); only guardian, orchestrator, versionium and clear-glass have one — idearium, cortex, intelligence, loom,
      copilot, cos, emerge and warp do not. Routes: each system's own <system>/interaction-contract.json (15 exist;
      contracts/nexus-interaction-contract.js is deprecated in their favour); cos, warp and emerge have none.
    leverage_today: >-
      Main's intelligence/synthesis (0.39.300 SY1/SY2) already ranks every open phase and gap by LEVERAGE, read from
      structure — unblocks, corroboration, centrality, kind, layer, how concrete — and orders the fill by leverage per
      unit of EFFORT (a phase costs 8 × its layer's factor). Every part is named. What structure cannot see is value to
      James: income, daily use, ownership, safety. Nothing in any phasemap declares it, and synthesis reads no such field.
    the_lab_loop_pieces: >-
      copilot/capability-extend.js — "no is not an answer": a request nothing can fulfil becomes a filed capability gap
      routed toward the builders. cos/playground/llm-lab.js — controlled agent experiments with conditions, triggers,
      feedback loops, if/then chains, results in JAA. cortex/self-heal/failure-mode-forensics.js — a failure becomes a
      .failure_mode node with its causal chain (RFR2) and a .debug_macro that replays it. lib/shadow.js — declare what a
      step must leave behind, settle, absences become gaps. idearium/repo/runtime-proof.js — which code ran under a
      passing test. docs/raid-simulation-engine.spec — scoring a simulated event before it is run. What none of them has:
      one check of whether a set of END-STATE CONDITIONS is met, in plain words, with evidence. Every loop above needs it.
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
    E14: "The event contract. Every event a phase emits is declared first in its system's own event-taxonomy.js in the ET1 shape (lib/event-taxonomy-pattern.js) — a dotted name, its SCREAMING_SNAKE key, description, payloadShape, severity; every route it adds is in that system's interaction-contract.json; every CLI verb and route has its .command node. An undeclared emit or an uncontracted route fails the phase."
    E15: "Isolation. Each system stays its own: no require() across systems except through a declared hook and wire in loom; systems meet through routes, declared events and the component registry — nothing else. A phase that touches several systems is built as one change per system, each wired on its own."
    E16: "Declared, not guessed. Every phase names its systems explicitly (`systems:`); loom's phasemap scanner reads that line first and guesses from prose only where none is given, marking the guess."
    E17: "Every phase declares its VALUE: a score 1–5 (to James), a cost S|M|L|XL, what kind of value (income, daily-use, quality, safety, ownership, compounding, foundation) and why in one line. Synthesis reads it as one more named part of leverage and its cost as the effort — added to the structural score, never replacing it, so the rank stays explainable and arguable. James can change any value; a changed value is a change to the map, with its reason."
    E18: "The judge never edits the judge. The deterministic core, James's laws (AXIOMS, E1–E18), the checkers and the proof rules are read-only to Nexus itself: it may PROPOSE a change to them, only James accepts. Everything else it may build, through the shadow layer, with rewind behind it."
    E19: "Where the graphs live. Per-project graphs (code, spec, execution, manifest, containment) live in IDEARIUM, beside the repos they describe, and code generated from graphs is written by Idearium into repos. What Nexus has LEARNED across projects (recipes, failure modes, crystals, the component library, the graph model) is memory and lives in CORTEX. The dynamics over both (CFR, RFR2, the causal graph, the field) live in INTELLIGENCE. Idearium reads cortex's library; nothing keeps a second copy."
    E11: "Nothing lost (§0.3). SISO and siso_ref stay, attributed; WARP 1.x gates run through an adapter until moved; divergent copies are surfaced, not merged silently."

  # ── Phases — bottom-up ─────────────────────────────────────────────────────────────────────────────────────────
  phases:

    EM0_ground:
      layer: foundation
      systems: [loom, emerge, emergence, warp]
      value: { score: 4, cost: M, for: [foundation], why: "everything sits on it; brings in main and fixes the 38-versions-stale component registry" }
      status: PARTIAL (1.7.3) — (1) and (2) done; (3) and (4) wait on emergence-6.zip, not in this checkout
      files: [loom/data/registry.json, loom/data/events.json, emergence/, warp/, docs/emerge-copies-divergence.md]
      does: >-
        (1) This branch brought in line with main 0.39.300 (a merge, main's tree wins; this branch's 0.39.298
        Architect stays in history — main's 0.39.299 rebuild supersedes it). (2) loom/data/registry.json regenerated
        from empty on main's maps — main still carries 0.39.262's (2275 components; lib/component-store.js absent).
        (3) The Emergence upload brought in as emergence/ beside emerge/, and WARP 1.5.0 over 1.4.0 (its changelog
        read first; warp's own 43 tests and every Nexus WARP consumer re-run). (4) A divergence report of the three
        Emerge specs and the two RFR2 trees, line by line, for James to decide — nothing merged silently.
      proof: "the branch equals main + this map; the registry offers nexus.lib.component-store; emergence's 157 and warp's 43 tests pass inside Nexus; the divergence report lists every differing definition"

    EV0_contracts_for_every_system:
      layer: foundation
      systems: [idearium, cortex, intelligence, loom, copilot, cos, emerge, warp]
      value: { score: 4, cost: M, for: [quality, foundation], why: "drift stops piling up: an undeclared event or route fails the suite" }
      status: PARTIAL (1.7.7) — (1) done for every system but warp (waits on 1.5.0); (3) built; (2)(4)(5) open
      depends_on: [EM0_ground]
      files: [idearium/event-taxonomy.js, cortex/event-taxonomy.js, intelligence/event-taxonomy.js, loom/event-taxonomy.js, copilot/event-taxonomy.js, cos/event-taxonomy.js, emerge/event-taxonomy.js, warp/event-taxonomy.js, cos/interaction-contract.json, warp/interaction-contract.json, emerge/interaction-contract.json, loom/scanners/phasemap-map.js, lib/event-taxonomy-pattern.js]
      does: >-
        E14–E16 made real before any phase uses them. (1) An event-taxonomy.js in the ET1 shape for each system that has
        none and that this map touches — written from the events each system ALREADY emits (read from its bus.emit /
        broadcast calls, not invented), so nothing it does today is undeclared. (2) interaction-contract.json for cos,
        warp and emerge, projected from their real route tables, as idearium's was (contract.live). (3) A check, per
        system: every emitted event string is in its taxonomy, every served route in its contract — a test, so drift
        fails the suite instead of piling up. (4) loom's phasemap scanner reads a phase's `systems:` line first (E16), its
        system list grows to cos, warp, emergence, economy and nexstore, and a prose guess is marked as one. (5) E17:
        intelligence/synthesis reads a phase's `value:` — the score added as one more named part of leverage ("declared
        +N"), the cost as its effort (S 2, M 4, L 8, XL 16) — so the fill order Nexus computes for itself includes what
        James values, and says so. Every later phase adds its own events and routes to these files as it is built.
      proof: "the check passes for every system with a contract; an emit added without a taxonomy entry fails it; loom lists this map's phases under cos and warp; no phase of this map is tagged 'general'"

    UI0_the_stations_agree:
      layer: interface
      systems: [idearium]
      value: { score: 4, cost: S, for: [daily-use, quality], why: "what James sees every day; four small, visible fixes" }
      status: OPEN
      depends_on: [EM0_ground]
      files: [idearium/ui/architect.html, idearium/ui/workshop.html, idearium/ui/spec-library.html, idearium/ui/settings.html, idearium/ui/index.html, idearium/ui/css/void-theme.css]
      does: >-
        Found in the screenshots of main, 2026-10-02: on the Architect the ENGINE band's label is drawn over the LAY OUT
        THE SPEC button; REACH is still in the workshop (James: "reach sectoin needs to be removed" — the part WS6 owns is
        the parts and modes; this phase only takes REACH out); the Spec Library and Settings are the old style in lowercase;
        the home page is partly lowercase ("Welcome", "settings", the cards). James: "no lowercase. and make sure its
        enterprise grade". Each page onto the shared void-theme.css, capitals, the overlap fixed — no new features.
      proof: "driven in Chromium against the real server, wide and narrow: no overlapping text, no visible lowercase on any station, REACH absent, no console errors"

    EM1_emerge_core:
      layer: foundation
      systems: [emerge]
      value: { score: 3, cost: L, for: [ownership, foundation], why: "his constraint field as code; the deterministic core every other phase leans on" }
      status: OPEN
      depends_on: [EM0_ground, EV0_contracts_for_every_system]
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
      systems: [warp, cos, loom]
      value: { score: 3, cost: XL, for: [ownership], why: "an engine that is his, not SISO; high to him, slow to pay back" }
      status: OPEN
      depends_on: [EM1_emerge_core, SH1_shadow_space]
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
      systems: [intelligence, guardian, cortex, orchestrator, idearium]
      value: { score: 4, cost: L, for: [quality, compounding], why: "causes stop being guessed; every failure traces to its real source" }
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
      systems: [nexstore, idearium, intelligence, emerge]
      value: { score: 3, cost: XL, for: [foundation, compounding], why: "one field instead of seven graphs; right, but the largest migration" }
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
      systems: [cortex, guardian, idearium, nexstore]
      value: { score: 3, cost: XL, for: [foundation], why: "every memory write checked; long payback" }
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
      systems: [idearium, copilot, cortex]
      value: { score: 5, cost: M, for: [daily-use, quality], why: "every agent gets better context the day it lands" }
      status: OPEN
      depends_on: [EM0_ground, EV0_contracts_for_every_system]
      files: [lib/repo-context.js, lib/vector-memory.js, lib/recall-triad.js, lib/context-table.js]
      does: >-
        "make sure its all like builds table of relevant context". Three lanes: LEXICAL (repo-context — what is
        named), VECTOR (vector-memory — what is similar), RELATIONAL (a walk of the field — what is connected: causes,
        dependencies, provenance). Each hit is a row: source, lanes that found it, relevance, confidence, hash, tokens,
        why. Lanes that agree raise confidence; a single-lane hit is marked weak. Constraints filter
        deterministically; the table is packed to the agent's budget (E8) with the cut said, and kept with whatever it
        built — what the agent knew, why, and what it left out.
      note: "Built first on what exists (value-first, E17): lexical = lib/repo-context.js, vector = lib/vector-memory.js, relational = a walk of the CODE graph and loom's wires. When RF1 and OT1 land, the relational lane reads the one field instead — same table, better lane."
      proof: "a fixture question: a chunk found by all three lanes outranks one found by one; the table persists beside the build and replays; nothing over budget is silently dropped"

    MR2_vector_space_for_the_field:
      layer: library
      systems: [cortex, intelligence]
      value: { score: 2, cost: M, for: [quality], why: "makes convergence mean something; useful, not urgent" }
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
      systems: [intelligence, cortex]
      value: { score: 4, cost: M, for: [compounding], why: "search for what is missing, highest pressure first" }
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
      systems: [cortex]
      value: { score: 2, cost: M, for: [quality], why: "memory kept by importance; better, not urgent" }
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
      systems: [idearium]
      value: { score: 3, cost: L, for: [compounding], why: "any size of model can work at the right level; reuses main FG1–FG4" }
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
      systems: [cortex, idearium]
      value: { score: 3, cost: S, for: [quality], why: "disagreements shown to him, not averaged away" }
      status: OPEN
      depends_on: [RF1_relational_field, MR1_recall_triad_and_context_table]
      does: >-
        E9. When recall returns memories or sources that disagree, both are kept, linked `contradicts`, and shown to
        James. His settlement is recorded with its cause — the strongest learning event the system can get, and the
        first in line for MR8.
      proof: "two contradicting sources both reach the context table, marked; settling one records the settlement as a transition caused by James"

    MR7_recipes:
      layer: service
      systems: [cortex, emergence]
      value: { score: 4, cost: M, for: [compounding], why: "every success becomes a recipe for the next one" }
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
      systems: [warp, emerge]
      value: { score: 5, cost: M, for: [compounding, income], why: "discoveries paid for once; Nexus gets cheaper as it learns" }
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
      systems: [intelligence, guardian]
      value: { score: 3, cost: S, for: [quality, safety], why: "agent replies checked for unsupported claims and reversals" }
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
      systems: [intelligence, guardian]
      value: { score: 2, cost: M, for: [quality], why: "agents learn how he means things; interesting, last" }
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
      systems: [intelligence, cos]
      value: { score: 3, cost: M, for: [safety], why: "rewind memory with the machine; pairs with RW1" }
      status: OPEN
      depends_on: [CF1_cfr_improved_with_rfr2, OT1_one_write_path]
      reuses: [docs/2026-10-02-workshop-codex-rewind-phasemap.spec RW1]
      does: >-
        cfr-kernel rewind + the hash-chained history: any agent's memory and field replayed to any moment. Paired with
        RW1 (the VM rewind) — the OS and the mind rewound together, to the same point.
      proof: "rewind to entry N: the field, the context table and the agent memory read as they did at N"

    CB1_cfr_build_logic:
      layer: service
      systems: [idearium, warp, intelligence]
      value: { score: 4, cost: L, for: [quality], why: "the build steers itself and halts with a cause instead of looping" }
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
      systems: [idearium]
      value: { score: 4, cost: L, for: [quality], why: "code built from synthesis with provenance, small enough for local models" }
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
      systems: [idearium, emerge]
      value: { score: 3, cost: M, for: [quality], why: "the spec becomes a contract the running system is checked against" }
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
      systems: [emergence, idearium]
      value: { score: 2, cost: M, for: [compounding], why: "Emergence aimed at building; mostly covered by CB1 + CB2" }
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
      systems: [idearium]
      value: { score: 4, cost: M, for: [daily-use], why: "the workshop he asked for: parts, modes, his ideas only" }
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
      systems: [idearium, guardian]
      value: { score: 5, cost: L, for: [daily-use, income], why: "the loop of this conversation, inside every repo" }
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
      systems: [idearium]
      value: { score: 3, cost: M, for: [daily-use], why: "the field visible on the Architect canvas" }
      status: OPEN
      depends_on: [RF1_relational_field, MR5_fractal_levels_with_the_field]
      files: [idearium/ui/js/arch-canvas.js, idearium/ui/architect.html]
      does: >-
        The field drawn on main's Architect canvas: the regime as colour, gaps as dashed absences, contradictions as
        crossed links, zoom through every LEVEL; a context-table viewer for any build. The Void's look, capitals.
      proof: "driven in Chromium: zoom from system to chunk, a turbulent leaf visible from the top, a build's context table opens from its node"

    EC6_economy_and_the_tokenizer:
      layer: library
      systems: [economy]
      value: { score: 4, cost: S, for: [income, quality], why: "exact local counts; quotes and budgets become real numbers" }
      status: OPEN
      depends_on: [EM1_emerge_core, EV0_contracts_for_every_system]
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
      systems: [cos, intelligence, idearium]
      value: { score: 5, cost: M, for: [safety], why: "models never write the real tree; the precondition for any client work" }
      status: OPEN
      depends_on: [EM0_ground, EV0_contracts_for_every_system]
      files: [lib/shadow.js, intelligence/liminal-space/, cos/workspace/, emergence/vendor/rfr2/liminal/shadow.js]
      does: >-
        "shadow space?" One idea, three uses joined. (1) The SHADOW is the expectation: WARP 2's expectations ARE
        lib/shadow.js's declarations — before a step runs it declares what must exist after; negative space on settle
        is the gap. One mechanism, not two. (2) The SHADOW SPACE is where the probabilistic shell acts: a generated
        change runs first in a shadow layer — a COS overlay on the repo's workspace (cockpit's shadow_layer) — and only
        what passes the constraints and its shadow is committed into the real tree. Models never write the real tree
        directly. (3) The shadow READ: the liminal shadow detector on agent replies and briefs (MR9) — what is implied
        and unsaid. Shadow and negative space become a region of the relational field, drawn on the canvas (LN1).
      note: "Built first on lib/shadow.js and COS's workspace as they are (value-first, E17); EM2 then makes WARP 2's expectations BE these shadows — one mechanism, adopted, not a second one."
      proof: "a step's declared shadow is its WARP 2 expectation once EM2 lands (one record, not two); a generated change that fails its tests never reaches the real tree; the absent file of a step is a gap with the step as cause"

    GA1_guardian_source_of_truth:
      layer: foundation
      systems: [guardian, clear-glass]
      value: { score: 4, cost: S, for: [safety, quality], why: "one truth for the agents; removes a drift risk already found" }
      status: OPEN
      depends_on: [EM0_ground, EV0_contracts_for_every_system]
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
      systems: [cos, idearium, guardian]
      value: { score: 4, cost: L, for: [income], why: "COS and Idearium working one queue, every hand-off traced" }
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
      systems: [idearium, cos, economy, guardian]
      value: { score: 5, cost: L, for: [income], why: "brief to proven delivery: the direct path to earning" }
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
      systems: [idearium, guardian, clear-glass]
      value: { score: 3, cost: M, for: [daily-use], why: "every new behaviour can be seen and changed without code" }
      status: OPEN
      depends_on: [EM1_emerge_core, EV0_contracts_for_every_system]
      files: [idearium/ui/settings.html, idearium/api/index.js]
      does: >-
        "settings are expanded if applicaple". Idearium's settings gain, each section only once its phase exists:
        EMERGE (the seed policy; the default build logic LINEAR | CAUSAL; crystallization's N; budgets), MEMORY & SEARCH
        (the recall lanes and their weights; field-memory sweeps; contradictions shown; MR10 on/off), ECONOMY (tokenizer
        method per provider; per-job budgets), SHADOW (shadow layer on/off per repo), AGENTS & ACCOUNTS (AC1, IN1, IN2), BUILD TEAMS (hats per role; COS
        toolbox), CLIENT JOBS (kits; isolation; delivery checklist). Guardian's settings own the agent facts (GA1);
        Clear Glass shows them read-only with a link to Guardian. Every setting has its route and CLI verb (E12).
      proof: "every setting round-trips through UI, route and CLI; a setting for an unbuilt phase does not appear"

    IN1_nexus_as_claude_codes_toolbox:
      layer: service
      systems: [orchestrator, copilot, loom]
      value: { score: 5, cost: S, for: [compounding, daily-use], why: "Claude Code sees Nexus from inside; every later phase gets built faster and better" }
      status: OPEN
      depends_on: [EM0_ground, GA1_guardian_source_of_truth, EV0_contracts_for_every_system]
      files: [.mcp.json, orchestrator/lib/mcp-server.js, orchestrator/lib/mcp-stdio.js, lib/introspect.js, lib/reflection.js]
      does: >-
        "i want to get you to work from inside nexus … then you could use introspect". Claude Code → Nexus. A .mcp.json
        at the repo root registers Nexus's MCP server, so every Claude Code session opened on this repo loads Nexus's
        tools (a cloud session asks to approve project servers first). The server gains what a builder needs, each a thin
        call onto what exists: introspect + reflection (examine the last answer, score the decision), loom (find a
        component, its hooks and wires, the impact of changing it), the recall triad and context table (MR1, once built),
        gaps and gap search, CFR trace and rewind, the field and its lenses, settings get, jobs. Every tool degrades
        honestly when its service is down ("cfr not reachable on :<port>"), never a fake answer. The session's own work
        is recorded into Nexus as Observations with cause — Claude Code becomes one more agent in the field, audited by
        the same constraints.
      proof: "a Claude Code session opened on the repo lists the Nexus tools; introspect on a fixture answer returns its reflection score; loom lookup of lib/component-store.js returns its real wires; with services stopped each tool says which one is down"

    IN2_claude_code_inside_nexus:
      layer: service
      systems: [guardian, economy, idearium, cos]
      value: { score: 5, cost: M, for: [income, daily-use], why: "the strongest coder available, working inside his pipeline on his account" }
      status: OPEN
      depends_on: [GA1_guardian_source_of_truth, AC1_accounts_into_agents, SH1_shadow_space]
      files: [lib/providers/claude-code.js, lib/economy/policy.js, lib/repo-agent.js, idearium/repo/work-surface.js]
      does: >-
        Nexus → Claude Code. A provider 'claude-code' — headless Claude Code (or the Agent SDK) on James's own machine,
        under his own signed-in account — registered in Guardian as a provider node (E13), priced by the economy (EC6),
        chosen by the router like any other. The repo agent and the build teams (BT1) hand it a repo, its CLAUDE.md, the
        contract and the context table; it works in the shadow layer (SH1), and what it returns is an Observation that
        must pass the constraints before it reaches the real tree (E1). The work surface shows its session live. Big,
        cross-file work goes here; small pieces stay on local models.
      proof: "a fixture contract dispatched to claude-code returns changes in the shadow layer only; failing changes never reach the tree; its cost lands in the economy ledger under the account that ran it"

    AC1_accounts_into_agents:
      layer: library
      systems: [clear-glass, guardian, economy, idearium]
      value: { score: 4, cost: M, for: [daily-use, income], why: "every account he has gets used, priced and learned separately" }
      status: OPEN
      depends_on: [GA1_guardian_source_of_truth, EC6_economy_and_the_tokenizer, ST1_settings]
      files: [guardian/lib/cg-account-authority.js, lib/economy/policy.js, lib/economy/ledger.js, lib/economy/router.js, lib/economy/gate.js, lib/repo-agent.js, idearium/ui/settings.html]
      does: >-
        "hooking the multiple accounts into the agents/providers and settings in idearium". The unit becomes PROVIDER ×
        ACCOUNT. Clear Glass keeps owning sign-in and the vaults; Guardian publishes each account as a node (E13). The
        economy learns limits, latency and success per account; the router chooses a provider and an account; the gate
        holds each account to its own limits. Defaults per job type, per repo, per client job (FV1 — a client's work can
        run on the account James picks for it). Idearium's settings gain AGENTS & ACCOUNTS: the accounts read from
        Guardian, read-only there, with their learned limits and spend, and the defaults editable. The gate never
        switches accounts to get around a provider's limit on its own — a fallback account is only ever James's
        explicit setting, and providers' terms on multiple accounts are his to follow.
      proof: "two accounts on one provider learn separate limits; a job pinned to an account runs only on it; the settings section lists Guardian's accounts and edits a default through route and CLI"

    PR1_proof_run_the_delivery_checker:
      layer: service
      systems: [idearium]
      value: { score: 5, cost: M, for: [income, safety, foundation], why: "James cannot read code: every delivery and every lab run must prove itself in plain words; the core every loop below uses" }
      status: DONE (0.39.302) — built ahead of EM0 on James's priority; screenshots are PR2
      depends_on: [EM0_ground]
      files: [idearium/repo/proof-run.js, idearium/event-taxonomy.cjs, idearium/api/index.js, idearium/cli/index.js, lib/shadow.js]
      does: >-
        "Yes" — the delivery checker. END-STATE CONDITIONS, each one an acceptance line in plain words with a check: a file
        exists (and contains), a command succeeds (and prints), the tests pass, the app starts and a page answers with the
        right status and content. Shadow-space first (lib/shadow.js): before running, it DECLARES everything the
        conditions expect; after, whatever is absent is the bug — a gap with its cause, not a guess. A failure is
        classified (missing file, command failed, timed out, page down, content missing). The result is a proof report
        in plain language — "7 of 8 met, not ready: the contact page answers 404" — written into the repo as
        proof/PROOF-REPORT.md for the client, and the run kept as history. The agent may PROPOSE conditions from a brief
        (Observations); James accepts them. Runs repo code exactly as runtime-proof and L6 do (cwd = the repo, limits).
      proof: "a fixture repo: met and unmet conditions of every kind reported with evidence; an absent file is a shadow gap; a server is started, checked and always stopped; the report reads in plain words"

    PR2_screenshots_through_clear_glass:
      layer: service
      systems: [clear-glass, idearium]
      value: { score: 4, cost: S, for: [income, quality], why: "the client sees it working; strongest evidence a non-coder can hand over" }
      status: OPEN
      depends_on: [PR1_proof_run_the_delivery_checker, GA1_guardian_source_of_truth]
      files: [clear-glass/src/ipc/bridge.js, clear-glass/src/driver/index.js, idearium/repo/proof-run.js]
      does: >-
        A small Clear Glass door (POST /cli/driver/screenshot: open a url in a background tab, wait, capture, close) so
        each page condition in a proof run carries a screenshot. Clear Glass not running → said in the report, never a
        silent missing image.
      proof: "with Clear Glass up, a page condition's evidence includes its screenshot; with it down, the report says so"

    LB1_the_end_state_lab:
      layer: service
      systems: [cos, idearium, guardian, intelligence]
      value: { score: 5, cost: L, for: [compounding, income], why: "agents iterate in a sandbox until the end-state conditions are met — the self-building engine" }
      status: OPEN
      depends_on: [PR1_proof_run_the_delivery_checker, SH1_shadow_space, CB1_cfr_build_logic]
      files: [cos/playground/llm-lab.js, cos/playground/sandbox.js, idearium/repo/proof-run.js, copilot/capability-extend.js]
      does: >-
        "Use cos end state to have agents in a lab to solve problems … keep filling the agent with feedback until it
        solves it … change your strategies until you can." A lab run: an END STATE (PR1 conditions), a COS sandbox
        branch of the repo (the shadow layer), an agent. Loop: attempt → proof run → the unmet conditions and their
        failure modes fed back → attempt again. STRATEGY changes when the same conditions keep failing (CFR's regime:
        resonant = stop repeating, change approach; turbulent = decompose smaller; another provider or account; a
        recipe from MR7), and the change itself is recorded with its reason. Bounded: a budget of attempts, tokens and
        time (EC6) James sets, and a halt that reports what was tried and why it stopped. Met → the change is offered to
        the real tree with its proof report; never merged on its own. Copilot's capability gaps (capability-extend)
        can open a lab run, so "I can't" becomes "being built, here is the proof when it is".
      honest_limit: "It can only solve what its conditions can CHECK. A goal whose success cannot be tested by a machine (\"cure cancer\") cannot be met by this loop; its useful part is the checkable sub-problems inside it."
      proof: "a fixture end state the first attempt fails: feedback carries the failures, the strategy changes after repeats, the run meets the conditions or halts within budget with its record"

    FM1_mining_failure_modes:
      layer: library
      systems: [cortex, intelligence, idearium]
      value: { score: 4, cost: M, for: [compounding, quality], why: "every failure teaches the next attempt; patterns become anti-recipes and fixes" }
      status: OPEN
      depends_on: [PR1_proof_run_the_delivery_checker, CF1_cfr_improved_with_rfr2]
      files: [cortex/self-heal/failure-mode-forensics.js, cortex/self-heal/fault-taxonomy.js, idearium/repo/proof-run.js]
      does: >-
        "Mine failure modes." Every unmet condition of every proof and lab run becomes a .failure_mode node through
        failure-mode-forensics (causal chain, sigma/delta, a .debug_macro that replays it); recurring modes are clustered
        and ranked by how often and how costly; the top ones become anti-recipes (MR7) and checks added to future end
        states by default ("this kind of project usually breaks here — check it").
      proof: "three fixture runs failing the same way produce one clustered mode with its count, its replay macro, and a default check proposed for the next end state"

    MS1_mental_simulation:
      layer: library
      systems: [intelligence, cortex]
      value: { score: 3, cost: M, for: [quality, compounding], why: "try a strategy in imagination before spending real attempts" }
      status: OPEN
      depends_on: [FM1_mining_failure_modes, LB1_the_end_state_lab]
      files: [docs/raid-simulation-engine.spec, intelligence/cfr/]
      does: >-
        "Mental simulations." Before a lab attempt, the planned strategy is run against the mined failure modes and
        recipes (no code executed): which known modes is it likely to hit, which conditions will it probably miss, what
        does it cost. A probabilistic Lens with its confidence, used to choose the next strategy, never to claim a
        result. Builds on raid-simulation-engine.spec's scoring of simulated events.
      proof: "for a fixture strategy that hit a known mode before, the simulation predicts that mode before the attempt, with its confidence; its predictions are scored against what then happens"

    RD1_raid_complete_or_build:
      layer: service
      systems: [copilot, cortex, idearium, cos]
      value: { score: 5, cost: M, for: [compounding], why: "the self-building front door: every request is either done or becomes a capability that is built, proven and registered" }
      status: OPEN
      depends_on: [PR1_proof_run_the_delivery_checker, LB1_the_end_state_lab]
      files: [copilot/capability-extend.js, cortex/core/raid/index.js, idearium/repo/proof-run.js]
      does: >-
        James: "Copilot uses raid to either complete the request or have the capability built using idearium. … Nodes
        expand." RAID decides per request: COMPLETE it with what exists, or BUILD the missing capability — the gap
        capability-extend files becomes an end state (PR1 conditions written from the request), Idearium builds it, the
        lab (LB1) iterates until the conditions pass, and the new capability is registered as nodes (registry, routes,
        CLI, loom — E12) so the next request finds it. A request is answered when its end state is proven, never before.
      proof: "a request no tool serves today: a gap, an end state, a lab run, a registered capability, then the same request completed by it"

    DA1_domain_agnostic_end_states:
      layer: library
      systems: [idearium, intelligence, clear-glass]
      value: { score: 5, cost: M, for: [compounding], why: "the same loop for research, problem solving and code" }
      status: OPEN
      depends_on: [PR1_proof_run_the_delivery_checker]
      files: [idearium/repo/proof-run.js]
      does: >-
        James: "This is non linear and domain agnostic. Research. Problem solving. Coding." Condition kinds beyond code,
        each checked by a machine, never by the model's own say-so: CLAIM (a finding must cite sources, read through
        Clear Glass, each quote found at its source), DATA (a result must reproduce from recorded inputs and seed),
        CONSISTENCY (no contradiction with settled facts in the relational field, MR6), REVIEW (James's own yes,
        recorded). A research or problem-solving end state is a list of these; the lab iterates on them as on code.
      honest_limit: "What a machine cannot check stays a REVIEW condition for James; the loop never marks it met itself."
      proof: "a fixture research end state: a claim without a source is unmet, a quote not found at its source is unmet, a reproducible result is met"

    GL1_the_graphs_as_a_model:
      layer: library
      systems: [intelligence, cortex, idearium]
      value: { score: 4, cost: L, for: [compounding, ownership], why: "the graphs predict the next step — a learned model of his own beside the LLMs" }
      status: OPEN
      depends_on: [RF1_relational_field, MR7_recipes, FM1_mining_failure_modes]
      does: >-
        James: "This is also technically an llm. The graphs." The relational field, its recipes and its mined failure
        modes predict, from a state, which next step usually reaches the end state and which usually fails, with
        confidence from counts (the pattern engine's Markov recall, MR7, FM1). One more proposer beside the LLMs —
        local, cheap, his — and scored against what then happens, so its weight is earned, not assumed.
      proof: "after fixture runs, the graph model predicts the next successful step better than chance, its score shown"

    PH1_phase_runs_end_in_proof:
      layer: service
      systems: [idearium]
      value: { score: 5, cost: S, for: [compounding], why: "the engine: Ollama builds Nexus piece by piece and nothing enters without passing its own proof" }
      status: DONE (0.39.303)
      depends_on: [PR1_proof_run_the_delivery_checker]
      files: [idearium/api/index.js, idearium/repo/proof-run.js, lib/chunk-build-orchestrator.js, lib/repo-agent.js]
      does: >-
        James: "It can build it. Piece by piece look at idearium." What exists, read: specs cut into blocks and chunks,
        each routed to an agent (blocks.yaml — four blocks default to ollama; chunk-dispatch falls back to ollama);
        chunk-build-orchestrator tries every agent before giving up; the repo agent runs on ollama with repo-context
        feeding a small model only what matches; repo.phase.run builds a phase and has another agent review it; Nexus
        is itself an Idearium repo (nexus-self) behind an apply gate with a snapshot. Missing: a judge that RUNS the work.
        Each phase run now ends with a proof run of that phase's own proof lines as conditions. Met → accepted. Unmet →
        the unmet conditions, their modes and causes go back to the same agent as the next attempt's feedback; repeated
        failure → the orchestrator's next agent. The first real run of the lab loop, on Nexus itself.
      proof: "a fixture phase whose first attempt misses a condition: the run is not accepted, the feedback carries the unmet condition, the second attempt is judged again"

    GG1_graphs_generate_code:
      layer: service
      systems: [idearium, emerge]
      value: { score: 5, cost: M, for: [compounding, income], why: "a growing share of every build written by the graphs with no LLM; the model writes only what is new" }
      status: OPEN
      depends_on: [PH1_phase_runs_end_in_proof, EV0_contracts_for_every_system]
      files: [emerge/compiler/index.js, emerge/compiler/emit.js, idearium/repo/graph.js, idearium/lib/wiring-gen.js]
      does: >-
        James: "I'm saying to generate code." What already runs with no LLM: emerge's T0 (structure) and T1 (typed
        interfaces, gate stubs, wiring, test skeletons) from a spec. Added: the WIRING of a phase generated from its wiring
        row (routes in the table with CAPS, CLI verbs, registry entries, nodes, loom map lines, event-taxonomy entries,
        contract routes) — mechanical, and a large share of every build; tests generated from end-state conditions;
        composition of known components from the library by their recorded dependencies; and any crystal (MR8) produced
        as a template. Each generation is judged by a proof run like any agent's work. What the graphs cannot write — new
        logic — goes to the model (emerge T2/T3), one node, inside a budget.
      proof: "a phase's wiring generated from its row with zero model calls, passing the version-sync, registry and loom checks; a component composed from the library passing its conditions"

    CL1_the_component_lab:
      layer: service
      systems: [idearium, cortex, cos]
      value: { score: 5, cost: M, for: [compounding, income], why: "Ollama builds components one at a time, the graphs keep them; the library grows and each new system is more assembly, less model" }
      status: OPEN
      depends_on: [PH1_phase_runs_end_in_proof, GG1_graphs_generate_code, CX0_codex_component_store]
      files: [lib/component-store.js, idearium/repo/proof-run.js, cos/playground/sandbox.js]
      does: >-
        James: "What if I add a workshop or component lab for oLlama building components." A component is named in
        plain words with its inputs, outputs and promises (end-state conditions). The graphs generate everything mechanical
        (GG1); Ollama fills only the logic, in pieces sized for a 7B model with only the context it needs (MR1, MR5); the
        proof run judges; unmet promises go back as feedback, strategy or agent changes when stuck (LB1). Passed →
        into the component store (cortex, E19) with its proof, tiered draft → proven → crystal (reused and passed again N
        times). Next time it is found by what it does and composed, not rebuilt. James reads proof reports, never code.
      proof: "a fixture component built by a small model through the lab, stored with its proof, then composed into a second fixture system without a model call"

    CX0_codex_component_store:
      layer: library
      systems: [cortex, idearium]
      value: { score: 4, cost: M, for: [compounding], why: "the library the lab fills and the Architect and the graphs draw from" }
      status: OPEN — carried from docs/2026-10-02-workshop-codex-rewind-phasemap.spec CX0
      depends_on: [EM0_ground]
      files: [lib/component-store.js]
      does: >-
        The component store grown into CODEX, as mapped in the workshop-codex-rewind map (tiers, promotion, seams,
        similarity), living in cortex (E19) and read by Idearium's Architect and GG1. Each entry carries its proof run.
      proof: "the workshop-codex-rewind map's own CX0 proof, plus: every stored component carries the proof run that admitted it"

  # ── Wiring — E12: each phase into each system it touches. A phase is DONE only when its row is true. ────────────
  # nodes use the lib/node-export.js envelope and Guardian's nodes/<type>/<id>.<type> layout; routes carry CAPS and get a
  # .command node; every CLI verb gets a .command node; loom: the map named, real wires, bootstrapped from empty.
  wiring:
    PH1: { systems: [idearium], events: "idearium: IDEARIUM_PHASE_PROVEN, IDEARIUM_PHASE_ATTEMPT_UNMET", contract: "idearium", routes: "repo.phase.run (ends in a proof run)", cli: "idearium phase run <repo> <phase>", loom: "one-idearium-map.js", settings: none }
    GG1: { systems: [idearium, emerge], events: "idearium: CODE_GENERATED_FROM_GRAPH", contract: "idearium", routes: "/api/repos/:uuid/generate/wiring", cli: "idearium generate wiring <repo> <phase>", loom: "one-idearium-map.js", settings: none }
    CL1: { systems: [idearium, cortex, cos], events: "cortex: COMPONENT_ADMITTED, COMPONENT_CRYSTALLIZED", contract: "idearium, cortex", routes: "/api/lab/components, /api/lab/components/:id/attempt", cli: "idearium lab component new|status", loom: "one-idearium-map.js", settings: "ST1 BUILD TEAMS (lab budgets, model per tier)" }
    CX0: { systems: [cortex, idearium], events: "cortex: COMPONENT_STORED", contract: "cortex", routes: "/api/components (existing store routes)", cli: "nexus components find|show", loom: "one-idearium-map.js", settings: none }
    RD1: { systems: [copilot, cortex, idearium, cos], events: "cortex: RAID_DECIDED_BUILD, CAPABILITY_REGISTERED", contract: "copilot, cortex", routes: "/api/capabilities/build", cli: "copilot build-capability <request>", loom: "copilot-capability-map.js", settings: none }
    DA1: { systems: [idearium, intelligence, clear-glass], events: "idearium: IDEARIUM_PROOF_RUN_SETTLED (kinds widen)", contract: "idearium", routes: "deliver/check, new kinds", cli: "idearium deliver check", loom: "one-idearium-map.js", settings: none }
    GL1: { systems: [intelligence, cortex, idearium], events: "intelligence: GRAPH_MODEL_PREDICTED, GRAPH_MODEL_SCORED", contract: "intelligence", routes: "/api/intelligence/graph-model/predict", cli: "intelligence predict", loom: "observability-map.js", settings: none }
    PR1: { systems: [idearium], events: "idearium: PROOF_RUN_STARTED, PROOF_RUN_SETTLED", contract: "idearium", nodes: "nexstore type proof_run; .command per route", routes: "POST /api/repos/:uuid/deliver/check, GET /api/repos/:uuid/deliver/check, POST /api/repos/:uuid/deliver/conditions", cli: "idearium deliver check|conditions <repo>", loom: "one-idearium-map.js", settings: none }
    PR2: { systems: [clear-glass, idearium], events: "clear-glass: DRIVER_SCREENSHOT_TAKEN", contract: "clear-glass", routes: "POST /cli/driver/screenshot", cli: "none", loom: "copilot-capability-map.js", settings: none }
    LB1: { systems: [cos, idearium, guardian, intelligence], events: "cos: LAB_ATTEMPT, LAB_STRATEGY_CHANGED, LAB_MET, LAB_HALTED", contract: "cos, idearium", routes: "/api/lab/runs, /api/lab/runs/:id/{attempt,halt}", cli: "cos lab run|status|halt", loom: "cos-testenv-map.js + one-idearium-map.js", settings: "ST1 BUILD TEAMS (lab budgets)" }
    FM1: { systems: [cortex, intelligence, idearium], events: "cortex: FAILURE_MODE_MINED", contract: "cortex", nodes: ".failure_mode, .debug_macro (existing types)", routes: "/api/failure-modes, /api/failure-modes/top", cli: "cortex failure-modes top", loom: "observability-map.js", settings: none }
    MS1: { systems: [intelligence, cortex], events: "intelligence: SIMULATION_RUN", contract: "intelligence", routes: "/api/intelligence/simulate", cli: "intelligence simulate <strategy>", loom: "observability-map.js", settings: none }
    UI0: { systems: [idearium], events: "none", contract: "none (pages only)", nodes: "none new", cli: "none", loom: "ui-map.js (the pages' shared theme wires)", settings: none }
    EV0: { events: "none new: declares what each system already emits", contract: "event-taxonomy.js x8; interaction-contract.json for cos, warp, emerge", systems: [idearium, cortex, intelligence, loom, copilot, cos, emerge, warp], nodes: ".component per taxonomy and contract file", cli: "nexus contracts check [--system <s>]", loom: "observability-map.js (the check's wires)", settings: none }
    EM0: { events: "loom: LOOM_REGISTRY_REGENERATED", contract: "loom", systems: [loom, emerge, warp], loom: "registry.json regenerated; emergence-map.js (new) for the upload's components", settings: none }
    EM1: { events: "emerge: EMERGE_OBSERVATION_PROPOSED, EMERGE_TRANSITION_COMMITTED, EMERGE_OBSERVATION_REJECTED, EMERGE_GAP_OPENED", contract: "emerge", systems: [emerge], nodes: "emerge.core.* .component + .hook per primitive; nexstore types field, constraint, transition, observation, gap, history", cli: "emerge core check|replay --seed", loom: "emerge-map.js (new)", settings: "ST1 EMERGE" }
    EM2: { events: "warp: WARP_LINK_RECORDED, WARP_EXPECTATION_DECLARED, WARP_EXPECTATION_MET, WARP_EXPECTATION_BROKEN", contract: "warp", systems: [warp, cos, loom], nodes: "warp.core.link|expectation|engine|ledger .component; warp.adapters.siso-gates", cli: "warp test|adapter list", loom: "warp-map.js (updated: WARP 2 + adapter wires to cos gates and loom's driver)", settings: none }
    CF1: { events: "intelligence: CFR_EDGE_RECORDED, CFR_REGIME_CHANGED, CFR_REWOUND, CFR_CONTRACT_VIOLATED", contract: "intelligence", systems: [intelligence, guardian, cortex, orchestrator, idearium], nodes: "intelligence.cfr.* updated; .event per CFR event type", routes: "/cfr/health, /cfr/trace, /cfr/rewind (new), /cfr/field (new)", cli: "cfr trace|rewind|field", loom: "observability-map.js (updated)", settings: "ST1 EMERGE (field thresholds)" }
    RF1: { events: "emerge: FIELD_NODE_WRITTEN, FIELD_RELATION_WRITTEN, FIELD_CONTRADICTION_LINKED", contract: "idearium, intelligence", systems: [lib/nexstore, idearium, intelligence], nodes: "nexstore types node, relation(structural|causal|provenance|semantic|contradiction)", routes: "/api/field/node, /api/field/relations, /api/field/lens/:name", cli: "field show|lens|relate", loom: "emerge-map.js + idearium-codebase-map.js (graph → lens wires)", settings: none }
    OT1: { events: "cortex: MEMORY_OBSERVED, MEMORY_COMMITTED, MEMORY_REJECTED", contract: "cortex, guardian", systems: [cortex, guardian, idearium, lib], nodes: "a .wire per migrated writer → field", routes: "/api/field/observe", cli: "field observe|writers", loom: "agent-memory-map.js, chat-ledger-map.js (updated)", settings: none }
    MR1: { events: "idearium: RECALL_REQUESTED, CONTEXT_TABLE_BUILT", contract: "idearium, copilot", systems: [lib, idearium, copilot], nodes: "lib.recall-triad, lib.context-table .component; nexstore type context_table", routes: "/api/recall, /api/context-table/:id", cli: "recall <question> [--budget]", loom: "agent-memory-map.js", settings: "ST1 MEMORY & SEARCH" }
    MR2: { events: "intelligence: ATTRACTOR_PLACED, CONVERGENCE_MEASURED", contract: "intelligence", systems: [lib, intelligence], loom: "agent-memory-map.js", settings: "ST1 MEMORY & SEARCH" }
    MR3: { events: "intelligence: GAP_SEARCH_RUN, GAP_CLOSED, GAP_NARROWED", contract: "intelligence", systems: [lib, intelligence], routes: "/api/gaps/search", cli: "gaps search", loom: "observability-map.js", settings: none }
    MR4: { events: "cortex: MEMORY_PROMOTED, MEMORY_DECAYED", contract: "cortex", systems: [cortex], loom: "agent-memory-map.js", settings: "ST1 MEMORY & SEARCH (sweeps)" }
    MR5: { events: "idearium: LEVEL_SUMMARY_STALE, LEVEL_SUMMARY_REBUILT", contract: "idearium", systems: [idearium, lib], reuses: "FG1–FG4's own wiring", settings: none }
    MR6: { events: "cortex: CONTRADICTION_FOUND, CONTRADICTION_SETTLED", contract: "cortex, idearium", systems: [lib, idearium], routes: "/api/contradictions, /api/contradictions/:id/settle", cli: "contradictions list|settle", settings: "ST1 MEMORY & SEARCH" }
    MR7: { events: "cortex: RECIPE_RECORDED, ANTI_RECIPE_RECORDED", contract: "cortex", systems: [lib, cortex], routes: "/api/recipes", cli: "recipes list|show", loom: "agent-memory-map.js", settings: none }
    MR8: { events: "warp: CRYSTAL_PROMOTED, CRYSTAL_REOPENED", contract: "warp", systems: [warp, emerge, lib], routes: "/api/crystals", cli: "crystals list|reopen", settings: "ST1 EMERGE (N)" }
    MR9: { events: "intelligence: LIMINAL_FLAG_RAISED", contract: "intelligence", systems: [guardian, lib], nodes: ".capability liminal.audit", loom: "copilot-capability-map.js", settings: none }
    MR10: { events: "intelligence: RELATION_RUPTURE, RELATION_REPAIR", contract: "intelligence", systems: [lib, guardian], settings: "ST1 MEMORY & SEARCH (on/off — James's call)" }
    MR11: { events: "intelligence: MIND_REWOUND", contract: "intelligence, cos", systems: [intelligence, cos], routes: "/cfr/rewind", cli: "rewind field|mind", settings: none }
    CB1: { events: "idearium: BUILD_STEP_LINKED, BUILD_REGIME_CHANGED, BUILD_HALTED", contract: "idearium", systems: [idearium, warp, intelligence], routes: "/api/repos/:uuid/build (logic: linear|causal)", cli: "idearium build --logic causal", loom: "build-surface-map.js", settings: "ST1 EMERGE (default logic)" }
    CB2: { events: "idearium: SOURCE_ANALYSED, SYNTHESIS_WRITTEN", contract: "idearium", systems: [idearium, lib], loom: "build-surface-map.js", settings: none }
    CB3: { events: "idearium: CAUSAL_BLOCK_COMPILED", contract: "idearium, emerge", systems: [idearium, emerge], nodes: "block causal in blocks.yaml; .event per declared event in generated repos", cli: "emerge compile --t1", loom: "one-idearium-map.js", settings: none }
    CB4: { events: "emergence: LOOP_TICKED, END_STATE_REACHED", contract: "idearium", systems: [emergence, idearium], loom: "emergence-map.js", settings: none }
    WS6: { events: "idearium: WORKSHOP_MODE_CHANGED, WORKSHOP_PART_ACCEPTED", contract: "idearium", systems: [idearium], routes: "/api/workshop/* (mode, parts)", cli: "idearium workshop --mode manual|assisted|stretched", loom: "one-idearium-map.js", settings: none }
    RC1: { events: "idearium: CHAT_CONTRACT_PROPOSED, CHAT_CONTRACT_ACCEPTED, CHAT_REPORT_WRITTEN", contract: "idearium", systems: [idearium, guardian], routes: "/api/repos/:uuid/agent/{contract,map,run,report}", cli: "idearium repo chat <uuid>", loom: "one-idearium-map.js", settings: none }
    LN1: { events: "none (a lens reads, never emits)", contract: "idearium", systems: [idearium], loom: "ui-map.js", settings: none }
    EC6: { events: "economy, in orchestrator's taxonomy until lib/economy has its own: TOKENS_COUNTED, BUDGET_EXCEEDED, TOKENS_SAVED", contract: "idearium", systems: [lib/economy], nodes: ".component lib.economy.tokenizer.gguf|bpe", routes: "/api/economy/tokens (method named)", cli: "economy tokens <text> --provider", loom: "economy-map.js", settings: "ST1 ECONOMY" }
    SH1: { events: "idearium: SHADOW_DECLARED, SHADOW_SETTLED, SHADOW_COMMITTED", contract: "idearium, cos", systems: [lib, cos, intelligence], routes: "/api/shadow/:step", cli: "shadow show|settle", loom: "observability-map.js + cos-testenv-map.js", settings: "ST1 SHADOW" }
    GA1: { events: "guardian: AGENT_FACTS_CHANGED; clear-glass: AGENT_CACHE_STALE", contract: "guardian, clear-glass", systems: [guardian, clear-glass], nodes: "every provider, userscript and hat a Guardian node", routes: "guardian /api/providers (hash-stamped), /api/agents", cli: "guardian agents list|verify", loom: "accounts-authority-map.js + copilot-capability-map.js", settings: "Guardian owns them; Clear Glass shows read-only" }
    BT1: { events: "cos: TOOL_RUN; idearium: TEAM_HANDOFF", contract: "cos, idearium", systems: [cos, idearium, guardian, lib], nodes: ".capability per COS tool; hats per role", routes: "/api/teams, cos /api/tools", cli: "cos tools list|run, idearium teams", loom: "cos-testenv-map.js + one-idearium-map.js", settings: "ST1 BUILD TEAMS" }
    FV1: { events: "idearium: JOB_CONTRACTED, JOB_QUOTED, JOB_DELIVERED, JOB_REVISED", contract: "idearium, cos", systems: [idearium, cos, lib/economy, guardian], nodes: "nexstore types job, contract, delivery, proof_report", routes: "/api/jobs, /api/jobs/:id/{contract,quote,build,deliver,revise}", cli: "idearium jobs new|quote|build|deliver|revise", loom: "one-idearium-map.js + cos-testenv-map.js", settings: "ST1 CLIENT JOBS" }
    IN1: { events: "orchestrator: MCP_TOOL_CALLED, MCP_TOOL_UNAVAILABLE", contract: "orchestrator", systems: [orchestrator, copilot, loom, intelligence, idearium], nodes: "one .capability + .command per MCP tool (orchestrator.mcp.<tool>)", routes: "MCP over stdio; each tool onto its existing route", cli: "nexus mcp list|call <tool>", loom: "copilot-capability-map.js (MCP tool → module wires)", settings: "ST1 AGENTS & ACCOUNTS (which tools Claude Code may call)" }
    IN2: { events: "guardian: PROVIDER_RUN_STARTED, PROVIDER_RUN_SETTLED", contract: "guardian, idearium", systems: [guardian, lib/economy, idearium, cos], nodes: "guardian provider node claude-code; .capability provider.claude-code.run", routes: "/api/repos/:uuid/agent/run (provider claude-code)", cli: "idearium repo run <uuid> --provider claude-code", loom: "economy-map.js + one-idearium-map.js", settings: "ST1 AGENTS & ACCOUNTS" }
    AC1: { events: "guardian: ACCOUNT_PUBLISHED; idearium: ACCOUNT_DEFAULT_SET", contract: "guardian, idearium, clear-glass", systems: [clear-glass, guardian, lib/economy, idearium], nodes: "guardian account nodes (from Clear Glass's authority); nexstore type account_usage", routes: "guardian /api/accounts, idearium /api/settings/accounts", cli: "guardian accounts list, idearium settings set accounts.default.<jobType>", loom: "accounts-authority-map.js + economy-map.js", settings: "ST1 AGENTS & ACCOUNTS" }
    ST1: { events: "idearium: SETTING_CHANGED", contract: "idearium, guardian", systems: [idearium, guardian, clear-glass], routes: "/api/settings/<section>", cli: "idearium settings get|set <section>.<key>", settings: "is the settings phase" }

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

  build_order: [EM0, EV0, GA1, IN1, UI0, PR1, PH1, PR2, DA1, EM1, EC6, MR1, SH1, EM2, CF1, MR9, RF1, MR6, ST1, AC1, IN2, CB1, MR7, MR8, MR3, FM1, CB3, WS6, LB1, RD1, CX0, GG1, CL1, MS1, GL1, MR5, LN1, OT1, MR11, CB2, RC1, BT1, FV1, MR2, MR4, MR10, CB4]
  # Value-first (E17), computed, not hand-picked: a phase is ready when everything it depends on is built; of the ready
  # ones, the next is the one with the highest value per cost — where a prerequisite takes on the value of the best phase
  # it unlocks (so EM2, slow on its own, is pulled forward by SH1's and CB1's value), ties by score. The groundwork and
  # the contracts come first because every later phase depends on them (EM0, EV0); then the agents' one truth and
  # Claude Code inside Nexus (GA1, IN1), which speed everything after; then what James sees daily (UI0); then the core
  # and the highest-value services. Low-value phases (MR2, MR4, MR10, CB4) fall to the end on their own. Change any
  # phase's value and the order is recomputed the same way.
  build_order_bottom_up: [EM0, EV0, UI0, GA1, IN1, EM1, ST1, EC6, AC1, EM2, CF1, SH1, IN2, RF1, OT1, MR1, MR5, CB1, CB2, CB3, WS6, MR3, RC1, BT1, MR2, MR6, MR4, MR7, MR8, FV1, MR9, MR10, MR11, CB4, LN1]   # the 1.3.0 order, kept (§0.3)


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

## ADDENDUM 2026-10-02 — 1.2.0
# James: "i want to get you to work from inside nexus … then you could use introspect" · "also hooking the multiple
# accounts into the agents/providers and settings in idearium." Added IN1 (Claude Code → Nexus: a root .mcp.json loads
# Nexus's MCP server — which exists, 17 tools, but nothing registered it — extended with introspect, loom, recall,
# gaps, CFR, field), IN2 (Nexus → Claude Code: a provider on James's own account, working in the shadow layer, its
# output an Observation), AC1 (provider × account as the unit: per-account limits and spend, defaults per job, an
# AGENTS & ACCOUNTS settings section; no automatic account switching to get around a limit). Found while mapping: Clear
# Glass owns accounts and Guardian already asks it, but Idearium and the economy are account-blind.

## ADDENDUM 2026-10-02 — 1.3.0
# James: "okay but all the other phases. make sure the yget added to nexus. make sure every system stays relative and
# adds routes, commands, all relative node types, and uses the event contract." Found: loom's phasemap scanner already
# reads all phases of this map, but tags systems by guessing from prose against a list without cos, warp, emergence,
# economy or nexstore; only 4 systems have an ET1 event taxonomy; cos, warp and emerge have no interaction contract.
# Added E14 (the event contract), E15 (isolation: systems meet only through routes, declared events and the
# registry), E16 (systems declared, not guessed); an explicit `systems:` on every phase; EV0 (taxonomies and contracts
# for every system this map touches, written from what each already emits, plus a drift check, plus the scanner
# reading `systems:`), placed right after EM0; and `events` + `contract` on every wiring row.

## ADDENDUM 2026-10-02 — 1.4.0
# James: "with these added, can you add a value to the system then maybe add all of them to the phasemap?" Found: main's
# intelligence/synthesis already ranks open phases by structural leverage per unit of effort (unblocks, corroboration,
# centrality, kind, layer), but no phasemap declares value to James and synthesis reads none. Added E17 (every phase
# declares value: score 1–5, cost S|M|L|XL, kind, why; synthesis adds it as a named part of leverage and uses the cost
# as effort — EV0 item 5); a value on all 35 phases; UI0 (the four UI faults found in the screenshots of main); SH1 and
# MR1 now start on what exists and are upgraded when WARP 2 and the field land (EM2 adopts SH1's shadows); EV0 before
# every phase that emits; ST1 before AC1's settings section. The build order is now value-first, computed from the
# values and the dependencies; the bottom-up order is kept beside it.

## ADDENDUM 2026-10-02 — 1.5.0
# James: "Yes, then I can use idearium to build anything needed" · "what about shadow space reasoning for the
# debugging?" · "Use cos end state to have agents in a lab … keep filling the agent with feedback until it solves it …
# change your strategies … Mine failure modes. Mental simulations." · Idearium and Clear Glass first. Found: the lab's
# pieces already exist (capability-extend, llm-lab, failure-mode-forensics, shadow, runtime-proof, the RAID simulation
# spec); none checks whether END-STATE CONDITIONS are met in plain words. Added PR1 (the proof run / delivery checker —
# shadow-space first, plain-language report into the repo), PR2 (screenshots through Clear Glass), LB1 (the end-state
# lab: attempt → proof → feedback → strategy change, bounded, never merging on its own; honest limit: only what its
# conditions can check), FM1 (failure modes mined into .failure_mode nodes, clustered, turned into default checks),
# MS1 (simulating a strategy against mined modes before spending attempts). PR1 is built now, ahead of EM0's merge, on
# James's priority; it touches idearium/api/index.js in one separate block to keep the later merge small.

## ADDENDUM 2026-10-02 — 1.5.1, PR1 built (0.39.302)
# The delivery checker: conditions (file, command, tests, page with the app started and always stopped), the shadow
# declared first so every unmet promise comes back absent with its cause, failure modes, and a plain-language proof
# report written into the repo. Found while building: a repo's working folder is re-materialised from its store, so a
# report written beside it was lost between calls — it now goes through the repo layer (writer/reader passed in).
# idearium's event taxonomy begun as idearium/event-taxonomy.cjs (idearium/ is "type": "module"); EV0 declares the
# rest. Proof: tests/modules/test-proof-run.test.js 7/7; end to end through the real idearium server.

## ADDENDUM 2026-10-02 — 1.6.0
# James: "This system is meant to build its own capability. Nodes expand. Copilot uses raid to either complete the
# request or have the capability built using idearium … This is non linear and domain agnostic. Research. Problem
# solving. Coding. … This is also technically an llm. The graphs." Added RD1 (RAID: complete or build — the
# self-building front door), DA1 (end states for research and problem solving: claims checked against sources,
# reproducible results, no contradiction with settled facts, James's review where a machine cannot check), GL1 (the
# graphs as a predictive model of his own, scored against outcomes).

## ADDENDUM 2026-10-02 — 1.7.0
# James: "It can build it. Piece by piece look at idearium." · "I'm saying to generate code." · "What if I add a
# workshop or component lab for oLlama building components." · "Should the graphs be in idearium or cortex? Look at the
# phases, in idearium." Read: Idearium already builds piece by piece with ollama in the loop (blocks → chunks → agents,
# the orchestrator's agent switching, the repo agent on ollama with repo-context, phase runs with a reviewer,
# nexus-self behind an apply gate); emerge's T0/T1 already generate code with no model. Idearium's per-system phase view
# selects phases by loom's prose-guessed tags — so until EV0 these phases sit under the wrong systems there and cos/warp
# ones not at all. Added PH1 (phase runs end in a proof run — the engine, next to build), GG1 (the graphs generate code:
# wiring from a phase's row, tests from conditions, composition, crystals), CL1 (the Component Lab), CX0 carried here,
# E18 (the judge never edits the judge) and E19 (per-project graphs in Idearium, learned memory in cortex, dynamics in
# intelligence).

## ADDENDUM 2026-10-02 — 1.7.1, PH1 built (0.39.303)
# A phase run's chain is now draft → review (when drafted locally) → PROOF: the phase's own conditions (its map's
# `conditions:`), run by the delivery checker. Met → proven. Unmet → feedback (each unmet promise, what happened, its
# likely cause) to the same agent in a fresh chat, bounded by repos.proof_attempts (default 2), then unproven. No
# conditions → no-proof, said. So a phase is only proven when it declares checkable conditions — the next step for the
# maps themselves is to give their phases `conditions:` (GG1 can generate the wiring ones). Proof:
# tests/modules/test-phase-proof.test.js 6/6 through the real repo layer with a stand-in agent.

## ADDENDUM 2026-10-02 — 1.7.2 (0.39.304)
# James: "get ollama solid. i need this done." No phase in the maps declares conditions, so PH1 read no-proof for all
# of them and Ollama got no feedback. A phase without conditions is now proven from its declared files: each exists,
# each JS file passes node --check — broken JS is unmet and its error is the next attempt's feedback. Proof:
# tests/modules/test-phase-proof.test.js 7/7 (PP-07).

## ADDENDUM 2026-10-02 — 1.7.3, EM0 (1) and (2) done
# James: "do it." (1) The branch is in line with main: main merged it as PR #23 (main's 0.39.299 Architect kept, this
# branch's 0.39.298 one dropped, 0.39.301–0.39.303 added), and 0.39.304 is on the branch above it.
# (2) loom/data/registry.json regenerated from empty on that tree: 2751 → 2769 components, 2804 → 2818 hooks, 3021 →
# 3032 distinct edges; nothing removed. Added: main's ui/js/arch-canvas.js, intelligence/synthesis (engine, sources),
# lib/nexstore (census, log, record, types, writers), their tests, the two 0.39.300 phasemaps. Found: the merge had
# dropped the hand-mapped edges idearium/api → idearium/lib/architect.js and → lib/component-store.js (the row named the
# dropped Architect's functions); restored with main's (makeSession, makeIndex, analyse, draft, decide, archText).
# Baseline, said: bootstrap still exits 1 on 111 unresolved declarations — the same 111 as before the merge (diffed),
# real missing endpoints (agent-tools and clear-glass .export hooks), not ordering. loom/test/schema.test.js 43/44
# fails the same with or without this change (StreamLog .declare entry: undefined.endsWith).
# (3) and (4) are not done: emergence-6.zip (Emergence 0.1.0 + WARP 1.5.0) is not in this checkout — re-upload needed.
# Proof: test-architect 8/8, atlas-refs 51/51, dangling-hooks 19/19, component-registry 18/18, registration-shape 8/8,
# hook-ownership 8/8, version-sync 30/30, loom-phasemap 5/5 + status 12/12, synthesis-zoom-versionium 6/6,
# loom component-detail 5/5, doc-generator 4/4.

## ADDENDUM 2026-10-02 — 1.7.4, EV0 (3) the event contract check
# Built first, because the taxonomies must be written FROM the code (EV0: "not invented") and something has to read it.
# lib/event-contract-check.js reads a system's own source for every emit of a literal dotted name — a method or a bare
# helper (emit, _emit, emitEvent, _emitEvent, busEmit, postEvent, broadcast, publish; `?.(` too), a ternary's two
# branches, the payload's top-level keys, file:line — and says what its taxonomy lacks. A template emit is UNRESOLVED
# unless its site names its events (`// emits: a, b`). An emit through a constant (`emit(EVENTS.X)`) is not read: it
# shows as a declared-but-unseen key, said, never failed. Two names on one key is a collision, always a failure.
# Found, said: the systems that HAVE a taxonomy drift as much as those without — guardian 60 undeclared of 75 emitted,
# orchestrator 18 of 19, clear-glass 131 of 141, versionium 1 of 5. 444 in all across the 12 systems held to it.
# So the check holds a RATCHET: contracts/event-contract-baseline.json is today's drift per system; new drift fails,
# a baseline entry declared since fails until it is dropped (the file stays exact), nothing writes it (E18). Drift
# stops piling up today; each system's taxonomy then empties its own entry, one change per system (E15).
# Surfaces: `nexus contracts check [--system=<s>] [--all] [--json]` (exit 1 on drift); loom has the check as a
# component wired to that CLI (tree scan — a hand-map row would collide). WARP: 0 literal emits read; its taxonomy waits
# on WARP 1.5.0 (EM0 (3)), which replaces warp/. COS already has cos/foundation/event-contracts.js (35 importers) —
# read before cos's taxonomy is written, so there is one truth, not two.
# Proof: tests/modules/test-event-contracts.test.js 7/7 (EC-05b: an emit added without a declaration fails, with its
# file:line); in the real tree, an emit appended to emerge/emerge-kernel.js failed `nexus contracts check` (exit 1).

## ADDENDUM 2026-10-02 — 1.7.5, the reader reads SISO
# The first reader saw only literal names, so it missed how the SISO systems emit: `stream.emit(new Event('x', …))`
# (258 sites), through a constant `new Event(HOST.COMPARTMENT_CREATED, …)` (99) and `{ type: 'x' }` (16). It now reads
# all three, resolving constants through the string tables in the system's OWN source (cos/foundation/event-contracts.js
# for COS). It also stopped counting calls quoted in strings or comments: loom's only "emit" was a hook's NAME
# ("os.emit('idearium.repo.file.write')"), and cortex, cos and guardian each had a commented-out one.
# Emitted, now read: emerge 3 → 56, cos 55 → 143, clear-glass 141 → 241, intelligence 24 → 37, idearium 116 → 130.
# The baseline was re-recorded to match (444 → 707). No code changed between the two readings: this is drift that was
# already there and is now seen, not new drift excused (E18 holds — the ratchet runs from here).
# Found, a defect: cos/playgrounds/kernel.js:67 emits VAULT.INJECTED; COS's VAULT table has no INJECTED key, so every
# vault-injection event is emitted as `undefined`. A constant whose table exists but lacks the key is now MISSING and
# fails (held in the baseline until COS's own change fixes it — cos/foundation/event-contracts.js says "IMMUTABLE after
# v1.0.0 (COS-5)", so the new key is James's to accept). A constant no table resolves is UNREAD, listed, not failed.
# Loom emits nothing, so it gets no taxonomy (ET1 refuses an empty one). WARP still reads 0; it waits on 1.5.0.
# Proof: tests/modules/test-event-contracts.test.js 8/8 (EC-01b: SISO, constants, missing, quoted).

## ADDENDUM 2026-10-02 — 1.7.6, EV0 (1): five systems fully declared
# Each written from the code, one change per system (E15), its baseline entry emptied: emerge 56 events, copilot 12,
# cortex 17, intelligence 37, idearium 138 (135 added; its two template emits now name what they send in an
# `// emits:` comment — CI's six ci:* relayed as idearium.ci.*, and cos.remote push|pull). Versionium, outside EV0's
# list, had one undeclared (versionium.branched) — added. Loom emits nothing, so it has no taxonomy (ET1 refuses an
# empty one). Declared-but-unseen, said: emerge spec.load (entered via driveAsync), intelligence contract.ok (via
# _emitPositive), versionium autocommit.triggered — real emits the reader does not see, kept declared.
# Open, said: COS (145 undeclared + VAULT.INJECTED missing) — COS already names its kernel events in
# cos/foundation/event-contracts.js ("IMMUTABLE after v1.0.0 (COS-5)"), so its ET1 taxonomy must not be a second list
# of the same names; how the two relate is James's call. Guardian (60), orchestrator (18) and clear-glass (232) are not
# in EV0's list; the ratchet already holds them — nothing new can drift there.
# Found along the way, said: emerge's own suites fail 7 tests identically with and without these changes.

## ADDENDUM 2026-10-02 — 1.7.7, EV0 (1): COS, one truth for its names
# James: "Read names from it" · "Add the key". cos/event-taxonomy.js never retypes a name cos/foundation/event-contracts.js
# holds — 88 entries are EC.<TABLE>.<KEY>, adding only description, payload and severity; a lost name throws at load.
# The 59 events COS emits as literals that file does not name are declared in the taxonomy alone. VAULT.INJECTED
# ('vault:secret:injected') added to event-contracts.js as a §BUGFIX amendment: every vault injection had gone out as
# `undefined`. 147 COS events, all declared. EV0 (1) now stands for idearium, cortex, intelligence, copilot, emerge,
# cos (loom emits none); warp waits on 1.5.0. Guardian (60), orchestrator (18) and clear-glass (232), outside EV0's
# list, stay held by the ratchet. Said: cos/test/test.js fails 1 of 157 with and without these changes.
