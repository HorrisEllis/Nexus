# versionium — Sovereign Causal Version Control

> **v3.2.0 (active)** · port 3754 · commit/history/restore/calendar — the intended live source for every system's version_history

**Author:** James Brooks (Erosmancer) · rheon.world

---

## What It Is

Versionium is causal version control for NEXUS: temporal replay, calendar playback, sigma-gated auto-commit. Promoted from a library embedded inside cortex's own process to a real sovereign system (own folder, own port, own data directory) on 2026-09-02, per James's own words quoted in its spec: *"versionium is its own folder. it's system with a server.js. cli. api. event driven interaction contract... spec as living model."*

Its own real purpose line is directly relevant to this whole session's work: `GET /api/versionium/history` exists *"so a system's commit history — and, going forward, LM1's `version_history:` spec section — has a live source instead of a hand-maintained one."* Every `version_history:` entry hand-written in `architecture-spec.spec` this session is, by Versionium's own stated design intent, a stand-in for what this system should eventually provide live.

---

## Quick Start

Not confirmed this session — no boot command read directly.

---

## File Structure

Not confirmed in detail — `versionium/lib/engine.js` (canonical implementation), `versionium/lib/store.js` (data separate from cortex's shared jaaDB, one deliberate exception: `event_log`) referenced in the spec but not read directly.

---

## Architecture

### Spine

Not confirmed — reached via `lib/nexus-client.js` (sovereign transport), never a direct `require()` across a process boundary, per the spec's own `reached_via` field. This is the sovereignty enforcement mechanism, not a spine claim.

### Governing axioms

Not enumerated in the excerpt read this session.

### Boundaries (documentation clarity)

| Term | Definition | Distinguished from |
|---|---|---|
| `cortex/versionium/index.js` | kept, unexecuted, as real historical reference (§0.3 never delete, archive) | `versionium/lib/engine.js` — the real, canonical, currently-executing implementation. Nothing requires the cortex copy anymore |

### Sovereignty (cross-system contract)

| Other system | May read | May never write | Enforced by |
|---|---|---|---|
| any | `GET /api/versionium/history`, `/restore/:id`, `/state/:id`, `/calendar/:date` | direct access to versionium's own data store | `lib/nexus-client.js` sovereign transport — real fix confirmed this session: the one real agent-facing tool (`versionium-commit.js`) previously reached cortex's versionium via a cross-process `require()` (a live AX-010-equivalent violation, silently giving every agent-issued commit its own separate, near-empty kernel instead of the real one) — fixed to call the real HTTP routes instead |

### Pulse / Self-diagnostics / Config layers / Phases / Component status

Not confirmed this session.

---

## The Modules

---

### engine

**id:** `versionium.engine`
**path:** `versionium/lib/engine.js`

**What it does**

The canonical commit-graph implementation — commits, branches, temporal replay, calendar playback. Made canonical 2026-09-01 after a real reconciliation found **two independently-built, never-reconciled commit-graph implementations both calling themselves "Versionium"**: idearium's `SnapshotGate` and `cortex/versionium/index.js`. `cortex/versionium/index.js` was chosen as canonical because it already had the more complete capability set (kernel replay, calendar, correctly branch-scoped commits, no `parentId` bug to inherit) — then moved wholesale into `versionium/lib/engine.js`, comments and all, not rewritten from scratch.

**A real, separate bug found in the same reconciliation pass:** the old `cortex/versionium`'s sigma-gated auto-commit had been polling a table (`shape_samples`) that nothing in the codebase had ever written to — dead since it was built. Fixed by replacing the dead poll with a real, live read of cortex's own `_field.entropy`.

**Real commit shape:** `commitId` (`vtm-<sha>`), `parentId`, branch label, message, author, full-state snapshot, `diffSnapshots()`, restore-with-auto-stash.

**Known, real, open bug** (not fixed as of the spec's own `gaps`): `parentId` always points at the most recent snapshot regardless of declared branch — *"a linear chain with a label, not a real DAG."* Found session 9, still open as of this spec's last read.

**Commands**

Not enumerated beyond the HTTP surface below.

**How to use it**

```
POST http://127.0.0.1:3754/api/versionium/commit
{ message, branch?, causedBy?, system?, state? }
```

**HTTP routes** — real, from `canonical_http_surface`:

```
POST /api/versionium/commit    { message, branch?, causedBy?, system?, state? } → new commit
GET  /api/versionium/history   ?system=<name> → commit history for a system
GET  /api/versionium/restore/:commitId → full-state snapshot at that commit
GET  /api/versionium/state/:commitId   → state only, no restore
GET  /api/versionium/calendar/:date    → temporal replay for a given date
```

**What it connects to**

- `cortex` — `_field.entropy` feeds sigma-gated auto-commit
- any system — via `lib/nexus-client.js`, sovereign transport only

**Bus events emitted**

Not enumerated this session.

---

## Modules Not Yet Built

Real, from the spec's own `build_order` (some steps done, some not, as of last read):

| Step | Status |
|---|---|
| 1. Fix branch/parentId bug | **Still open** — confirmed above |
| 2. Diff `rfr2-nexus`'s compress/clip/context against `lib/replay-engine.js` | Not confirmed done |
| 3. Per-file hashing (once components have a file to hash) | Not confirmed done |
| 4. Sigma-gated auto-commit | Built (`orchestrator/lib/versionium-auto-commit.js`), but depends on steps 1-3 actually working first per the spec's own ordering |

A real bug found by this system's own migration smoke test (`test-versionium-migration.js`, test V-006): manual `commit()` never wrote to `versionium_calendar` — only `_autoCommit()` did, so calendar playback was silently blind to every manually-triggered commit. Not confirmed fixed as of last read.

---

## Branches remember where they came from (3.4.0, v0.39.279)

Staging self-heal S0 (`docs/2026-09-28-staging-self-heal-phasemap.spec`), closing design gap V2. A branch's row used to record its head only, so its first commit had no parent and "restore to where staging began" had to be guessed. createBranch with a branch and a source (a commit id, or a branch whose head is used) records forkedFrom and forkedAt and starts the branch at that commit, so the first commit on the branch is the fork point's child. A commit that names a source does the same on a new branch's first commit. An existing branch is never re-forked, and an unknown source is refused with the reason first. branches() and forkPoint() read them back; the routes are GET and POST /api/versionium/branches, and POST /api/versionium/commit takes the source too. The first user is the staging branch of each repo (`lib/code-edit.js` stage), forked from the repo's own snapshot branch. Tests: `tests/modules/test-staging-s0-s1.test.js`.

## Build & Run Reference

Not confirmed.

---

## Version History

**Source:** hand-maintained — this atlas itself. Versionium's own commit history of *itself* was not queried this session (would require calling its own real API, not done here).

| Commit | Message |
|---|---|
| — | Promoted from library-inside-cortex to sovereign system, own folder/port/data dir (2026-09-02) |
| — | `cortex/versionium/index.js` made canonical after finding two competing real implementations both named "Versionium" (2026-09-01) |
| — | Dead `shape_samples` poll replaced with live `_field.entropy` read |
| — | Agent-facing commit tool moved off cross-process `require()` onto sovereign transport |

---

<!-- generated:registry:start -->

## What the registry knows (generated)

> Generated by `scripts/generate-atlases.js` from loom's registry and events (loom/data/registry.json, loom/data/events.json — data, outside the snapshot, so written plain) and the tree itself, 2026-10-05. Everything between the markers is rewritten on the next run — write narrative above them. The same facts, one component at a time, are what `lib/registry-harness.js` hands a repo agent (loom.card.tool).

**30** files · **18** code files · **0** registry components declared here · **0** events emitted · **0** heard · **0** routes · **4** code files with a covering test

### Files, directory by directory (5 directories)

#### `versionium/`

4 code · 2 other file(s).

- `versionium/config.js` (52 lines) — real, distinct config, matching ollama/config.js's and intelligence/config.js's exact established pattern: one file, every  
  exports ORCH_URL, SIGMA_THRESH, AUTOCOMMIT_COOLDOWN_MS, POLL_MS, FILE_KEYFRAME_INTERVAL, FILE_DELTA_MAX_RATIO +3 · requires 0 · required by 6
- `versionium/event-taxonomy.js` (46 lines) — // versionium/event-taxonomy.js — real event vocabulary for the sovereign // Versionium system. Conforms to lib/event-taxonomy-pattern.js's ET1
- `versionium/registry-components.js` (51 lines) — versionium/registry-components.js  
  exports systemId, version, port, label, purpose, components +2
- `versionium/server.js` (170 lines)  
  exports server · requires 7 · required by 0
- other: `versionium/compartment.json`, `versionium/interaction-contract.json`

#### `versionium/lib/`

10 code file(s).

- `versionium/lib/causality.js` (109 lines) — migrated wholesale from cortex/ versionium/causality.js (§VS1, docs/2026-09-02-versionium-sovereign-  
  exports init, stop, ancestors, descendants, causalChain · requires 1 · required by 1
- `versionium/lib/engine.js` (269 lines) — versionium's own commit/restore/calendar/ getState logic, migrated wholesale from cortex/versionium/index.js  
  exports init, stop, setDeps, commit, restore, calendar +4 · requires 2 · required by 2 · tested by `tests/modules/test-versionium-migration.js`, `tests/modules/test-versionium-repo-history.test.js`
- `versionium/lib/files.js` (375 lines) — the per-file layer under a repo snapshot (MCO-B). Spec: versionium/spec/versionium.file-versioning.spec (written first, §8.5).  
  exports plan, record, stage, tree, content, limits +8 · requires 3 · required by 1 · tested by `tests/modules/test-versionium-repo-history.test.js`
- `versionium/lib/http-utils.js` (45 lines) — ollama/lib/http-utils.js Small, dependency-free helpers every route module uses.  
  exports json, readBody, readRawBody · requires 0 · required by 4
- `versionium/lib/migrate-cortex-snapshots.js` (104 lines)  
  exports migrateCortexSnapshots · requires 1 · required by 0
- `versionium/lib/migrate-idearium-snapshots.js` (143 lines)  
  exports migrateIdeariumSnapshots · requires 2 · required by 0
- `versionium/lib/migrate-legacy-data.js` (88 lines) — VS1's real, one-time answer to gap V6 (versionium/spec/versionium.spec): production versionium_  
  exports migrateLegacyData · requires 1 · required by 1
- `versionium/lib/snapshot.js` (515 lines)  
  exports _subjectJaa, load, verifySnapshotIntegrity, checkChainIntegrity, rollback, registerStateProvider +6 · requires 2 · required by 0 · tested by `tests/modules/test-versionium-snapshot-migration.js`
- `versionium/lib/store.js` (61 lines)  
  exports jaaDB, uid, _getStore · requires 1 · required by 8 · tested by `tests/modules/snapshot-integrity.test.js`, `tests/modules/test-versionium-snapshot-migration.js`
- `versionium/lib/text-diff.js` (193 lines) — unified diff and a strict applier, for the per-file layer (MCO-B, versionium/spec/versionium.file-versioning.spec).  
  exports diff, apply, isDiffable, PatchError, CONTEXT, MAX_LCS_CELLS · requires 0 · required by 1

#### `versionium/routes/`

3 code file(s).

- `versionium/routes/files.js` (109 lines) — HTTP surface of the per-file layer (MCO-B). Logic lives in lib/files.js; this only parses, bounds and maps errors.  
  exports handle · requires 3 · required by 0
- `versionium/routes/system.js` (30 lines) — versionium/routes/system.js GET /health, GET /contract, OPTIONS *  
  exports handle · requires 3 · required by 1
- `versionium/routes/versionium.js` (120 lines) — the real commit/history/restore/ state/calendar API, migrated wholesale from cortex/boot.js's own  
  exports handle · requires 3 · required by 1

#### `versionium/schemas/`

1 code · 7 other file(s).

- `versionium/schemas/index.js` (51 lines) — // versionium/schemas/index.js — versionium's own, fully sovereign schema registry. //  
  exports get, list, SCHEMAS, MODULE_ID, VERSION · requires 1 · required by 0
- other: `versionium/schemas/schema.capability`, `versionium/schemas/schema.command`, `versionium/schemas/schema.event`, `versionium/schemas/schema.file_delta`, `versionium/schemas/schema.file_snapshot`, `versionium/schemas/schema.system`, `versionium/schemas/schema.versionium_commit`

#### `versionium/spec/`

3 other file(s).

- other: `versionium/spec/versionium.file-versioning.spec`, `versionium/spec/versionium.node-taxonomy.md`, `versionium/spec/versionium.spec`

<!-- generated:registry:end -->

---

## Copyright

Copyright © 2026 James Brooks (Erosmancer). Part of the rheon.world / NEXUS ecosystem.
