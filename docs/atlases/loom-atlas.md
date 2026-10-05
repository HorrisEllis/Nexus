# loom — Sovereign Component / Hook / Wire Registry

> **v1.5.1 (active)** · 7 modules · the registry every phasemap/spec-drift/capability check in NEXUS already depends on · L0 registry predates its own L3/L4 surface by unknown time — first added API access 2026-07-02

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

`loom/scanners/phasemap-map.js` exports `loadAll`, `forSystem`, `summary`, `historyFor`, `persistHistory`, `isPhasemapFile` and `parsePhasemapText`. `parsePhasemapText` turns one phasemap's text into phase rows (key-form phases and list-form `- id: X1` phases). Two other systems read phasemaps through it rather than parsing them again: `idearium/repo/roadmap.js` (a repo's roadmap) and the phases manager. The rest of the file, including how `loadAll` finds and tags each phasemap, is not described here.

A phase's `depends_on` is read by the file's `_list()` helper, which accepts three forms: a flow list `[A, B]`, a comma list `A, B` and a dash list `- A - B`. The rule for the end of a list changed in 0.39.275: a flow list ends at its own `]`, and whatever follows is a YAML comment. Before that, `depends_on: [S3, C1]  # why` was read as the items `S3` and `C1] # why`, so the edge to `C1` was lost and a phase could show as ready while `C1` was still open. A block or bare list has no `]`, so only a trailing ` # …` is cut there. Resolving a name to a phase (including a phase in another phasemap) is not done here; that belongs to `idearium/repo/roadmap.js`.

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
| 1.5.1 | main | phasemap-map `_list()` ends a flow list at its `]`; a trailing `# comment` is no longer a dependency | James Brooks | 2026-09-28 | staging-self-heal S4's edge to C1 was being dropped (0.39.275) |

**Known caveats:** loom's own spec-map scanner doesn't see loom's own spec (SM2); loom's emitted-event vocabulary is unenumerated (LM1-events) — both real, both open as of `loom.spec`'s own `gaps.as_of: 2026-09-01`.

---

<!-- generated:registry:start -->

## What the registry knows (generated)

> Generated by `scripts/generate-atlases.js` from loom's registry and events (loom/data/registry.json, loom/data/events.json — data, outside the snapshot, so written plain) and the tree itself, 2026-10-05. Everything between the markers is rewritten on the next run — write narrative above them. The same facts, one component at a time, are what `lib/registry-harness.js` hands a repo agent (loom.card.tool).

**72** files · **60** code files · **25** registry components declared here · **1** events emitted · **0** heard · **25** routes · **17** code files with a covering test

### Routes (25)

