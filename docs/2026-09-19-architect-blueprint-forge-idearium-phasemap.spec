spec:
  meta:
    name:        architect-blueprint-forge-idearium-consolidation
    roadmap: 'later — architect forge — later (declutter 2026-10-09, James: "okay")'
    version:     0.1.0-phasemap
    status:      "DRAFT — mapped, nothing built yet. Written per §8.5/§3.3 before
      touching any of the four systems. Explicitly reconciles with, does not
      duplicate, three existing DRAFT phasemaps found already covering most of
      this ground — see reconciles_with below."
    author:      James Brooks (via Claude, map + phasing pass)
    uuid:        nexus-phasemap-abfi-consolidation-v1-0000-2026-0919-001
    axioms_in_play: "0.1 reality over the plan; 3.3 map before build; 5.9 every
      system sovereign; 5.12 UI is disposable, a projection not an owner;
      10.3 competing truth layers are a system failure; 16.1 close nearest
      gap; 16.5 one canvas/one truth, don't duplicate"

  reconciles_with:
    - doc: "docs/nexus-architecture-rebuild-phasemap.spec"
      relevance: >
        P15-P17 already specify almost exactly this ask, in this order:
        forge-shell merges into loom (one phasemap truth, not two — P15),
        architect's node canvas becomes loom's OWN surface with architect
        as a consumer, not a parallel renderer (P16), blueprint builder
        migrates onto that same canvas as a second mode, not a second
        canvas (P17). All three still marked gate:deferred as of that
        doc's last edit (2026-08-13).
      real_divergence_found: >
        Reality has since moved PAST that plan, not toward it:
        architect/src/ui/spec-builder.html (git-dated 2026-09-19, the same
        session as the versionium/intelligence consolidation work) is a
        real, shipped, standalone Electron app — "SPEC BUILDER · ARCHITECT"
        — with its own node canvas (gate/node/check/surface primitives,
        L0-L7 architectural layers, its own PROPS/KG/GAPS/PLAN/FORGE/
        IDEARIUM tabs). This is exactly the "parallel renderer" P16 says
        architect should NOT be. Not a judgment that it's wrong — it's
        real, working, and already has FORGE and IDEARIUM tabs the P15-P17
        plan never anticipated — but it is a real fork from the drafted
        plan that needs a decision, not a silent pick of one side.
    - doc: "docs/2026-09-11-sovereign-node-architecture-phasemap.spec"
      relevance: >
        P3 (per-system node schemas) and P4 (full node-type coverage per
        system) are the exact architectural questions this session's
        intelligence/lib/domain-nodes.js work already answered empirically
        for one system, not yet generalized. P3 was left status:open,
        asking: one shared lib/node-schemas/, or per-system schema
        folders that extend/override it? intelligence's real build
        resolved this as a hybrid — lib/node-schemas/ stays the single
        checkPayload() authority (avoids the "competing validators" failure
        P3 was worried about), each system keeps a LOCAL, documentation-
        only sovereign mirror for its own introspection (get()/list()),
        never consulted by checkPayload() at runtime. Real, working,
        proven against 5 real payload shapes — not proposed, shipped in
        commit 41d85c7. P3/P4 should be marked resolved-by-precedent, not
        re-opened from scratch.
    - doc: "docs/spec-compiler.spec"
      relevance: >
        spec-builder.html's own live status bar says plainly:
        "spec-compiler not found — place spec-compiler/ adjacent to
        architect/". The spec exists (101 lines, deterministic T0-T3
        emitter, CC-001 "query cortex before emitting"); the directory
        does not. This is the single, smallest, most concrete blocking
        gap found this pass — the UI in the screenshot cannot compile
        anything until this exists.
    - doc: "docs/architect.spec"
      relevance: >
        Its own purpose line already says "Spec builder, hook registry,
        blueprint scanner... the design surface for hooks and blueprints"
        — architect's charter already includes blueprint, contradicting
        the framing that blueprint is a separate third thing bolted on.
        The real question is not "does architect own blueprint" (its spec
        already says yes) but "does architect's OWN canvas or loom's
        registry-backed canvas render it" — the same fork named above.

  # -------------------------------------------------------------------------
  # DECISIONS NEEDED FIRST — everything below is sequenced behind these
  # -------------------------------------------------------------------------
  decisions:
    D1_canvas_authority:
      question: "Does architect's own spec-builder.html stay the real
        canvas (superseding P16's 'move it into loom' plan), or does P16
        still happen and spec-builder.html gets migrated onto loom's
        registry-backed canvas as originally drafted?"
      options:
        a: "Keep spec-builder.html as architect's own canvas. It's real,
          shipped, already has FORGE/IDEARIUM tabs the old plan didn't
          anticipate. P15-P17 get marked superseded-by-reality, not done."
        b: "Follow P16/P17 as originally drafted: loom's registry becomes
          the one real canvas, architect and blueprint both become
          consumers/modes of it, spec-builder.html's real UI code is
          migrated onto loom's data, not thrown away."
      recommend: "b, migration not rewrite. §16.5 (one canvas, one truth)
        was the right call in August and the fork since then is exactly
        the kind of duplication it exists to prevent — spec-builder.html
        already proves the UI is worth keeping, so this is 'point its
        canvas at loom's real registry' (P16's own gate condition), not a
        rebuild. Cheapest path that honors both the existing plan and the
        real work since."
    D2_spec_authority:
      question: "Named in the prior turn's discussion, restated here as a
        real blocking decision: architect's own Phase-4 Spec Engine vs
        idearium/spec-engine/ — which authors specs, which builds them?"
      recommend: "architect authors (the visual canvas + node/gate/check
        graph IS spec authorship); idearium builds (chunk-dispatch +
        warp-build-dispatch already do real agent-dispatched builds from
        spec chunks). architect's own Spec Engine becomes the compiler
        target — the thing spec-compiler.spec's T0-T3 tiers emit FROM —
        not a second, competing author."
    D3_forge_home:
      question: "Forge has no sovereign backend today (no forge/ system
        dir — scattered across guardian's forge_patches table, the legacy
        cockpit/cockpit.spec forge-ide entry, and now spec-builder.html's
        own FORGE tab). Does it get one, or stay a tab/view inside
        architect+loom's canvas?"
      recommend: "A view, not a new sovereign system — §0.5 (complexity
        must earn existence). A phasemap is a projection of real phase
        data (loom already owns this per P15); forge doesn't need its own
        port/data folder to render one. Revisit only if forge grows real,
        independent state P15's loom-backed model can't hold."

  # -------------------------------------------------------------------------
  # PHASES — gated on the decisions above; P0-P2 can start regardless
  # -------------------------------------------------------------------------
  phases:
    P0_place_spec_compiler:
      depends_on: []
      goal: "Close the literal, live-observed blocker: place spec-compiler/
        adjacent to architect/, matching docs/spec-compiler.spec exactly.
        Smallest real gap, unblocks the UI's own COMPILE button."
      gate: "spec-builder.html's status bar warning clears; a real .spec
        compiles through T0/T1 with zero LLM tokens, per CC-002."

    P1_reconcile_node_schema_precedent:
      depends_on: []
      goal: "Mark 2026-09-11-sovereign-node-architecture-phasemap.spec's
        P3 and P4 resolved-by-precedent, citing intelligence/lib/
        domain-nodes.js (commit 41d85c7) as the proven pattern, then
        generalize it to the next system per P4's own real list (command/
        agent/model/tool/toolbox/ledger/failure_mode), not reinvented."
      gate: "one more system's own domain-nodes.js exists, schema-
        validated, proven against real payloads the same way — not just
        the pattern copy-pasted unverified."

    P2_decide_D1_D2_D3:
      depends_on: []
      goal: "Get real answers to the three decisions above before any
        canvas/authority work starts. Written record of the answer and
        why, per §17.3 — alternatives considered, not just the pick."
      gate: "decisions.D1/D2/D3 in this file updated in place with the
        real answer, dated, not left as recommendations."

    P3_architect_canvas_onto_loom_registry:
      depends_on: [P2]
      goal: "Per D1(b): point spec-builder.html's real canvas at loom's
        real component/hook/wire/seam registry instead of architect's own
        parallel model. Same real UI code, real data source swapped
        underneath it — P16's own gate condition (registry clean enough
        to render truthfully) applies unchanged."
      gate: "every node/edge spec-builder.html draws resolves to a real
        loom registry row — proven by diffing rendered nodes against
        loom/data/registry.json, not asserted."

    P4_blueprint_as_canvas_mode:
      depends_on: [P3]
      goal: "Per P17's own framing, unchanged by anything found this
        pass: a blueprint is a proposed subgraph of the same canvas, not
        a second canvas. builder/index.html's real phase-grid/constraint-
        panel/export UI (from the forge-shell.zip upload) gets folded in
        as a MODE of P3's canvas, not left as its own separate app."
      gate: "creating a capability in blueprint mode and viewing it in
        architect mode show the same real node, not two representations
        that can drift."

    P5_forge_as_phasemap_view:
      depends_on: [P3]
      goal: "Per D3: forge-shell's real pipeline-canvas UI (both the
        ui/forge-shell/ copy and the newly-uploaded standalone one)
        becomes a view over loom's real phasemap data (P15's own real
        goal), not a system with its own backend."
      gate: "forge view shows the same phase list get_changelog()/
        phasemap-map.js already serve elsewhere — one source, not a
        third array to drift, closing the exact 86-phase-drift finding
        P15 named."

    P6_idearium_build_authority:
      depends_on: [P2]
      goal: "Per D2: architect-authored specs (via P3's canvas, compiled
        by P0's spec-compiler) become idearium/spec-engine/'s real input,
        closing the loop James asked about — build entire codebases from
        the same UI used to design them."
      gate: "one real, end-to-end run: a spec authored in architect's
        canvas, compiled by spec-compiler, chunked and dispatched by
        idearium's spec-engine, produces real, running code — traced,
        not assumed."

  honest_gaps:
    - "This phasemap was written after reading the HEADERS and phase
      lists of the three reconciled docs (grep + targeted sections), not
      their full 467+977+214 lines line-by-line. P3-P6's gates may need
      revision once those docs are read in full."
    - "spec-builder.html's own source was not read in this pass beyond
      confirming its existence, git date, and the screenshot's visible
      UI — P3's real migration work needs a full read of it first, per
      §8.4."
    - "No live boot was possible in this sandbox to verify any of D1-D3's
      real-world behavior — same honest limit every phasemap in this
      repo already names for this environment."
