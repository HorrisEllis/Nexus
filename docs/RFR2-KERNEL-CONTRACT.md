# RFR2 kernel — the missing module, and the exact contract it must satisfy

**Status: absent.** `meta/rfr2/kernel/` does not exist. Not in the tree, not in
`unintegrated/`, not in any uploaded zip. Searched 2026-07-09.

## Why this is the single most important missing file in NEXUS

9 of RFR2's 12 modules load and work standalone. Three do not:

| module | loads | blocked by |
|---|---|---|
| `adapter-sandbox`, `delta`, `enforcement`, `identity`, `lazy`, `observer`, `query`, `time`, `version-gate` | yes | — |
| `clip`, `compress`, `context` | **no** | `import { createKernel } from '../kernel/index.js'` |

Those three are exactly the modules `docs/NEXUS-PHASE-MAP-CROSSREF.md` maps the
architecture's biggest open phases onto:

- **Phase 27 — System State VM**: `compress.snapshot()` / `restore()` is full
  state serialize/restore.
- **Phase 30 — Time-Travel Debugging**: `clip.snapshotRange()` / `restoreClip()`
  is the fork primitive. The crossref calls this *"the most direct one-to-one
  match in the whole corpus."*
- **Phase 109 — Epistemic Branch Runtime**: `clip` + `context` +
  `adapter-sandbox` + `observer`. The crossref calls this *"the big one."*

Every one of James's stated needs — VM-style snapshots per system, a replay
engine, epistemic branching — routes through these three modules. All three are
blocked by one absent file. **RFR2's "zero consumers" is not neglect; for its
most valuable third, it is impossible.**

## The contract, derived from consumers (not guessed)

`createKernel(opts)` where `opts` is `{ ringCap?: number }` — a ring-buffered
causal event store. Observed call sites:

- `context/index.js`: `createKernel()` — no args, defaults required
- `compress/index.js`: `createKernel({ ringCap })` and
  `createKernel({ ringCap: opts.ringCap || Math.max(snap.total * 2, 5_000) })`
- `clip/index.js`: `createKernel({ ringCap: Math.max(inRange.length * 2, 100) })`

The returned kernel object is accessed for:

| member | used by | inferred purpose |
|---|---|---|
| `ingest(event)` | context | add an event to the store |
| `getAll()` | clip, context | all retained events, presumably in causal order |
| `findById(id)` | clip, context | event lookup by id |
| `getChildren(id)` | clip, context | causal successors — the edge index |
| `edgeMeta` | clip, compress, context | edge metadata store |
| `edgeCount` | compress | number of edges (for compression reporting) |
| `droppedCount` | compress | events evicted by the ring cap |
| `clock` | compress | monotonic seq/tick source (see `rfr2/time`) |

## Why this file was NOT reconstructed

The *surface* above is fully determinable. The *semantics* are not:

- ring-cap eviction policy (FIFO? causal-aware? does it refuse to drop an event
  with living children?)
- how `droppedCount` interacts with `compress.compressionReport()`
- whether `getAll()` guarantees `time.causalOrder`, or merely insertion order
- clock ownership: does the kernel create its clock, or accept `time.createClock()`?

A kernel that guesses wrong does not fail loudly. It makes `compress.snapshot()`
produce a snapshot that restores to a *different* causal graph, and
`clip.validateClipStability()` validate a clip that isn't stable. That is worse
than absent: it is a silent corruption of the exact subsystem whose whole purpose
is fidelity. §1.1 — nothing exists until proven — cuts against writing it from
inference.

## What to do

The upstream source is `rfr2/packages/nexus/src/kernel` (the path the phase-map
crossref itself cites). Copy that module into `meta/rfr2/kernel/`. Then:

```bash
node -e "require('./lib/rfr2-bridge.js').loadRFR2Module('compress').then(m=>console.log(Object.keys(m)))"
```

should list `snapshot restore blueprint compile compressionReport`, and Phases
27, 30 and 109 become buildable rather than sourced.

## What already works today, proven

Via `lib/rfr2-bridge.js` (the ESM→CJS bridge; RFR2's first consumer):

- `delta.computeEventDelta()` — real statistics, `latencyImpact: 16.481` on a
  180ms gap against a ~100ms baseline.
- `enforcement` — 25 real invariants across identity/causality/time/arch/
  hostile/context/exec-model.
- `identity.contentHash()` — stable across runs, changes with content,
  independent of key order. **This is the per-file versionium primitive**
  (Phase 105 / Phase 32).
- `time.causalOrder()` / `seqPrecedes()` — real causal sort over real events.
- `version-gate` — `createVersionGate`, `validate`, `migrate`.

## Consent boundary — unchanged

`resonance`, `irs.js`, `relational.js` are people-modeling. They are not present
in `meta/rfr2/` and must not be pulled in under a phase-map pretext. Explicit
per-item consent required. (Recorded in `NEXUS-PHASE-MAP-CROSSREF.md`.)
