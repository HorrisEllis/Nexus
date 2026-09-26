spec:

  # ════════════════════════════════════════════════════════════════════════════
  # component-registry.spec
  # NEXUS Component Registry — the self-describing kernel
  #
  # The registry is the source of truth for every capability in NEXUS.
  # CLI, shell, userscripts, and external UIs are consumers of the registry.
  # They do not own grammar, routes, or schemas.
  # The registry does.
  #
  # Architecture authority chain:
  #   Registry  ← source of truth
  #     ↑ CLI       ← consumer, exposes registry operations
  #       ↑ Shell   ← consumer, renders registry state
  #
  # §1.1  Nothing trusted until proven — every component validated on register
  # §1.2  Nothing silently fails — registry errors are events, not swallowed
  # §2.1  Persistence is the golden rule — JAA write before in-memory index
  # §5.1  Every component carries UUID + hook contract
  # ════════════════════════════════════════════════════════════════════════════

  meta:
    name:        component-registry
    version:     1.0.0
    author:      james-brooks
    created_at:  2026-06-15T00:00:00Z
    status:      active
    uuid:        nexus-component-registry-v1-0000-2026-0615-jamesbrooks-001
    purpose: >
      The Component Registry makes NEXUS self-describing.
      Every capability — route, command, hook, event — is a Component.
      Components are registered, persisted, indexed, and discoverable.
      Any UI that reads the registry can render the full system.
      Any CLI that reads the registry can build its grammar.
      No UI or CLI hardcodes routes, commands, or schemas.
    tagline: "Register once. Discover everywhere."
    target_runtime: [node]
    language_stack: [javascript]
    paradigm: [SISO, event-driven, registry-first, contract-driven]
    output_path: lib/component-registry.js
    deps:
      - name: cortex/memory/jaa-db
        version: ">=6.0.0"
        required: true
        purpose: persistent storage for components table
      - name: nexus-bus
        version: ">=1.0.0"
        required: false
        purpose: emit registry events to connected UIs

    constraints:
      - id: CR-001
        description: >
          JAA write happens before in-memory index update. §2.1.
          If JAA write fails, the component is not indexed.
        type: hard
        enforced_by: [GATE-REG-001]

      - id: CR-002
        description: >
          Re-registering an existing id is an update, not a duplicate.
          Idempotent. Same id = same component, merged.
        type: hard
        enforced_by: [GATE-REG-002]

      - id: CR-003
        description: >
          Deletion is soft-only by default.
          deprecated:true + deprecatedBy set. Hard delete requires explicit flag.
        type: hard
        enforced_by: [GATE-REG-003]

      - id: CR-004
        description: >
          Component id format: namespace.name — dot-separated, lowercase, no spaces.
          namespace = owning system. name = capability within namespace.
        type: hard
        enforced_by: [GATE-SCHEMA-001]

      - id: CR-005
        description: >
          Every registration emits component.registered on the SSE bus.
          Every update emits component.updated.
          Every deprecation emits component.deprecated.
          Connected UIs rebuild grammar in real time from these events.
        type: hard
        enforced_by: [GATE-REG-004]

      - id: CR-006
        description: >
          Grammar is owned by the registry, not the CLI.
          The CLI reads /api/components/grammar and builds its trie from it.
          The CLI does not write grammar. Only POST /api/components/register does.
        type: hard
        enforced_by: [GATE-GRAMMAR-001]

      - id: CR-007
        description: >
          System registration (/api/register) accepts a components[] array.
          On system boot, components auto-register with registeredBy = systemId.
          On system offline, components marked unavailable:true (not deleted).
          On system reconnect, components marked unavailable:false.
        type: hard
        enforced_by: [GATE-REG-005]

  schemas:

    - id: SCHEMA-COMPONENT
      name: Component
      description: The unit of the registry. Every capability is a Component.
      fields:
        # Identity
        - name: id
          type: string
          required: true
          description: "Globally unique. Format: namespace.name. e.g. cortex.gaps.list"
        - name: namespace
          type: string
          required: true
          description: "Owning system. e.g. cortex, forge, liminal, guardian"
        - name: name
          type: string
          required: true
          description: "Capability within namespace. e.g. gaps.list"
        - name: version
          type: string
          required: true
          description: "Semver. Bumped on schema change."

        # Grammar — how CLI resolves this component
        - name: grammar
          type: string[]
          required: true
          min_length: 1
          description: >
            CLI command strings that resolve to this component.
            First entry is canonical. Rest are aliases.
            e.g. ["cortex gaps list", "list gaps", "gaps"]

        # Route — what the component actually calls
        - name: route
          type: object
          required: true
          fields:
            - name: method
              type: enum
              values: [GET, POST, PUT, DELETE, PATCH]
              required: true
            - name: path
              type: string
              required: true
              description: "Path on the orchestrator's proxy surface. e.g. /api/cortex/gaps"
            - name: proxy
              type: string
              required: false
              description: "Which system handles this. e.g. cortex, guardian, forge"

        # Parameters
        - name: params
          type: object[]
          required: false
          default: []
          item_fields:
            - name: name
              type: string
              required: true
            - name: type
              type: enum
              values: [string, number, boolean, enum, json]
              required: true
            - name: values
              type: string[]
              required: false
              description: "For type:enum only"
            - name: default
              type: any
              required: false
            - name: required
              type: boolean
              default: false
            - name: cli
              type: string
              required: false
              description: "CLI flag. e.g. --status"
            - name: description
              type: string
              required: false

        # Return shape — for shell rendering
        - name: returns
          type: object
          required: false
          fields:
            - name: type
              type: enum
              values: [object, array, string, void]
              required: false
            - name: schema
              type: string
              required: false
              description: "Schema name from /api/contract"
            - name: render
              type: enum
              values: [table, json, text, panel, none]
              required: false
              default: json

        # Events
        - name: events
          type: object
          required: false
          fields:
            - name: emits
              type: string[]
              default: []
            - name: listensTo
              type: string[]
              default: []

        # Hooks — other components triggered on completion
        - name: hooks
          type: object[]
          required: false
          default: []
          item_fields:
            - name: on
              type: enum
              values: [success, failure, always]
              required: true
            - name: trigger
              type: string
              required: true
              description: "Component id to trigger"

        # Access control
        - name: permissions
          type: string[]
          required: false
          default: [system]
          description: "Who can call this. e.g. system, admin, user"

        # Discovery
        - name: tags
          type: string[]
          required: false
          default: []
        - name: description
          type: string
          required: true
        - name: examples
          type: string[]
          required: false
          default: []

        # Lifecycle
        - name: registeredBy
          type: string
          required: false
          description: "systemId that registered this component"
        - name: registeredAt
          type: number
          required: false
          description: "Unix timestamp"
        - name: updatedAt
          type: number
          required: false
        - name: available
          type: boolean
          default: true
          description: "false when owning system is offline"
        - name: deprecated
          type: boolean
          default: false
        - name: deprecatedBy
          type: string
          required: false
          description: "id of replacement component"

    - id: SCHEMA-GRAMMAR-TREE
      name: GrammarTree
      description: >
        The resolved grammar tree consumed by the CLI.
        Built from all active components in the registry.
      fields:
        - name: tree
          type: object
          description: >
            Nested namespace tree.
            tree[namespace][subcommand...] = { componentId, params }
        - name: aliases
          type: object
          description: "Flat map of alias string → component id"
        - name: generatedAt
          type: number
        - name: componentCount
          type: number

  modules:

    - id:    MOD-REGISTRY-STORE
      name:  registry-store
      uuid:  nexus-cr-store-v1-0000-0001
      description: >
        Persistent storage layer for the component registry.
        Wraps JAA table 'components'.
        In-memory Map<id, Component> is the hot index.
        JAA is the source of truth on restart.
        Write to JAA first (§2.1), then update index.
        Never update index without successful JAA write.
      exports:
        - "init(jaaDB) → void"
        - "register(component: Component) → { ok, component, created: boolean }"
        - "get(id: string) → Component | null"
        - "list(filter?: ComponentFilter) → Component[]"
        - "update(id: string, patch: Partial<Component>) → { ok, component }"
        - "deprecate(id: string, replacedBy?: string) → { ok }"
        - "hardDelete(id: string) → { ok }"
        - "markAvailable(systemId: string, available: boolean) → { count }"
        - "buildGrammarTree() → GrammarTree"
        - "search(q: string) → Component[]"
      gate_pipeline:
        - "GATE-REG-001: component → validate(SCHEMA-COMPONENT) → reject if invalid"
        - "GATE-REG-002: component.id → jaaDB.query(components, id) → merge if exists"
        - "GATE-REG-003: jaaDB.insert/update(components, component) → §2.1"
        - "GATE-REG-004: update in-memory index → _index.set(id, component)"
        - "GATE-REG-005: emit registry.component.registered|updated on bus"
      behavioral_contracts:
        - "init() loads all non-deprecated components from JAA into _index on boot"
        - "register() is idempotent — same id merges, does not duplicate"
        - "markAvailable(systemId, false) sets available:false on all components where registeredBy===systemId"
        - "buildGrammarTree() derives tree from _index — never from JAA directly (hot path)"
        - "search() matches against id, description, grammar[], tags[]"
        - "hardDelete() only called when caller passes explicit confirmation token"
      error_paths:
        - "JAA write failure → { ok:false, error } — index NOT updated"
        - "schema validation failure → { ok:false, errors[] } — nothing written"
        - "id collision with different namespace → validation error, rejected"

    - id:    MOD-REGISTRY-SCHEMA
      name:  registry-schema
      uuid:  nexus-cr-schema-v1-0000-0001
      description: >
        Validates Component objects against SCHEMA-COMPONENT.
        Used by registry-store before every write.
        Also exposes the schema itself for external consumers.
        CR-004: enforces id format (namespace.name, lowercase, no spaces).
      exports:
        - "validate(component: unknown) → { ok, errors: string[] }"
        - "validateId(id: string) → { ok, error?: string }"
        - "coerce(raw: unknown) → Component"
        - "getSchema() → object"
      gate_pipeline:
        - "GATE-SCHEMA-001: id → /^[a-z][a-z0-9]*(\.[a-z][a-z0-9_]*)+$/ → reject if no match"
        - "GATE-SCHEMA-002: required fields present → id, namespace, name, version, grammar, route, description"
        - "GATE-SCHEMA-003: grammar.length >= 1 → reject if empty"
        - "GATE-SCHEMA-004: route.method → enum check"
        - "GATE-SCHEMA-005: params[].type → enum check per param"
        - "GATE-SCHEMA-006: coerce() fills defaults for optional fields"
      behavioral_contracts:
        - "validate() never throws — always returns { ok, errors[] }"
        - "coerce() is called before validate() in the register() flow"
        - "getSchema() returns the schema as a plain object — no code, no functions"
        - "All error messages are human-readable and specific about which field failed"
      error_paths:
        - "invalid id format → { ok:false, errors: ['id must match namespace.name format'] }"
        - "missing required field → { ok:false, errors: ['description is required'] }"
        - "unknown enum value → { ok:false, errors: ['route.method must be one of GET,POST,...'] }"

    - id:    MOD-REGISTRY-API
      name:  registry-api
      uuid:  nexus-cr-api-v1-0000-0001
      description: >
        HTTP API surface for the component registry.
        Mounted on the orchestrator.
        Six endpoints — all route through registry-store.
        Every mutation emits SSE event via nexus-bus.
      exports:
        - "mountRoutes(app: HttpApp, store: RegistryStore, bus: NexusBus) → void"
      gate_pipeline:
        - "GATE-API-001: GET /api/components → store.list(filter) → 200"
        - "GATE-API-002: GET /api/components/grammar → store.buildGrammarTree() → 200"
        - "GATE-API-003: GET /api/components/schema → store.getSchema() → 200"
        - "GATE-API-004: GET /api/components/:id → store.get(id) → 200 | 404"
        - "GATE-API-005: POST /api/components/register → store.register(body|body[]) → 201"
        - "GATE-API-006: PUT /api/components/:id → store.update(id, body) → 200 | 404"
        - "GATE-API-007: DELETE /api/components/:id → store.deprecate(id) → 200"
        - "GATE-API-008: DELETE /api/components/:id?hard=true → store.hardDelete(id) → 200"
      behavioral_contracts:
        - "GET /api/components supports ?namespace=, ?tag=, ?q= query params"
        - "POST /api/components/register accepts single Component OR Component[] array"
        - "Every successful mutation emits SSE event on /events stream"
        - "Grammar endpoint is the hot path — cached in memory, rebuilt on any mutation"
        - "All responses follow { ok, data, error? } shape"
        - "404 responses include the id that was not found"
      surfaces:
        - type: http
          path: /api/components
          method: GET
        - type: http
          path: /api/components/grammar
          method: GET
        - type: http
          path: /api/components/schema
          method: GET
        - type: http
          path: /api/components/:id
          method: GET
        - type: http
          path: /api/components/register
          method: POST
        - type: http
          path: /api/components/:id
          method: PUT
        - type: http
          path: /api/components/:id
          method: DELETE
      error_paths:
        - "POST with invalid schema → 400 { ok:false, errors[] }"
        - "GET /:id not found → 404 { ok:false, error:'component not found', id }"
        - "PUT /:id not found → 404"
        - "store write failure → 500 { ok:false, error }"

    - id:    MOD-REGISTRY-BOOT
      name:  registry-boot
      uuid:  nexus-cr-boot-v1-0000-0001
      description: >
        Wires the component registry into the orchestrator boot sequence.
        Adds 'components' table to JAA.
        Adds components[] to the /api/register payload shape.
        On system registration: auto-registers provided components.
        On system heartbeat failure: marks system components unavailable.
        On system reconnect: marks system components available.
        CR-007: the full auto-registration lifecycle.
      exports:
        - "bootPhase(seq: BootSequence, store: RegistryStore) → void"
        - "onSystemRegister(systemId: string, components: Component[], store: RegistryStore) → void"
        - "onSystemOffline(systemId: string, store: RegistryStore) → void"
        - "onSystemOnline(systemId: string, store: RegistryStore) → void"
      gate_pipeline:
        - "GATE-BOOT-001: seq.phase → init registry store → load JAA components into index"
        - "GATE-BOOT-002: /api/register handler → extract components[] from payload"
        - "GATE-BOOT-003: components[] → onSystemRegister() → store.register() each"
        - "GATE-BOOT-004: contract.unreachable event → onSystemOffline() → markAvailable(false)"
        - "GATE-BOOT-005: contract.verified event → onSystemOnline() → markAvailable(true)"
        - "GATE-BOOT-006: registry-store.init() called as SOFT boot phase"
      behavioral_contracts:
        - "Boot phase is SOFT — registry failure never blocks orchestrator boot"
        - "onSystemRegister sets registeredBy and registeredAt on each component"
        - "onSystemOffline does NOT delete — sets available:false only"
        - "Components registered before any system connects persist across restarts"
        - "First boot with empty JAA: index starts empty, fills as systems register"
      error_paths:
        - "JAA unavailable on boot → registry starts empty, logs warning, not fatal"
        - "System sends malformed components[] → each validated individually, bad ones logged and skipped"
        - "System sends duplicate ids from different namespace → schema rejection per CR-004"

    - id:    MOD-REGISTRY-GRAMMAR
      name:  registry-grammar
      uuid:  nexus-cr-grammar-v1-0000-0001
      description: >
        Builds and caches the grammar tree consumed by the CLI.
        Grammar is derived from the component index — never from the CLI.
        CR-006: the CLI reads this. The CLI does not write it.
        Rebuilt on any registry mutation (register, update, deprecate).
        Cache is invalidated by component.registered / component.updated events.
        The grammar tree is the contract between registry and CLI.
      exports:
        - "build(components: Component[]) → GrammarTree"
        - "getCached() → GrammarTree | null"
        - "invalidate() → void"
        - "toTrie(tree: GrammarTree) → TrieNode"
      gate_pipeline:
        - "GATE-GRAMMAR-001: components → filter available:true AND deprecated:false"
        - "GATE-GRAMMAR-002: per component → split grammar[0] on space → build tree path"
        - "GATE-GRAMMAR-003: per component → grammar[1..n] → add to aliases map"
        - "GATE-GRAMMAR-004: per component → params[] → attach to leaf node"
        - "GATE-GRAMMAR-005: tree + aliases → GrammarTree → cache"
        - "GATE-GRAMMAR-006: component.registered event → invalidate() → rebuild on next GET"
      behavioral_contracts:
        - "build() is deterministic — same component set always produces same tree"
        - "Unavailable components are excluded from grammar tree"
        - "Deprecated components are excluded from grammar tree"
        - "Aliases are flat — 'gaps' resolves to 'cortex.gaps.list' via aliases map"
        - "toTrie() converts GrammarTree to prefix trie for O(k) CLI lookup"
        - "getCached() returns null if invalidated — caller must call build()"
      error_paths:
        - "Component with invalid grammar string → logged, excluded from tree, not thrown"
        - "Grammar collision (two components same canonical string) → later registration wins, logged as warning"

  events:
    - id:   component.registered
      description: "Fired when a new component is registered for the first time"
      payload: "{ component: Component, systemId: string }"
      channel: registry

    - id:   component.updated
      description: "Fired when an existing component is updated"
      payload: "{ id: string, patch: object, component: Component }"
      channel: registry

    - id:   component.deprecated
      description: "Fired when a component is deprecated"
      payload: "{ id: string, deprecatedBy?: string }"
      channel: registry

    - id:   component.unavailable
      description: "Fired when a system goes offline and its components are marked unavailable"
      payload: "{ systemId: string, count: number, componentIds: string[] }"
      channel: registry

    - id:   component.available
      description: "Fired when a system comes back online"
      payload: "{ systemId: string, count: number }"
      channel: registry

    - id:   registry.grammar.rebuilt
      description: "Fired when the grammar tree is rebuilt after any mutation"
      payload: "{ componentCount: number, aliasCount: number, generatedAt: number }"
      channel: registry

  tests:
    - id: T-001
      description: "Register single component → GET /api/components returns it"
      tier: T0

    - id: T-002
      description: "Register component array → all appear in GET /api/components"
      tier: T0

    - id: T-003
      description: "Re-register same id → updates component, no duplicate in JAA"
      tier: T0

    - id: T-004
      description: "Register with missing required field → 400 with specific error"
      tier: T0

    - id: T-005
      description: "Register with invalid id format → 400 with CR-004 error"
      tier: T0

    - id: T-006
      description: "GET /api/components/grammar → correct tree shape, aliases populated"
      tier: T1

    - id: T-007
      description: "System boots with components[] → auto-registers, registeredBy set"
      tier: T1

    - id: T-008
      description: "System goes offline → components marked unavailable:true"
      tier: T1

    - id: T-009
      description: "System comes back → components marked unavailable:false"
      tier: T1

    - id: T-010
      description: "Deprecate component → still in GET response, deprecated:true"
      tier: T1

    - id: T-011
      description: "GET /api/components?tag=healing → only tagged components returned"
      tier: T0

    - id: T-012
      description: "GET /api/components?q=gaps → text search across id/description/grammar"
      tier: T0

    - id: T-013
      description: "Orchestrator restart → components reload from JAA into index"
      tier: T1

    - id: T-014
      description: "Registration emits component.registered on SSE stream"
      tier: T1

    - id: T-015
      description: "Grammar rebuild excludes unavailable and deprecated components"
      tier: T1

    - id: T-016
      description: "Architecture test: new system registers 4 components → grammar tree contains them, no shell code touched"
      tier: T2

