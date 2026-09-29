spec:
  meta:
    name:     system-nodes
    version:  1.0.0
    date:     2026-09-27
    release:  0.39.271
    uuid:     nexus-lib-system-nodes-v1-0000-2026-0927-jamesbrooks-001
    file:     lib/system-nodes.js
    status:   built — proven by tests/modules/test-one-idearium-phases-nodes.test.js
    phasemap: docs/2026-09-27-one-idearium-phases-living-spec-nodes-phasemap.spec (X1-X3)
  purpose: >-
    Every system's commands and capabilities as physical nodes, regenerated from the tree, and Guardian's .hat/.agent
    nodes. Replaces the uncommitted 2026-09-12 export run the node folders came from.
  contract:
    systems: >-
      (root) -> [{ dir, registry, contract }] — every top-level directory holding registry-components.js or
      interaction-contract.json.
    declared: >-
      (dir) -> { from, port, components } — registry-components.js ({components}, a bare array, or {COMPONENTS}),
      else the interaction contract's routes.
    served: >-
      (dir) -> { from, commands } | null — what the system's dispatch answers, where an extractor reads it:
      guardian/lib/command-index-extract.js, ollama/lib/command-index.js, idearium/api/index.js ROUTES.
    plan: >-
      (dir) -> nodes — capability per declared component; command per DECLARED ∪ SERVED route, marked declared and
      served (null = no extractor); one system node with counts, declared-not-served and the sources read. One file
      per node (a shared id gets its route appended).
    agentPlan: () -> hat + agent node per forged hat (agent payload name, intent, commands, personality — schema.agent).
    sync: >-
      ({ root, only, dryRun, agents }) — writes through lib/node-export.js; unchanged payloads (fingerprint) are not
      rewritten; a generated node whose source is gone is moved to <sys>/data/nodes/_archive/<type>/; nodes other
      writers own are never touched. Runs at orchestrator boot (all systems) and guardian boot (guardian + hats/agents).
    index/list/get: read helpers behind GET /api/nodes, /api/nodes/:type, /api/nodes/:type/:id; cli/nodes.js.
