# NEXUS CORTEX (Unified Memory API)
**UUID:** nexus-cortex-0000-4000-0000-cortex00001
**Layer:** 9 — memory
**Boot phase:** 9
**Status:** active
**Source:** NEXUS-CORTEX.spec, NEXUS-MODULES.spec, MASTEVOS-v9.spec

---

## What it is

The unified memory API for the entire ecosystem. Every memory system is accessible
through one interface. Not a batch system — an active lookup that assembles intelligence
from multiple memory subsystems on demand.

Like git: systems pull before agent calls, push after responses.
Every pull and push is an SNR-tagged, tracked, logged envelope.

**Critical distinction:**
- **Cortex** (this system) = the unified memory API layer sitting above all individual memory systems
- **Cortex v2** (`core/cortex-v2.js`) = CLI commands that read from this API — not the same thing

---

## Axioms

| Axiom | Rule |
|-------|------|
| §M1 | Everything that happens gets stored. No exceptions. |
| §M2 | Failures are first-class data. Always structured, tagged, stored. |
| §M3 | The system improves by accumulation, not retraining. |
| §M4 | Agents know themselves. Every agent carries a live self-model. |
| GATE_LAW_V | Failure modes are highest priority memory — written to Cortex immediately and unconditionally |
| §2.1 | Persistence is the golden rule. Nothing is ever hard-deleted. |

