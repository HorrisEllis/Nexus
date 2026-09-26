# BRIDGE — Causal Event Spine
## UUID: nexus-bridge-causal-spine-v1-0-0
## Version: 1.0.0
## Status: living — append-only, never frozen
## CausedBy: session 2026-06-12, architecture convergence with ChatGPT validation

---

## What this is

Bridge is not a relay. Bridge is not a router.

Bridge is the **physical memory of the system** —
an append-only causal event substrate that every service writes to
and every decision system derives from.

Everything else is a projection of what Bridge holds.

---

## What it must do

### 1. Receive (event ingestion)
Every service posts events to Bridge in a canonical shape.
One endpoint. One schema. No exceptions.
Guardian job dispatch, cortex gap, architect hook, idearium idea —
all flow through Bridge.

### 2. Chain (causal graph)
Every event links to the event(s) that caused it.
Multi-parent support — one job can be caused by a retry,
a fallback, and a schedule simultaneously.
The graph is a DAG, not a chain.

### 3. Sign (cryptographic attribution)
Ed25519 signature over canonical JSON (deterministic key ordering).
Every event is cryptographically attributable to its source service.
Tamper-evident via Cobalt boot chain already in place.

### 4. Project (derived state)
Raw events → projections → system views.
RAID does not read raw events. It reads the RAID projection.
Health does not poll services. It reads the health projection.
Token economy reads the cost projection.
Session state reads the session projection.

### 5. Replay
Given any event UUID, reconstruct the full causal tree.
State = projection of events from any point in time.
"State" as a concept disappears — it's always derivable.

### 6. Query
```
GET /bridge/trace/:eventId       → full causal tree from this event
GET /bridge/trace?source=X&action=Y&since=T  → filtered history
GET /bridge/trace/session/:id    → everything in one session
GET /bridge/project/:view        → current projection (raid|health|economy|session)
```

---

## The canonical event shape

```js
{
  uuid:        randomUUID(),           // this event — immutable
  ts:          Date.now(),             // wall clock — immutable
  source:      'guardian',            // which service
  action:      'job.dispatched',      // what happened (verb.noun)
  sessionId:   '...',                 // which session context
  causalEdges: [                      // multi-parent causal graph
    { type: 'triggered_by',   eventId: '...' },
    { type: 'fallback_from',  eventId: '...' },
    { type: 'influenced_by',  eventId: '...' },
  ],
  input:       {},                    // what came in
  output:      {},                    // what went out
  stateDiff:   {},                    // what changed (delta only)
  tags:        [],                    // searchable labels
  sig:         'ed25519-sig',         // bridge signs after ingestion
}
```

### causalEdge types
- `triggered_by` — direct cause
- `fallback_from` — this happened because X failed
- `influenced_by` — soft causal relationship (health signal, weight update)
- `scheduled_by` — caused by a schedule entry
- `replayed_from` — this is a replay of a prior event

### action naming convention
`<verb>.<noun>` — always lowercase, always present tense
Examples: `job.dispatched`, `gap.opened`, `hook.registered`,
`seam.verdict.received`, `provider.failed`, `snapshot.created`

---

## Projection layer

Projections are derived views computed from the event stream.
They are NOT stored as primary truth — they are rebuilt from events.
They are cached for read performance.

### RAID projection
```
events filtered by: job.dispatched, job.completed, provider.failed
aggregated by: provider × intent_cluster
output: success_rate, avg_latency, failure_modes per provider/cluster
```

### Health projection
```
events filtered by: *.booted, *.failed, *.offline, heartbeat.*
output: current online/offline state per service, last_seen, uptime
```

### Token economy projection
```
events filtered by: job.dispatched, job.completed
aggregated by: provider, window (5hr rolling)
output: calls_in_window, window_pressure, cost_estimate
```

### Session projection
```
events filtered by: sessionId = X
ordered by: ts ascending
output: full session timeline, causal tree, artifacts, gaps
```

---

## What changes in each service

Every service adds ONE call on every meaningful action:

```js
bridge.emit({
  source:      'guardian',
  action:      'job.dispatched',
  sessionId:   job.sessionId,
  causalEdges: [{ type:'triggered_by', eventId: req.causedBy }],
  input:       { provider, command, prompt: prompt.slice(0,100) },
  output:      { jobId, status:'queued' },
  stateDiff:   { jobs: +1, queued: +1 },
  tags:        ['dispatch', provider],
});
```

Services keep their own JAA tables. Bridge is additive, not replacing.

---

## What Bridge is NOT

- Not a message broker (no subscriptions, no pub/sub)
- Not a database (no mutable updates — append only)
- Not a single point of failure (services continue without it, sync on reconnect)
- Not a god-object (projections are derived, not stored as primary truth)

---

## Failure mode

If Bridge is unreachable:
- Services buffer events locally (max 100, ring buffer)
- On reconnect, flush buffer to Bridge in order
- Projections mark themselves stale, not broken
- RAID continues on last known projection
- Nothing blocks. Nothing crashes.
- Gap opened: `F-BRIDGE-UNREACHABLE` — named, logged, escalated.

---

## Build order (§3.1 bottom-up only)

1. `bridge/causal/schema.js` — event shape, canonical serializer, signature
2. `bridge/causal/ledger.js` — append-only JSONL store with causal index
3. `bridge/causal/graph.js` — DAG traversal, replay, causal tree query
4. `bridge/causal/projections.js` — RAID, health, economy, session views
5. `bridge/causal/server.js` — HTTP endpoints wired to above
6. Per-service integration — one `bridge.emit()` call per action
7. RAID reads projections instead of probing directly

---

## Axioms (immutable)

- §B-1: Every event is append-only. No updates. No deletes.
- §B-2: Every event has a UUID, a source, an action, a timestamp.
- §B-3: causalEdges is never null — empty array if root event.
- §B-4: Signature covers canonical JSON. Key order is deterministic.
- §B-5: Projections are derived. Never primary truth.
- §B-6: Bridge failure opens a named gap. Never silently degrades.
- §B-7: Services buffer locally on Bridge unreachable. Flush on reconnect.
- §B-8: State is a projection of events. State as a stored concept is deprecated.

