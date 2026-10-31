# docs/2026-10-31-causal-interconnect-phasemap.spec — Intelligence, RFR2 and CFR as one causal system
# His direction; the census, the reading and the cut are the coder's. Spec: intelligence/spec/causal-interconnect.spec.

origin: >-
  James, 2026-10-31: "also the intelligence system, rfr2 and cfr need to be interconnected."

status: "MAPPED 2026-10-31. Nothing built."

census: >-
  All three live in intelligence/. Require edges: Intelligence → CFR 7, CFR → Intelligence 1, Intelligence → RFR2 4, RFR2 ↔ CFR 0. Three causal
  graphs (CFR's CausalGraph, RFR2's lazily fed kernel, relational-field), none linked; three sigmas, each a different measure.

decisions:
  CI_D0_interconnected:
    chosen: "Intelligence, RFR2 and CFR are one causal system"
    by: "his, 2026-10-31 (origin)"
  CI_D1_one_graph_cfr_builds_rfr2_reads:
    chosen: >-
      TO CONFIRM (the coder's reading of "interconnected"): CFR builds the causal graph from the ledger; RFR2 reads and measures that graph
      (its kernel fed by CFR's edges, started with Intelligence); relational-field's chains walk it; the sigmas are chained but kept as
      their own measures; Intelligence's batched learning loop learns from RFR2's bottlenecks and CFR's chains.
    by: "the coder, by §10.3 (one causal graph, not three), §8.6 (every piece exists: the bridge is the only new file), and ML_D1 (cheap per edge, batched learning)"

phases:
  CI1_one_feed:
    status: OPEN
    depends_on: [CI_D0_interconnected, CI_D1_one_graph_cfr_builds_rfr2_reads]
    files: [intelligence/causal-bridge.js, intelligence/cfr/ledger.js, intelligence/routes.js, intelligence/server.js, tests/modules/test-causal-bridge.test.js, tests/modules/run-all.js]
    spec: intelligence/spec/causal-interconnect.spec
    blocks: [MOD-CI-FEED]
    does: "CFR's ledger entries, with their derived edges, into RFR2's kernel; the kernel started with Intelligence; the routes read the one kernel"
    proof: "RFR2's trace reaches CFR's root over causal/cfr edges; a throwing kernel never fails a ledger write"
  CI2_one_graph_for_queries_and_chains:
    status: OPEN
    depends_on: [CI1_one_feed]
    files: [intelligence/routes.js, intelligence/relational-field.js, cortex/self-heal/failure-mode-forensics.js, tests/modules/test-causal-bridge.test.js]
    spec: intelligence/spec/causal-interconnect.spec
    blocks: [MOD-CI-QUERY]
    does: "CQL and traces over the bridged kernel; relational-field's chains on the same graph"
    proof: "forensics' chain and a CQL chain agree on a fixture"
  CI3_the_measures_chained:
    status: OPEN
    depends_on: [CI1_one_feed]
    files: [intelligence/causal-measures.js, intelligence/baseline.js, intelligence/cfr/field.js, tests/modules/test-causal-measures.test.js]
    spec: intelligence/spec/causal-interconnect.spec
    blocks: [MOD-CI-MEASURES]
    does: "CFR sigma → RFR2 delta stream → regime and bottlenecks → CFR field and baseline; a .benchmark candidate past sigma"
    proof: "a slow burst gives a bottleneck and a regime, one intelligence.regime event"
  CI4_learning_from_both:
    status: OPEN
    depends_on: [CI3_the_measures_chained, CI2_one_graph_for_queries_and_chains, ML_D1_per_edge_metric_batched_learning, ML3_learning_loop]
    files: [intelligence/mastermind.js, tests/modules/test-causal-learning.test.js]
    spec: intelligence/spec/causal-interconnect.spec
    blocks: [MOD-CI-LEARN]
    does: "a recurring bottleneck or anomaly with one causal root becomes a pattern proposal through the gate, its chain as evidence"
    proof: "three bottlenecks with one root yield one proposal citing the chain"
  CI5_seen_and_asked:
    status: OPEN
    depends_on: [CI1_one_feed, CI3_the_measures_chained]
    files: [intelligence/registry-components.js, intelligence/routes.js, idearium/cli/route-commands.js, intelligence/ui]
    spec: intelligence/spec/causal-interconnect.spec
    blocks: [MOD-CI-SURFACE]
    does: "status and regime routes, two command rows, the view"
    proof: "`intelligence causal` shows shared events after a fixture run"

order: "CI1 → (CI2, CI3) → CI5; CI4 after ML3 (the batched learning loop) is built."
