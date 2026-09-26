# NEXUS Intelligence Layer — Spec Index v0.1
**Author:** James Brooks (Erosmancer)
**Date:** 2026-07-01
**Scope:** Five specs that together define NEXUS's self-aware, self-improving
           intelligence surface — from unified query to co-pilot as programmer
           to relationship shape to project flow to optimization.

---

## The Five Specs

| Spec | File | What It Defines |
|---|---|---|
| Unified Query Surface | `nexus-query-surface.spec` | Single route: "what's happening with X?" — joins gaps, sigma, events, blueprint, commits, field shape into one read |
| Co-pilot as System Programmer | `copilot-system-programmer.spec` | Durable monitors, feedback loops, task scheduling, multi-system task graphs, conversation memory, system learning |
| Project Flow | `nexus-project-flow.spec` | Empty-state behaviour, idea→spec→repo pipeline, synthesis engine, what-if engine, chunked distribution |
| Relationship Shape | `nexus-relationship-shape.spec` | CFR + RFR2 as shape definers — what it means for any two things to have a measurable relationship with a history |
| Optimization Service | `nexus-optimization-service.spec` | Feedback loops, learning flywheel, RAID fitness extension, optimization opportunity surfacing, self-improvement boundary |

---

## Honest status — what already exists vs what's proposed

### Already built, needs wiring only
- `guardian/lab/lab.js` — hypothesis + conditions + feedback loops → what-if engine uses this
- `lib/gap-predicate.js` — bug tracker IS this, filtered
- `lib/blueprint.js` — roadmap IS this, with divergence tracking
- `lib/changelog.js` + `CHANGELOG.md` — living changelog already exists
- `lib/sigma-writer.js` + `lib/cfr/sigma.js` — sigma trajectory already computed
- `lib/event-ledger.js` — baseline + deviation already tracked
- `lib/cfr/graph.js` — causal graph with ancestors()/descendants() already real
- `cortex/boot.js /api/memory` — conversation memory already in chat_log (cortex keeps memory; the intelligence routes moved to the intelligence system)
- `idearium/` — idea pipeline seed→expanding→tensioned→specced→building→complete already real
- `schedules`, `feedback_scores`, `conditioning_log`, `project_registry` — JAA tables already declared in NEXUS.md
- `unintegrated/rfr2-nexus/delta/index.js` — computeEventDelta(), detectFractals() already implemented
- `unintegrated/rfr2-nexus/observer/index.js` — observer bus already real
- `NEXUS-SELF.spec.md` — BEP engine, crystal patterns, RAID fitness already specced

### Genuinely new engineering
- `GET /api/intelligence/query` — the unified query route (built; served by intelligence/routes.js since 2026-09-19, previously /api/cortex/query on cortex/boot.js)
- Keyword → JAA schema routing (intelligence engine extended with schema-nav prompt)
- Co-pilot creating durable schedules and lab sessions (wiring exists, co-pilot can't compose it yet)
- Redundant conversation ledger (event_log write alongside chat_log)
- RFR2 delta → CFR field snapshot diff (two real systems, unwired to each other)
- Fractal detection surfaced in the query result (detectFractals() exists, nothing reads it)
- Empty-state co-pilot boot behaviour (reads project_registry, surfaces specific offer)
- Optimization opportunity synthesis (morning briefing from co-pilot) — no producer yet
- Field memory (recovery paths recorded per relationship) — new table needed: `field_memory`

---

## Dependency order — build this sequence, not the vision sequence

```
Phase 0 (done) — Nerve pulse events: copilot + ollama heartbeats added

Phase 1 (done) — Nerve read layer: lib/nerve/index.js, getSnapshot/onChange/setRadius

Phase 2 — Unified query surface (nexus-query-surface.spec)
           → Single prerequisite everything else needs
           → GET /api/intelligence/query on intelligence/routes.js (moved out of cortex 2026-09-19)
           → Keyword resolution via intelligence engine
           → Narrative from mastermind()
           → Wire into co-pilot context before every response

Phase 3 — Relationship shape (nexus-relationship-shape.spec)
           → Extend query surface to accept two subjects
           → Wire RFR2 computeEventDelta() to cfr/field snapshots
           → detectFractals() integration
           → Causal root tracing via cfr/graph.js ancestors()

Phase 4 — Co-pilot system programmer (copilot-system-programmer.spec)
           → Monitoring task creator → schedules table
           → Redundant conversation ledger → event_log alongside chat_log
           → Conditioning_log write after every response
           → Lab session composer for feedback loops
           → Multi-system task graph via contract queue

Phase 5 — Project flow (nexus-project-flow.spec)
           → Empty-state detection + structured offer
           → Idearium phase-walk wiring
           → Synthesis engine (mastermind() with project context)
           → What-if engine (co-pilot → lab session composer)
           → Chunked distribution via Versionium tree

Phase 6 — Optimization service (nexus-optimization-service.spec)
           → Metric feedback loops
           → Quality signal capture from conditioning_log
           → RAID fitness extension per-system
           → BEP crystal integration
           → Morning optimization briefing
           → Field memory table + recovery path recording
```

---

## What this looks like when it's all running

One week after Phase 6 is complete:

Co-pilot knows the shape of every relationship in the system. It knows guardian's
typical sigma baseline (0.18) and what makes it spike (NCP flapping). It knows
that the guardian→cortex coherence dropped twice this week and what caused each
drop (one was a chatgpt tab crash, one was a Versionium commit that changed the
job dispatch path). It knows that co-pilot's own response quality for cortex-related
queries has been improving. It has 4 open gaps, 2 of which are predictably going
to close themselves (sigma already falling), 2 of which need attention.

When you open a conversation, it doesn't say "how can I help?" It says: "guardian's
sigma has been at 0.52 for 6 hours — higher than its baseline. The chatgpt NCP
relationship has a fractal pattern every 45 minutes. Your last unfinished project
('cortex intelligence extension') has been in the `tensioned` phase for 4 days.
Where do you want to start?"

That's not a feature. That's a system that knows what it is.

---

## Living changelog integration

This spec index is itself a Versionium-tracked document. When any of the five
specs below change, the index should be updated in the same commit. The index's
sigma contribution is zero when: all five specs match their implementation, the
build order is accurate, and the "already built" vs "genuinely new" table is
correct. A divergence between this index and the codebase is a blueprint gap
of type SPEC_DRIFT.