- GET /api/context-graph — Context graph for a scope · declared in `loom/registry-components.js`
- GET /api/friction — Per-system friction score, proxied live from the diagnostic kernel (:7825) · declared in `loom/registry-components.js`
- GET /api/gaps — Every open gap, system + user-model domains, agnostic pipeline · declared in `loom/registry-components.js`
- GET /api/gaps/:domain — Open gaps for one domain (system / user-model) · declared in `loom/registry-components.js`
- GET /api/graph — The wire graph — nodes and edges of NEXUS · declared in `loom/registry-components.js`
- GET /api/hooks — List hooks — the registry loom is write authority for · declared in `loom/registry-components.js`
- GET /api/impact/:id — Blast-radius / impact query for a component · declared in `loom/registry-components.js`
- GET /api/phasemap — Every phase across every phasemap, tagged by system + status · declared in `loom/registry-components.js`
- GET /api/phasemap/:system — One system's roadmap — done/pending phase breakdown · declared in `loom/registry-components.js`
- GET /api/registry/:kind/:id — Read a registry entry (component/seam/wire) · declared in `loom/registry-components.js`
- GET /api/revisions — List registry revisions · declared in `loom/registry-components.js`
- GET /api/revisions/:id — Read one revision · declared in `loom/registry-components.js`
- GET /api/templates — Available scaffold templates · declared in `loom/registry-components.js`
- GET /api/tension — Per-system tension (friction + gap accumulation), proxied live from the diagnostic kernel · declared in `loom/registry-components.js`
- GET /health — Loom health — hooks.total + components.total it owns · declared in `loom/registry-components.js`
- POST /api/contracts — Create an interaction contract · declared in `loom/registry-components.js`
- POST /api/contracts/:id/close — Close a contract · declared in `loom/registry-components.js`
- POST /api/contracts/:id/handoff — Hand off a contract · declared in `loom/registry-components.js`
- POST /api/hooks — Create/update a hook (write authority) · declared in `loom/registry-components.js`
- POST /api/hooks/unwire — Remove a hook binding · declared in `loom/registry-components.js`
- POST /api/hooks/wire — Wire a hook→hook binding (fromId→toId) — the consumer-edge write path · declared in `loom/registry-components.js`
- POST /api/ingest — Ingest a component descriptor into the registry · declared in `loom/registry-components.js`
- POST /api/ingest-upload — Ingest via file upload · declared in `loom/registry-components.js`
- POST /api/registry/:kind — Write a registry entry · declared in `loom/registry-components.js`
- POST /api/scaffold — Scaffold a new system from a spec · declared in `loom/registry-components.js`

### Events it emits (1) — and who hears them

- **idearium.repo.file.write** — from `loom/seed/2026-07-11-session-wires.js` → no listener in the tree (heard over HTTP/SSE, or by nobody)

### Files, directory by directory (14 directories)

#### `loom/`

5 code · 2 other file(s).

- `loom/bootstrap.js` (359 lines) — seeds loom/data/registry.json. v2: replaces the earlier monolithic 'nexus.warp' single-component  
  requires 18 · required by 0
- `loom/config.js` (20 lines) — real, distinct config, not inline constants scattered across loom/server.js. Matches the pattern established by  
  exports PORT, DIAG_URL, OR_URL · requires 0 · required by 1
- `loom/doc-generator.js` (116 lines) — R6: documentation generated from what's real, not hand-maintained prose that can drift  
  exports generateSystemDoc, generateOverview, generateAll, OUT_DIR, MODULE_ID, VERSION
- `loom/registry-components.js` (75 lines) — loom/registry-components.js Declares every LOOM capability to the orchestrator on boot.
- `loom/server.js` (690 lines) — Sovereign LOOM system Port: 3752  
  exports server, driver, contracts · requires 5 · required by 0
- other: `loom/compartment.json`, `loom/interaction-contract.json`

#### `loom/agent-suite/`

1 code file(s).

- `loom/agent-suite/index.js` (220 lines)  
  exports LoomAgentSuite · requires 1 · required by 0 · tested by `loom/test/agent-suite.test.js`

#### `loom/contracts/`

1 code file(s).

- `loom/contracts/index.js` (204 lines)  
  exports LoomContracts, ContractRegistry · requires 1 · required by 0 · tested by `loom/test/contracts.test.js`

#### `loom/ingest/`

2 code file(s).

- `loom/ingest/index.js` (164 lines)  
  exports LoomIngest · requires 1 · required by 0 · tested by `loom/test/ingest.test.js`
- `loom/ingest/revisions.js` (83 lines) — disk-first store for ingested revisions. Phase: 144 (this session — drag-and-drop-equivalent ingest, backend half)  
  exports RevisionRegistry · requires 0 · required by 1

#### `loom/lib/`

1 code file(s).

- `loom/lib/changelog.js` (55 lines) — recordVersion({version, changes, releasedAt}) — real, append-only. Refuses (not throws) a duplicate version — a version string is  
  exports recordVersion, getChangelog, getVersion, TABLE · requires 1 · required by 0 · tested by `tests/lib/mco05-loom-changelog.test.js`

#### `loom/maps/`

15 code file(s).

