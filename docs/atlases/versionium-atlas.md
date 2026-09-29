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

## Copyright

Copyright © 2026 James Brooks (Erosmancer). Part of the rheon.world / NEXUS ecosystem.
