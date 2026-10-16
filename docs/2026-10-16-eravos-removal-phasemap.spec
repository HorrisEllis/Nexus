# docs/2026-10-16-eravos-removal-phasemap.spec
# ERAVOS removed from Nexus: the system, its UI, its hooks, its specs, and every live wire to it.
# MAPPED 2026-10-16, before building (docs/CLAUDE.md rule 1). Registered in docs/SPEC-REGISTRY.spec.

origin:
  date: 2026-10-16
  james: "can you remove eravos?"
  asked: >-
    How should ERAVOS be removed? The options were: (1) archive it out to _archive/2026-10-16-eravos/ (the coder's
    recommendation, as the Architect page was in 0.60.19); (2) only stop running it; (3) delete it outright.
  decided: "Delete it outright." (James, 2026-10-16, picked from the three)
  note: >-
    This is his call against the standing rule "nothing gets lost unless redundant" (§0.3). It is recorded here as his
    decision. Git history keeps every deleted file: the last commit with ERAVOS is the parent of this release's commit.
    Historical records (CHANGELOGs, version lines, old phasemaps and specs that mention ERAVOS) are not rewritten. They
    are the record of what was.

evidence:
  # measured 2026-10-16, not from memory
  - "eravos/: 140 tracked files (1.5 MB), 44 of them committed data under eravos/data/. ui/eravos/: its served UI. hooks/eravos.hooks.js: 63 hook declarations."
  - "Only hooks/index.js require()s anything of ERAVOS. No other system calls it over HTTP; nexus-client has no caller for 'eravos'."
  - "Guardian's organism queue (/api/guardian/organism-queue, /:id/zip, /:id/ack) was read only by ERAVOS, and nothing ever put anything in it (no _organismQueue.set anywhere): dead code."
  - "The MCP tool nexus_build_organism builds 'a conforming organism pack ready to drop into ERAVOS': it has no purpose without it."
  - "lib/file-tree-plan.js reads ERAVOS mods from eravos/ui/mods/ for the template picker (behind ?include=eravos since 0.39.267, when James said: 'the eravos options need to be removed from this prompt')."

phases:
  ER1_delete_the_system:
    status: BUILT 0.60.82
    systems: [eravos, core]
    files: [eravos/ (deleted), ui/eravos/ (deleted), hooks/eravos.hooks.js (deleted), hooks/index.js, docs/eravos.spec (deleted), docs/eravos-agnostic-canvas.spec (deleted), tests/modules/test-eravos-pulse-migration.js (deleted), run-all.js, tests/modules/run-all.js]
    does: "The system, its UI, its hook declarations, its two specs and its own test are deleted."

  ER2_unwire_the_platform:
    status: BUILT 0.60.82
    systems: [orchestrator, core, guardian, loom, diagnostic]
    files: [orchestrator/orchestrator.config.json, orchestrator/orchestrator.js, orchestrator/lib/contract-poller.js, orchestrator/lib/contract-handshake.js, orchestrator/lib/mcp-server.js, nexus/autopilot.js, lib/system-check.js, lib/nexus-self/systems.js, lib/blueprint-index.js, lib/gap-priority.js, lib/lean-mode.js, lib/agent-tools/naming.js, lib/agent-tools/tools/coordination/capability-tools.js, scripts/precommit-check.js, diagnostic/nexus-diagnostic.js, guardian/server.js, guardian/interaction-contract.json, hooks/guardian.hooks.js, loom/maps/session-2026-08-14-map.js, loom/maps/cos-testenv-map.js, loom/scanners/capability-map.js, loom/ui/index.html]
    does: >-
      Out of every list of live systems: the port, the orchestrator's systems, autopilot boot, health checks,
      contract polling and handshake, lean mode, gap priority, the blueprint index, the nexus-self system table,
      agent-tool naming, capability ports, the pre-commit version check, the diagnostic, and the loom maps. Guardian's
      dead organism queue and the MCP tool nexus_build_organism are removed.

  ER3_unwire_the_screens:
    status: BUILT 0.60.82
    systems: [idearium, ui, clear-glass]
    files: [idearium/ui/index.html, idearium/ui/js/app.js, idearium/ui/js/compartment.js, idearium/api/index.js, idearium/test/ui-restructure.smoke.cjs, lib/file-tree-plan.js, lib/spec-collect.js, ui/home/index.html, ui/home/core/config.js, ui/home/areas/shell.js, ui/home/areas/rail.js, ui/tv-shell/index.html, ui/tv-shell/warp-ui/nexus-shell.js, ui/tv-shell/nerve/nerve.js, ui/brainos/brainos-app.js, ui/brainos/brainos-automation.js, ui/brainos/brainos-canvas.js, clear-glass/renderer/library/sections/downloads.js, clear-glass/renderer/guardian-picker.js]
    does: >-
      The following go: Idearium's Build › Eravos tab, its iframe and its organism.create handler; the ERAVOS-mod
      templates; the Canvas channel (an iframe of :3751) on the Home and TV pages; ERAVOS's node and port on BrainOS
      and the TV shell; and ERAVOS as a system choice in Clear Glass.

kept_on_purpose:
  - "Text classifiers that recognise the word in OLD text (intelligence/index.js prefix map, synthesis SYSTEM_WORDS, vector-memory, spec-library NEXUS_RE, recursive-diagnose): history mentions ERAVOS and still has to be read as Nexus history."
  - "Comments that say where a pattern came from (e.g. 'the same pattern eravos/config.js used'): provenance, not wiring."
  - "The palette BrainOS and the conversations page took from ERAVOS (the CSS values live in those files; only the comments name ERAVOS)."
  - "Generated and historical files: blueprint-index.json (regenerated by lib/blueprint-index.js), docs/*.json/*.yaml/*.html manifests and maps, CHANGELOGs, lib/version.js history."
  - "data/eravos/ on a machine is runtime state, never committed. It is not touched here; he can delete it by hand."
