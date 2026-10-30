# Metric points per compartment, model/agent usage, and an Intelligence learning loop over jobs (for Nexus and Emerge)
# James, 2026-10-30: "I want the systems compartment to have metric points of data for stats? for diagnostic data. also.
# model usage. agent usage. also running the intelligence system on jobs every edge? or batch them every 10 or so? to map
# the relation between code primitives for the graph to learn to code better. for emerge also."
#
# MAPPED 2026-10-30 before code (rule 1). REUSE, not new (rule 2): the pieces exist —
#   - cos/watchdog/proc-stats.js + cos/host/state-store.js + cos/nodes/status.js: a compartment's live process stats.
#   - lib/economy/ledger.js (+ gate.js): model usage / tokens / provider already recorded per job (the "model usage").
#   - intelligence/baseline.js + schema.sigma_record: baselines and the sigma deviation (the .benchmark trigger, 0.60.299 arch spec).
#   - intelligence/relational-field.js + intelligence/causal/: the relation graph and causal links (the "graph that learns").
#   - lib/code-intel/ (decls, structure, chunker, cards): the CODE PRIMITIVES (what a job's code is made of).
#   - lib/ledger-*.js + lib/activity-log/: the per-job record the metrics attach to.
# The ONE new thing is the LOOP that joins them: a metric point per job-edge → the compartment's stats; and an Intelligence
# relational pass over a BATCH of edges that maps code-primitive relations back into the graph.
#
# Sovereignty (§5.9/§5.15): a compartment's metrics are COS's (it owns the compartment); usage numbers are the economy's,
# read by COS through a route, never its files; the relational graph and the learning pass are Intelligence's; code-intel
# primitives are lib's. No system reaches into another's internals; each is read through its door.

