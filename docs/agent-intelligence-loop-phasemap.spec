spec:
  meta:
    name:        agent-intelligence-loop
    roadmap: folded into one-model-engine — AP4 is ME6 (one optimizer); AP2/AP3/AP5 later (declutter 2026-10-09, James: "okay")
    version:     0.1.0-phasemap
    status:      PHASEMAP 2026-08-07. Mapped before build (§3.3).
    uuid:        nexus-agent-intelligence-loop-v0-0000-2026-0807-001
    author:      James Brooks
    supersedes_note: >
      Expands P3-P5 of docs/gemini-multiagent-coding-phasemap.spec. James clarified
      the goal: the injection optimizer is NOT a new brain — it is the INTELLIGENCE
      SYSTEM (RFR2 + CFR + fan-in + cortex + RAID) applied to the agent layer. The
      agent layer joins the nervous system that P1-P5 of nexus-live-mind made live.
    intent: >
      Inject what's needed into each agent (PUSH) + give agents tools to pull
      anything more from NEXUS on demand (PULL: schemas, contracts, chunk-by-id,
      seams, capabilities). Then let the intelligence system LEARN which injection
      strategy works for which agent under which constraints — optimizing and
      innovating around each agent's limitations AUTOMATICALLY. Strategy is a
      dynamic cortex database (rows that evolve, not hardcoded rules); RAID governs
      changes; RFR2 traces why an injection failed; CFR reads the regime.

  architecture:   # James, definitional — the optimizer IS the intelligence system
    push:         "buildInjectionPayload (P2, done) — contract + tree + target + recall, up front."
    pull:         "agent-facing tools to fetch MORE from NEXUS mid-task: get_schema, get_contract, get_chunk(id), get_seam, query_capability. Scoped per agent (P1 contract)."
    optimizer:    "the intelligence system reading agent-injection performance via the fan-in, tracing failure conditions via RFR2, reading regime via CFR, and adjusting the per-agent strategy."
    dynamic_db:   "cortex JAA tables (jaaDB.insert creates tables live) hold the EVOLVING per-agent injection strategy — not code, data."
    governance:   "RAID governs every strategy change (the mind may adjust, but governed)."

  substrate_all_live:   # §8.6 — ALL of this exists; wire the agent layer in, build nothing new
    - "lib/ledger-fanin — every event; agents emit here (P1 nexus-live-mind, live)."
    - "cortex/intelligence/relational-field — RFR2 traceToRoot: conditions behind an agent's friction."
    - "cortex CFR _field/regime (cortex/boot.js) — the regime an agent/task is in."
    - "cortex/intelligence — the learner (mastermind, pattern detection)."
    - "cortex JAA dynamic tables (jaaDB.insert) — dynamic databases for per-agent strategy."
    - "cortex/core/raid — governs strategy changes."
    - "lib/gemini-toolbox/agent-contracts — the per-agent constraints to optimize AROUND."
    - "lib/chunk-service, lib/line-edit, lib/fs-tree — the agnostic tools agents pull/act through."

  governing_axioms:
    - "§8.6 reuse — this is ALL wiring; the intelligence substrate exists. Build no new brain."
    - "§10.3 one source of truth — strategy lives in ONE cortex table, not scattered constants."
    - "§13.4 drift is data — a failed injection is a learning signal, not just an error."
    - "§RAID governs strategy changes. §1.1 declared≠real. §1.2 nothing silently fails. §always: registry + specs + nothing lost."

  phases:

    AP1_pull_toolbox:   # ← DONE 2026-08-07. lib/agent-pull.js (scoped pulls) + lib/tool-index.js (living cortex index). 8 tests.
      priority: FOUNDATION — agents must be able to reach back before optimization means anything.
      does: >
        Agent-facing PULL tools, scoped per agent (P1 contract): get_schema(name)
        (cortex schema-registry), get_contract(seamId) (lib/seam records),
        get_chunk(id) (chunk-service + a chunk id resolver), get_seam(id),
        query_capability(intent) (loom capability-map / RAID router). An agent
        pulls only what its contract's toolbox allows.
      reuse: "schema-registry, lib/seam, chunk-service, loom capability-map, raid router — all exist."
      gate:  "an agent can pull a schema/contract/chunk/capability by id; a pull outside its scope is refused (§1.1)."
      axioms: [§8.6, §1.1]

    AP2_agent_events_to_intelligence:
      depends_on: AP1
      does: >
        Emit agent lifecycle to the fan-in: injection built, tool pulled, edit
        proposed/verified/rejected/applied, task done/failed. So the intelligence
        system SEES agent behavior in the same stream as everything else. RFR2
        traces the conditions behind a failed edit / bad pull; CFR tags the regime.
      reuse: "lib/ledger-fanin (emit) + relational-field (RFR2) + CFR field — all live."
      gate:  "an agent failure appears in the fan-in, RFR2 traces its conditions, and it's queryable by intelligence."
      axioms: [§13.4, §1.2]

    AP3_strategy_dynamic_db:
      depends_on: AP2
      does: >
        The per-agent injection STRATEGY as a dynamic cortex database: for each
        agent, what to push vs let it pull, how much, what to cache, chunk size —
        rows in a cortex JAA table (agent_injection_strategy), not hardcoded. Seed
        from the P1 contract constraints; updated by AP4.
      reuse: "cortex jaaDB.insert (dynamic tables) — exists."
      gate:  "each agent has a strategy row read at injection time; changing it changes behavior with no code change."
      axioms: [§10.3, §2.2]

    AP4_intelligence_optimizes:
      depends_on: [AP2, AP3]
      does: >
        The intelligence system reads agent-injection performance (AP2 events),
        traces failures to conditions (RFR2), reads regime (CFR), and proposes
        strategy adjustments (AP3 rows) — optimizing around each agent's
        constraints automatically. e.g. an agent that keeps overflowing context →
        push less, pull more; an agent whose pulls miss → push that thing up front.
        RAID GOVERNS every change (the mind may adjust, governed).
      reuse: "cortex/intelligence + relational-field + CFR + RAID — all exist."
      gate:  "a repeated agent-failure condition produces a RAID-governed strategy change that measurably reduces it."
      axioms: [§RAID, §13.4, §1.1]

    AP5_autonomous_build_loop:
      depends_on: [AP1, AP2, AP3, AP4]
      does: >
        The autonomous build driver (the P5 of the multiagent map, now on the
        learned loop): given a task, assign agents by contract, inject via the
        LEARNED strategy (AP3/AP4), let them push/pull, propose block/seam edits,
        apply through RAID, loop until done or halt-on-ambiguity. Uses the existing
        lib/autonomous-loop + governAction gate.
      reuse: "lib/autonomous-loop + governAction (nexus-live-mind P6) + everything above."
      gate:  "a real build task runs across ≥2 agents on the learned strategy, edits RAID-applied, halts on ambiguity, and the strategy improved over the run."
      axioms: [§RAID, §1.2, user_wellbeing]

  ordering_rationale: >
    AP1 first (agents can pull) → AP2 (their behavior reaches intelligence) → AP3
    (strategy is storable/dynamic) → AP4 (intelligence optimizes the strategy) →
    AP5 (the autonomous loop runs on the learned strategy). Each depends on the
    prior; none is a new brain — all wire the agent layer into the live intelligence
    substrate.

  honest_risks:
    - "5 phases — an ARC. Each ships whole + tested + committed."
    - "AP4 (intelligence changes agent behavior) + AP5 (autonomy applies code) are the live/risky ones — RAID gates every change + every apply; halt-on-ambiguity mandatory; prove on James's boot."
    - "Learning needs real agent runs to have signal — AP4 proves over time on the booted system, not in one sandbox pass."

  first_build: "AP1 — the pull toolbox (agents reach back into NEXUS). Recommended start."

---
## AP1 COMPLETE 2026-08-07 — pull toolbox + living tool index
lib/agent-pull.js (agnostic — "lib is for agnostic tools"): pull(agentId, tool, args)
lets an agent fetch get_schema / get_chunk / query_capability / get_contract /
get_seam from NEXUS mid-task, SCOPED by its P1 contract (agentCan). Read-only
discovery is broadly allowed; the WRITE boundary still holds absolutely (test-writer
can pull a schema to read, but never write_patch prod). §8.6 composes schema-registry
+ chunk-service + loom capability-map + lib/seam.
lib/tool-index.js — the LIVING tool index in cortex James asked for: each tool has a
row (file/dir/provides) and record() appends real observations over time — CONSUMERS
(who used it), INTENTS (for what), EDGE CASES (refusals/misses/errors). Persists to a
cortex dynamic JAA table (tool_index, created live). NOT a static list — it populates
from actual usage, becoming the data AP4 (intelligence) optimizes on. §0.1 fixed the
scope map (capability/schema discovery is read-only, not intelligence-gated). 8 tests.
REMAINING: AP2 agent events→intelligence, AP3 strategy DB, AP4 optimize, AP5 loop.