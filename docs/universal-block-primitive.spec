spec:

  # ════════════════════════════════════════════════════════════════
  # UNIVERSAL BLOCK PRIMITIVE — the .system format
  # ════════════════════════════════════════════════════════════════
  #
  # §3.1 BOTTOM_UP_ONLY — this consolidates seven prior messages'
  # converged design into one written primitive. Nothing here is a new
  # idea; every field below traces to something either already real in
  # this codebase (cited) or already agreed in this conversation
  # (referenced by which turn). Written now because the shape stopped
  # changing turn to turn — consolidation was overdue, not premature.
  # ════════════════════════════════════════════════════════════════

  meta:
    name:         universal-block-primitive
    version:      0.1.0
    uuid:         nexus-universal-block-v1-0000-2026-0903-001
    author:       james-brooks
    status:       specced
    extension:    ".system"   # confirmed zero collision in this codebase, checked before adopting
    description: >
      One block shape, used everywhere: templates, schemas, specs,
      contracts, macros, component registries. A block is not a flat
      text chunk — it is a multidimensional, measurable unit: typed,
      stateful, hookable, wireable, and independently addressable by
      an agent with a small surface area. A .system file is a queue,
      a shelf, and an archive of these — never a single flat document.

  # ────────────────────────────────────────────────────────────────
  block_shape:
  # ────────────────────────────────────────────────────────────────
    # Every field below is either REUSED (cites the real existing
    # mechanism) or NEW (this spec is where it's introduced).

    id:
      reused_from: "spec-engine chunk.uuid + chunk.chunkIdx (idearium/spec-engine/index.js:295-296)"

    type:
      status: NEW
      why: >
        spec-engine hardcodes every chunk's fileName to `.md`
        regardless of real content (idearium/spec-engine/index.js:305)
        — confirmed, not assumed. `type` is the field that was missing:
        js | html | css | md | yaml | contract | schema | component.
        Drives both the synthesized output extension and which
        renderer a UI picks (this spec's synthesize section).
      taxonomy_source: >
        Not invented fresh — pulled from what's real: COMPARTMENT-OS-
        SPEC-v1.6.0 §59-62's already-formal Archetype/Blueprint/Plugin
        schemas, cortex/core/raid/contract-boundary.js's real 4
        (source,intention) pairs, and ERAVOS's per-organism
        schema/schema.json convention. contract-boundary.js's own
        discipline applies here too: only add a `type` for something
        real and in use, never a speculative category.

    lines:
      status: NEW
      why: "byteSize exists on every chunk today; lineCount does not (confirmed, idearium/spec-engine/index.js). Needed for AI context-window budgeting per-block, not just per-file."

    status:
      reused_from: "lib/gap-field.js's real lifecycle: open -> closed (-> expired, intelligence/gap/predicate.js). A block is UNFULFILLED (open) until its chunk reaches spec-engine's own COMPLETE state, then CLOSED. Same trigger, borrowed vocabulary — not a new state machine."
      values: [open, building, closed, expired, failed]  # building/failed reused directly from spec-engine's CHUNK_STATES

    hook:
      reused_from: >
        AXIOMS-v3.1 §5.1: "Every integration point is a registered hook
        with a declared side-effect policy. All execution flows through
        the event bus." A block's hook is that declaration — what it
        touches outside itself, stated, not implicit.

    wire:
      reused_from: >
        clear-glass/wire/nexus-wire.js's real pattern (register ->
        proxy -> relay between sovereign systems), scaled down from
        process-level to block-level. A wire is a declared connection
        between two blocks IN THE SAME .system file — the in-file
        equivalent of what nexus-wire.js does between whole systems.
      distinction_from_seam: >
        A seam (compartments.spec, already real) is a BOUNDARY — it
        says what may NOT cross without the gate. A wire is a
        CONNECTION — it says what DOES cross, deliberately. Both are
        needed; they are not the same concept under two names.

    contract:
      reused_from: >
        Not every block synthesizes into code. A `type: contract` block
        holds no executable content — it GOVERNS the other blocks the
        same role guardian/interaction-contract.json already plays
        per-system, scaled to per-file. "Blank contract, unfulfilled
        until full" (this conversation, six turns ago) = a contract
        block whose referenced code-blocks are not all `status: closed`
        yet.

  # ────────────────────────────────────────────────────────────────
  synthesize:
  # ────────────────────────────────────────────────────────────────
    status: NEW
    gate: "fires only when every code-typed block in the .system file is status:closed — confirmed nothing in spec-engine does this today (only markdown-concat compileText exists)"
    per_type_behavior:
      - type: js
        output: "real module concatenation with real boundaries (not markdown headers) -> one .js file"
      - type: html
        output: "assembled as one document, blocks become sections, not concatenated raw text"
      - type: [contract, schema]
        output: "NEVER synthesized into code — stays as governing metadata, same as interaction-contract.json today"

  # ────────────────────────────────────────────────────────────────
  per_agent_execution_model:
  # ────────────────────────────────────────────────────────────────
    # Grounded in the real, already-declared AGENT_CONSTRAINTS
    # (lib/agent-router.js) — the .system format's per-agent behavior
    # is DERIVED from these real, existing numbers, not invented
    # independently per agent.

    chatgpt:
      constraint: "maxTokens:900, chunk:true (lib/agent-router.js, real)"
      system_behavior: "one block per prompt, sequential, test-gated before next block sends — the only mode chatgpt's real budget allows"

    ollama:
      constraint: "small local context window (exact size not confirmed this pass — flagged, not assumed)"
      system_behavior: "NEW — context resets at every block boundary. Confirmed nothing in ollama-runtime.js or ollama/lib/*.js does this today. One block = one fresh context window, not one accumulating conversation."

    claude:
      constraint: "maxTokens:200000, inject:['warp','context'] (real, already declared — the inject array's actual wiring not traced this pass)"
      system_behavior: "phase-checkpointed, not chunked for size. Reuses orchestrator/lib/autonomous-loop.js's real sigma>0.70 rewind trigger and cortex/snapshot's real pre-stage snapshot/rollback — currently wired at the RUN level; this spec's new work is wiring the same triggers at the BLOCK level (checkpoint after block N, before block N+1)."

    gemini:
      constraint: "maxTokens:1000000, contextCaching:true (real, declared)"
      system_behavior: "UNDECIDED — not addressed in this conversation. Budget this large may not need any of the above; flagged rather than guessed at."

  # ────────────────────────────────────────────────────────────────
  specializations:
  # ────────────────────────────────────────────────────────────────
    macro_file_for_clear_glass:
      status: NEW
      maps_to: "lib/agent-tools/tools/clear-glass/macro.js — the REAL existing macro execution path (already live, /cli/macros/:name/run). A .system macro file is a sequence of blocks where each block IS one macro step, synthesizing (per synthesize.gate above) into the exact step-array macro.js already consumes — not a new macro format, a new AUTHORING format for the one that exists."

    living_component_index:
      status: PARTIAL — reuses, does not duplicate
      maps_to: >
        lib/tool-index.js — already explicitly "the living tool index"
        (its own words, confirmed real, §AP1). A .system file whose
        blocks are `type: component` populates THIS index at
        synthesize-time via its existing register()/record() calls —
        not a second, competing registry.
      component_shape: >
        Cobalt Core's own stated model (component_id, CLI surface, API
        surface, typed channels, ledger entry on creation) — this is
        the working-context definition, not independently re-derived
        here; a `type: component` block's fields map 1:1 to it.

  # ────────────────────────────────────────────────────────────────
  extensions:
  # ────────────────────────────────────────────────────────────────
    # Each real, distinct enough to earn its own extension. None of
    # these are arbitrary letters — each anchors to something already
    # massive and real in this codebase, checked before adopting.

    - ext: ".system"
      role: "the generic/umbrella form — this spec's own default"

    - ext: ".cos"
      role: "compartment-of-blocks"
      anchors_to: >
        cos/ — not a small directory. Confirmed real and large:
        kernel.js, siso, spec, archetype, playgrounds, vault, plugin,
        compartment, cli, vaultd, blueprint, foundation, manager.js,
        watchdog, host. .cos is the block-primitive's authoring format
        for what this subsystem already is, not a new namespace next
        to it.

    - ext: ".spec"
      role: "unchanged — the format ten real uploaded system specs
        already use (NEXUS-CORE.spec etc, all ten verified parsing
        correctly, prior turn). This spec does not touch that format."

    - ext: ".contract"
      role: "blank until every block closed, then submitted — real, not aspirational"
      anchors_to: >
        cortex/core/raid/contract-intake.js's real submitContract(contract, opts):
        requires contract.content (string) + opts.source/opts.intention,
        resolves a boundary via contract-boundary.js, queues with
        status:QUEUED. A .contract file's synthesize step (see
        `synthesize` above) produces exactly contract.content once
        every block is status:closed — then calls submitContract()
        directly. This is the real, concrete close of a gap flagged
        two turns ago in this same conversation: contract-intake.js's
        own header admits co-pilot calling submitContract() was "the
        honestly-named next step, not claimed done" — a .contract file
        reaching all-closed is that caller, finally real.

    - ext: ".macro"
      role: "clear-glass macro authoring — see specializations.macro_file_for_clear_glass above, unchanged from that finding"

  # ────────────────────────────────────────────────────────────────
  conditions:
  # ────────────────────────────────────────────────────────────────
    status: REUSED, not new
    anchors_to: >
      cockpit/pipeline.js already has a real, hand-rolled, safe
      condition evaluator — seamEval()/seamEvalSafe()/validateExpr(),
      no eval(), SEAM if/when node semantics. Block-to-block
      conditions ("yes, like conditions") route through this existing
      evaluator, not a second one. A block's `hook` can declare a
      condition expression; seamEvalSafe() decides whether the wire to
      the next block fires.

  # ────────────────────────────────────────────────────────────────
  templates:
  # ────────────────────────────────────────────────────────────────
    status: REUSED pattern, new content
    anchors_to: >
      idearium/spec-engine/templates/ already does exactly this for
      .spec files (compartments.spec, axioms.spec, architecture.spec —
      all real, all confirmed this conversation). Each new extension
      above gets its own templates/ directory following the identical
      convention — not a new templating mechanism, the same one,
      applied per extension.


  # ────────────────────────────────────────────────────────────────
  phase_files:
  # ────────────────────────────────────────────────────────────────
    ext: ".phase"
    status: "NOT NEW -- already the shape used two spec files ago"
    anchors_to: >
      docs/command-index-per-system.spec's own `build_order:` section
      is already phase-shaped (phase number, why, exit_criteria) -- the
      only thing missing is splitting it OUT into one real .phase file
      per system instead of leaving it embedded in one master doc. "Each
      gap a phase" reuses the same status lifecycle already established
      for blocks (open/closed, from lib/gap-field.js) -- a phase is OPEN
      until its exit_criteria are met, then CLOSED. Not a new state
      machine, the same one, applied at the phase granularity instead
      of the block granularity.
    shape: "one .phase file per system, each block = one phase = one gap, status:open|closed, exit_criteria required to close (no phase closes on claim alone -- Section 1.1)"

  # ────────────────────────────────────────────────────────────────
  living_index_unification:
  # ────────────────────────────────────────────────────────────────
    status: "CLARIFICATION, not a new system"
    finding: >
      "Living tool index" and "command line index" are not two things
      to build -- lib/tool-index.js is ALREADY, in its own words, "the
      living tool index" (register()/record(), grows from real usage,
      Section AP1). docs/command-index-per-system.spec's five per-system
      command indices are the SAME kind of registry at a different
      granularity -- tool_index tracks function-level tools
      (lib/agent-tools/), command-index tracks route-level surface
      (guardian/ollama/bridge/idearium/clear-glass HTTP commands). Both
      should populate the SAME underlying living-index mechanism
      (register/record/query) rather than becoming two parallel
      registries that can drift from each other the same way
      guardian.spec's routes: list already drifted from real code.
      Concretely: command-index-per-system.spec's phase files should
      call tool-index.js's real register() for each discovered route,
      not write a second, disconnected JSON file per system.

  # ────────────────────────────────────────────────────────────────
  open_gaps_this_pass:
  # ────────────────────────────────────────────────────────────────
    - "ollama's real context window size — not confirmed, needed before system_behavior.ollama can be built exactly right"
    - "claude's inject:['warp','context'] — declared but its actual wiring/effect not traced; needs reading before assuming it already does part of block-level injection"
    - "gemini's per-agent behavior — undecided, flagged not guessed"
    - "type taxonomy's full list — sourced from three real places (COMPARTMENT-OS-SPEC §59-62, contract-boundary.js's 4 pairs, ERAVOS schemas) but not yet merged into one final enum in this file"
