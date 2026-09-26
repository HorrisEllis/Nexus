spec:
  meta:
    name:        spec-compiler
    version:     1.1.0
    uuid:        nexus-spec-compiler-v1-0000-2026-0615-jamesbrooks-001
    purpose: >
      Deterministic code emitter from .spec files.
      The spec is the intent. The compiler produces the code.
      T0 and T1: zero LLM tokens. Fully deterministic.
      T2 and T3: AI fills genuine logic gaps only.
      Tokens ∝ unresolved meaning. Pay once. Recover from spec.

  axioms:
    CC-001: "Query Cortex before emitting. If it exists, skip."
    CC-002: "T0 and T1 emit zero LLM tokens. Fully deterministic."
    CC-003: "Chunk token budget enforced. T2 max 800. T3 max 2000."
    CC-004: "One chunk = one node. No flooding."
    CC-005: "Every emitted file registered with Cortex via versionium after write."

  pipeline:
    T0:
      name: "Structure emission"
      input: "ParsedSpec + PreflightResult"
      output: "directory tree, empty files, barrel exports, package.json"
      tokens: 0
      description: >
        Fully deterministic. Same spec always produces same tree.
        Existing files (from Cortex query) are never overwritten.
        Empty impl files contain only header comment and TODO placeholder.

    T1:
      name: "Scaffold emission"
      input: "ParsedSpec + KnowledgeGraph + PreflightResult"
      output: "typed interfaces, gate stubs with SISO wiring, test describe blocks"
      tokens: 0
      description: >
        Every exported function produces a typed stub that throws NotImplementedError.
        Every gate in gate_pipeline produces a commented stream.on() stub.
        Every behavioral contract produces a commented it() block in test scaffold.
        Open Cortex gaps for this module injected as GAP comments in impl file.

    T2:
      name: "Logic gap fill"
      input: "One KGNode (minimal context)"
      output: "Implemented function body"
      tokens: "max 800"
      model: "qwen2.5-coder:1.5b (GTX 1650 primary)"
      description: >
        One chunk per node. Contains only what that node needs.
        SEAM gate detector validates output before continuing.
        Three retry strategies on failure: resend-with-report, split, forensic.

    T3:
      name: "Complex reasoning"
      input: "Multiple KGNodes with broader context"
      output: "Complex implementations, cross-module logic"
      tokens: "max 2000"
      model: "mistral:7b-instruct-q4_K_M or NCP provider"

  modules:
    - id: cortex-query
      description: "Queries Cortex before any generation. Non-fatal if unreachable."

    - id: compiler-t0
      description: "Structure emission. Deterministic. Zero tokens."

    - id: compiler-t1
      description: "Scaffold emission. Deterministic. Zero tokens."

    - id: chunk
      description: "Builds minimal token payload for T2/T3 dispatch."

    - id: knowledge-graph
      description: "Builds dependency graph from spec modules and their exports."

    - id: runtime
      description: "Orchestrates the full T0→T1→T2→T3 pipeline."

  spec_format:
    root_key: "spec:"
    required_keys: [meta, modules]
    optional_keys: [schemas, events, tests, handshake, routes, ui]
    meta_required: [name, version, purpose, uuid]
    module_required: [id, description]
    module_optional: [exports, gate_pipeline, behavioral_contracts, error_paths, surfaces]

  usage:
    drop_in_builder: "Drag .spec file onto Builder drop zone"
    auth_client:     "node auth/client.js compile --file docs/foo.spec"
    direct:          "node spec-compiler/runtime.js --spec docs/foo.spec --out ./out"

  recovery_value: >
    The spec-compiler is the system's backup mechanism.
    Every system's .spec file is a complete recovery document.
    If the codebase is lost:
      1. Start with nexus-system-foundation.spec
      2. Run spec-compiler on each system spec
      3. T0/T1 produce the scaffolding deterministically
      4. T2/T3 fill the logic gaps via Ollama
      5. System is recovered without starting from memory
    The specs ARE the backup.