- `loom/maps/accounts-authority-map.js` (70 lines) — Clear Glass account authority + login portals + sealed vaults (v0.39.223). Same shape as ui-map.js / warp-map.js.  
  exports mapAccountsAuthority, FILES · requires 0 · required by 1
- `loom/maps/agent-memory-map.js` (107 lines) — 0.39.267–269: the agent-provider list, agent memory over the Clear Glass download manager, and copilot's activity recall, mapped into LOOM one component per FILE with every REAL edge as a wire:  
  exports mapAgentMemory, FILES, BOUNDARY_EXPORTS, CONSUMERS, BOUNDARY_IMPORTS · requires 1 · required by 1
- `loom/maps/build-surface-map.js` (99 lines) — 0.39.280: docs/2026-09-29-build-surface-phasemap.spec mapped into LOOM, one component per FILE with every REAL edge as a wire. Mirrors loom/maps/chat-ledger-map.js.  
  exports mapBuildSurface, FILES, CONSUMERS · requires 1 · required by 1
- `loom/maps/chat-ledger-map.js` (69 lines) — 0.39.278: the live chat ledger (Clear Glass download manager), the page-side stream that feeds it, and the co-pilot pane's kept conversation, mapped into LOOM one component per FILE with every REAL  
  exports mapChatLedger, FILES, CONSUMERS · requires 1 · required by 1
- `loom/maps/copilot-capability-map.js` (367 lines)  
  exports mapCopilotCapability, FILES · requires 0 · required by 1
- `loom/maps/cos-testenv-map.js` (78 lines) — the COS test VM (0.39.264), ErosmancerOS started by Clear Glass, and the Eravos → Idearium "new organism" path, mapped into LOOM one component per FILE, with every REAL edge  
  exports mapCosTestenv, FILES · requires 1 · required by 1
- `loom/maps/economy-map.js` (105 lines) — 0.39.281: docs/2026-09-29-provider-economy-phasemap.spec mapped into LOOM, one component per FILE with every REAL edge as a wire. Mirrors loom/maps/build-surface-map.js.  
  exports mapEconomy, FILES, CONSUMERS · requires 1 · required by 1
- `loom/maps/idearium-codebase-map.js` (125 lines) — 0.39.273: idearium's codebase toolkit (structural chunker v2, chunk cards, the search index, the edit engine, the /api/repos/:uuid/code/* surface and the eleven agent code tools), mapped into  
  exports mapIdeariumCodebase, FILES, BOUNDARY_EXPORTS, CONSUMERS, BOUNDARY_IMPORTS · requires 1 · required by 1
- `loom/maps/ledger-wire-person-model-map.js` (148 lines)  
  exports mapLedgerWirePersonModel, FILES, CONSUMER_EDGES
- `loom/maps/observability-map.js` (228 lines) — maps the observability/tablet arc's components into LOOM's component/hook/wire registry, one component per FILE, wired only by  
  exports mapObservability, FILES · requires 0 · required by 1
- `loom/maps/one-idearium-map.js` (170 lines) — 0.39.271: the Phases manager, the living spec, the COS debug report and the per-system node generator, mapped into LOOM one component per FILE with every real edge as a wire.  
  exports mapOneIdearium, FILES, BOUNDARY_EXPORTS, CONSUMERS, BOUNDARY_IMPORTS · requires 1 · required by 1
- `loom/maps/raid-events-and-tools-map.js` (124 lines) — registers this session's own real, new/touched components (RAID's real event-taxonomy + ledger  
  exports mapRaidEventsAndTools, FILES · requires 0 · required by 1
