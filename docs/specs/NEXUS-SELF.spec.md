# NEXUS SELF (Self-Model + BEP + Intent Map)
**UUID:** nexus-self-0000-4000-0000-selfmod00001
**Layer:** 15 — meta (highest layer in the stack)
**Boot phase:** 15
**Poll:** 3,600,000ms (hourly)
**Status:** active
**Source:** NEXUS-SELF.spec, MASTEVOS-v9.spec

---

## What it is

The system's rolling self-portrait. Layer 15 — reads from all layers.

Not a dashboard. A cognitive self-model that understands the system's behavioral patterns,
constraint walls, creativity index, trust landscape, and open questions.
Updated hourly. Used by RAID for routing, by Cortex for context assembly,
and by the cockpit for the meta panel.

**Layer position:** Self is ABOVE Orchestrator. Self observes. Orchestrator routes.
- Phase 15 (meta): self-model, cortex-v2 CLI
- Phase 14 (cognition): intent-map, bep-engine, orion-ext — all BELOW self
- Phase 9 (memory): well below self
- Phase 11 (guardian): well below self

Three components:
1. **Self-Model** (core/self-model.js) — hourly system portrait
2. **Intent Map** (core/intent/index.js) — semantic intent graph
3. **BEP Engine** (crystalball/bep-engine.js) — behavioral execution patterns

---

## Axioms

| Axiom | Rule |
|-------|------|
| §M4 | Agents know themselves. Every agent carries a live self-model. |
| §M3 | The system improves by accumulation, not retraining. |
| §A1 | Behavioral Execution Geometry: successful executions create gravitational attractors. |
| §A2 | Failure = field distortion. Recompute geometry, don't just patch. |

---

## What it does

### Self-Model — core/self-model.js

Hourly self-portrait of the entire system. Reads across all layers.

**Reads:** `delta_records`, `intent_nodes`, `trust_scores`, `crystals`, `gaps`, `guardian_health`, `law_violations`, `ime_profiles`, `bep_patterns`
**Writes:** `self_model`

**Self-model row fields:**

| Field | Type | Meaning |
|-------|------|---------|
| `creativityIndex` | [0,1] | `mean(surpriseScore)` over `delta_records` in last 24h. High = novel territory. Low = routine mode. |
| `divergenceTrend` | slope | Linear regression over last 10 `creativityIndex` values |
| `dominantIntentClusters` | object[] | Top 5 intents by callCount in last 7 days — `{ intentHash, text, callCount, successRate }` |
| `constraintPatterns` | object[] | Intents with `successRate < 0.4` AND `retryCount > 3` — the walls the system keeps hitting |
| `trustLandscape.top5` | object[] | Highest Wilson lower bound sources |
| `trustLandscape.bottom5` | object[] | Lowest Wilson lower bound sources |
| `trustLandscape.median` | number | Median score, sources with `confidence_n ≥ 10` |
| `openQuestions` | object[] | Intents with no associated crystals after 3+ calls — unresolved knowledge |
| `systemHealth.latentState` | 5D | valence, arousal, suppression, coherence, engagement |
| `systemHealth.dominantRegime` | string | `stable | degrading | anomaly | diverging | recovering` |
| `systemHealth.gapDensity` | integer | Open gaps right now |
| `systemHealth.crystalCount` | integer | Stable crystals |
| `systemHealth.ollamaAvailable` | boolean | |
| `systemHealth.guardianConnected` | boolean | |

**5D Latent State (Behavioral Execution Geometry §A1):**
```
VALENCE:     [-1, +1]   degrading ↔ improving
AROUSAL:     [0, 1]     calm ↔ activated (high gap rate, thrashing)
SUPPRESSION: [0, 1]     authentic ↔ masked (divergence high)
COHERENCE:   [0, 1]     integrated ↔ fragmented (contradictions)
ENGAGEMENT:  [-1, +1]   withdrawal ↔ approach (high output)
```

**CLI:**
```
nexus self                     — current self-model snapshot
nexus self history [n]         — last N snapshots
nexus self refresh             — force immediate recompute
nexus self constraints         — constraint patterns only
nexus self questions           — open questions only
```

### Intent Map — core/intent/index.js

Promotes free-text intent fields into UUID-keyed semantic graph. On every `agent_call` insert: extracts intent, fuzzy-matches against `lattice_nodes`, links or creates `intent_nodes` row.

**Intent node:**
```
uuid:                 string
text:                 string
intentHash:           FNV-1a hash of normalized text
callCount:            integer
successRate:          [0, 1]
avgSurpriseScore:     number
preferredAgent:       string
associatedCrystals:   string[] — crystal UUIDs
lastCalled:           integer (ts)
```

**Intent node insights:**
| Pattern | Meaning |
|---------|---------|
| High callCount + high success | Reliable workflow → crystallize the pattern |
| High surpriseScore | Novel territory → track for creativity index |
| No associatedCrystals | Unresolved question → `self-model.openQuestions` |
| Low success + high retry | Constraint wall → `self-model.constraintPatterns` |

