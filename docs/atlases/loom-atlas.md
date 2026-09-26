# loom — Sovereign Component / Hook / Wire Registry

> **v1.5.0 (active)** · 7 modules · the registry every phasemap/spec-drift/capability check in NEXUS already depends on · L0 registry predates its own L3/L4 surface by unknown time — first added API access 2026-07-02

**Author:** James Brooks (Erosmancer) · rheon.world
**License:** matches the parent NEXUS repository's license

| Repo | Description |
|---|---|
| **loom** (this, within the NEXUS monorepo) | THE registry authority — builds and maps NEXUS, owns the hook/wire/component registry (loom's own `registry-components.js` header, verbatim) |

---

## What It Is

loom is the sovereign source of truth for how NEXUS's components, hooks, and wires connect. Every other system's `declare()` call reaches loom's real write path (`POST /api/register`); every phasemap, spec-drift check, and capability lookup in the codebase reads loom's registry rather than re-deriving connectivity itself.

It existed as a pure in-process library (`LoomDriver`, `LoomContracts`) for an unknown span of earlier phases before `loom/server.js`'s own 2026-07-02 comment gave it an API surface at all: *"every other real system in NEXUS follows nexus-system-foundation.spec's L0-L5 shape and has a process, a port, and a handshake... LOOM had L0 and an L2-adjacent CLI, nothing else."* Its own `.spec` wasn't written until 2026-09-01 — closing a gap `orchestrator/lib/spec-drift.js`'s own live coverage check had already flagged.

---

## Quick Start

```bash
# real, from loom.spec — port 3752, override via LOOM_PORT
LOOM_PORT=3752 node loom/server.js
```

```
[boot output not captured in the files reviewed this session]
```

**Tested:** not run this session — this atlas is built entirely from real source files (`loom/schema/registry.js`, `loom/registry-components.js`, `loom/spec/loom.spec`, `loom/spec/loom.node-taxonomy.md`), not from an executed boot. Stated plainly rather than implied.

---

## File Structure

```
loom/
  schema/
    registry.js          real — LoomRegistry class, disk-first store
    component.js           real — COMPONENT_SCHEMA
    hook.js                  real — HOOK_SCHEMA, open type seed list
    wire.js                    real — WIRE_SCHEMA
    cortex-sync.js               real — durable write path into cortex
    index.js                       LoomDriver — not read directly this session
  contracts/
    index.js              LoomContracts — lifecycle state; not read directly this session
  ingest/
    index.js                LoomIngest.ingestZip — not read directly this session
  templates/
    system-scaffold.js       scaffoldSystem() — not read directly this session
  scanners/
    phasemap-map.js            real per-file existence (zip listing); internals not read
    spec-map.js                   real — SPEC_DIRS allowlist confirmed NOT to include loom/spec itself
    source-map.js, wiring-gaps.js, dangling-report.js, event-taxonomy-map.js
                                     real per-file existence; internals not read this session
  data/
    nodes/
      capability/            loom.registry.get.capability, loom.registry.put.capability — real files
      component/               loom.registry.get.component, loom.registry.put.component — real files
  phases/                       migrated this session via architecture-spec's decompose.js —
    LP1_phasemap_scanner.json     real phase node, decomposed from docs/loom-phasemap-section-phasemap.spec
    LP2_split_by_system.json        real phase node, depends_on LP1
    LP3_loom_section.json             real phase node, depends_on LP2
      command/                    loom.registry.get.command, loom.registry.put.command — real files
    registry.json                 real — 5.8 MB on disk
  registry-components.js     real — loom's own declared capability list (25 entries)
  spec/
    loom.spec                real
    loom.node-taxonomy.md      real
  server.js                     referenced by loom.spec and registry.js comments; not read directly this session
```

| Path | Node kind it holds | Contains |
|---|---|---|
| `schema/` | none — code | the real, central schemas every other system's components are checked against |
| `data/nodes/{capability,component,command}/` | capability, component, command | loom's own self-declared nodes — added 2026-07-25 after loom was found registering `components: []` for itself ("the mapmaker was not on the map") |
| `data/registry.json` | component, seam, hook, wire, concern (loom's `KINDS`) | the flat, disk-first store every `LoomRegistry` read/write goes through |

---

## Architecture

### Spine

Not confirmed. Nothing in `loom.spec`, `registry.js`, or `registry-components.js` reviewed this session mentions binding to WARP or any other single dispatch primitive — loom's own real mechanism is direct disk I/O (`registry.js`) plus an HTTP/SSE surface (`server.js`, not read directly). Stated as unconfirmed rather than assumed absent.

### Governing axioms

| Name | Statement | Rationale |
|---|---|---|
| `AX-001` | validate all inputs at boundary | shared convention |
| `AX-004` | self-describing — L3 (API) + L4 (handshake) added on top of the pre-existing L0 registry | matches the real boot pattern `copilot/server.js` and `eravos/server.js` already use |
| `AX-013` | living-model sections (this spec's own history/gaps/version_history) | the real, assigned axiom code for what this convention had been calling `SPEC_IS_LIVING_MODEL` without realizing loom's own spec already names it |

### Boundaries (documentation clarity)

| Term | Definition | Distinguished from |
|---|---|---|
| `registry.json` | loom's own disk-first flat store — re-read before every read call, per `registry.js`'s own §2.2 comment | `cortex`'s jaaDB — a separate durable history store, written to via `cortex-sync.js` on every mutation. Before `cortex-sync` was wired (2026-07-04), `registry.json` was "the only place any of this ever landed" (`registry.js`'s own comment) — the two stores answer different questions (current state vs. durable history) and neither is a cache of the other |

### Seams (cut points)

None found in the real files reviewed this session. Under the corrected definition (a seam is any declared cut-point — between modules, spec blocks, or nodes — not just total isolation), loom's own module boundaries in `loom.spec`'s `modules:` list (`schema`/`contracts`/`cortex-sync`/`ingest`/`system-scaffold`/`phasemap-map`/`spec-map`) are plausible seam candidates, but none of them are declared as seams in the source — stated as a real gap in loom's own documentation, not filled in with an inferred one.

| ID | Location | Between | Cut type | Isolation (if applicable) |
|---|---|---|---|---|
| — | — | — | — | — |

### Sovereignty (cross-system contract)

| Other system | May read | May never write | Enforced by |
|---|---|---|---|
| any | `GET /api/graph`, `/api/context-graph`, `/api/registry/:kind/:id`, `/api/friction`, `/api/tension`, `/api/gaps` | direct writes to `registry.json` — must go through `POST /api/register` / `POST /api/hooks` / `POST /api/registry/:kind` | process boundary — `registry.js` is only ever constructed inside loom's own process in the files reviewed |

Worth naming directly: loom is a deliberate exception to the usual "no shared write surface" framing — its entire purpose is to be the **shared write authority** other systems' `declare()` calls reach (`POST /api/register`, loom.spec's own words: *"the real write path every other system's declare() call reaches"*). That's not a violation of sovereignty, it's what a registry authority is — but it's worth stating explicitly rather than letting the general "systems don't write into each other" framing silently misdescribe loom's actual, different role.

### Pulse (liveness)

Not confirmed — no heartbeat, pulse, or self-identify mechanism found in the files reviewed this session.

### Self-diagnostics (structural strain)

| Metric | Computed from | Formula | Exposed at |
|---|---|---|---|
| `friction` | per `loom.spec`: "in-memory... per 2026-08-09 diagnostic wiring." Per `registry-components.js`'s own description: "proxied live from the diagnostic kernel (:7825)." | not stated in either real source — **the two real files disagree on whether this is computed in-process or proxied from an external kernel, and this atlas is not resolving that discrepancy, only recording it** | `GET /api/friction` |
| `tension` | same ambiguity as friction | "friction + gap accumulation" (registry-components.js's own words) | `GET /api/tension` |
| gap count | `gap-field entries` | not stated | `GET /api/gaps`, `GET /api/gaps/:domain` |

### Config layers

Not confirmed.

### Phases

**Source:** `docs/loom-phasemap-section-phasemap.spec` — loom's own phasemap for building its own phasemap-aggregation section (self-referential, and real).

| Phase | Intent | Entry condition | Exit gate | Produces | Status |
|---|---|---|---|---|---|
| `LP1_phasemap_scanner` | read every `docs/*phasemap*.spec`, extract phases (id, does, gate, status, depends_on), tag each by system | `loom/scanners/spec-map.js`'s pattern exists to reuse | scanner returns every phase across all maps, each tagged with its system + done/pending status | `loom/scanners/phasemap-map.js` | ✓ DONE 2026-08-08 |
| `LP2_split_by_system` | group consolidated phases by system/feature so "what is cortex becoming" etc. is answerable | LP1 done | phases grouped by system; each system's roadmap (done + pending) is listable | `bySystem` grouping, `forSystem()` | ✓ DONE 2026-08-08 |
| `LP3_loom_section` | expose the per-system phasemap as part of loom's own self-model, alongside components + specs | LP2 done | loom exposes the per-system phasemap section; querying a system shows its roadmap | `GET /api/phasemap`, `GET /api/phasemap/:system`, a UI view-roadmap section | ✓ DONE 2026-08-08 |

All three phases of this spec are closed — its own final line: *"REMAINING: none — spec closed."* Real aggregate stat from the same source: loom's phasemap scanner covers **95 phases across 15 maps, 19 systems, 48 done / 45 pending** — but that 45-pending figure is NEXUS-wide, not loom-specific, and this session didn't pull the per-system breakdown needed to say how many of those 45 belong to loom itself.

**Migration, executed this session:** these three phases were run through `architecture-spec`'s `decompose.js` — real, not illustrative:

```
migrated → /tmp/loom-migration/systems/loom/phases/LP1_phasemap_scanner.json
         → /tmp/loom-migration/systems/loom/phases/LP2_split_by_system.json
         → /tmp/loom-migration/systems/loom/phases/LP3_loom_section.json
wired    → 6 hook nodes (.entry/.done per phase) + 2 wire nodes (LP1→LP2, LP2→LP3)
compiled → orphans: [] — every dependency edge resolved cleanly
```

The paths above are this session's scratch directory, not loom's real repo path — this is a proof the tool works against loom's real data, not a claim that loom's actual filesystem has been touched. Migrating the other 14 real phasemap docs (95 phases, 19 systems total) the same way is the obvious next step and has not been done yet.

### Component status

Not confirmed — no `stub`/`wired`/`verified` vocabulary found in the real loom files reviewed.

---

## The Modules

---

### schema

**id:** `loom.schema`
**path:** `loom/schema/registry.js` (+ `component.js`, `hook.js`, `wire.js`)

**What it does**

`LoomRegistry` is loom's real L0 — the disk-first store for every declared component, seam, hook, wire, and concern (`KINDS = ['component', 'seam', 'hook', 'wire', 'concern']`). It is explicitly not a Warp Gate: *"Gates are pure per Warp's own design law... Disk I/O is a side effect. This class is the thing Gates' output gets handed to, living in the driver layer."*

**How it works internally**

Constructed with a `dataDir`, loads `registry.json` into `_state` on construct. `has(kind, id)` and `get(kind, id)` both **re-read from disk before answering** — a real fix (§FIX 2026-07-02) for a bug where two separate `LoomDriver` instances pointed at the same `dataDir` (a real CLI process and a real API process) couldn't see each other's writes, because `_state` was loaded once at construct time and never refreshed. `add(kind, record)` throws on duplicate id (callers should `has()`-check first — this is the enforcement backstop, not the primary gate), persists to disk immediately, then fire-and-forgets a write into `cortex-sync`.

`graph()` returns `{nodes, edges, components}` — hooks with `{id, component_id, type, direction}`, wires with `{from, to, id, intent}` (the *why* a wire exists — was silently dropped before a 2026-07-10 fix, now preserved). `contextGraph()` resolves wires to the components on each end so a relation reads "component A → component B: `<intent>`" instead of "hook → hook." `impactOf(componentId, maxDepth=8)` walks the relation graph transitively — "if this component's SEAM breaks, what depends on it and what intents fail downstream" — real blast-radius analysis, not a stub.

**Real schema fields** (unchanged, restated for this atlas — see `architecture-spec`'s own schema module for the generalized version):
- `Component`: `{id, namespace, name, version}` required
- `Hook`: `{id, component_id, name, type, direction}` required — `type` is an open seed list (`api`, `event_bus`, `callto`, `direct`, `webserver`, `cli`), not a closed enum
- `Wire`: `{id, from_hook_id, to_hook_id}` required, `intent` optional

**Commands**

| Command | Operates on | What it does |
|---|---|---|
| `loom.schema.has` | one node, any kind | re-reads disk, returns boolean |
| `loom.schema.get` | one node, any kind | re-reads disk, returns the record or null |
| `loom.schema.all` | every node of one kind | re-reads disk, returns the full map |
| `loom.schema.add` | one new node | disk-first write, then async cortex-sync |
| `loom.schema.graph` | the whole registry | returns `{nodes, edges, components}` |
| `loom.schema.contextGraph` | the whole registry | same, resolved to component-level relations with intent |
| `loom.schema.impactOf` | one component id, transitively | blast-radius analysis, up to `maxDepth` hops (default 8) |

**How to use it**

```javascript
const { LoomRegistry } = require('./loom/schema/registry.js');
const reg = new LoomRegistry({ dataDir: './loom/data' });
reg.add('component', { id: 'my.component', name: 'My Component' });
const impact = reg.impactOf('my.component');
// { component, directDependents, transitiveDependents, brokenIntents }
```

**HTTP routes** (from `loom.spec`'s real route list — the more authoritative of the two real sources this session found; see note under Sovereignty above about its partial disagreement with `registry-components.js`)

```
GET  /api/hooks              → hookRegistry contents, optional ?id=
GET  /api/registry/:kind/:id → driver.registry.get(kind, id)
GET  /api/graph               → full component/hook/wire graph
GET  /api/context-graph        → context graph view
GET  /api/impact/:id            → impact analysis for one component
POST /api/register                → the real write path every declare() call reaches
GET  /api/component/:id              → single component lookup
```

**What it connects to**

- `cortex-sync` — every `add()` fires a write into it, fire-and-forget
- every other NEXUS system — as the shared registry authority, via HTTP, not `require()`

**Bus events emitted**

Not enumerated — `loom.spec`'s own honest statement: *"the specific emitted event-name vocabulary was not enumerated this pass... recorded honestly as unenumerated rather than guessed."* `server.js` maintains an SSE client set and fans out registry mutations to it, but by raw pathname/method match, not a declared `events.emits[]` list.

---

### contracts

**id:** `loom.contracts`
**path:** `loom/contracts/index.js`

**What it does**

`LoomContracts` — lifecycle contract state. Exposed at `GET /api/contracts`, `POST /api/contracts` (create), `POST /api/contracts/:id/handoff`, `POST /api/contracts/:id/close` (per `registry-components.js`'s real declarations).

**How it works internally**

Not read directly this session — file confirmed to exist, internals not grounded. Stated honestly rather than inferred from the module name.

**Commands / How to use it / Bus events emitted**

Not grounded this session.

**HTTP routes**

```
GET  /api/contracts               → LoomContracts live state
POST /api/contracts                 → create an interaction contract
POST /api/contracts/:id/handoff       → hand off a contract
POST /api/contracts/:id/close           → close a contract
```

**What it connects to**

`schema` — contracts presumably reference components/hooks it declares, not confirmed from source this session.

---

### cortex-sync

**id:** `loom.cortex-sync`
**path:** `loom/schema/cortex-sync.js`

**What it does**

The durable write path from loom's registry into cortex — wired into every registry mutation as of 2026-07-04. Before this was wired, `registry.json` was, in `registry.js`'s own words, "the only place any of this ever landed."

**How it works internally**

Called fire-and-forget from `registry.js`'s `add()` method: `try { require('./cortex-sync').record('add', kind, this._state[kind][record.id]); } catch (_) {}`. Buffer-safe by design — per `registry.js`'s comment, this cannot make `add()` itself fail or block on cortex being reachable.

**Commands**

| Command | Operates on | What it does |
|---|---|---|
| `loom.cortex-sync.record` | one just-added node | writes it into cortex's real `loom_events` table, fire-and-forget |

**What it connects to**

`schema` — the sole caller. `cortex` — the write target, via the same `lib/cortex-write.js` guardian/eravos/copilot/ollama already use.

---

### ingest

**id:** `loom.ingest`
**path:** `loom/ingest/index.js`

**What it does**

`LoomIngest.ingestZip` — sha256 identity, unzip listing, parent-diff lineage for ingested archives. Wired to `POST /api/ingest` and `POST /api/ingest-upload` on 2026-07-05.

**How it works internally**

Not read directly this session.

**HTTP routes**

```
POST /api/ingest         → LoomIngest.ingestZip payload → sha256 identity + parent-diff lineage
POST /api/ingest-upload    → upload variant of the above
GET  /api/revisions          → ingest.revisions — real revision history from LoomIngest
```

**What it connects to**

Not confirmed from source this session.

---

### system-scaffold

**id:** `loom.system-scaffold`
**path:** `loom/templates/system-scaffold.js`

**What it does**

`scaffoldSystem()` — takes an operations-list payload and projects it into a generated CLI+API+contract shape. Wired to `POST /api/scaffold` on 2026-07-05 (built earlier, connected in the same pass as `ingest`).

**How it works internally**

Not read directly this session.

**HTTP routes**

```
POST /api/scaffold    → operations-list payload → generated CLI+API+contract projection
GET  /api/templates      → available system-scaffold templates
```

**What it connects to**

Not confirmed from source this session — plausibly the same generalized scaffold concept `architecture-spec`'s own `file-tree-plan.js`/`createFileTreeSpec()` implement, but that connection is not confirmed here, only noted as a real open question.

---

### phasemap-map

**id:** `loom.phasemap-map`
**path:** `loom/scanners/phasemap-map.js`

**What it does**

Real phasemap aggregation scanner. `loadAll()` / `forSystem(system)` are, per `loom.spec`, "the same... every session's own phasemap-writing verifies against before commit." Wired to `GET /api/phasemap[/:system]` on 2026-08-08 — the scanner existed as a pure lib module with no endpoint until then.

**How it works internally**

Not read directly this session.

**HTTP routes**

```
GET /api/phasemap             → every real phasemap in the tree
GET /api/phasemap/:system       → one system's phasemap
GET /api/phasemap/history/:id     → phasemap history for one entry
```

---

### spec-map

**id:** `loom.spec-map`
**path:** `loom/scanners/spec-map.js`

**What it does**

The §6.3 spec-coverage scanner — checks which real `.spec` files loom knows about.

**How it works internally**

Not read directly this session. What *is* confirmed, directly from `loom.spec`'s own gaps section: its `SPEC_DIRS` allowlist does **not** include `loom/spec` itself — loom's own spec-coverage scanner cannot see loom's own spec. Same real gap class as `clear-glass.spec`'s SM1 and `architecture-spec.spec`'s AS2.

**What it connects to**

Every system's `spec/` directory it's configured to scan — `loom/spec` conspicuously absent from that list.

---

## Modules Not Yet Built

None for the phasemap-section feature specifically — `docs/loom-phasemap-section-phasemap.spec` closes with all three of its own phases (LP1/LP2/LP3) marked done, and the spec's own final line states "REMAINING: none — spec closed." Migrating those same three phases into per-system node files was executed this session (see Phases above), so that step is no longer open either.

Beyond that feature, no other specced-but-unbuilt loom module was identified in the files reviewed this session — every module in `loom.spec`'s `modules:` list corresponds to a real, existing file. loom's own `GET /api/phasemap` reports 45 pending phases NEXUS-wide (out of 95 total, across 19 systems) — but attributing any of those specifically to loom itself would require pulling `phasemap-map.js`'s actual per-system output, not done this session. Stated as a real gap in this atlas's own coverage, not papered over with a guess.

---

## Module Conflict Registry

Not found in the files reviewed this session.

---

## Build & Run Reference

```bash
LOOM_PORT=3752 node loom/server.js   # real, from loom.spec's core.port + env_override
```

Not expanded further — this session did not read `loom/server.js` or `package.json` directly.

---

## Version History

**Source:** hand-maintained — `loom.spec`'s own `history:` and `version_history:` sections. No live Versionium wiring confirmed for loom in the files reviewed.

| Commit | Branch | Message | Author | Timestamp | Caused By |
|---|---|---|---|---|---|
| — | main | L3 (API) + L4 (handshake) added on top of the pre-existing L0 registry | James Brooks | 2026-07-02 | loom found to be the only real system missing the standard L0-L5 shape |
| — | main | cortex-sync.js wired into every registry mutation | James Brooks | 2026-07-04 | — |
| — | main | ingest and system-scaffold endpoints wired | James Brooks | 2026-07-05 | both built earlier, never connected |
| — | main | /api/phasemap[/:system] wired | James Brooks | 2026-08-08 | scanner existed as pure lib module, never had an endpoint |
| 1.5.0 | main | First .spec written for loom | James Brooks | 2026-09-01 | closing one of 11 real gaps orchestrator/lib/spec-drift.js's live check reported |

**Known caveats:** loom's own spec-map scanner doesn't see loom's own spec (SM2); loom's emitted-event vocabulary is unenumerated (LM1-events) — both real, both open as of `loom.spec`'s own `gaps.as_of: 2026-09-01`.

---

## Copyright

Copyright © 2026 James Brooks (Erosmancer). Part of the rheon.world / NEXUS ecosystem.
