spec:

  # ════════════════════════════════════════════════════════════════════════════
  # nexus-system-foundation.spec
  # The shape every NEXUS system must implement.
  #
  # This is not a module. It is a contract.
  # Every system in NEXUS (cortex, guardian, bridge, idearium, architect,
  # emerge, diagnostic) implements this foundation before anything else.
  #
  # The foundation has six layers, always in this order:
  #
  #   L0  IMMUTABLE CORE     — axioms, schemas, constants. Never changes.
  #   L1  EVENT BUS          — all state changes are events. Nothing couples directly.
  #   L2  CLI                — reads component registry. Grammar from registry.
  #   L3  API                — routes, validation, contracts.
  #   L4  HANDSHAKE          — registers with orchestrator. Declares components.
  #   L5  UI                 — hotswappable. Reads contract. Renders only.
  #
  # Build order: L0 → L1 → L2 → L3 → L4 → L5
  # Replace order: L5 first (safe). L0 never (immutable).
  # Couple order: only to L0 and L1. Never to L3, L4, L5.
  #
  # The event bus is the spine. Systems talk to each other through events,
  # not direct HTTP calls. HTTP is for external consumers (CLI, UI, other systems).
  # Internal state changes go through the bus first.
  #
  # ⚠️ §AX-011 QUALIFIER (addendum v1.2.0, 2026-07-09) — the two sentences
  # above are TRUE WITHIN A PROCESS and have never been true between them.
  # nexus-bus.js is `class NexusBus extends EventEmitter`: every one of the
  # twelve NEXUS processes holds its own instance. There is no distributed
  # bus. Read as a cross-process promise, this paragraph left engineers two
  # choices for reaching another system — require() its files, or hardcode
  # its port — and both are violations of a spec that offered no third
  # option. Twelve such violations accumulated. Meanwhile nexus-heal-loop
  # listened faithfully, for months, to a bus on which no gap was ever
  # emitted, because gaps are produced in other processes.
  #
  # ACROSS a boundary the sanctioned coupling is L3 (API) + L4 (handshake),
  # called through lib/nexus-client.js — name a SYSTEM and a PATH, never a
  # host or a port. See docs/nexus-system-foundation-addendum-v1.2.0.spec,
  # axioms AX-010 (sovereign transport), AX-011 (the bus does not span
  # processes), AX-012 (handshake verification precedes use).
  #
  # ════════════════════════════════════════════════════════════════════════════

  meta:
    name:        nexus-system-foundation
    version:     1.1.0
    author:      james-brooks
    created_at:  2026-06-15T00:00:00Z
    updated_at:  2026-06-29T00:00:00Z
    status:      canonical
    uuid:        nexus-system-foundation-v1-0000-2026-0615-jamesbrooks-001
    purpose: >
      Defines the shape every NEXUS system must implement.
      Not a module — a contract. Every system spec imports this.
      The foundation ensures every system is modular, replaceable,
      and connected through the event bus rather than direct coupling.
    changelog:
      - "1.1.0 (2026-06-29): promoted AX-008/AX-009 from the v1.1.0 addendum
         (now folded in, superseded as a standalone file). Added AX-010
         (drift-accounting as standing discipline). Added hooks to
         interaction_contract.required_fields — the hooks/wires/seams
         registry existed as a separate system; it's part of the same
         self-description envelope as routes/events/components now."
    applies_to:
      - cortex
      - guardian
      - bridge
      - idearium
      - architect
      - emerge
      - diagnostic
      - orchestrator
      - any new system added to NEXUS

  # ── L0: IMMUTABLE CORE ─────────────────────────────────────────────────────
  # The bedrock. Axioms, schemas, constants.
  # Once written, never changed without a major version bump.
  # Everything above depends on L0. L0 depends on nothing.

  layer_0_immutable_core:

    axioms:
      - id: AX-001
        statement: "Nothing is trusted until proven. Validate everything at the boundary."
        enforced_in: [api, handshake]

      - id: AX-002
        statement: "Nothing fails silently. Every error is an event on the bus."
        enforced_in: [event_bus, cli, api]

      - id: AX-003
        statement: "Disk before behavior. State is written to JAA before it changes anything."
        enforced_in: [core, event_bus]

      - id: AX-004
        statement: "Bottom-up only. Core before CLI. CLI before API. API before UI."
        enforced_in: [build_order]

      - id: AX-005
        statement: "The event bus is the spine. State changes are events first, effects second."
        enforced_in: [event_bus]

      - id: AX-006
        statement: "The UI is the most disposable layer. It reads. It does not own."
        enforced_in: [ui]

      - id: AX-007
        statement: "Every system is self-describing. It declares its components on register."
        enforced_in: [handshake]

      - id: AX-008
        statement: >
          Every component's hook graph must reach copilot.* within N hops,
          either directly (hooks.out wires_to a copilot.* id) or
          transitively (wires_to a component that itself reaches copilot.*).
          Promoted here from nexus-system-foundation-addendum-v1.1.0.spec —
          that file is now folded in, not a second living copy.
        enforced_in: [handshake, enforcement]

      - id: AX-009
        statement: >
          A second handshake path exists for known-but-foreign sovereign
          projects (kern-v2's Ed25519 + grammar-intersection model,
          re-scoped from "untrusted mesh peer"). Explicitly not a
          replacement for bridge/identity.js's shared-secret model among
          NEXUS's own 9 trusted services — different threat model, both
          valid. Also promoted from the v1.1.0 addendum.
        enforced_in: [handshake]

      - id: AX-010
        statement: >
          Spec is living, code drifts — the discipline is catching it, not
          preventing it. Every system's .spec is compared against its live
          state (registry-components.js, hooks/<system>.hooks.js, version
          strings) on a recurring basis. Drift is logged as an event
          (AX-002) and corrected in the spec or the code — never silently
          absorbed by treating the spec as decorative. Session 3-6 found
          drift this way repeatedly (component counts, phase statuses, a
          missing RAID engine); this axiom names that as the system's own
          standing discipline, not just this conversation's.
        enforced_in: [event_bus, ci]

    required_exports:
      description: >
        Every system's core module must export these.
        These are the primitives everything else builds on.
      exports:
        - name: SYSTEM_ID
          type: string
          description: "Globally unique system identifier. e.g. 'cortex', 'guardian'"

        - name: VERSION
          type: string
          description: "Semver. Matches entry in lib/version.js"

        - name: SCHEMA
          type: object
          description: >
            All data shapes this system produces or consumes.
            These are frozen at L0. Changing a schema = major version bump.

        - name: AXIOMS
          type: string[]
          description: "List of axiom ids this system enforces"

        - name: validate
          type: function
          signature: "(data: unknown, schemaId: string) → { ok, errors }"
          description: "Validates any data shape at the boundary"

        - name: constants
          type: object
          description: "All magic numbers, timeouts, thresholds. No literals in code."

  # ── L1: EVENT BUS ──────────────────────────────────────────────────────────
  # The spine. All state changes are events.
  # Systems communicate through events, not direct calls.
  # The bus is the only coupling between systems.

  layer_1_event_bus:

    contract:
      - Every state change in the system emits an event BEFORE the change takes effect.
      - Every error emits an error event. No silent failures (AX-002).
      - Events are written to JAA event_log before being emitted (AX-003).
      - Events carry uuid, type, payload, source, causedBy, ts.
      - causedBy links to the event that triggered this one. Causal chain is traceable.
      - The bus is the only way systems talk to each other internally.
      - HTTP is for external consumers only.

    required_exports:
      - name: emit
        signature: "(type: string, payload: object) → void"
        description: >
          Emit an event. Writes to JAA first, then broadcasts.
          All listeners receive it. causedBy is set if inside an event handler.

      - name: on
        signature: "(type: string, handler: function) → unsubscribe"
        description: "Subscribe to event type. Wildcard '*' catches all."

      - name: once
        signature: "(type: string, handler: function) → unsubscribe"
        description: "Subscribe once then auto-unsubscribe."

      - name: off
        signature: "(type: string, handler: function) → void"

      - name: history
        signature: "(filter?: { type, source, since }) → Event[]"
        description: "Read recent events from JAA event_log."

    standard_events:
      # Every system emits these. The names are fixed.
      - type: "{SYSTEM_ID}.booted"
        when: "System completes its boot sequence"
        payload: "{ version, port, phasesPassed }"

      - type: "{SYSTEM_ID}.error"
        when: "Any unhandled error"
        payload: "{ error, stack, context }"

      - type: "{SYSTEM_ID}.health"
        when: "Health check requested or timer fires"
        payload: "{ ok, services, memory, uptime }"

      - type: "{SYSTEM_ID}.shutdown"
        when: "System is shutting down"
        payload: "{ reason, uptime }"

  # ── L2: CLI ────────────────────────────────────────────────────────────────
  # The command interface. Reads grammar from component registry.
  # Does not own grammar. Does not hardcode commands.
  # Grammar is a function of the component index.

  layer_2_cli:

    contract:
      - CLI grammar is derived from GET /api/components/grammar. Never hardcoded.
      - Tab completion is built from the grammar trie.
      - Every command resolves to a component. Components route to API.
      - CLI is a thin rendering layer. Business logic lives in the API.
      - CLI reconnects automatically when orchestrator restarts.
      - CLI registers itself as a UI via POST /api/ui/register on start.

    required_exports:
      - name: start
        signature: "(opts?: { port, host }) → void"
        description: "Start the interactive CLI. Fetches grammar, opens REPL."

      - name: exec
        signature: "(commandString: string) → Promise<Result>"
        description: >
          Execute a single command non-interactively.
          Used by scripts, tests, and the auth client.

      - name: grammar
        signature: "() → GrammarTree"
        description: "Return the current grammar tree. Fetched from registry."

    grammar_engine:
      description: >
        The grammar engine is shared across all systems.
        It lives in lib/grammar-engine.js (Phase 3).
        Every system CLI imports it. No system reimplements it.
      operations:
        - "fetch(orchestratorUrl) → GrammarTree"
        - "buildTrie(tree) → TrieNode"
        - "resolve(input: string, trie: TrieNode) → { componentId, params, raw }"
        - "complete(partial: string, trie: TrieNode) → string[]"
        - "rebuild(events: SSEStream) → void  // live update on component.registered"

  # ── L3: API ────────────────────────────────────────────────────────────────
  # HTTP surface. Routes, validation, contracts.
  # All input validated at the boundary (AX-001).
  # All state changes go through L1 first, then respond.

  layer_3_api:

    contract:
      - Every route validates input before touching state.
      - Every response follows { ok, data?, error?, _status? } shape.
      - Every mutation emits an event on the bus before returning.
      - Routes are declared as components in the handshake (L4).
      - No route hardcodes business logic — it delegates to core (L0) or service layer.
      - GET routes are always safe — they never mutate state.
      - The API surface is described by the interaction contract.

    required_routes:
      - method: GET
        path: /health
        description: "System health. Always responds, even under load."
        returns: "{ ok, version, uptime, services }"

      - method: GET
        path: /contract
        description: "Interaction contract. Describes this system's full API surface."
        returns: "InteractionContract"

      - method: GET
        path: /events
        description: "SSE stream. All events from this system's bus."
        returns: "text/event-stream"

      - method: POST
        path: /api/register
        description: "Called by orchestrator to verify this system's contract."
        body: "{ orchestratorUrl }"
        returns: "{ ok, systemId, version, components }"

    interaction_contract:
      description: >
        Every system publishes an interaction contract.
        The orchestrator fetches and verifies it on registration.
        The contract is the system's self-description.
      required_fields:
        - systemId
        - version
        - port
        - routes         # all HTTP routes with method/path/description
        - events         # all events this system emits
        - components     # all components this system registers (for CLI)
        - hooks           # this system's entries in hooks/<system>.hooks.js —
                          # added 1.1.0. The hook/wire/seam registry existed
                          # since before this spec did; it just was never
                          # part of the same self-description envelope.
        - schemas        # all data shapes this system produces
        - axioms         # which axioms this system enforces

  # ── L4: HANDSHAKE ──────────────────────────────────────────────────────────
  # How the system declares itself to the orchestrator.
  # Registers components so they appear in the CLI grammar.
  # Happens once on boot, automatically.

  layer_4_handshake:

    contract:
      - System registers with orchestrator via POST :9000/api/register.
      - Registration payload includes components[] array.
      - Components auto-appear in CLI grammar after registration.
      - If orchestrator is unreachable, system retries every 5s (non-fatal).
      - On reconnect, system re-registers (components re-stamped available:true).
      - System listens to orchestrator SSE for contract updates from other systems.

    registration_payload:
      fields:
        - systemId:   "string — matches SYSTEM_ID"
        - port:       "number"
        - version:    "string — semver"
        - meta:       "object — arbitrary metadata"
        - components: "Component[] — registers with component registry"
        - contract:   "string — URL path to GET /contract"

    component_registration:
      description: >
        The components[] array in the registration payload is the key.
        Every capability of the system becomes a component.
        Components appear in the CLI grammar automatically.
        No CLI code needs to change when new capabilities are added.
      example:
        systemId: cortex
        components:
          - id: "cortex.gaps.list"
            grammar: ["cortex gaps list", "gaps", "gl"]
            route: { method: GET, path: "/api/gaps" }
            description: "List open gaps"
          - id: "cortex.memory.write"
            grammar: ["cortex memory write", "mem write", "mw"]
            route: { method: POST, path: "/api/memory/write" }
            description: "Write to working memory"
          - id: "cortex.heal.trigger"
            grammar: ["cortex heal", "heal"]
            route: { method: POST, path: "/api/heal/trigger" }
            description: "Trigger self-heal for a gap"

  # ── L5: UI ─────────────────────────────────────────────────────────────────
  # The most disposable layer. Reads. Does not own.
  # Contract-driven. Bootstraps from /api/contract and /api/components.
  # Can be replaced entirely without touching L0-L4.

  layer_5_ui:

    contract:
      - UI bootstraps entirely from /api/contract + /api/components.
      - No hardcoded routes, commands, or schemas in UI code.
      - UI registers with orchestrator via POST /api/ui/register on open.
      - UI receives all system events via SSE (/events).
      - UI is hotswappable — replace the HTML/JS, the system continues.
      - UI never owns state — it reads from API, renders, sends commands.
      - Multiple UIs can connect simultaneously (browser + terminal + userscript).

    bootstrap_sequence:
      - step: 1
        action: "GET /api/contract"
        result: "Full system map — services, routes, ports, schemas"
      - step: 2
        action: "GET /api/components"
        result: "Component index — all available commands"
      - step: 3
        action: "GET /api/components/grammar"
        result: "Grammar tree — CLI trie and alias map"
      - step: 4
        action: "POST /api/ui/register"
        result: "SessionId + stream endpoints"
      - step: 5
        action: "GET /events (SSE)"
        result: "Live event stream — updates grammar, state, health in real time"

    hotswap_test:
      description: >
        The test for whether the UI layer is truly hotswappable.
        Pass all three and the architecture is correct.
      tests:
        - "Delete nexus-shell.html. System continues operating via CLI."
        - "Replace nexus-shell.html with a completely different UI. All commands work."
        - "Open the new UI without restarting any service. It bootstraps correctly."

  # ── SYSTEM SPEC TEMPLATE ───────────────────────────────────────────────────
  # When writing a spec for a specific system, use this template.
  # Each section maps to a foundation layer.

  system_spec_template:

    meta:
      name:        "{system-name}"
      version:     "1.0.0"
      foundation:  "nexus-system-foundation@1.0.0"
      port:        "{port}"
      uuid:        "{uuid}"

    # L0 — what is immutable in this system
    core:
      schemas:    []   # data shapes this system owns
      axioms:     []   # which foundation axioms this system enforces
      constants:  {}   # magic numbers, thresholds

    # L1 — what events this system emits and handles
    events:
      emits:      []   # typed events this system produces
      handles:    []   # events from other systems this listens for

    # L2 — what commands this system exposes in the CLI
    # (derived from components[] — just write the components)
    cli:
      note: "CLI grammar is derived from components[]. No separate spec needed."

    # L3 — HTTP routes
    routes:
      internal:   []   # routes other systems call
      external:   []   # routes CLI/UI/humans call

    # L4 — what this system declares when it registers
    handshake:
      components: []   # Component[] — these become CLI commands

    # L5 — UI description (usually just a reference)
    ui:
      type:       "panel in nexus-shell"
      hotswap:    true

    # Modules — bottom-up build order
    modules: []

    # Tests
    tests: []

