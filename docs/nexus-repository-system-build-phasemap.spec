spec:
  meta:
    name:        nexus-repository-system-build
    version:     0.1.0-phasemap
    status:      "PHASEMAP 2026-09-15. MCO0 (audit) is DONE — real code
      found and grep-confirmed before any gap was assumed. MCO1 is DONE (2026-09-19 — the graph layer is real, tested, and adopted §24's edge_provenance_envelope); MCO2-MCO6 are NOT STARTED; MCO7 (Nexus's own systems as repo compartments) is PARTIAL - manifests done 2026-09-19. Cross-references
      idearium-creative-repo-overhaul-phasemap.spec — MCO5 here and that
      spec's MCO-G are the same real work; see build_order_note."
    uuid:        nexus-repository-system-build-v0-0000-2026-0915-001
    author:      james-brooks
    compiled_by: claude
    created_at:  2026-09-15T00:00:00Z
    depends_on_specs:
      - nexus-repository-system.spec
      - idearium-creative-repo-overhaul-phasemap.spec   # shares MCO-B/MCO-G surface
    intent: >
      Turn nexus-repository-system.spec's 46 sections into a real build
      plan. MCO0 found substantially more already real than expected —
      idearium/repo/index.js + import-pipeline.js + agent-suite/index.js
      already implement layers L0-L5 and part of L7/§38. This phasemap
      scopes what's left: graph (§24-26), deeper verification tiers
      (§37 L4-L8), full snapshot compliance (§33), hooks/wires/flows/
      tools as first-class repository-domain nodes (§18-22), git
      push/pull + credentials (§30-31), and Compartment ownership (§5, §32).

  # ── MCO0: audit real coverage before scoping anything ────────────────
  MCO0_audit_real_coverage:
    depends_on: []
    status: "DONE 2026-09-15."
    method: >
      Grep'd the real codebase for each spec section's canonical
      terms/functions rather than assuming from the spec text alone —
      same discipline as the existing axiom-5-2-raid-routing-phasemap's
      MCO7.
    real_and_done:
      - "L0 SOURCE / L1 STRUCTURE: idearium/repo/index.js v2.0.0. A repo
        IS a spec-engine manifest (§1.1/§2.2 chunk verification), real
        identity via rootHash (SHA-256 over canonical chunk content,
        JAA's existing content-addressable convention) — matches §3
        identity rule almost exactly (repo UUID as logical identity,
        content hash for real dedup, not used as identity itself)."
      - "L2 PARSE / L3 CHUNKS / L4 ATLAS: idearium/repo/import-pipeline.js.
        Deterministic regex-based structural-boundary parsing per
        language family (§10 constraint: no LLM for ordinary syntax —
        honored). buildAtlas() produces compressed topology (§14-15).
        Chunk boundaries never cut mid-body (§11 boundary_constraint).
        Failed-parse files stay observable/indexable/non-chunkable
        (§10 on_failure — honored exactly)."
      - "§35 INCREMENTAL: import-pipeline.js diffs against its own
        previous chunks/index.json + indexes/files.json contentHash —
        one edited file re-chunks one file, not the whole repo. Matches
        §35's chain almost verbatim."
      - "§42 STATE MACHINE (partial): PARSING -> MAPPING -> CHUNKING ->
        VERIFYING -> INDEXING -> READY|FAULT implemented in run(). A
        throwing step logs the canonical failure event (§39) and
        returns with FAULT plus whatever completed earlier — §39's
        'nothing silently fails' honored."
      - "§37 VERIFY (partial, L0-L3 only): import-pipeline.js's verify()
        performs syntax + boundary + structural integrity, matching
        §37's import_should_perform list exactly. L4-L8 (semantic,
        dependency, runtime/test, integration, system contract) not
        built — see MCO2."
      - "§2 CORE AXIOM / §38 MUTATION -> MAP UPDATE (partial):
        idearium/agent-suite/index.js's listRepositories,
        getRepositoryMap, getRepositorySymbols, getRepositoryChunks/
        Chunk, editRepositoryFile give agents the real MAP -> UNDERSTAND
        -> ACT lifecycle NEXUS-001 requires. editRepositoryFile
        triggers repo/index.js's _materializeQuiet, which reruns the
        whole pipeline — REPO-018 ('mutation produces an updated map')
        is real, not aspirational."
    real_gaps_grep_confirmed_zero_hits:
      - "§24-26 GRAPH: relationship_graph / dependency_cone /
        graph.traverse — zero matches repo-wide. Symbols and chunks
        exist; edges between them (imports, calls, depends_on) do not."
      - "§30 GIT INTEGRATION: zero simple-git/nodegit/git-spawn tied to
        idearium-hosted repos. (The nexus meta-repo's own git is a
        separate, unrelated concern — scripts/precommit-check.js.)"
      - "§31 CREDENTIALS: no dedicated credential capability for
        repository git operations — moot until MCO5, but the
        constraint (agent must never receive key material) needs to be
        designed in from MCO5's first line, not retrofitted."
      - "§18-22 HOOKS/WIRES/FLOWS/TOOLS as repository-domain node types:
        nexus's general hooks/wires system exists (hooks/*.hooks.js)
        but nothing typed repository:hook / repository:wire / .flow /
        .tool. agent-suite's functions are real but not yet formalized
        as the spec's .tool node shape."
      - "§33 SNAPSHOTS full compliance: versionium commits exist and
        work (see idearium-creative-repo-overhaul-phasemap MCO-B) but
        don't yet record atlas_version / chunk_index_version /
        graph_version / dependency_state / test_state /
        verification_state alongside source hash + git commit — only a
        subset of §33's must_record list."
      - "§5/§32 COMPARTMENT OWNERSHIP: cos/compartment exists as its own
        subsystem; nothing wires 'a repo MUST belong to exactly one
        Compartment' or 'import creates/attaches to a Compartment,
        never a second parallel abstraction' (§5 constraint) — that
        constraint is currently unenforced, not violated, just absent."
    gate: "MET — every real item above is cited to a real file/function;
      every gap is a grep-confirmed zero-hit, not an assumption."

  # ── MCO1: graph layer ─────────────────────────────────────────────────
  MCO1_graph_layer:
    depends_on: [MCO0]
    status: >
      DONE 2026-09-19 (v0.39.158). Built: idearium/repo/graph.js, spec at
      idearium/spec/idearium.repo-graph.spec (written first, §8.5), a
      real GRAPHING step in import-pipeline.js's state machine writing
      graph.json, and three read routes (repo.graph / .traverse / .cone).
      GATE MET — see gate_evidence below. Tests: tests/modules/
      test-repo-graph.js 49/49 against a real repo run through the real
      pipeline, no fixture graph.
    built:
      relations: "contains, belongs_to, imports, exports, depends_on, depended_on_by — the first three tiers of `order` below. `calls`/`called_by` deliberately NOT built and DECLARED unsupported in every graph, so a consumer can tell 'this graph has no call edges' from 'this code makes no calls'."
      capabilities: 'traverse() (§25), dependencyCone() (§26), affected() — the union cone MCO2 scopes its lazy tiers to.'
    gate_evidence: >
      traverse(start='file:src/index.js', relation='depends_on', depth=2)
      returns src/lib/helper.js at depth 1 and src/util.js transitively at
      depth 2 on a real materialized repo (GR-GATE, test-repo-graph.js).
      An import of 'express' that resolves to nothing in the repo comes
      back as a real edge with to:null, resolution:'unresolved',
      reason:'external-or-unresolved' — marked, never omitted (§24
      constraint, REPO-009), asserted by its own GR-GATE case.
    found_while_building:
      - "import-pipeline.js's brace-balance check had a 100% false-positive rate: 6 of 407 real .js files marked parse-failed, node --check passing on all six, including guardian/server.js. A failed file is chunkable:false, so each was silently excluded from chunking AND the graph. Fixed (braceDepth), 12/12 regression tests, 0 false positives after."
      - "import-pipeline.js's LANGUAGES table detects no Go/Rust/Ruby/Java/C#/C/C++, so 7 of the graph's extractors can never fire. Reported by the graph (languagesUndetectedUpstream), NOT fixed here — detection has one owner and changing it also changes chunking. Real next item."
    open:
      - "`exports` means 'top-level symbol this file declares', from the existing SYMBOL_PATTERNS — not export-statement analysis. A private top-level helper is included; a re-export is not followed. Stated in the spec, not over-claimed."
      - 'Extend import-pipeline.js LANGUAGES (needs its own spec — it changes chunking too).'
    order:
      - imports / exports (cheapest — likely near-free extension of
        existing SYMBOL_PATTERNS regex work in import-pipeline.js)
      - contains / belongs_to (structural, derived from existing
        file->chunk->symbol containment already in the atlas)
      - depends_on / depended_on_by (derived from imports, one hop)
      - calls / called_by (harder — needs call-site detection, not
        just declaration detection; may stay "unresolved" longer)
    adds:
      - repository.graph.traverse.capability
      - repository.graph.dependencies.capability
      - repository.graph.affected.capability   # feeds MCO2's dependency cone
    gate: >
      MET when graph.traverse(start=<real chunk>, relation=depends_on,
      depth=N) returns a real edge set for an actual materialized repo,
      and any relationship the extractor can't determine is marked
      "unresolved" rather than omitted (§24 constraint, REPO-009).
    edge_provenance_envelope:
      status: >
        ADOPTED in this build. The §AMENDED note below was written by the
        parallel line specifically so a future MCO1 build would give its
        edges the full envelope shape from day one rather than need a
        second migration later — this IS that build, so it was adopted
        rather than deferred. field_attachment_extension_point stays
        DEFERRED exactly as that note instructs.
        Shape: idearium/spec/idearium.repo-graph.spec.
    # §AMENDED 2026-09-19 — §24 (nexus-repository-system.spec) gained a
    # real edge_provenance_envelope schema and a deliberately-deferred
    # field_attachment_extension_point. This gate is unchanged — MCO1
    # still only needs resolution:unresolved-vs-omitted to ship — but
    # when MCO1's own edges get written, giving them the full envelope
    # shape from day one costs nothing extra and avoids a real, second
    # migration later. Do not build field_attachment_extension_point as
    # part of MCO1; it stays deferred until a second real field need
    # exists, per that section's own reasoning.

  # ── MCO2: verification tiers L4-L8 ────────────────────────────────────
  MCO2_verification_deepening:
    depends_on: [MCO1]
    status: >
      DONE 2026-09-20 (commit 5e082f4). Built: L4-L5 synchronous in
      idearium/repo/import-pipeline.js (DEEPENING step), L6-L8 lazy in
      idearium/repo/verify-lazy.js writing verification.lazy.json, test in
      tests/modules/test-mco2-verify-deepening.js. Status corrected in
      0.39.170 — this entry read NOT STARTED after the code landed. Gate
      evidence re-run 2026-09-20: test-mco2-verify-deepening.js 18/18.
    does: >
      Extends the existing verify() (which already covers L0-L3) up
      the tier ladder. Per §37's own note, expensive tiers (L6 runtime/
      test, L7 integration) SHOULD run lazily against the affected
      cone MCO1 produces — not eagerly on every import.
    tiers_to_add:
      - { level: L4, name: "semantic consistency", basis: "existing symbol table" }
      - { level: L5, name: "dependency consistency", basis: "MCO1 graph" }
      - { level: L6, name: "targeted runtime/test", basis: "MCO1 affected cone, lazy" }
      - { level: L7, name: integration, basis: "lazy, cone-scoped" }
      - { level: L8, name: "system contract", basis: "existing interaction-contract.json files" }
    gate: >
      MET when a real mutation triggers L4-L5 synchronously (cheap) and
      L6-L8 lazily against exactly the affected cone MCO1 computes —
      not the whole repo — matching §37's note and §26's
      dependency_cone rule.

  # ── MCO3: full snapshot compliance ────────────────────────────────────
  MCO3_snapshot_compliance:
    depends_on: [MCO1, MCO2]
    status: >
      DONE 2026-09-20 (v0.39.174). Built: idearium/repo/snapshot.js, spec at
      idearium/spec/idearium.repo-snapshot.spec (written first, §8.5),
      routes repo.snapshot.commit/.list/.show, test
      tests/modules/test-mco3-repo-snapshot.js 38/38. GATE MET: one real
      commit, read back through versionium's getState(), carries all nine
      §33 must_record keys with their data intact; also exercised over real
      HTTP against a booted versionium. CORRECTION to the "additive fields
      on the existing real commit" premise below: no repo-scoped commit
      existed (idea snapshots commit ideas/specs/gaps), so this phase added
      the repo-scoped path on versionium's unchanged engine.commit(),
      under system 'idearium.repo'. MCO-B (per-file snapshot/delta) is still
      NOT STARTED: a repo snapshot records derived state and stores no file
      content, so it cannot restore files.
      UI: Versionium repo subtab (v0.39.175) — list, take, per-snapshot detail,
      since-previous strip; tests/modules/test-mco3-versionium-tab.js.
    does: >
      Extends the versionium_commit metadata (real, existing — see
      idearium-creative-repo-overhaul-phasemap MCO-B) to also carry
      atlas_version, chunk_index_version, graph_version,
      dependency_state, environment, test_state, verification_state —
      the rest of §33's must_record list. No new commit mechanism;
      this is additive fields on the existing real one.
    gate: >
      MET when a real commit's metadata round-trips all of §33's
      must_record fields, verified against one real commit, not asserted.

  # ── MCO4: hooks/wires/flows/tools as first-class repository nodes ────
  MCO4_hooks_wires_flows_tools:
    depends_on: [MCO1]
    status: 'LATER — off the path — repository tools as nodes and full git come after (declutter 2026-10-09)'
    status_before: "NOT STARTED"
    does: >
      Wraps the real functions that already exist (agent-suite's
      listRepositories/getRepositoryMap/etc., import-pipeline's
      parse/verify) as formal .tool nodes per §22, rather than writing
      new logic. Adds repository:hook / repository:wire as typed nodes
      per §18-19. .flow (§21) is new — a general event-driven
      executable topology, explicitly distinct from clear-glass's
      .macro, which stays untouched.
    adds:
      - "repository.discover/.map/.parse/.index/.search/.traverse/
        .surface/.patch/.verify/.diff/.snapshot .tool nodes (§22 list),
        each wrapping an already-real function where one exists"
      - repository:hook / repository:wire typed nodes (§18-19)
      - ".flow schema (§21) — nodes, wires, entry, status"
    gate: >
      MET when every .tool node in §22's canonical list either wraps a
      cited real function or is explicitly marked not-yet-implemented —
      no .tool node claims capability without a real function behind it.

  # ── MCO5: git push/pull + credentials ─────────────────────────────────
  MCO5_git_integration_credentials:
    depends_on: [MCO3]
    status: 'LATER — off the path — repository tools as nodes and full git come after (declutter 2026-10-09)'
    status_before: "NOT STARTED — SAME WORK as
      idearium-creative-repo-overhaul-phasemap.spec's MCO-G. Build once,
      satisfy both gates. See build_order_note."
    does: >
      Real git clone/fetch/branch/checkout/diff/commit/tag/restore/
      push/pull against repository.source (§30 git_provides list).
      NEXUS continues owning semantic identity/atlas/chunks/
      relationships/verification/impact (§30 nexus_provides) — git
      integration does not replace any of MCO0-MCO4's real work, only
      persists it externally.
    constraint: >
      §31 CREDENTIALS — agent/copilot MUST NOT receive password/token/
      key contents as ordinary context. Same constraint idearium-
      creative-repo-overhaul-phasemap's MCO-G already states for
      ssh_key_path (copilot_writable:false there). One credential
      capability, one enforcement point, referenced by both phasemaps.
    gate: >
      MET when a real repository pushes a real commit to a real remote
      and a separate clone restores it byte-identical, with zero key
      material appearing in any event/chat/copilot context — identical
      bar to the other phasemap's MCO-G, because it is the same gate.

  # ── MCO6: Compartment ownership ────────────────────────────────────────
  MCO6_compartment_ownership:
    depends_on: [MCO0]
    status: "NOT STARTED"
    path: 'step 3 — check first: CHANGELOG-0.39.178''s table lists MCO6 compartments DONE (declutter 2026-10-09)'
    does: >
      Wires §5's ownership rule: repository import creates or attaches
      to an existing cos/ Compartment, never a second parallel
      "project compartment" abstraction. idearium's repo record (uuid,
      specUuid, rootHash, parent, forks, source, phase) gains a
      compartment_id field; cos/compartment owns execution state,
      idearium's repo record continues owning source/structure per
      §32's distinction (repository model describes source, Compartment
      describes execution).
    gate: >
      MET when every real idearium-imported repo has exactly one
      compartment_id, cos/compartment's own state confirms ownership
      both directions, and no second compartment-like abstraction
      exists anywhere in idearium's repo layer (grep-confirmed absence,
      same bar as MCO0).

  # -- MCO7: Nexus's own systems as repo compartments (added 2026-09-19) -----
  MCO7_nexus_systems_as_repo_compartments:
    depends_on: [MCO0, MCO6]
    status: "PARTIAL 2026-09-19. 7a (audit) and 7b (manifests) DONE - commit 4890f29. 7c-7h NOT STARTED."
    path: 'step 3 — Idearium holds the systems: 7a and 7b done, 7c–7h not started (declutter 2026-10-09)'
    does: >
      James: "make every system a repo compartment" - all Nexus systems. Dogfoods this
      spec on Nexus itself: each system is ONE repo record (source/structure, idearium
      repo layer) bound to ONE cos Compartment (execution/state) per ?5/?32, with its own
      data folder and its own version line. Named so far: intelligence, versionium, loom,
      guardian, ollama, cortex, clear-glass, copilot, idearium (list is open). Repos are
      VIRTUAL first (one git repo, each system a repo record with a path scope); a physically
      separate git repo per system is a later decision (7h). MCO0's note that the nexus
      meta-repo's own git is a separate concern still holds - 7 does not touch MCO5's git work.
      Reason for per-system version lines, from real evidence: the 0.39.156/0.39.154 merge
      had two parallel lines that both used 0.39.153 and 0.39.154 for different work,
      because there is one shared counter.
    steps:
      7a_audit: >
        DONE. Existing: idearium/repo RepoLayer, cos/kernel.js Compartment (flat, no
        parent/child), lib/system-registry.js (read-only aggregator of autopilot + diagnostic
        + lib/version.js). 106 static cross-system require/import edges among the 9 named
        systems (copilot 30, guardian 24, idearium 13, versionium 12, intelligence 11,
        cortex 11, loom 4, clear-glass 1, ollama 0) - a floor: path.join(ROOT,'<sys>')
        reach-across and HTTP calls are not counted. intelligence has no registered version.
      7b_manifests: >
        DONE. <system>/compartment.json for the 9 systems (id, repo scope + versionLine,
        cos compartmentId with empty axioms, runtime entry/port/phase, data dirs, dependsOn,
        boundaryFindings) and cli/compartments.js (list | sync [--write] | check). Manifests
        are DERIVED from the registry + a code scan, never hand-authored facts. Adding a
        system = one row in its SYSTEMS table. Gate MET: check passes for all 9.
      7c_register_in_repolayer: >
        NOT STARTED. Register each manifest as a repo record (manifest = source of truth);
        this is MCO6's compartment_id wiring applied to Nexus. Open: RepoLayer is ESM,
        cli/compartments.js is CJS - decide the loading path first.
      7d_bind_cos_compartment: >
        NOT STARTED. One cos Compartment per system (cos.nexus.<system>). Axioms are James's
        to define (manifests carry an empty list). cos Compartment is flat and identity-tight
        (max 5 axioms); nesting is NOT assumed.
      7e_per_compartment_versioning: >
        NOT STARTED. Each compartment owns its version line; VERSION.system becomes derived.
        Independent of 7c/7d. Needs a first registered version for intelligence.
      7f_boundary_enforcement: >
        NOT STARTED. Turn cross-system requires into contract calls (event-driven interaction
        contracts + handshake verification, per the sovereign-node-architecture phasemap), one
        system at a time in weight order: copilot, guardian, idearium, versionium,
        intelligence/cortex, loom, clear-glass. Independent of 7c/7d.
      7g_remaining_systems: >
        NOT STARTED. Add every other system as James names them (registry candidates not yet
        named: cos, eravos, architect, diagnostic, orchestrator, emerge, siso, warp,
        erosmancer, sentinel) - one SYSTEMS row + sync --write each.
      7h_physical_split_decision: "DEFERRED - a decision, not a build; only after 7f."
    gate: >
      MET when every system in James's list has exactly one repo record and one cos
      Compartment confirming ownership both directions (MCO6's gate, for Nexus's own
      systems), its own version line, and cli/compartments.js check passes with zero static
      cross-system requires per system (lib/ shared kernel excluded).

  build_order: [MCO1, MCO2, MCO4, MCO3, MCO6, MCO7, MCO5]
  build_order_note: >
    MCO5 (git+credentials) is intentionally last here, same reasoning
    as idearium-creative-repo-overhaul-phasemap's MCO-G: highest
    external-network/credential surface, wants its own security pass.
    Because MCO5 here and that spec's MCO-G are literally the same
    build, whichever phasemap reaches it first should implement once;
    the other phasemap's corresponding MCO should then be marked DONE
    by reference to this one's gate, not rebuilt.
