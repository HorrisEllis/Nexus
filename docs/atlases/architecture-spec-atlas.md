# architecture-spec — Capability Node / Associative Lattice Runtime

> **v0.3.0 (draft)** · 4 modules built · 2 modules specced-not-built · scaffold pattern every new sovereign NEXUS system builds with · zero external runtime dependencies

**Author:** James Brooks (Erosmancer) · rheon.world
**License:** matches the parent NEXUS repository's license

| Repo | Description |
|---|---|
| **architecture-spec** (this) | The seam over `genesis.spec`, `loom/schema/*.js`, and `guardian/lib/node-registry.js` — schema, compiler, watcher, and self-diagnostics for any new system |

---

## What It Is

architecture-spec is the base every new sovereign NEXUS system is scaffolded with, before any feature code exists. A system built to this spec declares itself as a set of capability nodes — components, hooks, and wires — and compiles those declarations into an associative lattice: a graph that proves what actually connects to what, instead of assuming it.

It's not a new invention. It's a consolidation of three things NEXUS already runs in production but that live apart: `genesis.spec` (the sovereign-system grammar), `loom/schema/*.js` (the real component/hook/wire schema), and `guardian/lib/node-registry.js` (the real JAA-backed per-type watcher and ledger). This atlas is the first end-to-end test of that consolidation — everything below this line that isn't in "Modules Not Yet Built" has actually been run.

---

## Quick Start

```bash
npm install
node .architecture/compiler/lattice.js   # compile the current node graph
node .architecture/registry/watcher.js    # start the live per-type index
```

```
components indexed: [ 'my-system.ingest', 'my-system.newthing' ]
hooks indexed: [ 'ingest.on_push', 'upstream.emit_push' ]
```

**Tested:** Node.js (container runtime, this session) · verified via direct execution against sample node files, not simulated

---

## File Structure

```
architecture-spec/
  .architecture/
    schema/
      component.js       real, tested
      hook.js             real, tested
      wire.js              real, tested
      bundle.js             real, tested
    compiler/
      lattice.js            real, tested — resolves edges, flags orphans
    registry/
      watcher.js             real, tested — live per-type index + ledger
      friction.js              real, tested — self-diagnostic scoring
    nodes/                     empty on fresh scaffold
      component/
      hook/
      wire/
      bundle/
  architecture-spec.spec        the living model — meta/core/events/routes/modules/gaps
  architecture-spec.template.yaml   the decoupled shell this system's own .spec was written against
  atlas-template.md              the decoupled shell this document was written against
```

| Path | Node kind it holds | Contains |
|---|---|---|
| `.architecture/schema/` | none — code, not node data | Component/Hook/Wire/NodeBundle validators |
| `.architecture/compiler/` | none | the lattice compiler |
| `.architecture/registry/` | none | the watcher and the friction/tension scorer |
| `.architecture/nodes/` | component, hook, wire, bundle | declared node files — empty until a project fills them |

---

## Architecture

### Spine

No single spine — this system has two independent real mechanisms: the lattice compiler (a pure read-and-project function, invoked, not event-driven) and the registry watcher (an `fs.watch`-driven listener, event-driven). They don't share a dispatch path; a project adopting this pattern that wants one universal spine would need to bind both through `genesis.spec`'s WARP binding table, which this system does not do itself.

### Governing axioms

| Name | Statement | Rationale |
|---|---|---|
| `SMALLEST_UNIT` | One component = one file = one intent, nothing bundled into a single file | An agent working on one node should never need more than that node's own file plus its directly-wired neighbors in context |
| `SPEC_IS_LIVING_MODEL` | A `.spec` is edited as the real system changes, in place, with `version_history` as the audit trail | Matches real behavior already observed in `clear-glass.spec`, `warp.spec` |
| `HARDLINE_AS_LITTLE_AS_POSSIBLE` | Anything that can plausibly change is a node, not a literal in a file | Generalizes `CONFIG_OUTSIDE_CODE` past config to any dynamic fact |
| (orphan-free, no-stub-in-production, lattice-stability) | see `architecture-spec.spec` `core.axioms` | proposed, no AX code assigned yet |

### Boundaries (documentation clarity)

