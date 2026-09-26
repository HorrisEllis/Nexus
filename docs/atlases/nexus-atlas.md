# NEXUS — Sovereign Multi-System Kernel

> **status: partial map** · 13 systems identified, 10 with their own atlas file (2 deeply grounded: loom, architecture-spec) · each system is a module of NEXUS; each module is its own modular system with components — same shape, one more zoom level out

**Author:** James Brooks (Erosmancer) · rheon.world

---

## What It Is

NEXUS is the top zoom level. Every system below (loom, intelligence, guardian, clear-glass, versionium, warp, and the rest) is, from here, a module — the same relationship a system has to its own components, one level further out. This atlas doesn't re-describe any of them; it indexes them, and links to each one's own atlas for the real depth.

This document is honest about its own incompleteness on purpose: most systems below are cited at the depth the zip listing and a handful of read files support, not at the depth loom's own atlas reaches. Padding every row to look equally thorough would be the same failure this whole pattern exists to prevent.

---

## File Structure

```
NEXUS/
  loom/                the registry authority — component/hook/wire, real, deeply mapped
  intelligence/         cognition layer consolidation (port :3753), real .spec read
  guardian/               the AI engine, real node-registry.js watcher pattern read
  clear-glass/              sovereign browser, real .spec read
  versionium/                 commit/history/restore/calendar API, real .spec read
  warp/                          the event spine every genesis.spec domain binds to
  genesis.spec                     the sovereign-system grammar (not a folder — a template)
  emerge/                            signal-physics grammar + spec-compiler module
  cortex/                              referenced by every system above; not read directly
  architecture-spec/                     this scaffold pattern itself — the one fully built+tested system
  idearium/                                the spec-engine + repo/project system — see hook below
```

