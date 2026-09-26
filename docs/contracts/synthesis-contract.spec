spec:
  meta:
    name:        synthesis-contract
    version:     0.1.0-schema
    foundation:  nexus-system-foundation@1.0.0
    uuid:        nexus-synthesis-contract-v1-0000-2026-0902-jamesbrooks-001
    purpose: >
      The one contract envelope a co-pilot hands to ANY building agent
      (chatgpt/claude/gemini/ollama/mistral — via runViaAgent, module_builder,
      or run_closed_loop). NOT a new mechanism — this formalizes the real
      shape cortex/core/raid/contract-intake.js's submitContract() already
      builds row-by-row (checked directly, not assumed: uuid/status/stage/
      intention/dir/language/system/source/file/title/forAgent/dependsOn/
      onFail/compartmentId/verdict all real fields there today), per
      docs/raid-routing-fidelity-phasemap.spec's RR4_governed_handshake_
      on_handoff, James's own field list verbatim ('need intention. Dir.
      conditions for passing the test env. Agent and system. Language if
      applicable. Compartment if needed. Chunk id. Request or contract
      id... Doesn't leave the input folder until handoff.').
      §HONEST SCOPE — two fields below (conditions, chunk_id) are named in
      RR4's own phasemap text but confirmed NOT present in contract-
      intake.js's row today (grep-checked). Marked coded: false. Adding
      them to submitContract() is the actual code change this schema
      exists to drive — not done by writing this file.

  # ── Boundary ──────────────────────────────────────────────────────────────
  # §CORRECTED 2026-09-02 — James: "primitives, principles, and invariants
  # are a boundary. contract schemas must have primitive." Original draft
  # of this file treated primitive/invariant/principle as three independent
  # per-candidate MATCH checks run against the whole universe of axioms/
  # components (see context-candidate.spec's original gate). Wrong shape:
  # that makes every contract implicitly re-derive its own boundary from
  # scratch, candidate by candidate. Correct shape, this section: the
  # contract DECLARES its primitive and the invariants/principles that
  # bound it, ONCE, up front — a required part of the envelope, not an
  # emergent property discovered by scoring candidates. Everything in
  # context.matched (below) is then judged in-bounds/out-of-bounds against
  # THIS declared boundary specifically — see context-candidate.spec's
  # revised shape.
  boundary:
    primitive:
      required: true
      type: string
      note: >
        REQUIRED — what kind of thing this contract IS. Originally
        specified as "must resolve to a real, registered loom component,"
        refused otherwise. §CORRECTED 2026-09-02 — checked that against
        every real contract source that exists today (context-synthesis-
        pipeline.spec's real_rows): 2 of 4 (self-heal, agent-mesh's
        submitBuildPhaseContract) have no HTTP route at all — internal,
        event-/function-driven, not routable. lib/component-registry.js's
        real register() hard-requires route:{method,path} in validate(),
        not defaultable. Forcing a fabricated route onto a non-routed
        module just to satisfy this field would be inventing structure
        that isn't real — the exact thing this codebase's own §1.1
        ("nothing pretends to work") exists to prevent. Corrected
        requirement: primitive must be a CONFIRMED-REAL identifier — a
        loom-registered component id when one exists (preferred, checked
        first), OR a real module path + function/export name that a
        direct read of the source confirms exists (grep/view, not
        assumed) when it doesn't. Refusal at synthesis time fires only
        when neither check confirms the identifier is real — never merely
        because it isn't loom-registered.

    invariants:
      type: array
      items: "warp/core/Axiom.js Axiom.id — real, already-declared axioms only"
      note: >
        the hard/soft Axiom objects this contract's primitive must not
        violate. Carried by reference (id), not copied — severity stays
        whatever the real Axiom object says, never re-asserted here.

    principles:
      type: array
      items: string
      note: >
        §-tags this codebase already cites in its own file headers
        (§1.1 nothing exists until proven, §1.2 nothing silently fails,
        §2.1/§2.2 disk-before-behavior, §3.1 bottom-up, §5.1 uuid+seam_id+
        comp_id) — reused, not reinvented, because every phasemap in
        docs/ already writes in this vocabulary.

  # ── Envelope fields ──────────────────────────────────────────────────────
  # coded: true  = this exact field exists in contract-intake.js's row today
  # coded: false = named in RR4's phasemap, not yet in the real row
  # new           = not in RR4 at all — added here for the synthesis-contract
  #                 use case specifically (module_builder / runViaAgent callers)
  envelope:
    uuid:
      coded: true
      type: string
      note: "queueId — generated by uid() in submitContract(), not caller-supplied"

    status:
      coded: true
      type: enum
      values: [queued, running, pass, fail, blocked]
      note: "dependency-graph state — 'did it pass'. contract-intake.js STATUS."

    stage:
      coded: true
      type: enum
      values: [queued, handshake_verified, input_folder, system_queue,
               processing, output_folder, qc_pending]
      note: >
        physical lifecycle position — 'where is it right now', separate from
        status per RR4's own finding. Only queued/handshake_verified are
        reachable via real code today (acknowledge()) — the rest are named,
        not yet tagged by any event gate (IC5, still open).

    intention:
      coded: true
      type: string
      required: true
      note: >
        what this contract is FOR, not just its content. Feeds IC3's
        intention taxonomy once real data exists — do not pre-design that
        taxonomy, per IC3's own explicit sequencing.

    dir:
      coded: true
      type: string
      note: "real working directory / file scope this contract touches"

    language:
      coded: true
      type: string
      required: false
      note: "only when applicable — a code contract vs a prose contract"

    system:
      coded: true
      type: string
      note: "which SYSTEM originated this contract (distinct from source)"

    source:
      coded: true
      type: enum
      values: [spec-parser, loom, idearium, copilot, self-heal]
      note: "which subsystem/mechanism submitted it"

    forAgent:
      coded: true
      type: string
      note: "chatgpt | claude | gemini | ollama | mistral | perplexity | <hat name>"

    compartmentId:
      coded: true
      type: string
      nullable: true
      note: "set once processNext() spawns a real COS compartment for this contract"

    dependsOn:
      coded: true
      type: array
      items: queueId
      note: "other contracts that must PASS before this one is eligible"

    onFail:
      coded: true
      type: object
      shape: "{action:'retry', maxRetries} | {action:'fallbackAgent', agent} | {action:'halt'} | null"

    verdict:
      coded: true
      type: string
      nullable: true
      note: "set by qaqcLayer extension — PASS | FAIL, from checkEndState or SEAM VERDICT scrape"

    conditions:
      coded: false
      type: object
      required: true
      note: >
        §RR4 GAP — James named this explicitly ('conditions for passing the
        test env'), the phasemap even says to 'formalize as a named field
        rather than only living in the prompt text' — but submitContract()
        has no `conditions` field today; the end-state check only exists
        as contract.checkEndState() (a function, opaque to anything reading
        the row) or the SEAM VERDICT regex scrape. This schema's `conditions`
        block is the formalization: end_state (prose, what PASS means),
        checks (array of named, inspectable predicates — not just a function
        closure), test_env (which COS compartment archetype / entryFile
        proves it, wiring IC2's still-open raid-test-env-hook).

    chunk_id:
      coded: false
      type: string
      nullable: true
      note: >
        §RR4 GAP — named by James, not in the row. idearium's spec-engine
        already has a real per-section chunk uuid (SPEC_SECTIONS / chunk
        files) — this field should REFERENCE that existing chunk uuid when
        the contract originates from idearium, not invent a second id
        scheme. null for contracts with no chunk origin (e.g. a bare
        module_builder request).

    context:
      new: true
      type: object
      required: false
      note: >
        THE GENUINELY NEW PIECE — not in RR4, not in contract-intake.js.
        This is what was missing when the raw ledger/user-model/component
        dump got pasted whole into ChatGPT's tab and it just answered
        conversationally instead of emitting a parseable tool call: nothing
        filtered that dump against what the contract actually needs.
        §CORRECTED — matched[] candidates are judged in-bounds/out-of-bounds
        against THIS contract's own `boundary` block above (its declared
        primitive + its invariants + its principles), never against the
        global universe of every axiom/component in the system. Two
        contracts with different primitives will keep different context
        from the exact same raw data, by design.
      shape:
        matched:
          type: array
          items: "context-candidate.spec#candidate (disposition: in_bounds)"
        source_map:
          type: object
          note: >
            per IC1's own finding — the injection MECHANISM already exists
            (guardian userscripts' real injectText()), the storage already
            exists (intelligence/lattice's real getEdge/updateEdge). This
            is just which real tool call produced each matched candidate —
            loom_scan | nexus_map | meta_query | query_movement | lattice —
            so an agent (or a human auditor) can re-run the same query
            instead of trusting the contract's snapshot blindly.

  handshake:
    note: >
      RR4's real ACK semantics, unchanged: a contract's source file/data
      physically stays in the receiving system's input/ dir until a genuine
      acknowledgment (not just reaching 'queued') moves it — same discipline
      COS compartment dirs and Versionium snapshots already use. This schema
      does not change that; acknowledge() in contract-intake.js already
      advances stage queued -> handshake_verified.

  depends_on_open_phases:
    - "IC5_full_input_queue_output_qc_lifecycle (docs/2026-08-30-interaction-contract-context-phasemap.spec) — the remaining STAGE values (input_folder..qc_pending) need real event gates to ever tag forward"
    - "IC2_raid_test_env_hook — conditions.test_env above needs this to actually verify inside a disposable compartment, not just trust a self-reported verdict"