decisions:
  ML_D1_per_edge_metric_batched_learning:
    status: DECIDED 2026-10-30 by the coder's reading of his axioms (answering his "every edge? or batch them every 10 or so?") — to confirm
    chosen: >-
      BOTH, at two tiers — this is what his own rules say (deterministic first, local by default, a reasoning agent only after
      a cheap check, "as little as possible", "count it"):
        1. EVERY EDGE (every job/event): a CHEAP, deterministic metric point is written — the job's outcome, duration, tokens,
           model, agent, cost, pass/fail, and the code primitives it touched (code-intel). No model is asked. This is the fine-
           grained diagnostic data, kept per compartment.
        2. A BATCH (every ~10 edges, OR sooner on a sigma deviation from baseline): the Intelligence relational pass runs ONCE
           over the batch, updating the relation graph between code primitives (relational-field + causal). One job's signal is
           noise; a window has enough to learn a real relation, and batching amortizes the expensive pass.
      So: collect on every edge (free), learn on a batch (paid, rarely). The batch also fires early when baseline.js flags a
      sigma deviation, so a real regression is learned from at once, not after 10. Why not per-edge learning: it would run the
      costly relational pass on single-point noise, against "as little as possible" and "deterministic first".
  ML_D2_same_loop_for_emerge:
    status: DECIDED 2026-10-30 by James — "for emerge also"
    chosen: >-
      Emerge's build events (each module the emerge build writes, from build-spec.js / the emerge checker) are edges on the
      same loop: a metric point per module built (pass/reject, the checker's verdict, the primitives), and the batched
      relational pass learns which emerge primitives relate — so the graph helps the emerge build code better too. Emerge is a
      separate repo, so it emits the edges through the metric door (a contract/route), never by importing Nexus; the reading of
      exactly how Emerge reports is to confirm (it may post to the metric endpoint, or write metric nodes the loop ingests).

phases:
  ML1_metric_point:
    status: OPEN
    layer: library
    depends_on: []
    files: [lib/node-schemas/schema.metric_point, cos/nodes/status.js]
    does: >-
      schema.metric_point: one cheap diagnostic data point — { ts, compartment/system, job id, kind, outcome (pass|fail),
      durationMs, model, agent, tokens, cost, primitives: [code-intel ids], sigma? }. A metric point is written per edge (job
      start/end) by the compartment, reusing proc-stats for the process numbers and the economy ledger for model/tokens/cost.
      Pure where possible so it is unit-tested without a running system.
    proof: "test-metric-point.test.js: a job edge produces a valid metric point with its model/agent/tokens/primitives; a point with no job id is refused (§1.2)"

  ML2_compartment_stats:
    status: OPEN
    layer: integration
    depends_on: [ML1_metric_point]
    files: [cos/host/state-store.js, cos/watchdog/proc-stats.js]
    does: >-
      Each compartment keeps its metric points as rolling stats (count, p50/p95 duration, pass rate, tokens, cost, per-model
      and per-agent breakdown) — the "metric points of data for stats" he asked for. Model usage and agent usage are two of the
      breakdowns, read from the economy ledger through its route (not its files). Exposed on the compartment's Diagnostics/Data
      tab (the cos-manager UI already lists those tabs, 0.60.298 MG spec).
    proof: "a compartment's stats show count/pass-rate/duration/tokens with per-model and per-agent breakdowns; model usage and agent usage are present; in the compartment's tests"

  ML3_learning_loop:
    status: OPEN
    layer: integration
    depends_on: [ML1_metric_point]
    files: [intelligence/relational-field.js, intelligence/baseline.js]
    does: >-
      The batched Intelligence pass (ML_D1): on every ~10 edges or on a sigma deviation (baseline.js), run the relational pass
      over the batch to map relations between the code primitives the jobs touched (which primitives co-occur in passes, which
      in failures), updating the relation graph (relational-field + causal). The graph is what "learns to code better" — a
      build can then read the graph to prefer primitive combinations that pass. Deterministic collection every edge; the pass
      is the only paid step, batched.
    proof: "test-learning-loop.test.js: 10 injected edges trigger one relational pass; a sigma edge triggers it early; the graph gains an edge between primitives that co-occur in passes; a single edge does NOT trigger the pass (cost control)"

  ML4_route_command_ui:
    status: OPEN
    layer: ui
    depends_on: [ML2_compartment_stats, ML3_learning_loop]
    files: [cos/manager/server.js, idearium/cli/route-commands.js]
    does: >-
      His order of delivery: a route + command to read a compartment's metrics and the learning graph, and the UI (the
      compartment Diagnostics/Data tab shows the stats; a graph view shows the learned primitive relations). Agents get it
      through the one command table.
    proof: "the route returns a compartment's stats + the learned relations; the command prints them; the Diagnostics tab shows them; in Clear Glass (glass.js), never Playwright"

  ML5_emerge_edges:
    status: OPEN
    layer: integration
    depends_on: [ML1_metric_point, ML3_learning_loop]
    files: [lib/node-schemas/schema.metric_point]
    does: >-
      Emerge reports its build edges through the metric door (ML_D2): each module the emerge build writes becomes a metric
      point (pass/reject, checker verdict, emerge primitives), fed into the same batched learning pass so the graph helps
      emerge build better. Emerge posts through a contract/route (sovereignty), never by importing Nexus. The exact reporting
      path is confirmed with him (post vs. metric nodes the loop ingests).
    proof: "an emerge build module produces a metric point via the door; the batch learns an emerge-primitive relation; no Nexus import in Emerge"

order: >-
  ML1 (the metric point — the cheap per-edge datum) first, reusing proc-stats + the economy ledger + code-intel. ML2 rolls them
  into per-compartment stats (model usage + agent usage are breakdowns). ML3 is the batched learning pass (every ~10 edges or a
  sigma event — ML_D1's answer to his per-edge-vs-batch question). ML4 the route+command+UI (the Diagnostics/Data tab). ML5
  folds Emerge's build edges in through the door. CAUTION: COS, Intelligence and the compartment system are where the parallel
  sessions are actively building (0.60.293–313); coordinate before code. Each phase specced again as .phase + .graph (his
  2026-10-20); DG2/DG3 check the DAG.