| Path | Node kind it holds | Contains |
|---|---|---|
| each system folder | component, hook, wire (per that system's own `.spec`) | one real subsystem — see its own atlas |
| `idearium/data/projects/<repo-id>/atlas.json` | none — idearium's own machine index, not our node schema | idearium's real, auto-generated per-project file/component index — see hook below |

---

## Hook: idearium repo/project metadata

<!-- This is the real integration point for "each system a repo
     compartment," confirmed against a real file this session:
     idearium/data/projects/nexus-id-repo-3a82e21b/atlas.json -->

Idearium already generates a real `atlas.json` per project it tracks — a different, complementary shape from this document:

```json
{
  "repository": "nexus-id-repo-3a82e21b",
  "generatedAt": 1790022783631,
  "fileCount": 3,
  "byLanguage": { "javascript": 2, "markdown": 1 },
  "byKind": { "component": 3 },
  "failedCount": 0,
  "tree": { "...": "recursive dir structure, per-file language/status/symbolCount/lineCount/kind" },
  "components": [ { "path": "...", "kind": "component", "language": "...", "symbolCount": 0 } ]
}
```

**The real path to "each system a repo compartment":** once a NEXUS system is its own idearium project (not just a folder in the monorepo), it already produces this file with no new code — idearium's ingest/chunk pipeline generates it automatically. `nexus-atlas-aggregate.js` (built and tested this session) rolls N of these into one NEXUS-wide summary:

```
node -e "
const { aggregate } = require('./nexus-atlas-aggregate.js');
console.log(aggregate({ loom: loomAtlasJson, guardian: guardianAtlasJson, ... }));
"
```

Tested this session against the one real `atlas.json` found (`nexus-id-repo-3a82e21b`, fileCount: 3) plus one clearly-labeled synthetic second system — correctly summed to `totalFiles: 15`, merged `byLanguage`/`byKind` counts across both. **Not yet done:** no NEXUS system currently has its own idearium project/atlas.json — this tool is ready for that day, not proof that day has arrived.

---

## Architecture

### Spine

Two real, distinct spines exist depending which layer you're looking at: `WARP` (per `genesis.spec`, every domain in a WARP-native system binds to its five primitives — Event/Gate/Stream/StreamLog/Axiom) for systems built on the sovereign-system grammar, and no confirmed single spine for `loom` specifically (its own atlas already states this honestly). Not every system in this list has been checked for which one applies.

### Governing axioms

| Name | Statement | Rationale |
|---|---|---|
| `AX-013` | living-model sections — a `.spec` is edited in place, not written once | confirmed real in `loom.spec`; this convention had been calling it `SPEC_IS_LIVING_MODEL` before finding loom already had a real code for it |
| `SOVEREIGN` / `AGNOSTIC` / `NOTHING_INLINE` / `SPINE_IS_WARP` | see `genesis.spec` in full | the grammar every WARP-native system is checked against |

### Boundaries (documentation clarity)

| Term | Definition | Distinguished from |
|---|---|---|
| This document (`nexus-atlas.md`) | a narrative index of systems, for a human to read | `idearium`'s `atlas.json` — a machine-readable per-project file index, auto-generated, no prose |

### Seams (cut points)

Real, confirmed this session — idearium's own chunk objects already carry a `seam_id` field: `"idearium.spec-engine:v1:chunk:<specUuid>:<sectionId>"` — a real, addressable cut-point per ingested file/section, exactly matching the "cut here" definition rather than the narrower isolation-only one.

| ID | Location | Between | Cut type | Isolation |
|---|---|---|---|---|
| `idearium.spec-engine:v1:chunk:<uuid>:<sectionId>` | any ingested file, per idearium's real chunker | one file/section ↔ the next | boundary | — |

### Sovereignty (cross-system contract)

| Other system | May read | May never write | Enforced by |
|---|---|---|---|
| any | each system's own compiled lattice / atlas.json | another system's `data/`, `.architecture/nodes/`, ledger | process boundary, per-system — not independently verified for every system in this list |

### Pulse / Self-diagnostics / Config layers / Phases / Component status

Not aggregated at this zoom level — each belongs to one system, not to NEXUS as a whole. See that system's own atlas.

---

## The Modules

<!-- One entry per system NEXUS actually contains. Depth here is
     capped at what this session actually read — see each system's
     note for how far that went. -->

### loom

**id:** `nexus.loom` · **own atlas:** `loom-atlas.md` (built, real, this session)
Registry authority — component/hook/wire, the phasemap section, cortex-sync, ingest, system-scaffold. Deeply mapped; see its own atlas for full depth.

### intelligence

**id:** `nexus.intelligence` · **own atlas:** `intelligence-atlas.md`
Port `:3753`. Consolidates `cortex/intelligence/`, `meta/cfr/` (the real sigma/friction/regime math), and `lib/baseline.js` into one system. Its own spec's first line: *"this spec is the map-first + spec-it step James asked for explicitly, before any file moves."*

### guardian

**id:** `nexus.guardian` · **own atlas:** `guardian-atlas.md`
The AI engine — NCP browser-tab providers, RAID routing, SEAM chunk dispatch. `guardian/lib/node-registry.js` is the real source `architecture-spec`'s own `watcher.js` generalizes from.

### clear-glass

**id:** `nexus.clear-glass` · **own atlas:** `clear-glass-atlas.md`
Sovereign NEXUS browser — Electron + Chromium + Firefox fingerprint + ErosmancerOS wire. **79 real components (v3.9.0)** as of `registry-components.js` directly — `clear-glass.spec` itself is stale at v3.1.0/67, a real, repeated version-drift pattern (4 independent real files disagreeing). TR1 (repo-derived agentId in dispatch) active — patched, isolated-tested, not yet integration-verified.

### versionium

**id:** `nexus.versionium` · **own atlas:** `versionium-atlas.md`
Causal version control — real commit/history/restore/calendar API. Its own spec states plainly that `GET /api/versionium/history` exists *"so a system's commit history... has a live source instead of a hand-maintained one"* — directly validates this atlas's own `Version History` section design.

### cortex

**id:** `nexus.cortex` · **own atlas:** `cortex-atlas.md`
The memory and brain — six organs boot in sequence (gap-finder → healer → self-heal → orion → raid → heartbeat), connected only by events.

### ollama-bridge

**id:** `nexus.ollama-bridge` · **own atlas:** `ollama-atlas.md`
Sovereign local model dispatch, deliberately isolated from guardian. Its own real history includes a spec-coverage-breaking name mismatch (`ollama` vs `ollama-bridge`), fixed 2026-09-01.

### copilot

**id:** `nexus.copilot` · **own atlas:** `copilot-atlas.md`
Intelligence layer — separated deliberately from guardian's dispatch. Can answer from Cortex memory alone if guardian is down.

### diagnostic

**id:** `nexus.diagnostic` (unconfirmed) · **own atlas:** `diagnostic-atlas.md`
Not confirmed as a standalone system — real scattered pieces exist (`clear-glass/src/diagnostic/`, a `nexus-diagnostic` UI organism, a real ledger directory) but no central spec was found. The `:7825` "diagnostic kernel" `loom.spec` references remains unlocated.

### warp

**id:** `nexus.warp`
The event spine every `genesis.spec`-native domain binds to (Event/Gate/Stream/StreamLog/Axiom). Referenced constantly, not read directly this session.

### genesis.spec

**id:** `nexus.genesis`
Not a running system — a template/grammar every new sovereign system is meant to scaffold from. `status: proposed`, not yet promoted to active or wired into idearium's promote-menu (a real, still-open gap named in `architecture-spec.spec`'s own AS3).

