# VERSIONIUM
**UUID:** nexus-mod-versionium-0000-4000-0000-000000000020
**Layer:** 7 — versioning
**Boot phase:** 7
**Poll:** 3000ms
**Status:** active
**Source:** NEXUS-VERSIONIUM.spec, NEXUS-MODULES.spec

---

## What it is

Causal version control. Not file trees — causality graphs.

GitHub tracks what changed. Versionium tracks **why**.

Per-file, per-agent, per-pipeline commits with temporal replay and calendar playback.
Sigma-gated saves — only meaningful changes commit automatically.
Manual push always commits regardless of sigma.

Your intellectual history is your commit log. Every breakthrough auto-commits.

---

## Axioms

| Axiom | Rule |
|-------|------|
| §2.1 | Persistence is the golden rule — nothing lost, only accumulated |
| §3.2 | Logical time (tick) is the ordering axis |
| §K1 | Events immutable after construction |
| §A3 | Every JAA insert carries `causedBy` or `source` |

**Auto-commit sigma threshold:** 0.15 — `|current_sigma - last_commit_sigma| > 0.15` → auto-commit

---

## What it does

### Core concepts

**Commit:** Named, hash-identified snapshot at a tick. `commitId = vtm-{sha12}` (content-addressed — same content = same hash). Contains: branch, tick, parentId, author, message, snapshot, files[], bottlenecks[].

**Branch:** Divergent replay path from a past tick. Branches are idea spaces, not just file trees.

**Diff:** Delta between two Cobalt records. Not line-by-line — field-level, schema-aware.

**Temporal replay:** Re-emit stored events from past tick. Modes: `fork` (new branch), `dry-run` (observe only), `live` (apply changes). CFR Rewind provides the snapshot ring buffer.

**Calendar:** Wall-clock indexed commit navigation. `nexus versionium calendar 2026-05-31` → all commits that day.

**Bottleneck:** Tick range where one component's sigma dominated the system. Identified in every commit. Used for root cause analysis.

### Commit record shape

```
commitId:      vtm-{sha12}   — SHA-256 of content, first 12 chars hex
parentId:      parent UUID | null (null = root commit)
branch:        string
tick:          logical clock tick at commit time
wall:          Date.now() — display only
author:
  agentId:     string (ollama | claude | human | etc)
  sessionId:   string | null
message:       string
snapshot:
  ringSlice:   last 50 ring buffer events
  shapes:      shape samples at commit (cobaltId → ShapeRecord)
  gapSurface:  all open gaps at commit time
  crystalState: crystal counts + top 5 stable crystals
files[]:       FileVersion records — { filePath, hash, tick, agentId, shapeAtCommit }
bottlenecks[]: { cobaltId, tickRange, peakSigma, affectedFiles[] }
divergencePoint: tick of branch divergence | null for trunk
```

### Sigma-gated saves

When `shape.sampled` fires: `sigma_delta = |current_sigma - last_commit_sigma|`. If `sigma_delta > 0.15` → auto-commit with message `"auto-commit at tick {tick}"`. Manual `vortex push` always commits regardless of sigma.

This prevents commit spam from minor changes while ensuring every breakthrough is captured.

### Content-addressable store

**FileStore (foundation/store/FileStore.js):** SHA-256 content-addressed blob store. `put(content) → hash`, `get(hash) → content | null`, `has(hash) → boolean`. Same content = same hash = no duplication.

**FileRefs (foundation/store/FileRefs.js):** Named refs → hashes (like Git refs). `set(name, hash)`, `get(name)`, `list()`. Example: `versionium:HEAD:main → vtm-abc123def456`

### Temporal replay

| Mode | Behaviour |
|------|-----------|
| `fork` | Create new branch from past state. All changes go to new branch. |
| `dry-run` | Observe what would happen. No state changes. |
| `live` | Apply changes to current system. Dangerous — use with snapshot first. |

**CFR Rewind ring buffer:** default `snapMax: 200`, `logMax: 2000`. In-memory ring for fast scrubbing. Serializable to `.nex` payload.

### CausalityMapper — versionium/causality.js

Per-file causality graph. Answers: "Why did this file change at tick 3842?" "What files changed as a result of gap.found event X?" "What did agent 'ollama' touch in the last pipeline run?"

```
mapFile(filePath, commitId)     → FileCausalityNode
getCauseChain(filePath)         → event[]
getEffectChain(filePath)        → event[]
queryByAgent(agentId, since)    → file[] touched
queryByEvent(eventId, maxDepth) → file[] affected
```
Max depth: 10. JAA table: `causality_nodes`.

### CLI

```
nexus versionium status
nexus versionium log [n]
nexus versionium show <commit-id>
nexus versionium chain <uuid>      — causal chain for any event UUID
nexus versionium diff <a> <b>
nexus versionium checkout <id>
nexus versionium branch <name>
nexus versionium merge <branch>
nexus versionium calendar <date>
nexus versionium replay <from> <to> [--mode fork|dry-run|live]
nexus versionium causality <file>  — why did this file change?
nexus versionium bottlenecks [n]
nexus versionium push [--message]  — always commits
nexus versionium pull [<commitId>]
```

### Canvas — visual Versionium

`canvas/spec-a/` — causality graph rendering, physics simulation, node inspector, image analyzer, timeline scrubber. `canvas/spec-b/bridge/bus-to-cfr.js` — bridge between SISO bus events and CFR canvas.

---

## JAA Tables

```
versionium_commits    — commit records with bottlenecks and snapshots
versionium_branches   — branch records, head commit, divergence point
versionium_file_index — per-file commit history (fast file history lookup)
versionium_calendar   — date-indexed commits (for calendar playback)
versionium_objects    — content-addressed object store
causality_nodes       — per-file causality graph nodes
```

---

## Schemas

| Schema | Status |
|--------|--------|
| versionium.schema.json | EXISTS |
| rewind.schema.json | EXISTS — fields: module, tick, found, prefixes, fork, streamId |
| causality.schema.json | EXISTS |

---

## What it does NOT do

- Does not delete commits — only append. Commits are immutable.
- Does not track files outside of declared `.map` surfaces
- Does not require manual commits — auto-commits on sigma > 0.15
- Does not replace `git` for code hosting — it tracks causality, not code patches
- Does not expose commit history as a PR/review workflow — it is a causal audit trail
- Does not sync with external version control systems
- Does not compute sigma itself — reads from `shape_samples` (shape-sampler's job)
- Does not modify `.nex` originals once written (LAW_IX)

---

## Open gaps

| ID | Description | Severity |
|----|-------------|----------|
| G-VER-01 | `jaa-db.js` ALL_TABLES missing all 6 versionium tables | CRITICAL |
| G-VER-02 | Versionium not yet in `poll-registry.js` layer 7 | HIGH |
| G-VER-03 | `CausalityMapper.start()` not wired in `boot.js` | HIGH |
| G-VER-04 | Canvas spec-b bridge not yet connected to Versionium | MEDIUM |
| G-VER-05 | Vortex (Idearium-side) and Versionium (Cobalt-side) need sync seam | HIGH |
