# ollama-bridge — Sovereign Local Model Dispatch

> **v1.0.0 (active)** · port 3749 · isolated from guardian on purpose — if guardian goes down, ollama keeps running

**Author:** James Brooks (Erosmancer) · rheon.world

---

## What It Is

A sovereign HTTP wrapper around local Ollama model dispatch, deliberately isolated from Guardian: *"If Guardian goes down, Ollama keeps running. If Ollama is slow, Guardian does not block."* RAID routes to this system by name, not through Guardian's internal logic. Every request gets a contract; every response is tracked.

**Real naming note, worth carrying forward:** this system's `.spec` file itself records a real bug (§FIX 2026-09-01, LM1) — the spec's `name` field was `ollama` while the actual running system's version key is `ollama-bridge`, and `orchestrator/lib/spec-drift.js`'s live coverage check reported this spec as *missing* on every run purely because of the name mismatch, even though every other field was already correct. Fixed by renaming the field, not the content. A live example of exactly the kind of drift `SPEC_IS_LIVING_MODEL` exists to catch — found in a real system, not this session's own work.

---

## Quick Start

Not confirmed this session.

---

## Architecture

### Governing axioms

`AX-001` (validate all inputs at boundary) confirmed from the excerpt read; full list not read this session.

### Boundaries (documentation clarity)

| Term | Definition | Distinguished from |
|---|---|---|
| `ollama-bridge` (real system name) | the actual running system, version key `ollama-bridge` | `ollama` — the name this system's own `.spec` used to carry, which broke automated spec-coverage checking for an unknown period until fixed |

### Sovereignty (cross-system contract)

RAID routes to this system by name specifically so Guardian's internal logic is never a dependency for local-model dispatch — a deliberate isolation, not an oversight.

---

## The Modules

---

### dispatch

**id:** `ollama-bridge.dispatch`

**What it does**

Receives a job, dispatches to a local model, tracks the contract governing it end to end.

**Real schemas**, from `ollama.spec`'s `core.schemas`:

```
OllamaJob:      { uuid, contractId, componentId, hookId, requestId, sessionId,
                   model, prompt, stream, status (queued|running|complete|failed|cancelled),
                   result, ts, completedAt, durationMs }

OllamaContract: { id, jobId, intent, agent: 'ollama', model, maxTokens, timeoutMs,
                   fallback: string[] }
```

Every field on `OllamaJob` is trace-linkable: `uuid` matches CFR's own trace, `contractId`/`componentId`/`hookId`/`requestId` chain a job back to exactly what requested it and why.

**Commands / How to use it / HTTP routes**

Not read this session — only `meta` and the start of `core.schemas` were pulled.

**What it connects to**

`cortex`'s RAID organ (per `cortex.spec`'s own routing — ollama is the default-first provider in most real clusters, per `guardian.spec`'s `raid_routing`).

**Bus events emitted**

Not read this session.

---

## Modules Not Yet Built

Not determined — this spec's `gaps`/`history` sections not read this session.

---

## Version History

**Source:** hand-maintained. One real, confirmed entry: the `ollama` → `ollama-bridge` name fix (§FIX 2026-09-01, LM1), content otherwise unchanged.

---

## Copyright

Copyright © 2026 James Brooks (Erosmancer). Part of the rheon.world / NEXUS ecosystem.