# ════════════════════════════════════════════════════════════════════════════
# ADDENDUM 2026-07-30 — FORGE-CodeFactory alignment + tier/seam concepts
# (source: FORGE-CODEFACTORY Living Doc v0.15 + Sigma Similarity 2c)
#
# CodeFactory (formerly CODEX) introduces concepts the NEXUS registry should
# adopt WITHOUT creating a competing truth layer (§10.3). Recorded here so the
# registry stays the single source of truth and CodeFactory's Blueprint layer
# becomes a PRODUCER into it, not a second copy.
#
# TIER (new, from CodeFactory §2a) — structural, not self-declared:
#   tier: component  → smallest executable unit; runs standalone; no producer required.
#   tier: mod        → built on ≥1 component; INVALID to register with zero
#                      component-tier producers. Enforced at register, not documented.
#   The existing registry entry gains an optional `tier` field; a mod-tier entry
#   whose producers contain no component-tier entry is rejected (§1.1 validated on
#   register). This is the structural form of "a Mod can't exist without a Component".
#
# ONE-WRITE-AUTHORITY (CodeFactory §2a v0.13 correction, already NEXUS law):
#   edges (wires) are owned EXCLUSIVELY by the wire registry; a component entry
#   never stores wires_in/wires_out redundantly. Consumers/producers stay on the
#   component; wires are queried from the wire registry. Matches NEXUS's existing
#   one-write-authority invariant — no change needed, recorded for CodeFactory parity.
#
# SEAM (from CodeFactory §Layer 2a, adopted from seam-block.spec):
#   the deterministic boundary contract between two entries — richer than a wire.
#   { seam_uuid, boundary_name, side_a, side_b, acceptance_criterion, mock_ref,
#     contract_version, fault_codes[] }. NEXUS already has seam-component-registry.spec
#   + seam-block; CodeFactory uses a derivative (seam-block.codefactory.spec), same
#   relationship seam-block.nexus.spec has to canonical. No second seam schema.
#
# SIGMA — TWO DISTINCT MEASUREMENTS (CodeFactory 2c, important):
#   drift-sigma      → current state vs baseline (registry/topology change; §2a).
#                      This is what NEXUS RAID/CFR already compute.
#   similarity-sigma → artifact A vs artifact B (dedup, clustering, pattern
#                      discovery). NEW, MUST NOT share the drift-sigma scalar.
#   Six dimensions: structure, interface, behavior, dependency, semantic, usage.
#   Weighted per purpose (dedup vs promotion vs discovery — no universal weight).
#   Anti-generalization guard: high σ_structure + low σ_semantic → DO NOT MERGE
#   (shape similarity without intent similarity is rejected).
#   NOTE (§0.1): this maps onto NEXUS's OB10 sigma-role insight — sigma is one
#   score serving many roles; CodeFactory's drift-vs-similarity split is the same
#   principle (one computeSigma, interpreted by purpose), and OB10's per-component
#   sigma_intent is where a NEXUS component would declare which sigma it means.
#
# PROMOTION STATES (CodeFactory 2c) — observed → candidate → pattern → component
#   → module. Promotion requires EVIDENCE (occurrence count + seam validation +
#   behavioral evidence), not just similarity. A registry entry could carry a
#   promotion_state to track how a capability earned its place.
#
# ARCHITECT / ERAVOS CONSOLIDATION (§10.3 — flagged, NOT auto-resolved):
#   CodeFactory's Blueprint Index overlaps Architect's topology-declaration role.
#   Per §10.3 (one source of truth) the resolution is: loom stays the registry-
#   truth; Architect stays the topology declarer WITHIN loom; CodeFactory's
#   Blueprint layer is a PRODUCER into that truth, not a competing registry.
#   CodeFactory does NOT replace Architect or Eravos — it raises a consolidation
#   question resolved by making it read from loom, not own a second copy.
#   This is a DESIGN DECISION for James, recorded not enacted.
# ════════════════════════════════════════════════════════════════════════════
