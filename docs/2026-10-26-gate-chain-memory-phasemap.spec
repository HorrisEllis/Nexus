# The gate chain: every gate a timestamped node, linked to the one before — the chain IS the persistent memory
# His analogy: like Ethereum — an append-only chain of nodes, each a step, each timestamped, each linked to the prior; the
# chain keeps the context, it is the persistent memory. Not crypto/consensus — the STRUCTURE (event-sourced, hash-linked,
# replayable). Every door writes to the one chain: the build pipeline's gates, copilot's steps, the CLI's commands, a drone's
# steps. So "what happened / the context" is the chain, replayed.
# MAPPED 2026-10-26 before code (rule 1). REUSE, not a new store (rule 2): lib/node-export.js already gives a timestamped,
# fingerprinted node envelope; lib/ledger-writer.js already appends; lib/gate-context.js is the gate. The ONE new thing is the
# LINK — each node carries `prev` (the id/fingerprint of the node before it) — which turns the append-only log into a chain
# that is tamper-evident and replayable. Order of delivery (his): backend → gates persist → copilot/CLI emit → route+command → UI.

origin:
  date: 2026-10-26
  james: >-
    "The same gates for Ethereum, the event-driven gates, I want for a copilot, like the CLI. Like each step, I want to be the
    persistence. Right, timestamp. Each gate to be a node. Even. That's what Ethereum is. The gates keep the context. It's the
    persistent memory."
  context: >-
    After AE1 (the engine made sovereign) and the agent-drones map. The gate chain is the persistence layer UNDER all of it: a
    drone's steps, a build's gates, a copilot turn, a CLI command — each is a gate, each becomes a timestamped node on the one
    chain, so the system has one replayable memory of everything it did, read the same way by a person, copilot and an agent.
  reading_to_confirm: >-
    The coder's reading: the STRUCTURE of a chain (append-only, each node links the prior by its fingerprint, timestamped,
    replayable) as local persistent memory — NOT a distributed blockchain with consensus/mining/tokens. If he means more
    (e.g. a shared chain across machines), that is a later addendum; this builds the local persistent chain first.
  reuse_2026_10_26: >-
    lib/node-export.js (the node envelope: uuid, type, context, exported_at, firstSeenAt, lastSeenAt, fingerprint), lib/ledger-
    writer.js (append), lib/ledger-tail.js (read), lib/gate-context.js (the gate's context), lib/node-schemas (the schema).

decisions:
  GC_D1_gate_is_a_linked_node:
    status: DECIDED 2026-10-26 by James — "Each gate to be a node … timestamp … It's the persistent memory."
    chosen: >-
      A gate is persisted as a node (schema.gate_node, a node-export envelope) carrying: ts, gate (name), by (pipeline | copilot
      | cli | drone), scope (repo/run/session), context (what it carried), result (pass | fail | decision + why), and `prev`
      (the id+fingerprint of the previous node in its chain). The nodes form an append-only, hash-linked chain; the chain,
      replayed, IS the context/persistent memory. One chain per scope (so a repo's / a run's / a session's memory is its own
      chain), all in one store.
  GC_D2_home:
    status: DECIDED by his axioms (used by ≥2 systems → the kernel) — to confirm
    chosen: >-
      lib/gate-chain.js (core) + lib/node-schemas/schema.gate_node. The pipeline, copilot, the CLI, drones and the UI all
      write/read it, so it is the kernel's — reached by every system without a crossing.

phases:
  GC1_the_chain:
    status: OPEN
    layer: library
    depends_on: []
    files: [lib/gate-chain.js, lib/node-schemas/schema.gate_node]
    does: >-
      lib/gate-chain.js: append({scope, gate, by, context, result}) builds a gate-node (node-export envelope), sets ts and
      `prev` to the chain head's id+fingerprint for that scope, fingerprints the node (its own hash over its content + prev, so
      the link is tamper-evident), writes it (ledger-writer), and returns the node. head(scope) gives the latest; read(scope,
      {limit}) gives the chain newest-first; replay(scope) folds the chain into the accumulated context (the persistent memory).
      verify(scope) walks the chain and reports any broken link (§1.2, a gap named not hidden). Dependency-injected (the writer
      and clock injectable) so it runs in a test with no backend; append never throws — a write that fails is recorded and the
      head is unchanged.
    proof: "test-gate-chain.test.js: append links each node to the prior (prev = prior id+fingerprint); replay reconstructs the context in order; verify catches a tampered/missing link; two scopes keep separate chains; a failed write is named, head unchanged — all injected, no backend"

  GC2_gates_persist:
    status: OPEN
    layer: integration
    depends_on: [GC1_the_chain]
    files: [lib/gate-context.js]
    does: >-
      The existing gate points write a gate-node on each gate: lib/gate-context.js note()/handled() append to the chain for the
      brick's scope (the pipeline's gates become the chain, by:'pipeline'). No second path — the gate already has the context;
      it now persists it as a linked node. Backward compatible: the gate's current return is unchanged, the append is additive.
    proof: "a pipeline gate run appends a node to its repo/run scope; the chain replays the build's gates in order; existing gate tests stay green"

  GC3_copilot_and_cli_emit:
    status: OPEN
    layer: integration
    depends_on: [GC1_the_chain]
    files: [copilot/tool-runtime.js, idearium/cli/route-commands.js]
    does: >-
      The two human doors become emitters (his "for a copilot, like the CLI"): each copilot step (a tool call / a reply) and
      each CLI command append a gate-node to the session's chain (by:'copilot' / by:'cli'), so a turn or a command session has
      a replayable memory. The chain is what copilot reads back as its own persistent context, the same memory a build has.
    proof: "a copilot step and a CLI command each append a node to the session chain; replay gives the session's context; in the copilot + cli tests"

  GC4_route_and_command:
    status: OPEN
    layer: integration
    depends_on: [GC2_gates_persist, GC3_copilot_and_cli_emit]
    files: [idearium/api/index.js, idearium/cli/route-commands.js]
    does: >-
      Read the memory through the one door and the one table: GET /api/gate-chain?scope= (the chain, or replay=1 for the folded
      context), GET /api/gate-chain/verify?scope= (the links hold). Command `gates <scope> [--replay] [--verify]`. So a person,
      copilot and an agent all read the persistent memory the same way.
    proof: "the route returns a scope's chain and its replay; verify reports link health; the command prints it; route contracts + cli tests pass"

  GC5_the_chain_ui:
    status: OPEN
    layer: ui
    depends_on: [GC4_route_and_command]
    files: [idearium/ui/js/gate-chain-panel.js]
    does: >-
      The human view (easy to understand): the chain as a timeline — each gate a node, in time order, with its timestamp, what
      it did (gate, pass/fail/decision), who (pipeline/copilot/cli/drone), and the context it carried; a broken link is shown,
      not hidden. The persistent memory, visible and replayable. Home: the Code tab / BrainOS canvas. Tested in Clear Glass
      (glass.js), never Playwright (AXIOMS §4.1, CG-001b).
    proof: "the panel driven in Clear Glass shows a scope's chain as a timeline with timestamps and who; a tampered link is flagged; no Playwright"

order: >-
  GC1 (the chain core, DI) first — the append-only, prev-linked, timestamped node chain + replay/verify, reusing node-export +
  ledger-writer. Then GC2 (the pipeline's gates persist as nodes), GC3 (copilot + the CLI emit their steps as nodes — his two
  doors), GC4 (read/replay the memory through the route + command), GC5 (the human timeline view). The chain is CORE so every
  system writes and reads one memory with no crossing. Drones (the agent-drones map) emit gate-nodes too — a drone's steps are
  gates on the chain — but that is a consumer, not a dependency. Each phase specced again as .phase + .graph (his 2026-10-20);
  DG2 (0.60.250) foresees any crossing. Nothing built before this map.