### emerge

**id:** `nexus.emerge`
Signal-physics grammar (`sigma`/`delta`/`slope`/`polarity`) plus the real `spec-compiler` module (T0–T3 pipeline, Cortex-query-first). Naming question still open between you and me — see earlier in this session.

### architecture-spec

**id:** `nexus.architecture-spec` · **own atlas:** `architecture-spec-atlas.md`
The one system in this list that's fully built and tested, not just read — schema, lattice compiler, registry watcher, friction/tension, decompose, and the registry API. Real numbers throughout, not descriptions of intended numbers.

### idearium

**id:** `nexus.idearium` · **own atlas:** `idearium-atlas.md`
Spec-engine (10-block chunking, file-tree-first scaffolding, COS archetype templates) plus the real per-project `atlas.json` this document hooks into.

---

## Modules Not Yet Mapped

Real per the zip listing, never opened this session: `orchestrator`, `eravos`, `mesh`, `remote-desktop` / `bridge-os-core`, `erosmancer`, `spatial-ris`, `bridge-os` (the separate repo, not this monorepo).

---

## Build & Run Reference

No single NEXUS-wide boot command confirmed this session — each system boots independently on its own port (loom `:3752`, intelligence `:3753`, versionium `:3754`, clear-glass ports `7701-7704`).

---

## Version History

**Source:** hand-maintained — this document itself, first authored this session. No live Versionium wiring for NEXUS-as-a-whole confirmed.

| Commit | Message |
|---|---|
| — | First NEXUS-level atlas authored, hooked into idearium's real atlas.json shape, aggregator built and tested against one real + one synthetic system |
| 0.39.255 | `lib/chat-logger.js` honours the test sandbox: `require('./test-sandbox.js').ensure()`, then `NEXUS_DATA_ROOT/chat-logs`, as `lib/ledger-writer.js` and guardian's `code-artifact.js` already do. Before this, every suite that reached guardian's completion path left `data/chat-logs/<date>-<id>.jsonl` in the real tree. A production process still writes `data/chat-logs/`. |


### 0.39.257 — shared libraries
- `lib/agent-tools/tool-root.js`: a run's `context.repoDir` makes the repo the default root for `read_file`, `file_tree` and `search_files`. `where: "nexus"` reads NEXUS itself. The containment check is unchanged. `runToolLoop` passes `context` to `executeTool`, which passes it to `tool.execute(args, opts)`, and a failed model call ends a run as a failure.
- `lib/agent-tools/tool-catalog.js`: every registered tool in a named group, with none left over, for `/tools`, `/help` and copilot's `/api/tools/list`.
- `lib/repo-context.js`: reads `graph.json` for file connections, and gives the project map when nothing matches.
- `lib/test-sandbox.js`: covers `COPILOT_INJECTION_DIR`.

### 0.39.262 — this document is the nexus repo's Home
- In idearium, Nexus is one repo, `nexus`. Its Home tab renders this file from the immutable snapshot (`idearium/ui/js/nexus-atlas.js`).
- Every system is a block at the top, and each module heading here gets that system's live numbers.
- Every reference in this document opens in idearium: a system opens its repo, a file opens in its repo's editor, an `*-atlas.md` renders in place, and a directory opens its repo's Files tab.
- A reference the snapshot does not have is marked, never guessed: `POST /api/nexus-self/resolve`.
- Each system repo's Home starts with its own atlas from `docs/atlases/`.

---

## Copyright

Copyright © 2026 James Brooks (Erosmancer). rheon.world.
