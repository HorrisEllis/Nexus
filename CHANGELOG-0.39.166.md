# NEXUS 0.39.166 — import re-sequencing, test-repo cleanup

## Done

1. **Test repos removed** — all 21 drops under `data/intake/` were MCO test
   fixtures (`mco01-src-*` with 1-byte files, `loose.js`/`x.swift` probes).
   `tests/modules/mco01-project-root-unwrap.test.js` builds its own tmp
   fixtures via `mkdtempSync`, so it does not depend on them. 640K gone.

2. **Import re-sequenced** — James: "import → unzip → take you to the repo
   → chunk → toast showing the progress."
   - `project-import.finalize` accepts `deferChunking: true`: it stops once
     files are really on disk (unzip → COS container → materialize) and
     returns `pipeline.state = 'DEFERRED'`. **The server default is
     unchanged** — existing callers (older import-project screen, CLI, e2e
     tests) still get the synchronous path.
   - New `POST /api/repos/:uuid/chunk` runs the *same* `runImportPipeline`,
     wrapped in real events: `idearium.repo.chunk.started/.done/.fault`.
     `chunkCount` is read back off `chunks/index.json`, not echoed from
     the request; unknown stays `null`, never `0`.
   - UI: finalize → `openRepoFor()` → `chunkRepoWithProgress()`. You are in
     the repo with real files before a chunk exists. Both halves report:
     foreground toasts for the person who clicked, plus SSE branches in
     `refreshOnEvent` so a chunk run started anywhere (reindex, CLI, another
     window) is never silent.
   - A failed chunk run toasts loudly and says the repo is imported but NOT
     indexed. That half-state is real and visible — Files works, anything
     reading by chunk does not.

3. Tests renamed `.cjs` (idearium's package.json is `type: module`).
   Full suite re-run after these changes: **0 failures**.

## Answers to the three questions asked

- **Dependency graph — you already have one.** `idearium/repo/graph.js`,
  exposed at `/api/repos/:uuid/graph`, `/graph/traverse`, `/graph/cone`.
  It records unresolved edges rather than dropping them, which is exactly
  what makes the Intelligence scan's dangling-hook detection possible.
  Nothing to build; what is missing is a *view* of it.
- **Per-folder chunk index — do not build a second store.** `atlas.json`
  already carries the folder `tree` (`buildAtlas`, `__dir` nodes) and
  `chunks/index.json` carries `file` per chunk. A per-folder index is a
  projection over those two, computed on read. A second storage layer
  would be a second thing to keep correct.
- **Repo-scoped agent hat — already 80% built.** `lib/hat-forge.js` is
  exactly the mechanism described: `forge({ name, baseAgent, allowedAgents,
  toolScope, personaPrompt, responsibilities })`, validated against real
  agents and real registered tools, stored as data, with export/import
  and revoke. A hat forged per repo with `toolScope` limited to that
  compartment's index is wiring on proven infrastructure, not a new
  subsystem. This is the right foundation to build *before* the agents
  tab, the per-repo CLI and the AI-assisted IDE, because all three are
  surfaces onto it.

## NOT done this pass

Agents tab + per-repo CLI · Map tab (atlas + chunk index) · tags per chunk ·
chunk editing on the build surface · AI-assisted IDE · Versionium tab ·
CI/CD per compartment with SSH · Brainstorm "spacial void".

CI/CD and SSH remain the largest single item: there is no CI/CD subsystem
and no SSH infrastructure anywhere in the tree today.