| Term | Definition | Distinguished from |
|---|---|---|
| Node | A declared fact: this component/hook/wire exists, here is its shape | `Chunk` — a unit of dispatch (send this prompt to an agent, verify the result). A chunk may produce a node's file; the node itself is never generated content |

### Seams (structural isolation)

None declared yet in this system's own node files — `genesis.spec`'s `SEAM_IS_DUMB` concept is adopted as a principle but no concrete seam has been recorded here, since this system has no compartments of its own yet to be isolated from each other.

### Sovereignty (cross-system contract)

| Other system | May read | May never write | Enforced by |
|---|---|---|---|
| any | this system's compiled `lattice.json`, `api-routes.json` (once built) | this system's `.architecture/nodes/`, `ledger/`, `data/` | process-level: no other system's process holds a write handle into this one's data directories — stated as the rule; not yet mechanically tested in this session |

### Pulse (liveness)

Not applicable. This system has no peers yet to announce itself to — it is a scaffold pattern, not a running networked service in this test.

### Self-diagnostics (structural strain)

| Metric | Computed from | Formula | Exposed at |
|---|---|---|---|
| `friction` | `lattice.orphans.length` + `gaps.entries` open count | `orphanCount + openGapCount` | `.architecture/registry/friction.js` — real, run this session: **5** |
| `tension` | friction + gap accumulation in a 30-day window | `friction + (opened − closed)` | same file — real, run this session: **9** |

### Config layers

Not yet differentiated — no per-component override has been built; `HARDLINE_AS_LITTLE_AS_POSSIBLE` is a stated principle for future modules, not yet demonstrated with a real layered config.

### Phases

Not formalized for this system itself yet — the four built modules were produced in a single design-and-test session, not through a declared multi-phase build process.

### Component status

| Status | Meaning | Entry condition | Exit condition |
|---|---|---|---|
| `stub` | declared, incomplete | file created with id/type only | all required fields filled → `wired` |
| `wired` | all required fields present | `intent`, `capability`, `hooks` non-empty | every hook resolves, transitively → `verified` |
| `verified` | passed all validation gates | zero orphans in the compiled lattice | — |