- `loom/maps/session-2026-08-14-map.js` (473 lines) — maps the three genuinely NEW components this session created (lib/agent-system/contracts.js, submit.js,  
  exports mapSession20260814, FILES · requires 0 · required by 1
- `loom/maps/ui-map.js` (107 lines) — maps plain UI files (not tools, not backend modules) into LOOM's component/hook/wire registry, one component per  
  exports mapUi, FILES · requires 0 · required by 1
- `loom/maps/warp-map.js` (102 lines) — maps Warp's own files into LOOM's component/ seam/hook/wire registry, one component per FILE, not one per library.  
  exports mapWarp, FILES · requires 0 · required by 1

#### `loom/scanners/`

10 code file(s).

- `loom/scanners/capability-map.js` (277 lines)  
  exports mapCapabilities, loadAll, verifyRoutes, resolveWires, SYSTEMS · requires 0 · required by 4
- `loom/scanners/closed-door.js` (187 lines)  
  exports scan, DEFAULT_SCAN_DIRS, EXCLUDE_PATTERNS · requires 0 · required by 2
- `loom/scanners/dangling-report.js` (108 lines)  
  exports report, classify · requires 1 · required by 1
- `loom/scanners/event-taxonomy-map.js` (156 lines) — the EVENT TAXONOMY layer of loom's self-model, mirroring loom/scanners/phasemap-map.js's real, existing  
  exports loadAll, forSystem, summary, findEvent, MODULE_ID, VERSION · requires 1 · required by 1
- `loom/scanners/mock-data-finder.js` (126 lines)  
  exports scan, PATTERNS · requires 1 · required by 1 · tested by `tests/modules/test-mock-data-finder.js`
- `loom/scanners/phasemap-map.js` (493 lines) — the PHASEMAP layer of loom's self-model James: "consolidate all the phasemaps, split them by system, add it as an  
  exports loadAll, parsePhasemapText, isPhasemapFile, forSystem, summary, persistHistory +5 · requires 0 · required by 7 · tested by `loom/test/phasemap-map.test.js`, `tests/modules/test-loom-phasemap-status.js`
- `loom/scanners/source-map.js` (381 lines)  
  exports scanTree, mapSource, eventMap, eventsOf, idFor, stripNonCode +4 · requires 0 · required by 11 · tested by `tests/modules/test-component-store.test.js`, `tests/modules/test-dangling-hooks-and-idearium-load.test.js` +1
- `loom/scanners/spec-map.js` (247 lines)  
  exports mapSpecs, parseSpecs, listSpecs, checkRegistryCoverage, checkRoutesServed, joinToCapabilities +1 · requires 1 · required by 1
- `loom/scanners/stub-finder.js` (162 lines)  
  exports scan, MARKER_RE, THROW_NOT_IMPL_RE, MOCK_IDENTIFIER_RE, NEGATION_RE · requires 1 · required by 1 · tested by `tests/modules/test-stub-finder.js`
- `loom/scanners/wiring-gaps.js` (103 lines)  
  exports scanAndReport, MODULE_ID, VERSION · requires 3 · required by 0

#### `loom/schema/`

12 code file(s).

- `loom/schema/axioms.js` (75 lines) — Warp Axioms enforcing LOOM's referential integrity. These are what a bare Gate can't do: a Gate only sees the  
  exports makeLoomAxioms · requires 1 · required by 1
- `loom/schema/component.js` (22 lines) — Component: a named, versioned unit of the system. Mirrors architect/registry-components.js's _c() shape.  
  exports COMPONENT_SCHEMA · requires 0 · required by 1 · tested by `tests/loom-schema-split.test.js`
- `loom/schema/concern.js` (32 lines) — Concern: a real, detected roadmap item. §BUILT 2026-07-14 — "a roadmap that loom automatically builds from...  
  exports CONCERN_SCHEMA · requires 0 · required by 1 · tested by `tests/loom-schema-split.test.js`
- `loom/schema/cortex-sync.js` (119 lines) — durable persistence + session recovery for LOOM §GAP CLOSED 2026-07-02: LOOM's registry (registry.js) only ever wrote to  
  exports record, getLastSessionContext · requires 1 · required by 1
- `loom/schema/definitions.js` (39 lines) — LOOM Phase 131: component/seam/hook/wire schema.  
  exports KNOWN_HOOK_TYPES, COMPONENT_SCHEMA, SEAM_SCHEMA, HOOK_SCHEMA, WIRE_SCHEMA, CONCERN_SCHEMA · requires 5 · required by 2 · tested by `tests/loom-schema-split.test.js`, `tests/node-schemas-split.test.js`
- `loom/schema/driver.js` (101 lines) — the one function outside code calls: declare(). Wires the four Gates + five Axioms into a real Warp Stream+StreamLog,  
  exports LoomDriver · requires 4 · required by 1
- `loom/schema/gates.js` (204 lines) — Warp Gates for LOOM's four declaration types. Each Gate is pure per Warp's design law: matches(event) -> bool,  
  exports componentDeclareGate, seamDeclareGate, hookDeclareGate, wireDeclareGate, concernDeclareGate · requires 2 · required by 1
- `loom/schema/hook.js` (39 lines) — Hook: a named, typed wire endpoint on one component. Directly the Architect spec's own primitive: "a named,  
  exports HOOK_SCHEMA, KNOWN_HOOK_TYPES · requires 0 · required by 1 · tested by `tests/loom-schema-split.test.js`
- `loom/schema/index.js` (14 lines) — public surface of Phase 131. Everything CLI (Phase 132) and API (Phase 133-adjacent, per the stated  
  exports LoomDriver, definitions · requires 2 · required by 9 · tested by `loom/test/contracts.test.js`, `loom/test/schema.test.js`
- `loom/schema/registry.js` (244 lines) — disk-first store for declared components, seams, hooks, and wires.  
  exports LoomRegistry, KINDS · requires 1 · required by 1 · tested by `tests/modules/loom-context-intent.test.js`, `tests/modules/test-dangling-hooks-and-idearium-load.test.js`
- `loom/schema/seam.js` (23 lines) — Seam: a named boundary a component exposes or crosses. "Seam" means what it means across the rest of NEXUS's own  
  exports SEAM_SCHEMA · requires 0 · required by 1 · tested by `tests/loom-schema-split.test.js`
- `loom/schema/wire.js` (16 lines) — Wire: the connection between exactly two hooks. §SPLIT 2026-09-03 — see component.js's header for the split rationale.  
  exports WIRE_SCHEMA · requires 0 · required by 1 · tested by `tests/loom-schema-split.test.js`

#### `loom/schemas/`

1 code · 7 other file(s).

- `loom/schemas/index.js` (51 lines) — // loom/schemas/index.js — loom's own, fully sovereign schema registry. //  
  exports get, list, SCHEMAS, MODULE_ID, VERSION · requires 1 · required by 0
- other: `loom/schemas/schema.capability`, `loom/schemas/schema.command`, `loom/schemas/schema.component`, `loom/schemas/schema.hook`, `loom/schemas/schema.node`, `loom/schemas/schema.system`, `loom/schemas/schema.wire`

#### `loom/seed/`

1 code file(s).

- `loom/seed/2026-07-11-session-wires.js` (167 lines) — loom/seed/2026-07-11-session-wires.js §NEW 2026-07-11 — every wire found broken or missing this session,  
  requires 1 · required by 0 · emits idearium.repo.file.write

#### `loom/spec/`

2 other file(s).

- other: `loom/spec/loom.node-taxonomy.md`, `loom/spec/loom.spec`

#### `loom/templates/`

1 code file(s).

- `loom/templates/system-scaffold.js` (616 lines)  
  exports main, dispatch, createServer, PORT, scaffoldSystem · requires 1 · required by 0 · tested by `loom/test/system-scaffold.test.js`

#### `loom/test/`

10 test file(s).


#### `loom/ui/`

1 other file(s).

- other: `loom/ui/index.html`

<!-- generated:registry:end -->

---

## Copyright

Copyright © 2026 James Brooks (Erosmancer). Part of the rheon.world / NEXUS ecosystem.
