spec:
  meta:
    name:     spec-engine-manifest-first
    version:  0.2.0
    date:     2026-09-25
    owner:    idearium.spec-engine
    status:   P1b+P2 built (0.39.245); P1a, P1c, P3–P6 open
    origin: >
      James: "components made separately so the llm needs as little context as possible...
      the file structure and list of files, components, and dependencies needs to be generated
      first, creates the registry and manifest first, for the wiring. then chunked into each
      js file/component... using the component registry as an event bus and interaction
      contract with hooks, wires and data directories. also works as a map for the project."

  # ── What exists (mapped, not assumed) ─────────────────────────────────────
  exists:
    - idearium spec-engine chunks a spec per file (ERAVOS v3-17 catalog → 77 chunks, per-block agent)
    - guardian dispatches each chunk to a provider tab; SEAM verdicts per chunk
    - each system ships registry-components.js; loom holds the registry; interaction-contract.json derives from it
  missing:
    - M1 a manifest generated BEFORE chunks, with payload schemas (not just names)
    - M2 a static wiring check that gates chunking
    - M3 a cross-boundary integration run after assembly
  evidence_for_missing: >
    0.39.244's three bugs were all seams between individually-correct components:
    guardian /events carried no payload; the Agent tab's api() dropped the refusal body;
    copilot refused before guardian could open the right tab. A unit test stubbing the
    boundary passed while the system failed.

  # ── Invariants (Cobalt Core for this pipeline) ────────────────────────────
  invariants:
    I1: one source of truth — the manifest generates the wiring; code never re-declares it by hand
    I2: every component has exactly one intent sentence and is the smallest unit that achieves it
    I3: every signature has exactly one producer; collision is a hard error (SISO law 1)
    I4: every emitted event has a consumer or is declared residue; undeclared residue is an error
    I5: a chunk's context = its own manifest entry + its neighbours' schemas; nothing else
    I6: kernel (bus, registry, router, persistence, boot order) is phase 0 — never chunked

  # ── Manifest entry (typed; one per component) ─────────────────────────────
  manifest_entry:
    id:        string            # stable component_id
    intent:    string            # one sentence
    file:      string            # path in the repo
    consumes:  [ { signature: string, schema: object } ]   # events/commands it handles
    emits:     [ { event: string, schema: object, residue: bool } ]
    data:      { reads: [dir], writes: [dir] }
    cli:       string | null     # verb noun [flags], routed through the component router
    depends:   [component_id]    # by id — no imports
    tests:     [ { given: object, expect: object } ]      # contract tests, from schemas

  # ── Pipeline (gated states, each transition ledgered) ─────────────────────
  pipeline:
    - P0 SPEC       → spec text in
    - P1 MANIFEST   → LLM generates file tree + manifest entries + registry (one job, whole-spec context)
    - >-
        P2 WIRE-CHECK → static, no LLM: I3, I4, schema compatibility producer↔consumer, depends acyclic
        FAIL → back to P1 with the violation list (retry protocol: creation ctx + failure report)
    - P3 KERNEL     → phase 0 built and tested first (bus, registry loader, router, persistence)
    - P4 CHUNKS     → one chunk per component, parallel; context per I5; SEAM contract tests per entry
    - P5 ASSEMBLE   → registry loads components by id; router wires signatures; no imports
    - >-
        P6 INTEGRATE  → real events across real boundaries, driven from manifest emits/consumes; no stubs at seams
    - states: >-
        QUEUED → MANIFESTED → WIRED → KERNEL_OK → CHUNKED → ASSEMBLED → INTEGRATED | FAILED → RETRYING

  # ── Components to build (each its own chunk) ──────────────────────────────
  components:
    - { id: idearium.manifest.generate,  intent: "spec → manifest entries + file tree + registry",         cli: "manifest generate <specId>" }
    - { id: idearium.manifest.validate,  intent: "check I3/I4/schemas/acyclic; list violations",            cli: "manifest check <specId>" }
    - { id: idearium.manifest.chunk,     intent: "one chunk per entry with I5 context",                     cli: "manifest chunk <specId>" }
    - { id: idearium.manifest.contract,  intent: "SEAM contract tests from an entry's schemas",             cli: "manifest tests <componentId>" }
    - { id: idearium.manifest.integrate, intent: "drive every declared emit across the assembled registry", cli: "manifest integrate <specId>" }
    - { id: idearium.manifest.map,       intent: "render the manifest as the project map (Architect tab)",  cli: "manifest map <specId>" }

  # ── Open questions (ask before building) ──────────────────────────────────
  gaps:
    - G1 schema language: JSON Schema subset, or JAA table defs (jaa/schema.sql) as the type system?
    - G2 where the manifest lives: a .manifest node in the repo compartment, or inside the .spec?
    - G3 existing specs (e.g. ERAVOS, 77 chunks already built): regenerate through P1, or backfill a manifest from code?
    - G4 roadmap/phasemap consolidation (James, earlier) — the pipeline states above could BE the phasemap

  # ── Built 0.39.245 (2026-09-25) ───────────────────────────────────────────
  built:
    code: idearium/spec-engine/manifest/  (parse-catalog, file-list, graph, wire-check, registry, commands, cli, index)
    doors:
      - idearium manifest check|generate|context <file>          (idearium CLI router)
      - node idearium/spec-engine/manifest/cli.js …               (pure: loads no store; clean JSON for chunk prompts)
    reads: .spec catalogs (genesis grammar), build_order YAML (compiler-t0 shape), JSON file lists
    checks: DUPLICATE_KEY/PATH, MISSING_INTENT, SELF_DEPENDENCY, UNRESOLVED_DEPENDENCY, CYCLE (all cycles listed),
            MULTIPLE_PRODUCERS (I3), UNDECLARED_RESIDUE (I4), NO_PRODUCER, SCHEMA_MISMATCH; warns LEGACY_REF
    emits: manifest.json (entries, depends, dependents, layers, buildOrder) + component-registry.json — deterministic
    reuse: compiler-t0 _topoOrder now calls manifest/graph.js order() — one ordering implementation
    proof: tests/modules/test-manifest-phase1.test.mjs 16/16
    first_run_findings (genesis.spec's own file tree):
      - kernel/boot.js ↔ spine/warp-bridge.js cycle (ref meant "calls OR relates to")
      - component-registry.js generated from manifest-registry.js but did not depend on it
      - kernel/boot.js and pulse/heartbeat.js read config without depending on it
      - hand-written boot order had config/ last
      - fixed in genesis.spec: ref split into depends (directional) / related; boot order now generated (7 layers)

  # ── P1 split (agreed 2026-09-25) — whole-spec context used exactly once ──
  p1_split:
    - P1a FILE LIST  → one LLM job: path, uuid, one-sentence intent, depends   (only step that sees the whole spec)
    - P1b REGISTRY   → code, no LLM: resolve, reject cycles, registry, layers, build order      [BUILT]
    - P1c INTERFACES → one small LLM job per file: own intent + depends' intents → consumes/emits/exposes + schemas
    - then P2 WIRE-CHECK on the interfaces                                                          [BUILT]

  # ── Raised by James 2026-09-25, not built ────────────────────────────────
  next:
    - N1 ollama: new conversation per chunk (context reset); log each conversation; a chunk may reference
         the previous chunk's log when it needs persistence — by reference, not by carrying it in context
    - N2 copilot: log every exchange and reference the last context — "it's dumb and has no persistence,
         which was a major point of cortex"
    - N3 "i need to be able to manage nexus in idearium, this is too much in my head all the time"
         → run P1b over NEXUS itself (backfill a file list from code, G3) so NEXUS has a generated map;
           this is also the substrate for the permanent NEXUS repo (step 2 of the 2026-09-25 order)

  # ── 0.39.246 ─────────────────────────────────────────────────────────────
  graphs_hooked:
    - code (graph.json) · execution (proof.json, now auto-queued per import) · spec (spec-graph.json, new — built from this manifest builder)
    - spec↔code disagreements recorded as ledger_divergence (declared_not_imported · imported_not_declared)
    - open: execution↔code / execution↔spec comparison
