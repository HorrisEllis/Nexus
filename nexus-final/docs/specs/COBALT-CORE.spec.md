# COBALT CORE
**UUID:** nexus-sys-cobalt-0000-2026-0531-001
**Layer:** 0 — foundation
**Port:** none
**Status:** active — sealed after v3.3.0
**Source:** NEXUS-CORE.spec, NEXUS-SPEC-v9.spec, NEXUS-MODULES.spec

---

## What it is

The immutable kernel. Every system in the ecosystem propagates outward from this.
Two surfaces and nothing else: the SISO event bus and the JAA database.
No module ever imports another module. All communication goes through these two surfaces.
The core is never rebuilt from components. Components are built from the core.

---

## Axioms

| Axiom | Rule |
|-------|------|
| §K1 | Events are immutable after construction. `Object.freeze()` enforced. |
| §K2 | Gate output collected atomically. Gates never call `emit()` directly. |
| §K3 | Channel strings dot-namespaced. Wildcards: `*` (one segment), `**` (any depth). |
| §K4 | Logical clock strictly monotone. Wall clock is advisory only. |
| §K5 | Ring buffer bounded. Old events evicted — not deleted. |
| §K6 | No module calls another module directly. All communication via JAA or event bus. |
| §K7 | All errors surface as events. Never uncaught throws. |
| §K8 | Module UUIDs are opaque strings. No module introspects another's internals. |
| §2.1 | Persistence is the golden rule. JAA on everything. |
| §5.7 | Zero direct module calls. All I/O via JAA tables only. |
| §1.2 | Nothing silently fails. Every error: loud, specific, logged, toasted. |

**Signature collision rule:** Two gates in the same stream may not share a signature. Collision is a hard error — not a silent precedence bug.

**Infinite loop prevention:** Every gate's `matches()` checks `event.wasProcessedBy(this.signature)` before claiming. `transform()` marks immediately. One event cannot be claimed twice by the same gate.

---

## What it does

### SISO — foundation/siso.js (v3.3.0)

**Event:** Immutable datum flowing through the stream.
`{ id, type, tick, wall, causedBy, relatedTo[], payload, meta.sourceUUID, meta.sessionId }`
`Object.freeze()` on construction. `hash = FNV-1a(type + JSON.stringify(payload))` for dedup.

**StreamLog:** Bounded ring buffer. Configurable capacity (default 10,000). Levels: `OFF | EVENTS | DEEP | DATA`. Observes — never consumes. `.tail(n)` for debug. `.sample()` for snapshot. Sub-streams share the parent log.

**SISOBus:** ALK-compatible event bus. `.on(pattern, cb)` — wildcard subscribe. `.emit(type, data)` — route through all matching subscribers. Errors in subscribers caught and re-emitted as `alk.kernel.sub.error` (§K7).

**ALKKernel:** Full kernel with causal graph. `.emit()`, `.subscribe()`, `.registerGate()`, `.removeGate()`. `.traceToRoot()`, `.descendants()`, `.parent()`, `.children()`, `.related()`. `.stats()` for observability. `.startPulse(5000)` — proof-of-life heartbeat.

**Gate subtypes:**
- `PureGate` — no state, `transform(event) → Event | Event[] | null`, used for parsing/filtering/projection
- `StateGate` — declares reads via ReadSet, returns MutationBatch
- `Runner` — wires PureGates and StateGates to Stream + persistence: `reads → resolve → transformEvent → apply`

**Causal graph:** Every event links to parent (`causedBy`) and semantic associations (`relatedTo[]`). `traceToRoot` walks causedBy chain to origin. Edge types: `causal | semantic | temporal | rule`.

**Gate dispatch:** O(1) by Map lookup. Depth-first, synchronous. Unclaimed events land in `pending[]` — residue, not an error.

### JAA — foundation/jaa.js (v3.3.0)

The only shared data surface. Every module reads and writes through this interface. Architecture: in-memory arrays as hot path, append-only JSONL files per table as the truth layer. `jaaDB.open()` replays JSONL into memory and opens append streams.

