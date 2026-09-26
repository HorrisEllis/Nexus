# Session Handoff — 2026-09-15 — Idearium Creative-Repo Overhaul

## What happened, in order

1. Diffed `nexus-v0_39_137-mco19-clearglass.zip` vs `Nexus_v0_39_139-integrated.zip`
   (path-prefix normalized: `nexus/` vs `n139/`). Real delta: `cortex/` (72 files
   + 62 `.nex` snapshots + `data/cortex/memory/*`).
2. `Cortex.zip` confirmed byte-identical (md5) to `n139/Cortex.zip` already sitting
   at the integrated repo's root — cortex isn't missing, just unextracted.
3. Checked `.git` in both — same lineage (clearglass HEAD `810790f` is an ancestor
   of integrated HEAD `c091032`). `cortex/` **is** in integrated's git HEAD tree;
   just absent from its working directory (along with a large `_archive/` chunk —
   broader working-tree/index mismatch, not a cortex-specific loss).
4. You asked for a full idearium "creative repo" overhaul (README project pages,
   archive->real files, roadmap, zoom/sub-repos, phasemaps from `.phase` nodes,
   CI/CD+SSH, Versionium-based snapshots/rewind, adjustable+Copilot-writable
   config, 500-cap). First pass was a markdown design doc.
5. You uploaded `nexus-repository-system.spec` (your own, dictated to a prior
   Claude session) and asked for a phasemap in that format — produced
   `idearium-creative-repo-overhaul-phasemap.spec`.
6. Asked for the equivalent phasemap for `nexus-repository-system.spec` itself.
   **Key finding (MCO0 audit):** large parts of it are already real —
   `idearium/repo/index.js` + `idearium/repo/import-pipeline.js` +
   `idearium/agent-suite/index.js` implement layers L0-L5 and part of §38/§2.
   Produced `nexus-repository-system-build-phasemap.spec` grounded in that audit.
7. You asked whether the two phasemaps should combine, and whether that should
   live inside `idearium.spec` itself. Answer: combine the two phasemaps (they
   shared one duplicate MCO — git+credentials — and one dependency chain);
   do **not** fold into `idearium.spec` — phasemaps are dated work-logs,
   specs are canonical structure, mixing them is the exact pattern that got
   `docs/specs/IDEARIUM.spec.md` marked SUPERSEDED. Produced the merged
   `idearium-repository-overhaul-phasemap.spec` (13 MCOs, one build order).
8. Produced the canonical spec those MCOs build toward:
   `idearium-creative-repo.spec` — depends on `nexus-repository-system.spec` /
   `versionium.spec` / `idearium.spec` / `loom.spec`, owns nothing they already
   own, defines project-home/roadmap/zoom/versionium-bridge/config/CI-CD,
   core axiom `ICR-001 NO_PHANTOM_PROGRESS`, invariants ICR-001..014.

## Deliverables in this handoff's zip

| File | Type | Status |
|---|---|---|
| `idearium-creative-repo-overhaul-phasemap.md` | early markdown design doc | superseded by the .spec below |
| `idearium-creative-repo-overhaul-phasemap.spec` | first phasemap (idearium-only surface) | **SUPERSEDED** — see merged file |
| `nexus-repository-system-build-phasemap.spec` | first phasemap (repo-system surface) | **SUPERSEDED** — see merged file |
| `idearium-repository-overhaul-phasemap.spec` | **merged phasemap, 13 MCOs** | current work-log — source of truth for "what's built" |
| `idearium-creative-repo.spec` | **canonical spec** | current — source of truth for "what must be true" |
| `schema.phase_node` | draft node file | PROPOSED, not yet registered (MCO-A) |
| `schema.file_delta` | draft node file | PROPOSED, not yet registered (MCO-A) |

## Where things actually stand

- **Real, already built** (found by MCO0's audit, not assumed): repo source
  identity (rootHash), deterministic parse, chunk boundaries, atlas, incremental
  re-chunk, L0-L3 verify, the agent MAP-first tool surface
  (`idearium/agent-suite/index.js`).
- **Nothing from today's MCO list is built yet** — MCO0 is the only `DONE` entry
  in the merged phasemap. Everything else (`MCO-A` through `MCO-G`) is `NOT
  STARTED`.
- **Three open questions, unresolved, blocking specific MCOs:**
  1. `file_delta` home — versionium/ (recommended) vs cortex/.
  2. Zoom level names (`MCO-D`) — count is 4, names undecided.
  3. Git remote target (`MCO-G`) — one of the four real remotes
     (`mine`/`nexus0822`/`other`/`person-model`) vs a new idearium-only remote.

## Immediate next step, if continued

Per the merged phasemap's `build_order`: **MCO0 is done; MCO-A (register
`schema.phase_node` + `schema.file_delta`) is next**, since MCO-B/E depend on it
and it has no unresolved open questions blocking it.

## Not yet done, flagged explicitly (not silently skipped)

Per your message: loom's own phasemap data has **not yet been checked** for
anything additive to the specs above — that's the next action after this
handoff/zip, budget permitting.
