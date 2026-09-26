# cortex — The Memory and Brain of NEXUS

> **v3.5.0 (active)** · port 3748 · six organs boot in sequence, connected only by the event bus

**Author:** James Brooks (Erosmancer) · rheon.world

---

## What It Is

Cortex is where everything that needs to be remembered, learned, healed, or routed passes through. Its own spec states the discipline plainly: six organs boot in a fixed sequence, each subscribing to and emitting events — *"no organ calls another directly."* Friction (per-gap severity, 0.0–1.0) is a first-class concept here, distinct from `loom`'s registry-strain friction and the nerve domain's UX-drift friction — three unrelated real meanings of the same word across the codebase, cortex's being the oldest and most load-bearing.

---

## Quick Start

Not confirmed this session.

---

## File Structure

Not enumerated directly — organs and routes below are known from the spec; the underlying file layout was not read.

---

## Architecture

### Spine

Not confirmed — cortex's own event bus connects its six organs; whether that bus is WARP itself or a cortex-local equivalent was not confirmed this session.

### Governing axioms

`AX-001, AX-002, AX-003, AX-005` — per `cortex.spec`'s `core.axioms`; individual statements not read this session.

### Boundaries (documentation clarity)

| Term | Definition | Distinguished from |
|---|---|---|
| Cortex's `friction` (`Gap.friction`, `FailureMode.friction`) | a per-gap severity score, 0.0 (nominal) to 1.0 (failure) | `loom`'s registry-strain friction (orphan hooks + open gaps) and `genesis.spec`'s nerve-domain UX friction — three real, unrelated meanings |

### Sovereignty (cross-system contract)

| Other system | May read | May never write | Enforced by |
|---|---|---|---|
| any | `GET /api/gaps`, `/api/memory/working`, `/api/failure-modes`, `/api/friction`, `/api/chat-log`, `/api/search`, `/api/raid/decide` | direct writes to cortex's memory tiers — must go through `POST /api/memory/write`, `POST /api/event`, `POST /api/table/insert` | not independently verified as process-isolated this session |

### Pulse (liveness)

Real, three-tier, from `core.constants`: `HB_HEALTH_MS: 10000` (health probe, 10s), `HB_PULSE_MS: 30000` (API pulse, 30s), `HB_TELEMETRY_MS: 60000` (telemetry frame, 60s). Matches the `heartbeat` organ (order 6 in the boot sequence) exactly.

### Self-diagnostics (structural strain)

| Metric | Computed from | Formula | Exposed at |
|---|---|---|---|
| `friction` (per-gap) | `Gap.friction` field, 0.0–1.0 | thresholds real: `FRICTION_NOMINAL: 0.0`, `FRICTION_ELEVATED: 0.4`, `FRICTION_HIGH: 0.7`, `FRICTION_FAILURE: 1.0` | `GET /api/friction` |

### Config layers / Phases / Component status

Not confirmed this session.

---

## The Modules

<!-- Cortex's "modules" are its six organs — a different real shape than
     component/hook/wire node files, kept as-is rather than forced into
     that mold. -->

---

### The six organs

**id:** `cortex.organs` (the boot sequence itself, not one module)

**What it does**

Six organs boot in a fixed order, each subscribing to and emitting events only — no direct calls between them.

| Order | Organ | Purpose | Subscribes | Emits |
|---|---|---|---|---|
| 1 | `gap-finder` | watches event stream for stale modules, axiom violations, recurring failures | `*` | `cortex.gap.found` |
| 2 | `healer` | prescribes fixes for open gaps using diagnostic engine results | `cortex.gap.found` | `cortex.heal.requested` |
| 3 | `self-heal` | 5-level escalation ladder with friction ledger | `cortex.heal.requested`, `HEAL_REQUESTED` | `cortex.heal.applied`, `cortex.heal.failed`, `cortex.escalation.*` |
| 4 | `orion` | sensor + policy — classifies requests, routes to context | `*` | `cortex.orion.classified` |
| 5 | `raid` | provider selection — 9 clusters, 5 NCP providers, Ollama primary | `cortex.orion.classified` | `cortex.raid.decided` |
| 6 | `heartbeat` | 3-tier liveness (see Pulse above) | none | `cortex.health`, `heartbeat.tick`, `heartbeat.pulse`, `heartbeat.frame` |

**How it works internally**

The `raid` organ (order 5) is the same RAID routing `guardian.spec`'s `raid_routing` describes from the consumer side — cortex classifies and decides, guardian dispatches. This is a real, confirmed seam between the two systems: cortex emits `cortex.raid.decided`, guardian's own spec lists `handles: cortex.raid.decided → dispatch to chosen provider`.

**Commands / How to use it**

Not read this session.

**HTTP routes** — real, from `cortex.spec`'s own `routes:`:

```
Internal:
  GET  /health
  GET  /contract
  GET  /events (SSE)

External:
  GET  /api/gaps?status=            POST /api/gaps/resolve
  GET  /api/memory/working           POST /api/memory/write
  POST /api/memory/forget             GET  /api/failure-modes
  GET  /api/friction                    GET  /api/chat-log
  GET  /api/search?q=&threshold=          POST /api/search/context
  GET  /api/search/status                   GET  /api/raid/decide?intent=
  POST /api/meta/observe                      GET  /api/meta/gaps
  GET  /api/meta/bda                            POST /api/meta/classify
  GET  /api/engines                               POST /api/event
  POST /api/table/insert                            GET  /api/self-heal/status
```

**What it connects to**

- `guardian` — `cortex.raid.decided` is what guardian's own spec lists as its primary inbound handle
- `versionium` — `_field.entropy` feeds versionium's sigma-gated auto-commit (per `versionium.spec`)

**Bus events emitted**

`cortex.booted`, `cortex.gap.found`, `cortex.gap.resolved`, `cortex.gap.escalated`, `cortex.heal.requested`, `cortex.heal.applied`, `cortex.heal.failed`, `cortex.memory.written`, `cortex.memory.forgotten`, `cortex.intelligence.pattern_crystallised`, `cortex.raid.decided`, `cortex.snapshot.created`, `cortex.escalation.friction_increased`, `cortex.escalation.failure_mode`, `escalation.level_0` through `escalation.level_4`, `component.registered`/`component.updated` (from component-registry) — all real, from `cortex.spec`'s own `events.emits`.

---

## Modules Not Yet Built

Not determined — `cortex.spec`'s `gaps:`/`history:` sections not read this session.

---

## Build & Run Reference

Not confirmed.

---

## Version History

**Source:** NOT CONFIRMED EITHER WAY — whether cortex reports to Versionium wasn't checked this session. Cortex's own `versionium.spec` connection is real (versionium's engine originated as `cortex/versionium/index.js`), which makes this worth checking directly rather than assuming.

---

## Copyright

Copyright © 2026 James Brooks (Erosmancer). Part of the rheon.world / NEXUS ecosystem.
