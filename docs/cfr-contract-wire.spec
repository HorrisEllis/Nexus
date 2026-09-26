spec:
  meta:
    name:        cfr-contract-wire
    version:     1.0.0
    uuid:        nexus-cfr-contract-wire-v1-0000-2026-0627-jamesbrooks-001
    status:      active
    author:      James Brooks
    purpose: >
      CFR tracks contracts through wires, hook to hook.
      Every event in the ledger knows:
        - which component emitted it          (componentId)
        - which hook it came from             (hookId)
        - which contract governs the intent   (contractId)
        - what the intent was                 (intent)
        - which agent handled it              (agent)
        - which system it came from           (source)
        - which component it went to          (toComponentId)
        - which hook it landed on             (toHookId)
        - what tags describe it               (tags[])
        - progress through the contract       (progress: dispatched|running|complete|failed)

      This makes CFR the relational field.
      Every node is a component. Every edge is a wire.
      The contract is the declared shape of what should happen.
      CFR measures what actually happens against the contract.
      Deviation = gap. Gap = open loop. Open loop = signal to RAID.

  axioms:
    - §CFR-1  Every ledger entry carries the full wire context (component, hook, contract)
    - §CFR-2  Wire traversal is recorded before the event is processed (§LAW II)
    - §CFR-3  Contract deviation opens a CONFLICT or CAUSAL gap immediately
    - §CFR-4  The causal graph is the live map of all wires in the field
    - §CFR-5  Agent is recorded on every entry — RAID reads this for outcome learning
    - §CFR-6  Progress is append-only — dispatched → running → complete|failed, never backward

  wire_context:
    # Added to every CFR ledger entry — on top of existing fields
    fields:
      componentId:    string   # e.g. "guardian.copilot"  — who emitted this
      hookId:         string   # e.g. "guardian.copilot.reply" — which hook
      contractId:     string   # e.g. "nexus-interaction-contract-v1" — governing contract
      intent:         string   # e.g. "build" "diagnose" "ask" — classified intent
      agent:          string   # e.g. "ollama" "claude" "chatgpt" — who handled it
      toComponentId:  string   # e.g. "cortex.raid" — who received it (null if terminal)
      toHookId:       string   # e.g. "cortex.raid.receive" — receiving hook
      tags:           string[] # e.g. ["copilot", "user-intent", "forge-cluster"]
      progress:       enum     # dispatched | running | complete | failed | rolled_back
      sessionId:      string   # groups all events in one user session
      requestId:      string   # groups all events in one request lifecycle
      compartmentId:  string   # which compartment contained this execution

  how_it_flows:
    # Intent arrives at co-pilot
    1_arrives:
      componentId:    "guardian.copilot"
      hookId:         "guardian.copilot.receive"
      contractId:     "nexus-interaction-contract-v1::guardian.routes./copilot/prompt"
      intent:         "build"          # classified by RAID
      agent:          null             # not yet assigned
      toComponentId:  "cortex.raid"
      toHookId:       "cortex.raid.decide"
      tags:           ["copilot", "user-intent"]
      progress:       "dispatched"

    # RAID decides
    2_raid_decides:
      componentId:    "cortex.raid"
      hookId:         "cortex.raid.decide"
      contractId:     "nexus-interaction-contract-v1::cortex.routes./api/raid/decide"
      intent:         "build"
      agent:          "ollama"         # RAID's decision
      toComponentId:  "guardian.copilot"
      toHookId:       "guardian.copilot.dispatch"
      tags:           ["raid", "routing", "forge-cluster"]
      progress:       "running"

    # Dispatched to agent
    3_dispatched:
      componentId:    "guardian.copilot"
      hookId:         "guardian.copilot.dispatch"
      intent:         "build"
      agent:          "ollama"
      toComponentId:  "emerge.compiler"   # if build intent routes here
      toHookId:       "emerge.compiler.receive"
      tags:           ["copilot", "ollama", "t2-gate"]
      progress:       "running"

    # Complete — outcome recorded
    4_complete:
      componentId:    "emerge.compiler"
      hookId:         "emerge.compiler.complete"
      intent:         "build"
      agent:          "ollama"
      toComponentId:  "cortex.raid"       # feedback loop
      toHookId:       "cortex.raid.feedback"
      tags:           ["compiler", "t2-complete"]
      progress:       "complete"

    # Feedback updates RAID weights
    5_feedback:
      componentId:    "cortex.raid"
      hookId:         "cortex.raid.feedback"
      intent:         "build"
      agent:          "ollama"
      toComponentId:  null               # terminal
      toHookId:       null
      tags:           ["raid", "weight-update", "outcome-learning"]
      progress:       "complete"

  cfr_queries_this_enables:
    # All previously impossible, now trivial
    - "show me every request that touched guardian.copilot in the last hour"
    - "what agent handled this requestId end to end"
    - "which component is causing the most failed progress states"
    - "which wire (hookId → toHookId) has the highest sigma"
    - "what was the intent for this causal chain"
    - "which contracts are being violated (expected vs actual progress)"
    - "show me all events in compartment X"
    - "what did RAID decide for this session and what was the outcome"

  what_changes_in_code:

    lib/cfr/ledger.js:
      record(type, payload, opts):
        opts gains:
          componentId     # caller passes this
          hookId          # caller passes this
          contractId      # looked up from component-registry by componentId
          intent          # from RAID classification, passed through
          agent           # which agent was assigned
          toComponentId   # next hop component
          toHookId        # next hop hook
          tags            # array of string labels
          progress        # dispatched | running | complete | failed | rolled_back
          requestId       # same across all hops of one request
          compartmentId   # which compartment

        These fields are written into the ledger entry unchanged.
        CausalGraph.ingest() already builds edges from causedBy — now
        also builds edges from (hookId → toHookId) pairs. Wire edges.

        SIGMA still computed the same way.
        But now also computed per (componentId × hookId) pair.
        A wire can have its own sigma. The field can see which wire is failing.

    lib/cfr/graph.js:
      CausalGraph.ingest(entry):
        add wire edge:
          if entry.hookId and entry.toHookId:
            edges.push({
              from:   entry.hookId,
              to:     entry.toHookId,
              type:   'wire',
              weight: 1.0,
              contractId: entry.contractId,
              agent:  entry.agent,
              intent: entry.intent,
            })

        existing edges (causedBy, sessionId, jobId, temporal) unchanged.
        Wire edges are the declared topology.
        Causal edges are what actually happened.
        CFR watches the diff between them.

    lib/component-registry.js:
      register(component):
        component.hooks[] — each hook now has:
          id:          string   # e.g. "guardian.copilot.receive"
          direction:   'in' | 'out' | 'bidirectional'
          intent:      string[] # which intents this hook handles
          contract:    string   # which contractId governs it
          tags:        string[]
          wires_to:    string[] # declared next-hop hookIds

        When registered, every hook is ingested into CFR as a node.
        Every declared wires_to becomes an edge in the causal graph.
        The graph reflects the declared architecture before any event fires.
        Events confirm or deviate from the declared topology.

    guardian/agents/co-pilot/index.js:
      Every _cortexInsert('chat_log', row) and _logEvent() call
      gains the wire context fields.
      requestId generated at prompt entry, propagated through all hops.
      compartmentId = current compartment UUID.

    cortex/core/raid/index.js:
      _decide() returns agent + reason + cluster (already does this).
      Now also returns: componentId to route to, hookId to call.
      Outcome recording gains: componentId, hookId, contractId, intent, agent.
      RAID weight table becomes: (cluster × componentId × hookId) not just (cluster × agent).

  what_stays_the_same:
    - sigma computation (unchanged)
    - delta computation (unchanged)
    - gap emission thresholds (unchanged)
    - JSONL append-only (unchanged)
    - §LAW II write-before-emit (unchanged)
    - causal edges from causedBy/sessionId/jobId (unchanged — additive only)
    - CFR HTTP routes (additive — new query params for componentId, hookId)

  build_order:
    1. Add wire context fields to lib/cfr/ledger.js record()
    2. Add wire edges to lib/cfr/graph.js ingest()
    3. Add hooks[] with wires_to[] to component registry schema
    4. Build registry-components.js for each system (guardian, cortex, emerge, architect, bridge)
    5. On component.registered → ingest hooks as CFR nodes, wires_to as CFR edges
    6. Propagate requestId + compartmentId + componentId through co-pilot → RAID → dispatch → outcome
    7. Update RAID weight key from (cluster × agent) to (cluster × componentId)
    8. CFR /api/graph now returns wire edges + causal edges + sigma per wire

  the_relational_field:
    Declared topology (from registry):
      guardian.copilot.receive → cortex.raid.decide
      cortex.raid.decide → guardian.copilot.dispatch
      guardian.copilot.dispatch → emerge.compiler.receive
      emerge.compiler.complete → cortex.raid.feedback
      cortex.raid.feedback → cortex.cfr.record

    Live topology (from ledger):
      same as above when everything works
      deviations = gaps
      "guardian.copilot.dispatch → chatgpt (not ollama)" = RAID weight shift
      "emerge.compiler.receive → timeout" = compartment failure → rollback
      "cortex.raid.feedback missing" = causal gap → open loop

    The UI causal graph renders both layers.
    Declared = the skeleton.
    Live = what's actually happening.
    Sigma colors the wires.
    High sigma wire = something is wrong between those two components.
    RAID avoids routing through high-sigma wires.
