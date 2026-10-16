# 0.60.82 — 2026-10-16

James: "can you remove eravos?"

He was asked how, with three options:
1. archive it out (the coder's recommendation, as the Architect page was archived in 0.60.19);
2. only stop running it;
3. delete it outright.

He chose: **"Delete it outright."** That goes against the standing rule "nothing gets lost unless redundant" (§0.3),
so it is recorded as his call in `docs/2026-10-16-eravos-removal-phasemap.spec`. Git history keeps every deleted file:
the parent of this release's commit is the last one with ERAVOS.

## Deleted (ER1)

- `eravos/`: 140 files, 44 of them committed data
- `ui/eravos/`
- `hooks/eravos.hooks.js`
- `docs/eravos.spec`, `docs/eravos-agnostic-canvas.spec`, `docs/atlases/eravos-atlas.md`
- `tests/modules/test-eravos-pulse-migration.js`

## Unwired (ER2, ER3)

- **Platform:**
  - the :3751 port and the orchestrator's systems;
  - autopilot boot and health checks;
  - the contract poller and handshake;
  - lean mode and gap priority;
  - the blueprint index and the nexus-self systems table;
  - agent-tool naming and capability ports;
  - the pre-commit version check and the diagnostic;
  - loom's maps, scanner and UI lists;
  - `lib/version.js` modules.
- **Screens:**
  - Idearium's Build › Eravos tab, its iframe and its "new organism" handler;
  - the eravos-mod templates in `lib/file-tree-plan.js`;
  - the Canvas channel (an iframe of :3751) on the Home and TV pages;
  - ERAVOS's node and port in BrainOS and the TV shell;
  - ERAVOS as a system choice in Clear Glass.
- **Found dead and removed with it:**
  - Guardian's organism queue: only ERAVOS read it, and nothing ever put anything in it;
  - the MCP tool `nexus_build_organism`: it built packs "ready to drop into ERAVOS".

## Kept on purpose

- Text classifiers that read old history. Old specs and logs mention ERAVOS, and they are still Nexus history.
- Provenance comments.
- CHANGELOGs and version lines.
- Generated manifests.
- `data/eravos/` on a machine is runtime state and was never committed. Delete it by hand if you want.

## Also fixed

- `test-nexus-atlas-refs` was failing on the idearium atlas lines added in 0.60.79–0.60.81 (plain-text code spans for
  routes and commands). That was the coder's own regression. It now passes 49/49.

## Proof

Targeted, each run after the change:
- `test-file-tree-plan` 58/58
- `nexus-nerve` 10/10 (now 9 hook systems)
- `test-contract-handshake-paths` 8/8
- `test-cos-testenv-any-repo` 57/57
- `test-nexus-atlas-and-glass` 10/10
- `test-nexus-self-and-cos-run` 30/30
- `test-registration-shape` 8/8
- `test-synthesis-zoom-versionium` 6/6
- `test-module-builder-resolve` 6/6
- `test-nexus-mcp` 5/5
- `test-nexus-command-tool` 8/8
- `test-nexus-atlas-refs` 49/49

The full-suite result follows in the next commit.
