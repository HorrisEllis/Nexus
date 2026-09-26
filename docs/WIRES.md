# NEXUS Wire Map — What talks to what
**Last updated:** 2026-06-24
**Purpose:** Every connection in the system, explicit. No assumed wires.

---

## Bus events (SISO — nexus-bus.js)

| Emitter | Event | Listener | Status |
|---------|-------|----------|--------|
| guardian/server | guardian.job.created | cortex intelligence | ✓ |
| guardian/server | guardian.job.status | cortex gap-loop | ✓ wired 2026-06-24 |
| guardian/server | guardian.job.complete (+ meta.gapUuid) | cortex gap-loop → verifyClosure | ✓ wired 2026-06-24 |
| guardian/server | guardian.tab.needed | orchestrator SSE clients | ✓ |
| diagnostic | HEAL_REQUESTED | cortex self-heal | ✓ |
| cortex/raid | guardian.job.complete | cortex intelligence | ✓ |
| reflection | reflection.contract.queued | guardian poll loop | ✓ wired 2026-06-24 |
| reflection | reflection.contract.resolved | gap-loop verifier | ✓ wired 2026-06-24 |
| gap-predicate | gap.deduplicated | event_log | ✓ |
| gap-predicate | gap.resolved | event_log + bus | ✓ |
| gap-predicate | gap.expired | event_log | ✓ |

---

## HTTP routes (orchestrator proxies all)

| Route | From | To | Status |
|-------|------|----|--------|
| POST /api/guardian/copilot/prompt | UI | guardian :7820/copilot/prompt | ✓ |
| POST /api/guardian/command | any | guardian :7820/command | ✓ |
| POST /api/guardian/cli/exec | co-pilot execFn | guardian :7820/cli/exec | ✓ |
| GET /api/cortex/gaps | UI | cortex :3748/api/gaps | ✓ |
| GET /api/guardian/jobs | UI | guardian :7820/jobs | ✓ |
| GET /api/guardian/providers | UI | guardian :7820/providers | ✓ |
| POST /api/idearium/* | any | idearium :4800/* | ✓ |
| GET /api/components/grammar | grammar-engine | orchestrator → component-registry | ✓ |
| GET /ui/agents/mistral | browser | ui/agents/mistral/index.html | ✓ |
| GET /ui/agents/chatgpt | browser | ui/agents/chatgpt/index.html | ✓ |

---

## JAA writes (§2.1 — disk before behavior)

| Writer | Table | When |
|--------|-------|------|
| guardian/server createJob | jobs | before dispatch |
| guardian/server updateJob | jobs + ledger | every state transition |
| guardian/server job.complete | ledger | on completion |
| reflection._updateStreak | gaps + reflection_contracts | on streak threshold |
| reflection.runReflectionPass | decision_log | on score |
| gap-predicate.enrichGap | gaps | at gap creation |
| gap-predicate.verifyClosure | gaps + closure_attempts | after every repair attempt |
| co-pilot.handlePrompt | event_log | prompt received + reply sent |
| raid._updateW | (file) raid-weights.json | on job outcome |
| raid._clusterReviewTick | (file) raid-clusters.json | on Mistral pattern proposal |

---

## RAID dispatch chain

```
input → decide(prompt) [now exported, was broken]
    → Qwen async classify → _clusterSamples
    → _cluster() → learned patterns → baseline regex
    → CLUSTER_CHAINS[cluster] → fallback chain
    → _agentAvailable() health check
    → _dispatch() → ollama | guardian/command | require('../agents/X')
    → _updateW() on outcome
```

**Known broken dispatch paths:**
- gemini: tries `require('../agents/gemini')` — file doesn't exist
- perplexity: same — should route through guardian /command like chatgpt

---

## Reflection → Guardian → Mistral chain

```
reflection._updateStreak() streak threshold hit
    → jaa.insert('reflection_contracts', { status:'queued', agent:'mistral' })
    → bus.emit('reflection.contract.queued')

guardian boot phase: reflection-contracts.poll (every 30s)
    → jaa.query('reflection_contracts', r => r.status === 'queued')
    → createJob({ command:'diagnose_and_repair', provider:'ollama', meta:{ contractUuid } })
    → dispatchJob → Ollama native
    → contract status: dispatched

reflection.runReflectionPass() (every 15s)
    → jaa.query('reflection_contracts', r => r.status === 'dispatched')
    → verifyClosure(gap) — predicate + artifact
    → resolved: contract.status = resolved
```

---

## Co-pilot → System chain

```
UI input → POST /api/guardian/copilot/prompt
    → handlePrompt()
    → _readSystemState() [gaps, jobs, health, providers via execFn]
    → _classifyIntent() [Qwen small model]
        → tool: /cli/exec → RAID gate → execute → format result
        → question: Mistral with system state as context → text reply
        → action: RAID → agent → execute
    → return { ok, text, modelUsed, classification, systemState }
    → UI displays text + RAID classification footer
```

---

## Hotswap watcher coverage

| Directory | Watched | Since |
|-----------|---------|-------|
| cortex/ui/ | ✓ | original |
| idearium/ui/ | ✓ | original |
| emerge/ui/ | ✓ | original |
| orchestrator/ui/ | ✓ | original |
| diagnostic/ui/ | ✓ | original |
| ui/home/ | ✓ | original |
| **ui/agents/** | ✓ | 2026-06-24 (was missing) |

