# NEXUS System Map — Living Document
**Last updated:** 2026-06-24
**Author:** James Brooks (Erosmancer)
**Status:** Active — updated every session

This document maps every component, every wire, every open loop. It is the honest answer to "what talks to what and does it actually work."

---

## Service Registry

| Service | Port | Status | Notes |
|---------|------|--------|-------|
| Orchestrator | :9000 | ✓ | Proxy, SSE relay, hotswap watcher, component registry |
| Bridge | :9999 | ✓ | Identity, trust relay, circuit breaker |
| Cortex | :3748 | ✓ | JAA (source of truth), RAID, intelligence, reflection |
| Guardian | :7820 | ✓ | AI dispatch, NCP, SEAM queue, co-pilot entry point |
| Idearium | :4800 | ✓ | Idea OS, specs, repos (flat-file — cortex sync pending) |
| Architect | :3747 | ✓ | Hook registry, blueprint/SNR/translate |
| Diagnostic | :7825 | ✓ | Remediation scan, escalation ladder, gap dispatch |
| Autopilot | :7799 | ✓ | Process supervisor, circuit breaker, restart with backoff |
| Ollama | :11434 | ✓ | Local inference (mistral:7b-instruct-q4_K_M, qwen2.5-coder:1.5b) |
| emerge | — | ✗ offline | Code generation kernel — not running |
| forge-shell | — | ✗ offline | IDE shell — not running |

---

## Intelligence Stack (bottom-up)

```
User input (ui/home/index.html floating menu)
    ↓
Guardian co-pilot (guardian/agents/co-pilot/index.js)
    ↓ reads live state (gaps, jobs, health, providers)
    ↓
Qwen 0.5b (intent classification — fast, local, non-blocking)
    → tool intent   → /cli/exec → RAID gate → execute
    → question      → Mistral 7b (system state as context)
    → action        → RAID → agent → execute
    ↓
RAID (cortex/core/raid/index.js)
    → LAW_I: Ollama first (mistral:7b-instruct-q4_K_M)
    → cluster classification: Qwen async + learned patterns
    → weights: updated on every outcome, persisted to disk
    → decide() exported and working (was broken — fixed 2026-06-24)
    ↓
Mistral 7b (generation, reasoning, reflection analysis)
    ↓
Guardian job (createJob → JAA before dispatch → bus event)
    ↓
guardian.job.complete (carries gapUuid for closure verifier)
    ↓
Gap-loop closure verifier (predicate check + artifact check)
    → resolved: gap closed, contract closed
    → still open: attempt logged, retry on next pass
```

---

## Gap Lifecycle (Phase 23.7)

```
Gap detected (diagnostic or reflection)
    ↓
enrichGap() — predicate + artifact_requirement + dedup_key + truth_floor
    ↓
Dedup check — same predicate already open? → append evidence, skip insert
    ↓
Gap inserted to JAA (status: open)
    ↓
Diagnostic sweep — marks gap 'investigating' on dispatch (NOT re-dispatched each sweep)
    ↓
Guardian dispatches job to Mistral via Ollama native
    ↓
job.complete event fires with meta.gapUuid
    ↓
Gap-loop verifyClosure():
    1. predicate.check() against JAA state — is the problem still real?
    2. artifact_requirement verified — does proof exist?
    Both must pass → gap RESOLVED
    Either fails → attempt logged → gap stays open → retry
    ↓
TTL: if expired without resolution → EXPIRED (visible, not silent)
Attempts ≥ 10 → BLOCKED (human escalation)
```

States: `open → investigating → resolved | expired | blocked → archived`

---

## Reflection Loop (Phase 11)

```
decision_log row (satisfaction = null)
    ↓ every 15s
runReflectionPass() scores it
    ↓
_updateStreak() — N consecutive low scores for same class
    ↓
Gap created (KNOWLEDGE or CAPABILITY loop_type)
    + reflection_contract inserted to JAA (status: queued)
    ↓
Guardian polls reflection_contracts every 30s
    → dispatches queued contracts to Mistral via Ollama
    → contract status: dispatched
    ↓
runReflectionPass() checks dispatched contracts
    → verifyClosure() — predicate + artifact
    → resolved: contract closed, gap closed
    → not resolved: attempt logged, retry next pass
```

---

## RAID Cluster Classification (self-improving)