**API:**
```
await jaaDB.open()                        — replay persisted data, open append streams
await jaaDB.insert(table, record)         — append row, assign _rowId
      jaaDB.query(table, predFn, limit)   — filtered scan, sync, newest first
await jaaDB.get(table, uuid)              — single row by uuid
await jaaDB.update(table, uuid, patch)    — shallow merge (new row for append)
      jaaDB.count(table)                  — row count
await jaaDB.compact(table)               — deduplicate, rewrite JSONL
      jaaDB.tail(table, n)               — last N rows (most recent)
      jaaDB.scan(table)                  — full table as array
await jaaDB.close()                      — flush and close all streams
```

**Every record requires:** `uuid` (§5.1), `causedBy` or `source` (§A3), `ts` (wall timestamp), `_rowId` (assigned by JAA on insert — not user-settable).

**Status convention:** `pending → processing → complete | failed`

**Claim pattern** (prevents double-processing across poll cycles):
```js
await jaaDB.update(TABLE, item.uuid, { status: 'processing', claimedAt: Date.now() });
const confirmed = await jaaDB.get(TABLE, item.uuid);
if (confirmed.status !== 'processing') continue; // race lost — skip
```

**Browser adapter:** IndexedDB-backed, same API. Used by admin panel and canvas.

### Supporting foundation modules

**cobalt-registry.js** — auto-registration. Every module declares a COBALT object. On `init()`, module inserts COBALT record into `agent_signatures`. Registry polls `agent_signatures` and maintains a live map of all registered modules.

**bus-log.js** — polls `event_log` for new rows, writes to StreamLog ring buffer. Load order 1. Provides the `event_log → StreamLog` bridge.

**shape-sampler.js** — computes `sigma/delta/slope/snr/oscillation` from event stream every 100 ticks. Writes `shape_samples` rows. Versionium watches for sigma > 0.7 → auto-commit.

**poll-registry.js** — single point where all module poll intervals are declared. `pollRegistry.start()` called after `jaaDB.open()`. All layers started in declared bottom-up order.

**validator.js** — NanoValidator, zero-dep AJV replacement for schema validation.

**nano-ws.js** — NanoWSServer, zero-dep WebSocket server replacement.

**FileStore.js** — SHA-256 content-addressed blob store. `put(content) → hash`, `get(hash) → content | null`.

**FileRefs.js** — named refs → hashes (like Git refs). `set(name, hash)`, `get(name)`, `list()`.

---

## What it does NOT do

- Does not route agent calls (that is RAID in the Control Panel)
- Does not detect gaps (that is gate/gap-finder)
- Does not hold any business logic
- Does not communicate with external systems
- Does not have an HTTP port
- Does not import from any other layer
- Does not allow deletion — only append and compact
- Does not allow modules to bypass the JAA write path
- Does not allow signature collisions in gate registration
- Does not allow wall clock as ordering axis (§K4)

---

## JAA Tables owned

```
event_log       — universal append-only log (owner: bus-log)
agent_signatures — cobalt registry (owner: cobalt-registry)
shape_samples   — sigma/delta/slope/snr per module per 100 ticks (owner: shape-sampler)
failures        — all module errors (owner: any module)
toasts          — all toast events (owner: any module)
cli_history     — CLI command log (owner: cli.js)
law_violations  — constitutional law violations (owner: kernel/law-watcher)
boot_records    — boot phase log (owner: boot.js)
```

---

## SEAM contract (STORAGE_CONTRACT)

```
commands:
  store.write  { key, value, decay? }  → StoreResult     — NOT idempotent, timeout 5ms
  store.read   { key }                 → StoreResult|null — idempotent, timeout 1ms
  store.query  { table, where? }       → Row[]            — idempotent, timeout 10ms
events:
  store.written  { key, ts }
  store.error    { key, error, code }
isolation:
  — No module imports jaa.js directly except foundation layer
  — All writes via jaaDB.insert() / jaaDB.update()
  — No module holds authoritative state without JAA backing row
```

---

## Open gaps

| ID | Description | Severity |
|----|-------------|----------|
| G-MOD-01 | `jaa-db.js` ALL_TABLES missing 25+ tables — PHASE 3 boot will fail | CRITICAL |
| G-MOD-02 | 13 schemas marked BUILD REQUIRED not yet created | HIGH |