**Core axiom:** Failure modes are highest priority memory. They go to Cortex immediately and unconditionally. No mistake is repeated because Cortex holds every failure and the fix that worked (or didn't).

---

## What it does

### Unified API

**recall:**
```
cortex.recall(intent, context, tier?) → MemoryResult[]
```
Primary retrieval. Intent is natural language. Returns scored, ranked MemoryResult array.
Intent classifier routes to appropriate MQL lanes:
- `debug_failure` → lanes B (causal), C (failure), E (recency)
- `gap_fill` → lanes A (lexical), D (BEP), E (recency)
- `session_resume` → lanes E, B, A
- `causal_trace` → lanes B, C
- `pattern_lookup` → lanes D, A
- `crystal_query` → lanes A, B
- `general` → lanes A, B, D, E

**push:**
```
cortex.push(content, tags, tier) → { id }
```
All writes are logged, tagged, SNR-enveloped. Write only via this method — never direct JAA inserts to memory tables. AJV validates against `memory-index.schema.json` before insert.

**delete.request:**
```
cortex.delete.request(id, reason) → { approved, ts }
```
Deletion is a request — never immediate. Routed to RAID Engine for LLM-brained approval. Always logged. `§M1` means the deletion event itself is permanent. Approved = soft-deleted (state: 'deleted'). Rejected = logged as rejection event.

### Push/Pull model (like git)

**Pull before agent call:**
1. Build intent IR from request
2. `cortex.recall(intent, context)` → `MemoryResult[]`
3. Assemble context packet (5 tiers)
4. Inject into agent prompt

**Push after agent response:**
1. Tag response (language, intent, agent, session, phase)
2. `cortex.push(response, tags, tier='recent')`
3. MCL processes event → may crystallize
4. BEP engine checks for pattern match or new pattern

### MQL — Five-lane parallel retrieval (cortex/crystalball/mql.js)

Token budget: 48,000 chars (~12K tokens)

| Lane | Source | Weight | Description |
|------|--------|--------|-------------|
| A — lexical | lattice-bridge entity index | 0.70 | Keyword entity index |
| B — causal | kernel causal graph | 1.00 | Ancestors + descendants of anchor event |
| C — failure | failures + fix_map | 0.95 | Open failures + fix_map entries |
| D — BEP | bep_patterns table | 0.90 | Behavioral attractor pattern match |
| E — recency | event_log ring + agent_calls | 0.85 | Ring buffer tail + recent calls |

**Source weights:**
```
failures: 1.50  fix_map: 1.40  bep_patterns: 1.35  crystals: 1.30
agent_calls: 1.20  gaps: 1.15  event_log: 0.80
```

### Memory tiers (priority order)

| Tier | Priority | Retention | Source |
|------|----------|-----------|--------|
| crystal | 1 | permanent | MCL — stable crystallized beliefs |
| spec | 2 | project lifetime | idearium.core |
| session | 3 | session lifetime | guardian.siphon |
| recent | 4 | rolling window (default 20) | agents.* |
| failure | 5 (highest pull weight) | permanent | healer, gap-finder |
| index | 6 | compaction-eligible | memory/agent-memory.js |

**Failure tier weight 1.50** — failures teach most.

### Context packet assembly (5 tiers injected to every agent)

```
TIER_1 — Stable crystallized beliefs (highest confidence)
TIER_2 — Current project context (spec, phase, open gaps)
TIER_3 — Last N agent responses (working memory)
TIER_4 — Injected failure context (from healer — when retrying)
TIER_5 — Associative lattice results for this intent
```

Agent prompt format: `{ system, memory:[{tier,content}], intent, constraints:{temp:0, maxTokens:4096}, beg }`

### Memory subsystems (all unified under Cortex API)

**MCL — Memory Crystallization Layer (crystalball/mcl.js)**

Belief layer. States: `RAW_EVENT → ACTIVE_TRACE → CANDIDATE → STABLE_CRYSTAL`
- Signal score < 0.30 → archived without tracing
- Signal score ≥ 0.30 → `ACTIVE_TRACE` in `active_traces`
- Cluster formed → `CANDIDATE` crystal
- `stabilityScore > 0.85` AND `recurrenceHalfLife > 24h` AND `crossLaneCount ≥ 2` → `STABLE_CRYSTAL`
- Orion pipeline verifies seam before crystal promoted for cross-AI beliefs

**BEP Engine — crystalball/bep-engine.js**

Code memory. Not caching — behavioral attractors with `behaviorGraph`: ordered invariant-checked steps.
- Reuse = skip Ollama entirely
- Mutation = send only delta to Ollama
- Partial = send behaviorGraph as scaffold
- Contradiction detection: new `delta_record` contradicts crystal → `bep.contradiction.detected` → `gap.found` (high severity)
- Pattern similarity: FNV-1a hash + Jaccard (Jaccard > 0.65 → same cluster)

**Lattice — crystalball/lattice-bridge.js + memory/lattice-index.js**

Associative word graph. Entity index. Causal graph persistence to JAA every 500 events.

**Fix Map — memory/fix-map.js**

Gap-type → fix knowledge base. Every successful/failed healer attempt recorded. Confidence = `success_count / (success_count + failure_count)`. Healer weights fix selection by confidence.

**Agent Self-Model — memory/agent-memory.js**

EMA behavioral fingerprint per agent (`ema_alpha: 0.15` ≈ 6-call memory horizon).
Axes: `gatePassRate`, `hallucinationRate`, `constraintEscapeRate`, `tokenCeiling`, `avgLatencyMs`, `contextCeiling`, `appliedMitigations`.

---

## JAA Tables owned

```
crystals           — stable crystallized beliefs
active_traces      — MCL trace records
bep_patterns       — behavioral execution patterns
memory_index       — all indexed agent content (tiered)
memory_queries     — MQL query log
fix_map            — gap→fix knowledge base
cortex_memory      — raw agent responses
conditioning_log   — feedback conditioning
feedback_scores    — feedback weights
```

---

## Events

**Emits:** `crystalball.crystal.formed`, `cortex.recall.complete`, `cortex.push.complete`, `cortex.delete.requested`, `cortex.delete.approved`, `cortex.delete.rejected`, `cortex.bep.match`, `cortex.bep.new`

**Subscribes:** `agent.response.received`, `gate.failed`, `gap.found`, `healer.exhausted`, `healer.resolved`, `gate.passed`, `crystalball.mcl.sweep`, `crystalball.bep.query`

---

## CLI

```
nexus cortex recall <intent>              — pull memory for intent
nexus cortex push <content> [--tier]      — write to Cortex
nexus cortex delete <uuid> --reason       — request deletion (RAID approves)
nexus cortex stats                        — table counts, tier breakdown
nexus cortex crystal list [--state]
nexus cortex crystal show <uuid>
nexus cortex crystal search <term>
nexus cortex bep list [--layer]
nexus cortex bep show <uuid>
nexus cortex bep contradictions
nexus cortex fixmap list
nexus cortex fixmap confidence <path>
nexus cortex forget <uuid>                — alias for delete
nexus cortex sweep                        — force MCL sweep
nexus cortex lanes <intent>               — show which MQL lanes would fire
```

---

## What it does NOT do

- Does not allow direct JAA inserts to memory tables from other modules — only via `cortex.push()`
- Does not hard-delete anything — only soft-delete via RAID approval
- Does not generate content — only stores, retrieves, and crystallizes
- Does not run inference — only assembles context for inference
- Does not track file versions — that is Versionium
- Does not build specs — that is Idearium
- Does not route agent calls — that is RAID
- Does not expose a direct HTTP API for external agents (access is through the system API, SNR-tagged)
- Does not forget failures — failure tier retention is permanent

---

## Open gaps

| ID | Description | Severity |
|----|-------------|----------|
| G-CORTEX-01 | `cortex.recall()` API not yet implemented — MQL called directly | HIGH |
| G-CORTEX-02 | `cortex.delete.request()` routing to RAID Engine not yet wired | HIGH |
| G-CORTEX-03 | Push/pull model not enforced — agents still write JAA directly | HIGH |
| G-CORTEX-04 | `memory/ring-adapter.js` and `continuous-stream.js` not yet specced | MEDIUM |
| G-CORTEX-05 | Idearium not yet pulling from Cortex before spec builder sessions | MEDIUM |