**Dedup:** FNV-1a hash + Jaccard (Jaccard > 0.6 between two intents → same cluster).

**CLI:**
```
nexus intent list [--sort callCount]
nexus intent show <uuid>
nexus intent search <term>
nexus intent graph              — ASCII force-directed graph
nexus intent unresolved         — intents with no crystals
```

### BEP Engine — crystalball/bep-engine.js

Behavioral Execution Patterns. Code memory. Not caching — behavioral attractors.

**Not caching — attractors.** Patterns carry a `behaviorGraph`: ordered invariant-checked sequence of steps that made the output work.
- Reuse = skip Ollama entirely
- Mutation = send only the delta to Ollama
- Partial = send the behaviorGraph as scaffold

**Pattern similarity:** FNV-1a hash + Jaccard (Jaccard > 0.65 → same cluster). EMA alpha: 0.20.

**Contradiction detection:** New `delta_record` contradicts a crystal (low cosine similarity to support cluster) → `bep.contradiction.detected` → `gap.found` (high severity). Closes the loop: raw evidence → structured belief → contradiction → self-repair.

**Behavioral gravity (§A1):** High-metrics BEPs (`successRate`, `useCount`) are deep attractors. RAID reconstructs from BEG — not generates fresh — for familiar intents.
- Deep attractor = execution path visited many times successfully
- Shallow attractor = execution path visited rarely or with mixed results
- Bifurcation = moment where small stimulus caused large state change (high surprise)

**Pattern schema:**
```
uuid, version, intent, intentHash, tags
layer:          gate | healer | manifest | translation | foundation
inputContract:  object
outputContract: object
behaviorGraph:
  steps:        [{ action, result }]
  invariants:   string[]
constraints:    string[]
failureModes:   string[]
implementations: string[]  — file paths
metrics:
  useCount, successRate, avgLatencyMs, regressionCount, lastUsed
```

**Events emitted:** `bep.match`, `bep.new`, `bep.contradiction.detected`, `crystalball.bep.query.result`

**CLI:**
```
nexus bep list [--layer]
nexus bep show <uuid>
nexus bep contradictions
nexus bep match <intent>       — what pattern would match this intent?
```

### Cortex v2 — core/cortex-v2.js

CLI skin on the Cortex API. Reads from `self_model`, crystals, `cortex_memory`, `memory_index`, `bep_patterns`.

```
nexus ask <query>                      — search cortex + prepend crystals
nexus memory search <query> [--tags]
nexus memory index [<query>]
nexus memory cortex [<query>]
nexus memory forget <uuid>             — soft-delete memory entry
```

### Agent Self-Model per agent — memory/agent-memory.js

EMA behavioral fingerprint per agent (`ema_alpha: 0.15` ≈ 6-call memory horizon). Updated after every `agent.response.received` and `agent.*.error`. O(1) update, O(1) read. Used by RAID.

**Priors:**
| Agent | gatePassRate | hallucinationRate | tokenCeiling | avgLatencyMs |
|-------|-------------|-------------------|--------------|--------------|
| ollama | 0.78 | 0.08 | 4,096 | 3,200ms |
| chatgpt | 0.82 | 0.05 | 32,768 | 4,500ms |
| claude | 0.88 | 0.03 | 200,000 | 5,200ms |

---

## JAA Tables

```
self_model     — hourly system portrait (schema: BUILD REQUIRED)
intent_nodes   — semantic intent graph (schema: BUILD REQUIRED)
intent_edges   — directed graph of intent transitions
bep_patterns   — behavioral execution patterns (schema: EXISTS)
```

---

## What it does NOT do

- Does not route agent calls — RAID does
- Does not store conversations — Guardian does
- Does not build specs — Idearium does
- Does not write to any table other than its declared ones (§5.7)
- Does not run more often than hourly (self-model poll is 3,600,000ms)
- Does not generate content — only observes and synthesizes
- Does not enforce laws — it observes violations and reports them in `systemHealth`
- Does not manage compartments — Orchestrator does
- Does not decide what to commit — Versionium does (sigma-gated)

---

## Open gaps

| ID | Description | Severity |
|----|-------------|----------|
| G-SELF-01 | `self-model.schema.json` not yet created | HIGH |
| G-SELF-02 | `intent-node.schema.json` not yet created | HIGH |
| G-SELF-03 | `core/self-model.js` not yet in `poll-registry.js` at phase 15 | HIGH |
| G-SELF-04 | `core/intent/index.js` not yet in `poll-registry.js` at phase 14 | HIGH |
| G-SELF-05 | 5D latent state computation (EKF) not yet implemented | MEDIUM |
| G-SELF-06 | `nexus intent graph` ASCII renderer not yet implemented | LOW |
| G-SELF-07 | BEP contradiction detection not yet wired to `gap.found` | HIGH |