```
Intent arrives
    ↓
Layer 1: learned patterns (raid-clusters.json, weighted, Qwen-generated)
Layer 2: baseline regex (CLUSTERS_BASELINE — always present)
    ↓ synchronous result immediately
Qwen async classification (non-blocking, ~200ms)
    → agrees with regex: stored as confirmation
    → disagrees: stored as correction in _clusterSamples
    ↓
Correction rate > 40% in recent window
    → _clusterReviewTick() fires
    → Mistral proposes new regex word groups
    → patterns written to raid-clusters.json
    → next boot: learned patterns loaded first
```

---

## Component Registry

All capabilities register via `POST /api/components/register`. Grammar engine reads `GET /api/components/grammar` and builds a trie. Tab completion and RAID cluster assignment use it.

Current registered: orchestrator (14 routes), bridge (15 routes), guardian (24 routes), idearium (0 routes — needs registration), architect (5 routes).

**Gap:** idearium registers 0 routes. Component registry loaded 0 components at boot. Most components not self-registering.

---

## NCP Providers (browser tab bridge)

| Provider | Status | Userscript |
|----------|--------|------------|
| ChatGPT | ✓ connecting | guardian/userscript-chatgpt.js v10.1.0 |
| Claude | ✓ connecting | guardian/userscript-claude.js v10.2.0 |
| Ollama | ✓ native | guardian/agents/ollama.js — no tab needed |
| Gemini | ⚠ RAID assumes online | No health probe — hardcoded online:true |
| Perplexity | ⚠ RAID assumes online | No health probe — hardcoded online:true |

**Gap:** Gemini and Perplexity are never probed. RAID always thinks they're available. Dispatch to them fails silently (require('../agents/gemini') throws, caught, weight degrades).

---

## JAA Tables (cortex/memory/jaa-db.js)

Working tier (decays): sigma_records, active_traces, working_memory, agent_calls, interstitial_spaces
Short tier (1h decay): event_log, bep_patterns, session_patterns
Long tier (permanent): decision_log, reflection_contracts, closure_attempts, gap_predicates, gaps, failures, cortex_memory, artifacts, ledger, jobs, seam_sessions, queue_compartments, settings, chat_log, blueprints, snapshots, requests, contracts, registry, branches, hooks, notes, replay_log

---

## Open Loops (known gaps as of 2026-06-24)

| Gap | Type | Status | Fix |
|-----|------|--------|-----|
| Gemini/Perplexity dispatch broken | CAPABILITY | open | Add health probe, route through guardian /command |
| Idearium flat-file (not cortex) | CAPABILITY | open | cortex sync layer |
| vectra not installed | CAPABILITY | open | npm install vectra |
| 6 drifted specs | spec_drift | open | Update versions or code |
| 9 unspecced components | KNOWLEDGE | open | Write specs |
| Hub (hub.py) not deprecated | KNOWLEDGE | open | nexus-knowledge.js deprecate() |
| All UIs have inline scripts | CAPABILITY | open | Shared nexus-client.js, SISO modules |
| No seam_id on any UI | CAPABILITY | open | Requires UI rewrite (last priority) |
| co-pilot streaming output | CAPABILITY | open | Token-by-token to UI |
| emerge offline | CAPABILITY | open | Start emerge or build it |
| forge-shell missing | CAPABILITY | open | ui/forge-shell.html missing |

---

## Build Order (§3.1 — always bottom-up)

```
1. JAA tables          — data exists before anything writes
2. gap-predicate.js    — predicate library, dedup, truth floor
3. open-loop-taxonomy  — createLoop enrichment
4. nexus-diagnostic    — dedup at gap creation
5. gap-loop            — closure verifier
6. guardian/server     — job contracts, reflection polling
7. cortex/core/raid    — Qwen classifier, public decide()
8. lib/reflection      — contracts + verifier
9. co-pilot            — real operator (Qwen + Mistral)
10. UI                 — last, always last
```

---

## Integrated Deliverables (this session)

- `nexus-v0_9_8-integrated.zip` — full patched source tree
- `copilot-v1.1.zip` — co-pilot agent + UI thin shell
- `gap-lifecycle.spec` — causal closure specification
- `copilot.spec` — co-pilot v1.1 specification
- `PATCH-NOTES.md` — all changes with rationale

