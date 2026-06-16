spec:
  meta:
    name:        cli
    version:     1.0.0
    foundation:  nexus-system-foundation@1.0.0
    uuid:        nexus-cli-v1-0000-2026-0615-jamesbrooks-001
    purpose: >
      Command-line tools for NEXUS operation, diagnosis, and boot.
      Not a service. Scripts run on demand.
      The dynamic grammar CLI (Phase 3) will replace most of these
      with a unified interface driven by the component registry.

  modules:
    - id: diagnose
      path: "cli/diagnose.js"
      lines: 1450
      description: >
        Runs all 12 diagnostic engines against a system's ledger.
        Called automatically by boot-systems when a service fails to come up.
        Also callable manually: node cli/diagnose.js <systemId>
        Output: health score, alerts, causal chain, circuit state,
        entropy rate, fault tree, homeostasis score.

    - id: boot-systems
      path: "cli/boot-systems.js"
      description: >
        Starts all NEXUS subsystems in sequence.
        Called by orchestrator after its own boot sequence completes.
        Each system: spawn → wait for health → verify contract.
        On failure: run diagnose → log to event ledger → continue.
        Order: bridge → cortex → guardian → idearium → architect → emerge → diagnostic.

    - id: nexus-repl
      path: "cli/nexus-repl.js"
      description: >
        Interactive REPL for NEXUS.
        Currently: direct command dispatch via auth client.
        Phase 3: replaced by grammar engine CLI with tab completion,
        component-driven grammar, and live grammar updates via SSE.

    - id: build-cli (Phase 3)
      path: "lib/grammar-engine.js  (not yet built)"
      description: >
        The dynamic grammar CLI. Phase 3 of the component registry arc.
        Fetches grammar tree from /api/components/grammar.
        Builds trie for O(k) command resolution.
        Tab completion from trie.
        Live grammar updates when component.registered SSE fires.
        Every component becomes a CLI command automatically.
        No hardcoded commands. Grammar is a function of the registry.
      operations:
        - "fetch(orchestratorUrl) → GrammarTree"
        - "buildTrie(tree) → TrieNode"
        - "resolve(input, trie) → { componentId, params, raw }"
        - "complete(partial, trie) → string[]"
        - "rebuild(sseStream) → void"
      status: "PENDING — Phase 3"

  notes:
    - "All existing CLI tools remain functional during Phase 3 build"
    - "Phase 3 grammar CLI wraps and extends, does not replace, auth client"
    - "diagnose.js is the manual entry point to the 12-engine suite"
