spec:

  # ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
  # intelligence/spec/causal-interconnect.spec — Intelligence, RFR2 and CFR as one causal system: CFR builds the graph from the ledger,
  # RFR2 reads and measures that graph, Intelligence learns from both. Format: emerge's module spec (kg-builder, specDepth 1.0, no BLACK).
  # Phases: docs/2026-10-31-causal-interconnect-phasemap.spec.
  # ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════

  meta:
    name:        causal-interconnect
    version:     1.0.0
    author:      james-brooks
    created_at:  2026-10-31T00:00:00Z
    status:      specced
    uuid:        nexus-intelligence-causal-interconnect-spec-v1-0000-2026-1031-jamesbrooks-001
    origin: >-
      James, 2026-10-31: "also the intelligence system, rfr2 and cfr need to be interconnected." The direction is his; the census, the reading
      of "interconnected" (one causal graph CFR builds and RFR2 reads, the sigmas chained, Intelligence learning from both) and the module cut
      are the coder's, TO CONFIRM.
    purpose: >-
      One causal picture of Nexus instead of three. CFR derives causal edges from every ledger entry as it is written; the same event, with
      CFR's edges, enters RFR2's kernel, so RFR2's query language (CQL), traces, deltas, bottlenecks and regime classification run over the
      graph CFR built; relational-field's causal chains (what forensics and self-heal explain failures with) walk that same graph; the
      sigmas are chained (CFR's per-event sigma at write time → RFR2's delta stream → RFR2's regime → Intelligence's baseline and CFR's
      field), each still its own measure; Intelligence's learning loop takes RFR2's bottlenecks and anomalies as its input.
    target_runtime: [node]
    language_stack: [javascript]
    paradigm: [one-graph, reuse-before-build, observe-then-enforce, measures-kept-apart]
    axioms: ["§10.3 one truth (one causal graph)", "§8.6 reuse before build", "§1.2 nothing fails silently", "§0.1 evidence over memory", "§5.15 all three are Intelligence's"]
    deps: []

    census: >-
      Read 2026-10-31 on main 0.60.326. All three live in intelligence/ (56 core files, rfr2/ 18, cfr/ 7). Require edges: Intelligence → CFR 7,
      CFR → Intelligence 1, Intelligence → RFR2 4 (three in routes.js), RFR2 ↔ CFR 0. Three causal graphs: CFR's CausalGraph (cfr/graph.js,
      built by cfr/ledger.js from ledger entries), RFR2's kernel (rfr2/kernel, a 20,000-event ring fed from nexus-bus '*' only after the
      first RFR2 route is called, empty at every start), and relational-field (the real causal chains self-heal and forensics use; cortex/self-
      heal/failure-mode-forensics.js: RFR2's kernel "does NOT exist" for it). Three sigmas, different measures: cfr/sigma.js computeSigma
      (one event's deviation from its type's baseline, stored at write), rfr2/sigma classify (a trajectory's regime from a delta window,
      never stored), baseline.js sigma (rolling deviation for friction). rfr2/adapter maps only Clear Glass's old bridge events (pw:*, dom:*).

    constraints:
      - id: CI-001
        description: "One graph: RFR2 answers over the edges CFR derived; a second, unlinked causal graph is not kept."
        type: hard
        enforced_by: [GATE-CI-ONE-GRAPH]
      - id: CI-002
        description: "The measures stay apart: CFR's sigma, RFR2's regime and the baseline's deviation are each named for what they measure; one never stands in for another."
        type: hard
        enforced_by: [GATE-CI-MEASURES]
      - id: CI-003
        description: "The feed never slows a ledger write: RFR2 ingests after CFR's write returns, bounded, and a failure is counted and said, never thrown into the writer."
        type: hard
        enforced_by: [GATE-CI-NONBLOCKING]

  schemas:

    - id: CausalEvent
      name: CausalEvent
      description: "One event as both CFR and RFR2 hold it."
      fields:
        ledgerUuid:   "string — the CFR ledger entry's uuid"
        kernelId:     "string — RFR2's internal id for it"
        type:         "string"
        system:       "string"
        ts:           "number"
        causedBy:     "string[] — the ledger uuids CFR's edges name"
        edgeType:     "enum — causal/explicit | causal/cfr | causal/adapter"
        sigma:        "number 0..1 | null — CFR's computeSigma at write"
      behavioral_contracts: ["the id map is bounded like the kernel's ring"]
      error_paths: ["a causedBy outside the ring → kept as an external reference, said in the trace"]

    - id: RegimeReading
      name: RegimeReading
      description: "RFR2's regime for a window, with what fed it."
      fields:
        window:     "{ from: number, to: number, events: number }"
        regime:     "string — one of rfr2/sigma REGIMES"
        confidence: "number"
        dominantCause: "string — one of DOMINANT_CAUSES"
        sigmaMean:  "number — the mean CFR sigma over the window"
        bottlenecks: "[{ type, waitMs }] — rfr2/delta detectBottlenecks"
      behavioral_contracts: ["computed, recorded as an event; never written back into the events it read"]
      error_paths: ["too few events → regime 'insufficient', said"]

    - id: InterconnectStatus
      name: InterconnectStatus
      description: "Whether the three are joined, read for the screen and the command."
      fields:
        cfr:        "{ events: number, edges: number }"
        rfr2:       "{ events: number, edges: number, since: number, lagMs: number }"
        shared:     "number — events present in both"
        relational: "{ walksOnCfrGraph: bool }"
        dropped:    "number — events the feed could not ingest, with the last why"
      behavioral_contracts: ["read only"]
      error_paths: ["a part not started → its block says not started, never zeros"]

  interfaces:

    - id: IF-CFR
      name: cfr
      path: intelligence/cfr/index.js
      description: "CFR: the ledger that derives edges, the field, sigma, delta, the causal graph."
      exports: ["createCFRLedger", "createCFRField", "computeRegime", "computeSigma", "computeDelta", "CausalGraph"]
      behavioral_contracts: ["edges fall out of events already written"]
      error_paths: ["a malformed entry → skipped, counted"]

    - id: IF-RFR2-KERNEL
      name: rfr2-kernel
      path: intelligence/rfr2/kernel/index.js
      description: "RFR2's event kernel: ingest with causedBy and edgeType, a bounded ring."
      exports: ["createKernel({ ringCap }) → { ingest(type, payload, meta), … }", "gateOutput", "BUILTIN_GATES"]
      behavioral_contracts: ["gates never call ingest directly (A-2)"]
      error_paths: ["the ring full → oldest evicted"]

    - id: IF-RFR2-QUERY
      name: rfr2-query
      path: intelligence/rfr2/query/index.js
      description: "CQL: FIND events|edges|chains WHERE …"
      exports: ["parseQuery", "execQuery", "createQueryIndex", "query", "CQLSyntaxError"]
      behavioral_contracts: ["read only"]
      error_paths: ["a syntax error → CQLSyntaxError with the position"]

    - id: IF-RFR2-MEASURE
      name: rfr2-measure
      path: intelligence/rfr2/sigma/index.js
      description: "RFR2's regime classifier and delta tools (rfr2/delta: computeDeltaStream, detectBottlenecks, clusterByAnomaly)."
      exports: ["classify", "createSigmaEngine", "REGIMES", "DOMINANT_CAUSES", "computeDeltaStream", "detectBottlenecks"]
      behavioral_contracts: ["pure observers"]
      error_paths: ["an empty window → insufficient"]

    - id: IF-RELATIONAL
      name: relational-field
      path: intelligence/relational-field.js
      description: "The causal chains self-heal and forensics use today."
      exports: ["readFieldForFriction", "trackFrictionConditions"]
      behavioral_contracts: ["read only over what it is given"]
      error_paths: ["no chain → an empty chain, said"]

    - id: IF-BASELINE
      name: baseline
      path: intelligence/baseline.js
      description: "The rolling baseline and its deviation (friction)."
      exports: ["BaselineMonitor", "createBaseline", "sigma", "mean", "slope"]
      behavioral_contracts: ["a rolling window"]
      error_paths: ["too few points → no deviation, said"]

    - id: IF-INTEL-ROUTES
      name: intelligence-routes
      path: intelligence/routes.js
      description: "Intelligence's routes, including today's lazy RFR2 kernel (getRFR2Kernel, ensureRFR2Live) and /api/intelligence/rfr2/*."
      exports: ["the rfr2 stats, query, trace, descendants, children routes"]
      behavioral_contracts: ["the routes keep their paths and reply shapes"]
      error_paths: ["the kernel not live → the reply says so"]

  modules:

    - id: MOD-CI-FEED
      name: one-feed-cfr-to-rfr2
      uuid: nexus-intelligence-causal-feed-v1-0000-2026-1031-001
      path: intelligence/causal-bridge.js
      phase: CI1_one_feed
      description: >-
        The joint. When CFR's ledger writes an entry and derives its edges, the same event goes into RFR2's kernel with CFR's edges as its
        causedBy (edgeType causal/cfr), after the write returns, bounded. The kernel is started with Intelligence (server.js), not on the
        first RFR2 route call, and routes.js's getRFR2Kernel returns this one kernel (its own nexus-bus '*' feed becomes the fallback for
        events that never reach a ledger, marked causal/explicit).
      deps: [{ name: cfr }, { name: rfr2-kernel }, { name: intelligence-routes }]
      schema_refs: [CausalEvent, InterconnectStatus]
      exports: ["createCausalBridge({ ledger, kernel }) → { onEntry(entry, edges), status(), kernel }", "bridge.status() → InterconnectStatus"]
      gate_pipeline: ["GATE-CI1-001: the write returned first", "GATE-CI1-002: CFR's edges mapped to kernel ids", "GATE-CI1-003: a failure counted, never thrown"]
      behavioral_contracts: ["one kernel in the process; the routes read it", "the id map bounded like the ring"]
      error_paths: ["an edge to an event outside the ring → kept as an external reference"]
      acceptance: ["fixture: three ledger entries where CFR derives a → b → c; RFR2's trace from c reaches a with edgeType causal/cfr; a ledger write with the kernel throwing still returns"]

    - id: MOD-CI-QUERY
      name: query-over-cfr-graph
      uuid: nexus-intelligence-causal-query-v1-0000-2026-1031-001
      path: intelligence/routes.js
      phase: CI2_one_graph_for_queries_and_chains
      description: "CQL, trace, descendants and children answer over the bridged kernel (CFR's edges included); relational-field's causal chains for self-heal and forensics walk the same graph through the bridge, so 'why did this fail' and 'trace this event' read one graph."
      deps: [{ name: one-feed-cfr-to-rfr2 }, { name: rfr2-query }, { name: relational-field }]
      schema_refs: [CausalEvent]
      exports: ["the /api/intelligence/rfr2/* routes on the bridged kernel", "relational-field chain(eventId) via the bridge"]
      gate_pipeline: ["GATE-CI2-001: a route's reply shape unchanged", "GATE-CI2-002: forensics' chain and a CQL chain agree on a fixture"]
      behavioral_contracts: ["the routes keep their paths"]
      error_paths: ["the bridge not started → the old lazy kernel answers, the reply says which"]
      acceptance: ["on a fixture: FIND chains WHERE … returns the chain CFR derived; failure-mode-forensics' chain for the same failure is the same chain"]

    - id: MOD-CI-MEASURES
      name: the-sigmas-chained
      uuid: nexus-intelligence-causal-measures-v1-0000-2026-1031-001
      path: intelligence/causal-measures.js
      phase: CI3_the_measures_chained
      description: >-
        The three measures, each kept as itself, fed in order: CFR's per-event sigma (stored at write) and the events' deltas form RFR2's delta
        stream; RFR2 classifies the window's regime and finds its bottlenecks; the reading goes to CFR's field (computeRegime's evidence) and
        to the baseline as a recorded event, and a deviation past the baseline's sigma is a .benchmark candidate (architecture-spec RULE B).
      deps: [{ name: one-feed-cfr-to-rfr2 }, { name: rfr2-measure }, { name: baseline }, { name: cfr }]
      schema_refs: [RegimeReading, CausalEvent]
      exports: ["readRegime({ windowMs }) → RegimeReading", "emits intelligence.regime { regime, confidence, dominantCause, sigmaMean, bottlenecks }"]
      gate_pipeline: ["GATE-CI3-001: each measure named for what it is", "GATE-CI3-002: a reading is an event, never written into its inputs"]
      behavioral_contracts: ["on a cadence and on a sigma spike, never per event (cheap per edge, batched learning — ML_D1)"]
      error_paths: ["too few events → regime insufficient, said"]
      acceptance: ["fixture: a burst of slow events gives a bottleneck and a regime with its dominant cause; the reading is one intelligence.regime event"]

    - id: MOD-CI-LEARN
      name: learning-from-both
      uuid: nexus-intelligence-causal-learn-v1-0000-2026-1031-001
      path: intelligence/mastermind.js
      phase: CI4_learning_from_both
      description: "Intelligence's learning loop (the batched one, ML_D1) takes RFR2's bottlenecks and anomaly clusters and CFR's chains as its input: a recurring bottleneck or anomaly cluster with the same causal root becomes a pattern proposal through the gate (crystallization, EW_D4), with the chain as its evidence."
      deps: [{ name: the-sigmas-chained }, { name: query-over-cfr-graph }]
      schema_refs: [RegimeReading]
      exports: ["proposals with { pattern, chain, occurrences, regime }"]
      gate_pipeline: ["GATE-CI4-001: a proposal names its chain", "GATE-CI4-002: through the gate, never written as a pattern directly"]
      behavioral_contracts: ["a proposal, not a fact, until it passes its gate"]
      error_paths: ["no recurring root → nothing proposed, said in the loop's run"]
      acceptance: ["fixture: the same root behind three bottlenecks yields one proposal citing the chain"]

    - id: MOD-CI-SURFACE
      name: interconnect-surface
      uuid: nexus-intelligence-causal-surface-v1-0000-2026-1031-001
      path: intelligence/registry-components.js
      phase: CI5_seen_and_asked
      description: "Backend, route, command, screen: GET /api/intelligence/causal/status (InterconnectStatus) and /api/intelligence/causal/regime; rows `intelligence causal`, `intelligence regime`; the Intelligence view shows the three joined, the lag and what was dropped."
      deps: [{ name: one-feed-cfr-to-rfr2 }, { name: the-sigmas-chained }]
      schema_refs: [InterconnectStatus, RegimeReading]
      exports: ["two routes", "two command rows", "the view"]
      gate_pipeline: ["GATE-CI5-001: route before row before screen"]
      behavioral_contracts: ["agents get what a person gets"]
      error_paths: ["Intelligence down → the row says so"]
      acceptance: ["`intelligence causal` shows CFR and RFR2 counts with shared > 0 after a fixture run"]

  events:
    causal:
      - "intelligence.causal.dropped { count, why }"
      - "intelligence.regime { regime, confidence, dominantCause, sigmaMean, bottlenecks }"

  enforcement:
    gates:
      - { id: GATE-CI-ONE-GRAPH, name: one-graph, severity: error, check: "the RFR2 routes read the bridged kernel", on_failure: "the reply says which kernel answered" }
      - { id: GATE-CI-MEASURES, name: measures-apart, severity: error, check: "each reading names its measure", on_failure: "refused" }
      - { id: GATE-CI-NONBLOCKING, name: never-slows-a-write, severity: fatal, check: "a throwing kernel does not fail a ledger write", on_failure: "suite red" }

  tests:
    - "tests/modules/test-substrate-spec.test.js — this spec compiles at specDepth 1.0, no BLACK node"
    - "per module: its acceptance lines"