*(the four built modules below are code, not node instances, so this state machine hasn't been exercised on them directly yet — it applies to nodes a project using this scaffold would declare)*

---

## The Modules

---

### capability-node-schema

**id:** `architecture-spec.capability-node-schema`
**node file:** not yet declared as its own node — this module IS the schema nodes are checked against

**What it does**

Defines and validates the three declared file types a new system uses to describe itself: `component`, `hook`, `wire`, plus this spec's own addition, `bundle`. Nothing exists in a system's lattice until one of these exists for it.

**How it works internally**

Each type has a frozen `requiredKeys`/`types` object and a `check*()` function doing presence + `typeof` validation — the same minimal-validator shape `loom/schema/*.js` uses, restated unchanged for `component`/`hook`/`wire`. `hook.type` is deliberately an open seed list (`api`, `event_bus`, `callto`, `direct`, `webserver`, `cli`), not a closed enum. `bundle` is reference-only — `{bundle_id, members}` — and never merges files.

**Commands**

| Command | Operates on | What it does |
|---|---|---|
| `architecture-spec.check-component` | any file in `.architecture/nodes/component/` | validates required keys and types, returns `{ok, missing, wrongType}` |
| `architecture-spec.check-hook` | any file in `.architecture/nodes/hook/` | same, plus validates `direction` against `in\|out\|bidirectional` |
| `architecture-spec.check-wire` | any file in `.architecture/nodes/wire/` | validates `id`/`from_hook_id`/`to_hook_id` |
| `architecture-spec.check-bundle` | any file in `.architecture/nodes/bundle/` | validates `bundle_id` and that `members` is an array |

**How to use it**

```javascript
const { checkComponent } = require('./.architecture/schema/component.js');
const result = checkComponent({ id: 'sys.ingest', namespace: 'sys', name: 'ingest', version: '0.1.0' });
// { ok: true, missing: [], wrongType: [] }
```

**HTTP routes**

None — these are file-level validators, not a running service.

**What it connects to**

- `lattice-compiler` — via no formal hook/wire yet (both are code modules, not declared nodes in this test run) — the compiler imports these four `check*()` functions directly

**Bus events emitted**

None.

---

### lattice-compiler

**id:** `architecture-spec.lattice-compiler`

**What it does**

Reads every component/hook/wire node file, resolves every wire's two hook ends against real node ids, and produces a compiled lattice — the wiring as proven, not as claimed. Any hook whose wire target doesn't resolve is recorded as an orphan.

**How it works internally**

Stateless between runs — every call reads every node file fresh from `nodesDir`, builds a `nodes` map (id → kind/status), then walks every wire file resolving `from_hook_id`/`to_hook_id` against the hooks it found. Unresolved ids go into `orphans` (deduplicated); resolved pairs become `edges`, each carrying the wire's `intent`.

**Real test run this session**, against 1 component, 2 hooks, 2 wires (one deliberately dangling):

```json
{
  "generated": "2026-09-22T14:47:37.121Z",
  "nodes": {
    "my-system.ingest": { "kind": "component", "status": "stub" },
    "ingest.on_push": { "kind": "hook", "status": "stub" },
    "upstream.emit_push": { "kind": "hook", "status": "stub" }
  },
  "edges": [
    { "from": "upstream.emit_push", "to": "ingest.on_push", "intent": "upstream forwards new records for ingest to process" }
  ],
  "orphans": ["nowhere.hook"]
}
```

**Commands**

| Command | Operates on | What it does |
|---|---|---|
| `architecture-spec.compile-lattice` | every file in `.architecture/nodes/{component,hook,wire}/` | produces `CompiledLattice`, printed above with real output |

**How to use it**

```javascript
const { compileLattice } = require('./.architecture/compiler/lattice.js');
const lattice = compileLattice({ nodesDir: './.architecture/nodes' });
```

**HTTP routes**

None yet — target surface: `GET /<system>/lattice`, read-only.

**What it connects to**

- `capability-node-schema` — reads its files directly, no formal wire declared between them in this test
- `friction-tension` — consumes `lattice.orphans` as one of its two real inputs

**Bus events emitted**

None yet — target: `architecture-spec.lattice.compiled`, `architecture-spec.orphan.detected`.

---

### registry-watcher

**id:** `architecture-spec.registry-watcher`

**What it does**

Watches `.architecture/nodes/<type>/` live, indexes every drop in memory, and appends a per-type append-only ledger — the generalization of `guardian/lib/node-registry.js` out of guardian and into any project's own registry domain.

**How it works internally**

On `start()`, scans every type directory once (initial indexing), then opens an `fs.watch` per type directory. Every file event re-reads the file, validates it against the matching `check*()` function, and either indexes it (`added`/`changed`) or removes it (`deleted`), appending one JSON line to `_ledger.jsonl` per event either way.

**Real test run this session:** started against 5 seed node files, correctly indexed all 5; a live file drop (`newthing.json`) was detected and indexed without restarting the process; the drop was correctly logged to the ledger. One real, observed caveat: `fs.watch` double-fired on the single write (`added` then `changed`) — a known Node platform quirk; `guardian/lib/node-registry.js`'s real debounce (`_watchDebounce`) was simplified out of this minimal version and should be ported back before production use.

**Commands**

| Command | Operates on | What it does |
|---|---|---|
| `architecture-spec.watch-start` | all four `.architecture/nodes/<type>/` directories | begins live watching, returns nothing (fire-and-forget) |
| `architecture-spec.watch-all` | in-memory index for one type | returns every currently-indexed node of that type |

**How to use it**

```javascript
const { createWatcher } = require('./.architecture/registry/watcher.js');
const w = createWatcher({ nodesDir: './.architecture/nodes', checkFns: {/* ... */} });
w.start();
w.all('component'); // → [{ node, filePath }, ...]
```

**HTTP routes**

None — an in-process watcher, not an HTTP service in this test.

**What it connects to**

- `capability-node-schema` — every drop is validated against it before indexing
- `friction-tension` — the ledger this module writes is one of the real sources a fuller diagnostic could read (not wired directly in this test — friction-tension currently reads `gaps.entries` from the `.spec` file, not this module's ledger)

**Bus events emitted**

None on the bus directly — `onChange` callback fires per event; wiring that to a real bus is not done in this test.

---

### friction-tension

**id:** `architecture-spec.friction-tension`

**What it does**

Computes a live self-diagnostic score from this system's own state: `friction` (current structural strain — orphan hooks plus open gaps) and `tension` (friction plus whether gaps are accumulating or closing over a time window). Generalizes loom's real `GET /api/friction` and `GET /api/tension` down to per-system instead of proxied from a shared diagnostic kernel.

**How it works internally**

`computeFriction` takes a compiled lattice and a gaps array, returns `orphanCount + openGapCount`. `computeTension` adds `opened − closed` within a `windowDays` window, read from each gap's `opened`/`closed` timestamps.

**Real test run this session** — against `architecture-spec.spec`'s own actual `gaps.entries` (AS1–AS4, all still open) and the lattice-compiler's one real orphan:

```json
{ "friction": 5, "orphanCount": 1, "openGapCount": 4 }
{ "tension": 9, "friction": 5, "windowDays": 30, "opened": 4, "closed": 0, "accumulation": 4 }
```

The embedded widget below renders these same two numbers from the same formula, copied, not re-derived, so they can't silently drift apart.

**Commands**

| Command | Operates on | What it does |
|---|---|---|
| `architecture-spec.compute-friction` | a `CompiledLattice` + a `.spec` file's `gaps.entries` | returns `{friction, orphanCount, openGapCount, breakdown}` |
| `architecture-spec.compute-tension` | same, plus a window in days | returns `{tension, friction, opened, closed, accumulation}` |

**How to use it**

```javascript
const { computeTension } = require('./.architecture/registry/friction.js');
const t = computeTension({ lattice, gaps, windowDays: 30 });
```

**HTTP routes**

None yet — target: `GET /<system>/friction`, `GET /<system>/tension`, `GET /<system>/gaps`.

**What it connects to**

- `lattice-compiler` — reads `lattice.orphans`
- this system's own `.spec` file — reads `gaps.entries` directly (a real, if slightly unusual, cross-reference: a code module reading its own governing spec file as data)

**Bus events emitted**

None yet.

---

<div style="border:1px solid #30363d;border-radius:6px;overflow:hidden;margin:16px 0;">
<iframe src="gaps-widget.html" width="100%" height="340" style="border:none;display:block;" title="architecture-spec gaps and self-diagnostics"></iframe>
</div>

*(the iframe above renders `gaps-widget.html`, tested separately this session: its embedded script executes cleanly and produces friction: 5 / tension: 9, matching `friction.js`'s own tested output exactly)*

---

## Modules Not Yet Built

| Module | Version | Depends On | Description |
|---|---|---|---|
| api-surface | 0.1.0 | lattice-compiler | Compiles hooks with `type: api` into an HTTP route table |
| sovereignty-boundary | 0.1.0 | lattice-compiler | Enforces the process-level write boundary stated in Sovereignty above, mechanically rather than by convention |

---

## Module Conflict Registry

Not applicable — no two modules in this system are mutually exclusive.

---

## Build & Run Reference

```bash
npm install
node .architecture/compiler/lattice.js      # compile, print CompiledLattice
node .architecture/registry/watcher.js       # start live watching (long-running)
node -e "require('./.architecture/registry/friction.js').computeTension({...})"
```

---

## Version History

**Source:** hand-maintained — `architecture-spec` has no live Versionium wiring yet; `architecture-spec.spec`'s own `version_history:` is the record.

| Commit | Branch | Message | Author | Timestamp | Caused By |
|---|---|---|---|---|---|
| 0.1.0 | main | First draft spec — first-principles module set only | James Brooks | 2026-09-22 | — |
| 0.2.0 | main | Reframed as the seam over genesis.spec + loom + guardian's node-registry; added NodeBundle, SMALLEST_UNIT, SPEC_IS_LIVING_MODEL | James Brooks | 2026-09-22 | discovery that genesis.spec and node-registry.js already existed |
| 0.3.0 | main | Added HARDLINE_AS_LITTLE_AS_POSSIBLE, FrictionScore/TensionScore, friction-tension module | James Brooks | 2026-09-22 | request to track tension/friction via registry, gaps, dangling hooks |

**Commands / routes:** none live yet — see caveat below.

**Known caveat:** no branch DAG exists at all yet (single `main` branch, hand-entered) — Versionium's own real gap (label-only branching, not a true DAG) doesn't even apply here yet since this system hasn't reached the point of using Versionium.

---

## Copyright

Copyright © 2026 James Brooks (Erosmancer). Part of the rheon.world / NEXUS ecosystem.
