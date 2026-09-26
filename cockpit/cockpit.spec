spec:

  # ════════════════════════════════════════════════════════════════
  # BLOCK 1 — META
  # ════════════════════════════════════════════════════════════════
  meta:
    name:           forge-ide
    version:        1.0.0
    author:         james-brooks
    created_at:     2026-05-30T00:00:00Z
    last_modified:  2026-05-30T00:00:00Z
    status:         bootstrapping
    uuid:           forge-ide-0000-2026-0530-jamesbrooks-001
    checksum:       0000000000000000000000000000000000000000000000000000000000000000
    target_os:      [linux, mac, windows, container]
    execution_mode: hybrid
    paradigm:       [modular, event-driven, constraint-first, web-grammar]
    language_stack: [javascript, typescript]
    runtime_deps:
      - name:     node
        version:  ">=18.0.0"
        required: true
        purpose:  ES module runtime. SISO bus. JAA persistence. Plugin loader.
      - name:     js-yaml
        version:  ">=4.0.0"
        required: true
        purpose:  .spec file parse and emit. spec-validator dependency.
      - name:     zstd-wasm
        version:  ">=1.5.0"
        required: false
        purpose:  .nex compression in browser environments. Node uses native zstd.
      - name:     libsodium-wasm
        version:  ">=0.7.0"
        required: false
        purpose:  Ed25519 signing of .nex artifacts. XSalsa20-Poly1305 encryption.
    constraints:
      - id: CONS-001
        description: >
          SISO bus and JAA are the only shared surfaces between all modules.
          No module imports another module directly. All communication via bus events.
          Violation = cross-layer coupling that breaks hot-reload and test isolation.
        type: hard
        source: rheon-ide-v3.3.0 §5.7 + ME axiom ME-3.
        enforced_by: [GATE-001]
      - id: CONS-002
        description: >
          The .spec file is the container. When a hook is declared in spec.hooks,
          it is registered on the SISO bus immediately on spec load.
          When a surface is declared, the fs-watcher registers it immediately.
          When a gate is declared, causal-nexus registers it immediately.
          The spec does not describe the system — the spec runs the system.
        type: hard
        source: Forge unified spec §F-1 — authorial intent.
        enforced_by: [GATE-002]
      - id: CONS-003
        description: >
          A .nex file opened as a COS compartment creates a sandbox.
          The original .nex is immutable (read-only flag bit 4).
          All mutations in the sandbox write to a shadow fs-layer only.
          On close: shadow layer is discarded or saved as a new .nex (fork).
          The original .nex is never modified by a sandbox session.
        type: hard
        source: Forge unified spec §F-4 — sandbox model.
        enforced_by: [GATE-003]
      - id: CONS-004
        description: >
          All .nex artifacts must pass version-gate validation before
          decompression, parsing, or compartment boot. No component bypasses this gate.
          SHA-256 of payload must match header bytes 16–47.
        type: hard
        source: causal-nexus INV-VM1 + Forge .nex envelope spec §3.
        enforced_by: [GATE-004]
      - id: CONS-005
        description: >
          The Seam web (ring 1 primitives, ring 2 composites, sealed core)
          is the type system. Non-adjacent node jumps in a web path are
          type errors, not runtime errors. They emit a Gap and require a
          bridge keyword. The compiler refuses to emit JS for paths with
          unresolved WEB-TYPE-VIOLATION gaps unless bridge is declared.
        type: hard
        source: SEAM-LANG-SPEC-v0.1.2 §WEB GRAMMAR WEB-6.
        enforced_by: [GATE-005]
      - id: CONS-006
        description: >
          The UI never writes to files directly (ME-1).
          All file writes go through the filebase via bus events.
          CLI and UI are equivalent — same hooks, different surface (ME-2).
        type: hard
        source: META-EDITOR-SPEC-v1.0.0 axioms ME-1, ME-2.
        enforced_by: [GATE-001]
    supersedes:     "forge-ide-spec-v1.0.0 (prose), forge-unified-spec-v1.0.0 (prose)"
    notes: >
      forge-ide is the authoring environment for the Seam constraint language,
      built on rheon-ide-v3.3.0 (143/143 tests, SISO + JAA, 12 modules).
      The .spec file IS the container. A .nex IS a bootable sandbox.
      These are the same thing at different moments of one causal history.
      Validator: node spec-validator.js forge-ide.spec

  # ════════════════════════════════════════════════════════════════
  # BLOCK 2 — INTENT
  # ════════════════════════════════════════════════════════════════
  intent:
    purpose: >
      Forge IDE is a constraint-first authoring environment for the Seam language
      and the Architect universe. It extends rheon-ide-v3.3.0 with: the Seam web
      grammar (ring 1 primitives, ring 2 composites, sealed JAA+SISO core),
      the .spec-as-container model (spec declares hooks/surfaces/gates that
      instantiate live on load), the .nex-as-sandbox model (any .nex can be
      opened as an isolated COS compartment, mutations on shadow layer only),
      clip capture (any authoring process segment is replayable and exportable),
      the GTCI loop (gap taxonomy → question generation → agent injection →
      fix_map → self-healing), and the word-association lattice (shared language
      built from every session, spar, oracle call, and compilation).

    problem_statement: >
      Existing IDEs separate the specification from the execution environment.
      The spec describes what to build; the IDE builds it; the files persist it.
      These are three separate concerns with impedance mismatch at every boundary.
      Forge collapses them: the .spec IS the container, the .nex IS the bootable
      sandbox, the compiler IS a gate chain over the spec's own constraint field.
      The IDE does not load the spec — the spec instantiates the IDE.

    stakeholders:
      - name: james-brooks
        role: >
          Primary author. Writes Seam programs, declares specs, manages clips,
          boots sandboxes from .nex files, runs torture chamber tests.
          Expects the web path to trace live as he types.
      - name: ollama-agent
        role: >
          Local LLM routed through the SNR gate. Receives GTCI-injected gap
          questions as SYSTEM CONTEXT before primary request. Answers feed fix_map.
      - name: guardian-agent
        role: >
          Claude bridge via userscript. Receives same GTCI injection as ollama.
          Higher quality answers for complex gap types. Not in the hot path.
      - name: seam-compiler
        role: >
          The gate chain (Pass 0→3). Reads the .spec constraint field and hooks.
          Never asks questions mid-run. All failures emit named Gaps to JAA.
      - name: cos-compartment-kernel
        role: >
          COS host that wraps the Forge IDE as a compartment (Phase 8).
          Writes runtime.tick and runtime.state to the .spec runtime block.
          Manages shadow fs-layer for .nex sandbox sessions.

    non_goals:
      - Forge is not a general-purpose code editor. It edits Seam programs and .spec files.
      - Forge is not a Docker wrapper or VM manager. Sandboxes are .nex files, not containers.
      - Forge is not an AI model. Ollama and Guardian are agents, not the IDE itself.
      - Forge does not replace git. The evolution_log supplements version control.
      - Forge does not enforce application-level business logic. Gates are structural only.
      - Forge does not write files from the UI layer. All writes go through filebase hooks.

    invariants:
      - id: INV-F1
        statement: >
          The .spec file is the live execution context.
          Hooks declared in spec.hooks are registered on the SISO bus on spec load.
          Surfaces declared in spec.surfaces are watched by fs-watcher on spec load.
          Gates declared in spec.gates are registered with causal-nexus on spec load.
          No hook, surface, or gate exists at runtime unless declared in the spec.
        criticality: fatal
        enforced_by: [GATE-002]
        detection: spec-engine.js validates that every runtime hook has a spec declaration on every tick.
        consequence: Runtime state diverges from spec. §F-1 violated. System pretends to work.

      - id: INV-F2
        statement: >
          A .nex opened as a sandbox never modifies the original .nex.
          All sandbox mutations write to the shadow fs-layer only.
          The original .nex sha256 header field is immutable after write.
        criticality: fatal
        enforced_by: [GATE-003]
        detection: nex-engine.js verifies sha256 on every sandbox close. Throws if original mutated.
        consequence: Sandbox corrupts the original artifact. Replay determinism broken.

      - id: INV-F3
        statement: >
          All .nex artifacts pass version-gate before decompression or boot.
          SHA-256 of compressed payload must match header bytes 16–47.
          Type byte must be one of the 9 declared types (0x01–0x09).
        criticality: fatal
        enforced_by: [GATE-004]
        detection: nex-engine.verify() called before every decompress or boot. GateValidationError on fail.
        consequence: Corrupt or wrong-version artifact hydrates silently. Sandbox boots from bad state.

      - id: INV-F4
        statement: >
          Non-adjacent Seam web path jumps are type errors.
          The compiler emits a WEB-TYPE-VIOLATION Gap for every non-adjacent jump.
          JS is not emitted for paths with unresolved WEB-TYPE-VIOLATION gaps
          unless a bridge keyword explicitly names the conceptual distance.
        criticality: fatal
        enforced_by: [GATE-005]
        detection: web-engine.validatePath() runs on every Pass 0. Gaps written to JAA before Pass 1.
        consequence: Programs with hidden type violations compile to JS. Constraint field is wrong.

      - id: INV-F5
        statement: >
          JAA write before behavior. Every gap, clip, nex artifact, web path,
          grammar word, and gtci question is written to JAA before any action is taken.
        criticality: fatal
        enforced_by: [GATE-006]
        detection: JAA insert audit log checked on every module event. Fails loud if action precedes write.
        consequence: §2.1 violated. State exists in runtime but not in storage. Data loss on crash.

      - id: INV-F6
        statement: >
          The spec runtime block is written by the COS compartment kernel on every SISO tick.
          runtime.tick mirrors the SISO logical clock strictly. Never decrements.
          runtime.state mirrors the COS CompartmentState enum.
        criticality: high
        enforced_by: [GATE-006]
        detection: spec-engine.js asserts runtime.tick >= previous value on every write.
        consequence: Spec heartbeat diverges from kernel. runtime block becomes stale.

      - id: INV-F7
        statement: >
          No module imports another module directly. All communication via SISO bus events.
          Plugin modules are sovereign. Cross-plugin imports are prohibited.
        criticality: fatal
        enforced_by: [GATE-001]
        detection: plugin-loader.js static import analysis on every module load. Throws on violation.
        consequence: Hot-reload breaks. Test isolation fails. Circular imports possible.

    success_conditions:
      - Open any .spec file — hooks live on SISO bus within 100ms of load.
      - Write Seam code — web path traces live, shape named, violations flagged.
      - Compress any spec/session/clip — .nex produced with valid sha256 header.
      - Boot any .nex — COS compartment starts at captured tick, shadow layer mounted.
      - Close sandbox — discard or fork. Original .nex unchanged.
      - Gap detected — GTCI question generated within 3s, injected into next agent call.
      - Clip captured — every bus event in range stored, replayable, exportable.

    failure_conditions:
      - Spec loads but hooks are not on bus — INV-F1 violated.
      - Sandbox closes and original .nex is modified — INV-F2 violated.
      - .nex boots without sha256 verification — INV-F3 violated.
      - Seam compilation succeeds despite WEB-TYPE-VIOLATION gaps — INV-F4 violated.
      - Gap detected but not in JAA before action — INV-F5 violated.
      - runtime.tick decrements — INV-F6 violated.
      - Module imports another module directly — INV-F7 violated.

    tradeoffs:
      - id: TRDE-001
        description: >
          .nex ZSTD compression requires WASM in browser environments.
          WASM boot adds ~200ms to first nex operation.
        chosen: WASM for browser, native zstd for Node.
        alternatives_considered: >
          Pure JS compression (pako) — 3–5x worse ratio. Rejected.
          No compression — .nex files become large for long sessions. Rejected.
        revisit_condition: >
          Revisit if WASM boot time exceeds 500ms on target hardware.
          Revisit when browser native compression API matures.

      - id: TRDE-002
        description: >
          The spec runtime block is written on every SISO tick.
          High-frequency ticking causes frequent file writes for Node backend.
        chosen: Batch runtime block writes at 100ms intervals. Tick counter is in-memory.
        alternatives_considered: >
          Write on every tick — too many IO ops for high-frequency sessions. Rejected.
          Write only on session end — runtime block stale during session. Rejected.
        revisit_condition: >
          Revisit if 100ms batch interval causes visible drift in runtime.tick display.

      - id: TRDE-003
        description: >
          The torture chamber injects faults at arbitrary tick N.
          Fault injection requires pausing the SISO bus, which blocks all event processing.
        chosen: >
          Pause bus, inject, resume. Max pause: 10ms. Alert if exceeded.
        alternatives_considered: >
          Async fault injection — non-deterministic tick targeting. Rejected.
          Separate process — too much IPC overhead for high-tick sessions. Rejected.
        revisit_condition: >
          Revisit if bus pause exceeds 10ms on AMD Ryzen 7 3700X (target hardware).

    risks:
      - id: RISK-001
        assumption: COS compartment kernel is available for Phase 8 integration.
        confidence: medium
        if_wrong: >
          Forge IDE runs standalone without COS host. runtime.tick is written by
          spec-engine.js directly. Sandboxes are simulated with Node worker_threads.
          Phase 8 integration becomes a migration, not a first boot.
        validation_method: >
          Milestone check at Phase 7 (v3.10.0). If COS integration not started,
          activate standalone sandbox fallback (G-U-001 mitigation).

      - id: RISK-002
        assumption: libsodium WASM loads before first .nex sign operation.
        confidence: high
        if_wrong: .nex signing unavailable. Files are compressed but unsigned.
        validation_method: >
          Phase 9 load-order gate. libsodium WASM boot must complete before
          nex-engine registers on bus. GATE-004 blocks sign operations until ready.

  # ════════════════════════════════════════════════════════════════
  # BLOCK 3 — ARCHITECTURE
  # ════════════════════════════════════════════════════════════════
  architecture:
    type: modular
    description: >
      Forge IDE is a strict layer DAG extending rheon-ide-v3.3.0.
      Layer 0 (foundation) is immutable — siso.js, jaa.js, plugin-schema, plugin-loader.
      Layer 1 (spec) is the live authority — the .spec file runs the system.
      Layers 2–9 are modules loaded in phase order via plugin-loader.js.
      All modules communicate via SISO bus events only. No cross-module imports.
      The UI (Layer 9) is hot-swappable and disposable. The spec survives any UI swap.

    communication:
      mechanisms:
        - siso_bus_events
        - jaa_persistence
        - cos_compartment_kernel
        - spec_runtime_block
        - shadow_fs_layer
      primary: siso_bus_events
      fallback: jaa_persistence
      prohibited:
        - mechanism: direct_module_import
          reason: Cross-module imports break hot-reload and test isolation. CONS-001.
        - mechanism: ui_direct_file_write
          reason: UI writes go through filebase hooks only. CONS-006 / ME-1.
        - mechanism: sandbox_write_to_original_nex
          reason: Sandbox mutations shadow only. CONS-003 / INV-F2.

    structure:
      layers:
        - id: foundation
          order: 0
          purpose: >
            Immutable core. SISO bus, JAA persistence, plugin schema, plugin loader.
            Sealed after rheon-ide-v3.3.0. Never changes without major version bump.
          modules: [siso, jaa, plugin-schema, plugin-loader, spec-engine]
          may_import_from: []
          may_not_import_from: [language, agents, voice, compiler, repo, spec-layer, ui]

        - id: spec-layer
          order: 1
          purpose: >
            The .spec file is the live execution context. spec-builder reads, validates,
            and emits the spec. When loaded, the spec instantiates hooks, surfaces, and
            gates on the bus. The runtime block receives ticks from the kernel.
          modules: [spec-builder]
          may_import_from: [foundation]
          may_not_import_from: [language, agents, voice, compiler, repo, ui]

        - id: kernel-bridge
          order: 2
          purpose: Rheon kernel ↔ IDE bus translation.
          modules: [kernel-bridge]
          may_import_from: [foundation]
          may_not_import_from: [language, agents, voice, compiler, repo, ui]

        - id: language
          order: 3
          purpose: >
            Seam language engines. seam-engine (kernel words, constraint extraction),
            grammar-engine (ledger, keyword trust, negotiation), field-engine
            (constraint field, gaps, BEP stage), web-engine (web path extraction,
            adjacency validation, fork geometry, shape naming).
          modules: [seam-engine, grammar-engine, field-engine, web-engine]
          may_import_from: [foundation, spec-layer, kernel-bridge]
          may_not_import_from: [agents, voice, compiler, repo, ui]

        - id: agents
          order: 4
          purpose: >
            LLM agents and quality gate. ollama-agent (local LLM, hardware-calibrated
            catalog), guardian-agent (Claude bridge via userscript), snr-passthrough
            (quality gate, routing decisions, SNR scoring before agent dispatch).
          modules: [ollama-agent, guardian-agent, snr-passthrough]
          may_import_from: [foundation, language]
          may_not_import_from: [voice, compiler, repo, ui]

        - id: voice
          order: 5
          purpose: Web Speech API. Segment log. Lattice feed.
          modules: [voice-engine]
          may_import_from: [foundation, language]
          may_not_import_from: [compiler, repo, ui]

        - id: compiler
          order: 6
          purpose: >
            Gate chain compiler (Pass 0–3). nex-engine (compress/decompress/verify/
            diff/bundle/sign/boot). clip-engine (capture/replay/diff/export/import/boot).
            sandbox-engine (nex → COS compartment lifecycle, shadow fs-layer).
          modules: [compiler, nex-engine, clip-engine, sandbox-engine]
          may_import_from: [foundation, spec-layer, language, agents]
          may_not_import_from: [repo, ui]

        - id: repo
          order: 7
          purpose: Version history, map-engine (.map topology scanner/diff/watcher).
          modules: [repo, map-engine]
          may_import_from: [foundation, spec-layer, compiler]
          may_not_import_from: [ui]

        - id: spec-intel
          order: 8
          purpose: >
            GTCI engine (gap taxonomy 200+ gaps → question generators → agent injection →
            fix_map). lattice-engine (word association, friction detection, shared language).
            causal-nexus (event ring, causal graph, macro projection).
          modules: [gtci-engine, lattice-engine, causal-nexus]
          may_import_from: [foundation, spec-layer, language, agents, compiler, repo]
          may_not_import_from: [ui]

        - id: ui
          order: 9
          purpose: >
            Disposable renderer. Van Gogh swirl canvas (z-index 0, immutable visual core).
            All panels read from bus. Never write to files. Hot-swappable.
          modules: [ui]
          may_import_from: [foundation]
          may_not_import_from: []

      entry_points:
        - id: spec-load
          type: file
          description: >
            Open a .spec file — hooks/surfaces/gates instantiate immediately.
            The spec IS the entry point.
        - id: nex-boot
          type: file
          description: >
            forge nex boot <path.nex> — decompress, verify, mount shadow layer,
            boot COS compartment at captured tick. Sandbox mode.
        - id: clip-boot
          type: event
          description: >
            forge clip boot <clipId> — export clip → .nex, boot at fromTick,
            replay to toTick, then live from that moment.
        - id: siso-bus
          type: event
          description: Direct bus event injection for tests and CLI.
        - id: http-api
          type: api
          description: HTTP server at :7800. 25 routes. CLI handler. Rate limiting.

      exit_points:
        - id: spec-file
          type: file
          description: .spec written on every mutation. runtime block updated every 100ms.
        - id: nex-artifact
          type: file
          description: .nex written on compress, checkpoint, fork, clip export.
        - id: jaa-store
          type: file
          description: JSONL append-only store. One file per table. 35 tables total.
        - id: bus-events
          type: event
          description: All module-to-module communication.
        - id: ui-render
          type: ui
          description: Bus events → panel renders. Disposable.

    data_flow:
      direction: unidirectional
      model: push
      primary_store: jaa_jsonl_store
      secondary_store: spec_runtime_block

    control_flow:
      model: reactive
      orchestration: decentralized
      tick_driven: true
      tick_rate_note: >
        SISO logical tick increments on every event. runtime.tick mirrors this.
        Batched to spec file at 100ms intervals (TRDE-002).

  # ════════════════════════════════════════════════════════════════
  # BLOCK 4 — MODULES
  # ════════════════════════════════════════════════════════════════
  modules:

    siso:
      id:           siso
      uuid:         aa000001-0000-4000-8000-000000000001
      layer:        foundation
      status:       active
      owner:        james-brooks
      version:      3.3.0
      file_ref:     siso.js
      created_at:   2026-05-30T00:00:00Z
      last_modified: 2026-05-30T00:00:00Z
      purpose: >
        Immutable event bus. SISOBus, SISOEvent, StreamLog, Gate, Stream.
        Logical clock (§3.2). Sealed after v3.3.0.
      inputs:
        - id: IN-siso-001
          name: event
          type: SISOEvent
          required: true
          source: any-module
          description: Any bus emission from any module.
      outputs:
        - id: OUT-siso-001
          name: event
          type: SISOEvent
          destination: all-subscribers
          description: Dispatched to all matching gate/subscriber registrations.
      dependencies:
        internal: []
        external: []
      hooks_in: []
      hooks_out:
        - id: HOOK-siso-001
          event: siso:event:emitted
          description: Every bus event. The primary inter-module channel.
        - id: HOOK-siso-002
          event: siso:gate:fired
          description: Gate execution record with input/output.
      failure_modes:
        - id: FAIL-siso-001
          scenario: Circular gate chain exceeds GATE_DEPTH_MAX.
          impact: fatal
          probability: rare
          detection: Gate depth counter. Throws GateCycleError at depth > 20.
          mitigation: GATE_DEPTH_MAX=20 enforced at bus level.
          recovery: No in-process recovery. Restart required.
          emits_gap: true
      state_model:
        type: stateful
        state_vars: [logical_tick, event_ring, gate_registry, subscriber_registry]
        hot_path: event dispatch
        truth_layer: in-memory (JAA mirrors on every write)
      behavioral_contract:
        invariant_refs: [INV-F7]
        description: >
          Gates execute before listeners. Logical clock strictly monotone.
          No module imports SISO directly in cross-module context — bus singleton only.
      cobalt:
        reads: []
        writes: []
      performance:
        latency_budget_ms: 1
        throughput_target: "100k events/s"
        memory_budget_mb: 64
      security:
        trust_level: trusted
        data_sensitivity: internal
        attack_surface:
          - vector: Event flooding via synthetic bus injection.

    jaa:
      id:           jaa
      uuid:         aa000002-0000-4000-8000-000000000002
      layer:        foundation
      status:       active
      owner:        james-brooks
      version:      3.3.0
      file_ref:     jaa.js
      created_at:   2026-05-30T00:00:00Z
      last_modified: 2026-05-30T00:00:00Z
      purpose: >
        Immutable persistence. Dual-backend (Node JSONL + browser IndexedDB).
        35 tables. Append-only. Checkpoints. Sealed after v3.3.0.
      inputs:
        - id: IN-jaa-001
          name: record
          type: object
          required: true
          source: any-module
          description: Any record with uuid field. Written before behavior (§2.1).
      outputs:
        - id: OUT-jaa-001
          name: record
          type: object
          destination: querying-module
          description: Queried records returned to requesting module.
      dependencies:
        internal: []
        external: []
      hooks_in: []
      hooks_out:
        - id: HOOK-jaa-001
          event: jaa:record:inserted
          description: Every successful JAA insert.
        - id: HOOK-jaa-002
          event: jaa:checkpoint:written
          description: Checkpoint written on table compaction.
      failure_modes:
        - id: FAIL-jaa-001
          scenario: JSONL file corrupted mid-write (crash during append).
          impact: high
          probability: rare
          detection: Checksum validation on open. Corrupt lines logged and skipped.
          mitigation: Write-ahead log pattern. Atomic append.
          recovery: Replay from last valid checkpoint.
          emits_gap: true
      state_model:
        type: stateful
        state_vars: [table_cache, checkpoint_index]
        hot_path: insert
        truth_layer: filesystem (JSONL)
      behavioral_contract:
        invariant_refs: [INV-F5]
        description: Write before behavior. Every record has uuid. No silent failures.
      cobalt:
        reads: []
        writes: [nodes, threads, gaps, edges, bep_signals, sessions, tags,
                 personal_vectors, grammar, agent_calls, artifacts, ide_sessions,
                 ledger_upgrade, ledger_idea, ledger_checkpoints, plugins, plugin_hooks,
                 repo_history, spec_versions, voice_segments, snr_signals,
                 web_paths, web_shapes, nex_artifacts, nex_bundles, clips,
                 clip_events, clip_replays, maps, map_diffs, gap_questions,
                 sandbox_sessions, torture_runs, lattice_nodes, lattice_edges]
      performance:
        latency_budget_ms: 5
        throughput_target: "10k writes/s"
        memory_budget_mb: 128
      security:
        trust_level: trusted
        data_sensitivity: confidential
        attack_surface:
          - vector: Path traversal in table file names.

    web-engine:
      id:           web-engine
      uuid:         bb000015-0000-4000-8000-000000000015
      layer:        language
      status:       active
      owner:        james-brooks
      version:      1.0.0
      file_ref:     modules/web-engine/index.js
      created_at:   2026-05-30T00:00:00Z
      last_modified: 2026-05-30T00:00:00Z
      purpose: >
        Extracts and validates the Seam web path as the programmer types.
        Maps keywords to web nodes (ring 1 primitives, ring 2 composites).
        Validates adjacency (WEB-1). Detects forks (FORK-1..5). Names shapes.
        Emits web path events for the web-panel to render.
        Pass 0 of the compiler gate chain.
      inputs:
        - id: IN-web-001
          name: seam_source
          type: string
          required: true
          source: seam-engine
          description: Raw Seam source text from the editor.
      outputs:
        - id: OUT-web-001
          name: web_path
          type: WebPath
          destination: compiler
          description: >
            { path: string[], shape: string, forks: Fork[],
              violations: WebViolation[], edges: WebEdge[] }
        - id: OUT-web-002
          name: gaps
          type: Gap[]
          destination: jaa
          description: WEB-TYPE-VIOLATION gaps for non-adjacent jumps.
      dependencies:
        internal:
          - module_id: seam-engine
            reason: Keyword-to-node mapping uses seam-engine KERNEL_WORDS.
          - module_id: jaa
            reason: Writes web_paths and web_shapes records before emitting.
        external: []
      hooks_in:
        - id: HOOK-web-in-001
          event: ide:seam:parsed
          description: Seam source parsed by seam-engine — triggers web path extraction.
      hooks_out:
        - id: HOOK-web-out-001
          event: forge:web:path:updated
          description: Current web path with shape, forks, violations.
        - id: HOOK-web-out-002
          event: forge:web:violation
          description: WEB-TYPE-VIOLATION gap emitted for non-adjacent jump.
        - id: HOOK-web-out-003
          event: forge:web:shape:named
          description: Named shape detected (declare-and-persist, meaning-arc, etc).
      failure_modes:
        - id: FAIL-web-001
          scenario: Unknown keyword not in KERNEL_WORDS or grammar table.
          impact: low
          probability: common
          detection: Keyword lookup returns null. Nearest adjacent node used as proxy.
          mitigation: >
            Unknown keyword triggers seam proposal event from nearest node.
            Grammar table updated if accepted.
          recovery: Compiler continues with gap noted. No compilation block.
          emits_gap: true
        - id: FAIL-web-002
          scenario: Circular web path (rare — would require loop in Seam syntax).
          impact: medium
          probability: rare
          detection: Path cycle detector. Max path length = 128 nodes.
          mitigation: Emit WEB-CYCLE-DETECTED gap. Halt Pass 0.
          recovery: Programmer resolves loop. Resubmit.
          emits_gap: true
      state_model:
        type: stateful
        state_vars: [current_path, active_shape, fork_stack]
        hot_path: keyword extraction and adjacency check
        truth_layer: jaa (web_paths table)
      behavioral_contract:
        invariant_refs: [INV-F4]
        description: >
          Pass 0 always runs before Pass 1. WEB-TYPE-VIOLATION gaps always written
          to JAA before Pass 1 begins. Never silently passes non-adjacent jumps.
      cobalt:
        reads: [grammar]
        writes: [web_paths, web_shapes, gaps]
      performance:
        poll_interval_ms: 0
        latency_budget_ms: 16
        throughput_target: "60 path updates/s (one per editor keystroke frame)"
        memory_budget_mb: 8

    nex-engine:
      id:           nex-engine
      uuid:         bb000016-0000-4000-8000-000000000016
      layer:        compiler
      status:       active
      owner:        james-brooks
      version:      1.0.0
      file_ref:     modules/nex-engine/index.js
      created_at:   2026-05-30T00:00:00Z
      last_modified: 2026-05-30T00:00:00Z
      purpose: >
        Compress, decompress, verify, diff, bundle, sign .nex artifacts.
        Boot .nex files as COS compartment sandboxes.
        .nex envelope: 96-byte header (magic NEX0, version, type, flags,
        sha256, uuid, ts, payloadLen) + ZSTD-compressed JSON payload.
        Nine types: spec(01), map(02), clip(03), session(04), behavior(05),
        grammar(06), bundle(07), compartment-snapshot(08), sandbox(09).
      inputs:
        - id: IN-nex-001
          name: artifact
          type: object
          required: true
          source: any-module
          description: Spec, map, clip, session, or behavior object to compress.
        - id: IN-nex-002
          name: nex_path
          type: string
          required: true
          source: cli-or-ui
          description: Path to .nex file for decompress, verify, boot, or diff.
      outputs:
        - id: OUT-nex-001
          name: nex_artifact
          type: UrckArtifact
          destination: filebase
          description: Binary .nex envelope written to disk via filebase hook.
        - id: OUT-nex-002
          name: compartment
          type: CosCompartment
          destination: sandbox-engine
          description: Booted COS compartment from .nex. Shadow layer mounted.
      dependencies:
        internal:
          - module_id: jaa
            reason: Writes nex_artifacts before emit. Reads on verify/diff.
          - module_id: sandbox-engine
            reason: Delegates compartment lifecycle to sandbox-engine on boot.
        external:
          - name: zstd-wasm
            reason: ZSTD compression in browser. Native in Node.
          - name: libsodium-wasm
            reason: Ed25519 signing, XSalsa20-Poly1305 encryption. Optional.
      hooks_in:
        - id: HOOK-nex-in-001
          event: forge:nex:compress:request
        - id: HOOK-nex-in-002
          event: forge:nex:boot:request
        - id: HOOK-nex-in-003
          event: forge:nex:verify:request
      hooks_out:
        - id: HOOK-nex-out-001
          event: forge:nex:compress:done
        - id: HOOK-nex-out-002
          event: forge:nex:boot:done
        - id: HOOK-nex-out-003
          event: forge:nex:verify:result
        - id: HOOK-nex-out-004
          event: forge:nex:violation
          description: SHA-256 mismatch or type violation on verify/boot.
      failure_modes:
        - id: FAIL-nex-001
          scenario: SHA-256 mismatch on verify — corrupt .nex file.
          impact: fatal
          probability: rare
          detection: nex-engine.verify() checks sha256 before any decompress.
          mitigation: GateValidationError thrown. Event emitted. JAA gap written.
          recovery: Use prior .nex in chain. Re-compress from source.
          emits_gap: true
        - id: FAIL-nex-002
          scenario: ZSTD WASM not loaded before first compress in browser.
          impact: high
          probability: medium
          detection: WASM readiness gate checked before compress. Emits NOT_READY gap.
          mitigation: Load order gate blocks compress until WASM ready (TRDE-001).
          recovery: Wait for WASM boot. Retry. Max 3s timeout.
          emits_gap: true
      state_model:
        type: stateful
        state_vars: [wasm_ready, active_sandboxes]
        hot_path: compress
        truth_layer: jaa (nex_artifacts table)
      behavioral_contract:
        invariant_refs: [INV-F2, INV-F3]
        description: >
          Original .nex never modified after write. SHA-256 verified before every boot.
          Version gate validates type byte. Shadow layer mounted before compartment start.
      cobalt:
        reads: [nex_artifacts, nex_bundles]
        writes: [nex_artifacts, nex_bundles]
      performance:
        latency_budget_ms: 500
        throughput_target: "1 compress/s for 10MB session"
        memory_budget_mb: 256

    clip-engine:
      id:           clip-engine
      uuid:         bb000017-0000-4000-8000-000000000017
      layer:        compiler
      status:       active
      owner:        james-brooks
      version:      1.0.0
      file_ref:     modules/clip-engine/index.js
      created_at:   2026-05-30T00:00:00Z
      last_modified: 2026-05-30T00:00:00Z
      purpose: >
        Captures any bounded segment of the IDE authoring process as a replayable clip.
        Watches SISO bus events and JAA writes within a fromTick→toTick window.
        Exports clips as .nex (type=0x03). Boots clips as sandboxes via nex-engine.
        Clip sources: seam-session, compilation, gap-resolution, gtci-cycle,
        spec-build, plugin-interaction, web-path, sandbox-session, torture-run.
      inputs:
        - id: IN-clip-001
          name: capture_request
          type: ClipCaptureRequest
          required: true
          source: cli-or-ui
          description: "{ name, source, fromTick? } — fromTick defaults to current tick."
      outputs:
        - id: OUT-clip-001
          name: clip
          type: ForgeClip
          destination: jaa
          description: Complete clip record with all events, web path, gaps, integrity hash.
      dependencies:
        internal:
          - module_id: siso
            reason: Watches bus for all events in clip window.
          - module_id: jaa
            reason: Writes clip, clip_events, clip_replays. Reads on replay.
          - module_id: nex-engine
            reason: Exports clip as .nex. Boots clip as sandbox.
        external: []
      hooks_in:
        - id: HOOK-clip-in-001
          event: forge:clip:capture:start
        - id: HOOK-clip-in-002
          event: forge:clip:stop
        - id: HOOK-clip-in-003
          event: forge:clip:replay:request
        - id: HOOK-clip-in-004
          event: forge:clip:boot:request
      hooks_out:
        - id: HOOK-clip-out-001
          event: forge:clip:capture:done
        - id: HOOK-clip-out-002
          event: forge:clip:replay:event
        - id: HOOK-clip-out-003
          event: forge:clip:replay:done
        - id: HOOK-clip-out-004
          event: forge:clip:export:done
      failure_modes:
        - id: FAIL-clip-001
          scenario: Clip replay diverges from original (non-deterministic side effect).
          impact: medium
          probability: medium
          detection: Hash comparison on replay. forge:clip:replay:diverged emitted.
          mitigation: "Side effects declared in SideEffectRecord. replay: no-op default."
          recovery: Replay continues. Divergence logged. Operator decides.
          emits_gap: true
        - id: FAIL-clip-002
          scenario: Clip event count exceeds memory budget during capture.
          impact: medium
          probability: low
          detection: Event counter checked every 1000 events. Alert at 80% of budget.
          mitigation: Auto-checkpoint at 80%. Ring buffer bounded at clip level.
          recovery: Clip split into sub-clips at checkpoint. Both valid.
          emits_gap: false
      state_model:
        type: stateful
        state_vars: [active_capture, capture_start_tick, event_buffer]
        hot_path: event capture
        truth_layer: jaa (clips, clip_events)
      behavioral_contract:
        invariant_refs: [INV-F5]
        description: >
          JAA write before clip is considered captured. Integrity hash computed
          on every clip close. Side effect policy declared before any replay.
      cobalt:
        reads: [clips, clip_events, clip_replays]
        writes: [clips, clip_events, clip_replays]
      performance:
        poll_interval_ms: 0
        latency_budget_ms: 1
        throughput_target: "100k events captured/s without blocking bus"
        memory_budget_mb: 128

    sandbox-engine:
      id:           sandbox-engine
      uuid:         bb000018-0000-4000-8000-000000000018
      layer:        compiler
      status:       active
      owner:        james-brooks
      version:      1.0.0
      file_ref:     modules/sandbox-engine/index.js
      created_at:   2026-05-30T00:00:00Z
      last_modified: 2026-05-30T00:00:00Z
      purpose: >
        Orchestrates .nex or clip → COS compartment sandbox lifecycle.
        Mounts copy-on-write shadow fs-layer over original .nex.
        Manages playground modes (isolated, mirrored, synthetic).
        Manages torture chamber (12 fault injection types at arbitrary tick N).
        On close: discard shadow or save as new .nex fork.
      inputs:
        - id: IN-sandbox-001
          name: nex_or_clip
          type: NexArtifact | ForgeClip
          required: true
          source: nex-engine or clip-engine
          description: Artifact to boot as sandbox.
        - id: IN-sandbox-002
          name: sandbox_config
          type: SandboxConfig
          required: false
          source: cli-or-ui
          description: >
            { mode: 'playground'|'torture', isolation: IsolationLevel,
              playgroundMode?: PlaygroundMode, tortureTests?: TortureTest[] }
      outputs:
        - id: OUT-sandbox-001
          name: compartment_id
          type: string
          destination: cos-kernel
          description: COS compartment UUID. Runtime block updated with sandboxedFrom.
        - id: OUT-sandbox-002
          name: fork_nex
          type: NexArtifact
          destination: nex-engine
          description: New .nex if sandbox closed with fork decision.
      dependencies:
        internal:
          - module_id: nex-engine
            reason: Reads and writes .nex. Forks produce new .nex via nex-engine.
          - module_id: jaa
            reason: Writes sandbox_sessions, torture_runs before compartment start.
        external: []
      hooks_in:
        - id: HOOK-sandbox-in-001
          event: forge:sandbox:open
        - id: HOOK-sandbox-in-002
          event: forge:sandbox:fork
        - id: HOOK-sandbox-in-003
          event: forge:sandbox:discard
        - id: HOOK-sandbox-in-004
          event: forge:torture:run
      hooks_out:
        - id: HOOK-sandbox-out-001
          event: forge:sandbox:started
        - id: HOOK-sandbox-out-002
          event: forge:sandbox:closed
        - id: HOOK-sandbox-out-003
          event: forge:torture:result
        - id: HOOK-sandbox-out-004
          event: forge:sandbox:fork:done
      failure_modes:
        - id: FAIL-sandbox-001
          scenario: Shadow fs-layer fails to mount (disk full or permission error).
          impact: fatal
          probability: rare
          detection: Mount operation checked before compartment start.
          mitigation: Pre-flight disk check. Emit gap. Abort boot.
          recovery: Free disk space. Retry.
          emits_gap: true
        - id: FAIL-sandbox-002
          scenario: Torture fault injection bus pause exceeds 10ms (TRDE-003).
          impact: medium
          probability: low
          detection: Pause timer checked on resume. Alert emitted if > 10ms.
          mitigation: Async fault injection where possible. Sync only if tick-exact required.
          recovery: Torture run continues. Pause duration logged in torture_runs.
          emits_gap: false
      state_model:
        type: stateful
        state_vars: [active_sandboxes, shadow_layers, torture_state]
        hot_path: shadow layer mount/unmount
        truth_layer: jaa (sandbox_sessions, torture_runs)
      behavioral_contract:
        invariant_refs: [INV-F2, INV-F3]
        description: >
          Original .nex never modified. Shadow layer mounts before compartment start.
          JAA write before sandbox start (INV-F5). Fork produces new uuid.
      cobalt:
        reads: [nex_artifacts, clips]
        writes: [sandbox_sessions, torture_runs, nex_artifacts]
      performance:
        latency_budget_ms: 200
        throughput_target: "1 sandbox boot/s"
        memory_budget_mb: 512

    gtci-engine:
      id:           gtci-engine
      uuid:         bb000019-0000-4000-8000-000000000019
      layer:        spec-intel
      status:       active
      owner:        james-brooks
      version:      1.0.0
      file_ref:     modules/gtci-engine/index.js
      created_at:   2026-05-30T00:00:00Z
      last_modified: 2026-05-30T00:00:00Z
      purpose: >
        Gap-Triggered Context Injection. Reads the gap taxonomy (200+ gaps, 60+ domains,
        gap-taxonomy.js v3.0.0). Generates structured questions for every detected gap.
        Injects questions into next agent call as SYSTEM CONTEXT.
        Parses agent answers. Writes answers to fix_map and memory_index.
        Self-healing loop: gap → question → injection → answer → fix_map → healer.
        9 system gap types with registered question generators:
        stale_module, stuck_call, recurring_failure, missing_response,
        schema_violation, law_violation, behavior_gap, dead_listener, ime_anomaly.
      inputs:
        - id: IN-gtci-001
          name: gap
          type: Gap
          required: true
          source: any-module
          description: Any gap written to JAA. Polled every 3s.
      outputs:
        - id: OUT-gtci-001
          name: gap_question
          type: GapQuestion
          destination: jaa
          description: Structured question ready for agent injection.
        - id: OUT-gtci-002
          name: context_block
          type: string
          destination: ollama-agent or guardian-agent
          description: SYSTEM CONTEXT block injected above primary agent request.
      dependencies:
        internal:
          - module_id: jaa
            reason: Reads gaps table. Writes gap_questions. Reads for polling.
          - module_id: ollama-agent
            reason: Injects context block into next agent call.
          - module_id: guardian-agent
            reason: Same injection, higher quality for complex gaps.
        external: []
      hooks_in:
        - id: HOOK-gtci-in-001
          event: jaa:record:inserted
          description: Polls for new gaps on every JAA insert.
        - id: HOOK-gtci-in-002
          event: ide:agent:response
          description: "Agent response parsed for GAP ANSWER N: format."
      hooks_out:
        - id: HOOK-gtci-out-001
          event: forge:gtci:question:generated
        - id: HOOK-gtci-out-002
          event: forge:gtci:question:injected
        - id: HOOK-gtci-out-003
          event: forge:gtci:question:answered
        - id: HOOK-gtci-out-004
          event: forge:gtci:question:resolved
        - id: HOOK-gtci-out-005
          event: forge:gtci:toast:gap
      failure_modes:
        - id: FAIL-gtci-001
          scenario: "Agent response does not contain GAP ANSWER N: markers."
          impact: low
          probability: medium
          detection: Regex parse returns zero matches. Questions reset to pending.
          mitigation: Questions re-injected in next agent call (max 3 attempts).
          recovery: After 3 failed injections, gap escalated to operator toast.
          emits_gap: false
        - id: FAIL-gtci-002
          scenario: Unknown gap type not in taxonomy.
          impact: low
          probability: low
          detection: Taxonomy lookup returns null. Fallback template used.
          mitigation: 'Fallback: "Please describe this gap and suggest resolution."'
          recovery: Answer recorded. Gap marked as custom-resolved.
          emits_gap: false
      state_model:
        type: stateful
        state_vars: [question_queue, injection_history, answer_cache]
        hot_path: gap detection poll
        truth_layer: jaa (gap_questions)
      behavioral_contract:
        invariant_refs: [INV-F5]
        description: >
          JAA write before question is considered generated (INV-F5).
          Max 3 questions injected per agent call (GTCI_MAX_QUESTIONS=3).
          Questions sorted by priority: critical → high → medium → low → age.
      cobalt:
        reads: [gaps, gap_questions, agent_calls]
        writes: [gap_questions]
      performance:
        poll_interval_ms: 3000
        latency_budget_ms: 100
        throughput_target: "20 questions/min in high-gap sessions"
        memory_budget_mb: 16

  # ════════════════════════════════════════════════════════════════
  # BLOCK 5 — CAUSAL MAP
  # ════════════════════════════════════════════════════════════════
  causal_map:

    spec-load-to-hooks:
      id: spec-load-to-hooks
      description: Opening a .spec file causes hooks to register on the SISO bus.
      critical_path: true
      causes:
        - target: siso
          mechanism: hook registration via plugin-loader
          latency: immediate
          reversible: false
      invariant_refs: [INV-F1]
      blast_radius:
        modules: [siso, jaa, spec-builder]
        invariants: [INV-F1, INV-F7]
        event_types: [forge:spec:hook:registered, forge:spec:surface:watching]

    gap-to-question:
      id: gap-to-question
      description: A gap written to JAA triggers GTCI question generation within 3s.
      critical_path: true
      causes:
        - target: gtci-engine
          mechanism: JAA poll detects new gap record
          latency: 3000ms max
          reversible: false
      invariant_refs: [INV-F5]
      blast_radius:
        modules: [gtci-engine, ollama-agent, guardian-agent]
        invariants: [INV-F5]
        event_types: [forge:gtci:question:generated, forge:gtci:question:injected]

    nex-boot-to-sandbox:
      id: nex-boot-to-sandbox
      description: >
        Booting a .nex causes: sha256 verify, type gate, ZSTD decompress,
        shadow layer mount, COS compartment start at captured tick.
        The spec's runtime block updates: mode=sandbox, sandboxedFrom=nex.uuid.
      critical_path: true
      causes:
        - target: nex-engine
          mechanism: SHA-256 verify → decompress → spec-engine → sandbox-engine
          latency: 500ms max
          reversible: true
      invariant_refs: [INV-F2, INV-F3]
      blast_radius:
        modules: [nex-engine, sandbox-engine, spec-builder]
        invariants: [INV-F2, INV-F3, INV-F6]
        event_types: [forge:nex:boot:done, forge:sandbox:started, forge:spec:runtime:updated]

    web-path-to-compilation:
      id: web-path-to-compilation
      description: >
        Seam source change → web-engine extracts path (Pass 0) →
        field-engine extracts constraints (Pass 1) →
        compiler emits JS (Pass 2) → artifacts written (Pass 3).
        WEB-TYPE-VIOLATION gaps block Pass 1 unless bridge declared.
      critical_path: true
      causes:
        - target: web-engine
          mechanism: ide:seam:parsed event
          latency: 16ms (one editor frame)
          reversible: false
        - target: compiler
          mechanism: forge:web:path:updated event
          latency: 100ms total Pass 0→3
          reversible: false
      invariant_refs: [INV-F4]
      blast_radius:
        modules: [web-engine, field-engine, compiler, jaa]
        invariants: [INV-F4, INV-F5]
        event_types: [forge:web:path:updated, forge:web:violation, ide:compiler:done]

  # ════════════════════════════════════════════════════════════════
  # BLOCK 6 — EVENT MODEL
  # ════════════════════════════════════════════════════════════════
  event_model:
    event_types:

      - name: forge:spec:loaded
        description: .spec file opened and all hooks/surfaces/gates instantiated.
        producers: [spec-builder]
        consumers: [ui, gtci-engine]
        schema: " specUuid: string, hookCount: number, surfaceCount: number, gateCount: number, ts: number "
        causal_edge_type: causal

      - name: forge:spec:runtime:updated
        description: runtime block written to spec file. Tick, state, mode updated.
        producers: [spec-builder]
        consumers: [ui]
        schema: " tick: number, state: string, mode: string, sandboxedFrom: string | null, ts: number "
        causal_edge_type: temporal

      - name: forge:web:path:updated
        description: Web path extracted from Seam source. Shape named if recognized.
        producers: [web-engine]
        consumers: [compiler, ui]
        schema: " path: string[], shape: string, forks: object[], violations: object[], ts: number "
        causal_edge_type: causal

      - name: forge:web:violation
        description: Non-adjacent web path jump detected. Gap emitted.
        producers: [web-engine]
        consumers: [compiler, gtci-engine]
        schema: " from: string, to: string, gap: object, ts: number "
        causal_edge_type: causal

      - name: forge:nex:compress:done
        description: .nex artifact written. sha256, bytes, ratio available.
        producers: [nex-engine]
        consumers: [jaa, ui]
        schema: " nexId: string, path: string, type: number, ratio: number, bytes: number, ts: number "
        causal_edge_type: causal

      - name: forge:nex:boot:done
        description: COS compartment booted from .nex. Shadow layer mounted.
        producers: [nex-engine]
        consumers: [sandbox-engine, spec-builder, ui]
        schema: " nexId: string, compartmentId: string, tick: number, ts: number "
        causal_edge_type: causal

      - name: forge:clip:capture:done
        description: Clip capture complete. All events in range stored to JAA.
        producers: [clip-engine]
        consumers: [jaa, ui]
        schema: " clipId: string, eventCount: number, fromTick: number, toTick: number, ts: number "
        causal_edge_type: causal

      - name: forge:sandbox:started
        description: Sandbox compartment running. Shadow layer active.
        producers: [sandbox-engine]
        consumers: [spec-builder, ui]
        schema: " sandboxId: string, nexId: string, mode: string, isolation: number, ts: number "
        causal_edge_type: causal

      - name: forge:sandbox:fork:done
        description: Sandbox closed with fork. New .nex written with parentNex reference.
        producers: [sandbox-engine]
        consumers: [nex-engine, ui]
        schema: " originalNexId: string, forkNexId: string, forkPath: string, ts: number "
        causal_edge_type: causal

      - name: forge:gtci:question:generated
        description: GTCI question generated from gap taxonomy for a detected gap.
        producers: [gtci-engine]
        consumers: [ollama-agent, guardian-agent, ui]
        schema: " questionId: string, gapId: string, gapType: string, priority: string, ts: number "
        causal_edge_type: causal

      - name: forge:gtci:question:resolved
        description: Agent answer recorded. fix_map and memory_index updated.
        producers: [gtci-engine]
        consumers: [jaa, ui]
        schema: " questionId: string, answer: string, fixMapEntry: object, ts: number "
        causal_edge_type: causal

      - name: forge:torture:result
        description: Torture test completed. Pass/fail, gap emitted if applicable.
        producers: [sandbox-engine]
        consumers: [jaa, ui, gtci-engine]
        schema: " runId: string, testId: string, passed: boolean, gap: object | null, recovery: string | null, ts: number "
        causal_edge_type: causal

  # ════════════════════════════════════════════════════════════════
  # BLOCK 7 — RUNTIME MODEL
  # ════════════════════════════════════════════════════════════════
  runtime_model:
    execution_environment:
      primary: node_18_esm
      secondary: browser_chrome_latest
      tertiary: cos_compartment

    # THE SPEC-AS-CONTAINER MODEL
    # The runtime block below is not configuration — it is the spec's own
    # heartbeat. Written by the COS compartment kernel (or spec-engine.js
    # standalone) on every tick. This IS the live execution state.
    spec_runtime_block:
      description: >
        Written by COS compartment kernel every 100ms (batched from SISO tick).
        The spec file IS the container. This block is the container's heartbeat.
        All fields are live — they reflect actual system state, not configuration.
      fields:
        session:
          type: string
          description: Current session UUID. New UUID on every IDE boot.
          writable_by: cos-compartment-kernel or spec-engine.js
        tick:
          type: number
          description: SISO logical clock. Strictly monotone. Never decrements. (INV-F6)
          writable_by: cos-compartment-kernel or spec-engine.js
        mode:
          type: string
          enum: [live, replay, sandbox]
          description: live = normal authoring, replay = playing back clip, sandbox = .nex container
          writable_by: sandbox-engine or spec-engine.js
        state:
          type: string
          enum: [created, running, stopped, snapshotted, replaying, sandboxed]
          description: COS CompartmentState mirror.
          writable_by: cos-compartment-kernel or sandbox-engine
        isolation:
          type: number
          enum: [0, 1, 2, 3, 4]
          description: COS IsolationLevel. 0 = full isolation (default for sandboxes).
          writable_by: sandbox-engine
        sandboxedFrom:
          type: string | null
          description: UUID of .nex this instance was booted from. null if live session.
          writable_by: sandbox-engine
        clips:
          type: string[]
          description: UUIDs of clips anchored to this spec's causal history.
          writable_by: clip-engine
        snr:
          type: number
          description: Current signal quality 0..1 from snr-passthrough.
          writable_by: snr-passthrough
        checkpoints:
          type: object[]
          description: Ring buffer checkpoints. { seq, ts, hash }[]. From causal-nexus.
          writable_by: causal-nexus
        webPath:
          type: string[]
          description: Current Seam web path from web-engine.
          writable_by: web-engine
        webShape:
          type: string
          description: Named shape if recognized by web-engine.
          writable_by: web-engine

    # JAA TABLES (35 total)
    storage:
      backend: jsonl_node_or_indexeddb_browser
      tables:
        # Foundation tables (rheon-ide-v3.3.0, sealed)
        - name: nodes
          description: Voice/text nodes committed to the constraint field.
        - name: threads
          description: Thread records.
        - name: gaps
          description: Gap objects (open and closed). Written before behavior (INV-F5).
        - name: edges
          description: Field topology transition events.
        - name: bep_signals
          description: BEP stage signals.
        - name: sessions
          description: Session metadata.
        - name: tags
          description: Axis tags per ledger entry.
        - name: personal_vectors
          description: Lifetime constraint vectors per person.
        - name: grammar
          description: Seam grammar keyword table. Keyword, trust_score, causedBy.
        - name: agent_calls
          description: Agent call records with GTCI injection history.
        - name: artifacts
          description: Code artifacts from agent responses. Named with namer.
        - name: ide_sessions
          description: IDE session records.
        - name: ledger_upgrade
          description: Upgrade ledger entries. Separate from idea ledger.
        - name: ledger_idea
          description: Idea ledger entries. Zero enforcement surface.
        - name: ledger_checkpoints
          description: Ledger checkpoint hashes.
        - name: plugins
          description: Plugin registry.
        - name: plugin_hooks
          description: Hook registrations per plugin.
        - name: repo_history
          description: Version history records.
        - name: spec_versions
          description: .spec version snapshots.
        - name: voice_segments
          description: Transcribed voice segments.
        - name: snr_signals
          description: SNR quality signals.
        # Forge additions
        - name: web_paths
          description: Web path traces per session. path[], shape, forks[], violations[].
        - name: web_shapes
          description: Named shapes. frequency, firstSeen, lastSeen.
        - name: nex_artifacts
          description: Every .nex written. sha256, path, type, ratio, bytes, flags.
        - name: nex_bundles
          description: Bundles of multiple .nex artifacts.
        - name: clips
          description: Clip records. fromTick, toTick, source, hash, replayable, bootable.
        - name: clip_events
          description: Individual events within clips.
        - name: clip_replays
          description: Replay records. replayed, diverged, ts.
        - name: maps
          description: .map topology snapshots. files[], surfaces[], dataFlows[], gaps[].
        - name: map_diffs
          description: Diffs between topology maps.
        - name: gap_questions
          description: "GTCI gap questions. status lifecycle: pending→injected→answered→resolved."
        - name: sandbox_sessions
          description: Sandbox/playground/torture session records.
        - name: torture_runs
          description: Torture test runs. tests[], results[], clipCaptured.
        - name: lattice_nodes
          description: Word association nodes. word, frequency, valence.
        - name: lattice_edges
          description: Word co-occurrence edges. weight, sessions[].

    context_modes:
      - id: live
        description: Normal authoring. runtime.mode=live. All features active.
      - id: replay
        description: Playing back a clip. Bus emits captured events. UI shows replay progress.
      - id: sandbox
        description: >
          Booted from .nex. Shadow fs-layer active. Mutations captured.
          On close: discard or fork to new .nex. Original immutable.

  # ════════════════════════════════════════════════════════════════
  # BLOCK 8 — INTERFACES
  # ════════════════════════════════════════════════════════════════
  interfaces:
    external:
      - id: IFACE-EXT-001
        name: http-api
        protocol: HTTP/1.1
        port: 7800
        description: HTTP server. 25 routes. CLI handler. Rate limiting.
        consumers: [browser-ui, cos-host, external-tools]
        authentication: none (localhost only)
        rate_limit: 100 req/s

      - id: IFACE-EXT-002
        name: ollama-api
        protocol: HTTP/1.1
        port: 11434
        description: Local Ollama API. GTCI injections go here first.
        consumers: [ollama-agent]
        authentication: none (localhost)

      - id: IFACE-EXT-003
        name: guardian-bridge
        protocol: WebSocket
        port: 7749
        description: Claude bridge via Guardian userscript. Zero API key needed.
        consumers: [guardian-agent]
        authentication: session-cookie

      - id: IFACE-EXT-004
        name: cos-compartment-api
        protocol: HTTP/1.1
        port: 3748
        description: COS host API. Compartment lifecycle. Phase 8+.
        consumers: [sandbox-engine]
        authentication: compartment-token
        status: planned

    internal:
      - id: IFACE-INT-001
        name: siso-bus
        from_module: any-module
        to_module: siso
        mechanism: SISOBus.emit() / SISOBus.on()
        description: Primary inter-module channel. All modules use this.

      - id: IFACE-INT-002
        name: jaa-persistence
        from_module: any-module
        to_module: jaa
        mechanism: jaa.insert() / jaa.query()
        description: Write before behavior. UUID on every record.

      - id: IFACE-INT-003
        name: spec-runtime-write
        from_module: spec-engine
        to_module: spec-builder
        mechanism: bus event forge:spec:runtime:update
        description: Tick, state, mode written to spec runtime block.

      - id: IFACE-INT-004
        name: gtci-injection
        from_module: gtci-engine
        to_module: ollama-agent
        mechanism: bus event forge:gtci:inject
        description: SYSTEM CONTEXT block prepended to next agent call.

  # ════════════════════════════════════════════════════════════════
  # BLOCK 9 — VALIDATION
  # ════════════════════════════════════════════════════════════════
  validation:
    gates:
      - id: GATE-001
        description: Module isolation gate. No direct cross-module imports.
        severity: fatal
        enforces: [INV-F7]
        check_logic: plugin-loader.js static import analysis on every module load.
        on_failure:
          action: halt
          message_template: "ISOLATION: Module imported directly. Bus events only."
          log_to: [gaps, law_violations]

      - id: GATE-002
        description: Spec-as-container gate. Hooks declared in spec are live on bus.
        severity: fatal
        enforces: [INV-F1]
        check_logic: spec-engine.js validates bus registration on every tick.
        on_failure:
          action: halt
          message_template: "SPEC-CONTAINER: Hook declared in spec but not on bus."
          log_to: [gaps, law_violations]

      - id: GATE-003
        description: NEX immutability gate. Sandbox never writes to original .nex.
        severity: fatal
        enforces: [INV-F2]
        check_logic: nex-engine.verify() checks sha256 on sandbox close.
        on_failure:
          action: halt
          message_template: "NEX-IMMUTABLE: Original .nex was modified. Shadow layer breach."
          log_to: [gaps, law_violations]

      - id: GATE-004
        description: NEX version gate. SHA-256 and type verified before decompress or boot.
        severity: fatal
        enforces: [INV-F3]
        check_logic: nex-engine.verify() runs before every decompress or boot.
        on_failure:
          action: halt
          message_template: "NEX-VERSION: sha256 mismatch or invalid type. Artifact corrupt."
          log_to: [gaps]

      - id: GATE-005
        description: Web type gate. Non-adjacent path jumps block Pass 1 without bridge.
        severity: fatal
        enforces: [INV-F4]
        check_logic: web-engine.validatePath() in Pass 0 before field-engine runs.
        on_failure:
          action: rollback
          message_template: "WEB-TYPE: Non-adjacent jump. Declare bridge or fix path."
          log_to: [gaps]

      - id: GATE-006
        description: JAA-first gate. JAA write before any behavior.
        severity: fatal
        enforces: [INV-F5, INV-F6]
        check_logic: JAA insert audit on every module event.
        on_failure:
          action: halt
          message_template: "JAA-FIRST: Action occurred before JAA write. 2.1 violated."
          log_to: [gaps, law_violations]

    drift_detection:
      enabled: true
      comparison_target: last_snapshot
      check_interval_s: 3600
      drift_threshold: 0.15
      auto_patch_proposal: false

    static_analysis:
      run_on: [on_patch, deploy]
      tools: [spec-validator]
      fail_on: fatal_only

    coverage:
      min_module_gate_coverage: 0.95
      min_invariant_gate_coverage: 1.0
      warn_below: 0.90
      fail_below: 0.80

  # ════════════════════════════════════════════════════════════════
  # BLOCK 10 — SNAPSHOTS
  # ════════════════════════════════════════════════════════════════
  snapshots:
    - id: SNAP-F-001
      spec_version: 1.0.0
      timestamp: 2026-05-30T00:00:00Z
      trigger: manual
      state_hash: 0000000000000000000000000000000000000000000000000000000000000000
      prior_snapshot: ""
      delta_summary: >
        Initial .spec encoding for forge-ide v1.0.0. Built on rheon-ide-v3.3.0.
        8 new modules declared. Spec-as-container model in runtime_model block.
        Nex-as-sandbox model in CONS-003, INV-F2, INV-F3, sandbox-engine.
        7 invariants, 6 gates, 12 event types, 35 JAA tables. 9-phase roadmap.
      diff_ref: ""
      causal_delta:
        added: [spec-as-container, nex-as-sandbox, web-engine, gtci-engine, clip-engine, sandbox-engine]
        removed: []
        modified: []
      modules_changed: [web-engine, nex-engine, clip-engine, sandbox-engine, gtci-engine, jaa, siso]
      invariants_status:
        - invariant_id: INV-F1
          status: declared
          gate_id: GATE-002
          checked_at: 2026-05-30T00:00:00Z
        - invariant_id: INV-F2
          status: declared
          gate_id: GATE-003
          checked_at: 2026-05-30T00:00:00Z
        - invariant_id: INV-F3
          status: declared
          gate_id: GATE-004
          checked_at: 2026-05-30T00:00:00Z
        - invariant_id: INV-F4
          status: declared
          gate_id: GATE-005
          checked_at: 2026-05-30T00:00:00Z
        - invariant_id: INV-F5
          status: declared
          gate_id: GATE-006
          checked_at: 2026-05-30T00:00:00Z
        - invariant_id: INV-F6
          status: declared
          gate_id: GATE-006
          checked_at: 2026-05-30T00:00:00Z
        - invariant_id: INV-F7
          status: declared
          gate_id: GATE-001
          checked_at: 2026-05-30T00:00:00Z
      patch_ref: ""
      replay_tested: false
      replay_test_at: ""
      notes: >
        Bootstrap snapshot. state_hash placeholder — computed on first nex-engine compress.
        All invariants declared. None yet proven by running code.
        Phase 1 (spec-as-container) is the first proof point.

  # ════════════════════════════════════════════════════════════════
  # BLOCK 11 — EVOLUTION LOG
  # ════════════════════════════════════════════════════════════════
  evolution_log:
    - id: EVOL-F-001
      timestamp: 2026-05-30T00:00:00Z
      spec_version_before: 0.0.0
      spec_version_after: 1.0.0
      change_type: [initial_encoding]
      author: james-brooks + claude-sonnet-4
      reason: >
        Initial .spec encoding for forge-ide v1.0.0.
        Synthesizes six prior specifications into machine-parseable format
        using causal-nexus.spec from spec_builder.zip as authoritative template.
        Three authorial questions became the architecture:
        "what if the spec file itself, is the container it builds in."
        "a sandbox would be a nex file opened up as a container?"
        "yes."
      alternatives_considered:
        - option: Keep prose specs as source of truth.
          rejected_reason: >
            Prose specs cannot be validated by spec-validator.js.
            Cross-references unchecked. Invariant coverage uncomputable.
            Drift undetectable. The spec_builder toolchain requires machine-parseable format.
        - option: OpenAPI for HTTP interfaces only.
          rejected_reason: >
            OpenAPI covers external HTTP only. Primary contracts are internal.
            spec-as-container, nex-immutability, web-type-gate require full 11-block format.
      affected_modules: [siso, jaa, web-engine, nex-engine, clip-engine, sandbox-engine, gtci-engine]
      affected_invariants: [INV-F1, INV-F2, INV-F3, INV-F4, INV-F5, INV-F6, INV-F7]
      causal_impact: >
        No runtime behavior change — system not yet built. Enables spec-validator
        validation, blast radius computation, drift detection, invariant coverage
        verification. All 7 declared invariants have enforcing gates.
      snapshot_ref: SNAP-F-001
      review_status: auto_approved
      reviewed_by: spec-validator.js
      reviewed_at: 2026-05-30T00:00:00Z
