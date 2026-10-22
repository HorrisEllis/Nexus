# 0.60.200 — what Idearium needed to work on MASTERMIND

James, 2026-10-21: "i just want you to add what idearium needs to work on mastermind."

## How the list was made
His MASTERMIND-v0_1_50 zip was driven through Idearium's real API in the test sandbox, with Versionium's real routes up: import → index →
roadmap → registry → dependency graph → build. Each place it stopped is one fix below. Nothing was guessed (§0.1).

## What the run found, and what changed
1. **Every path began `mm9/`.** The zip holds the project inside one folder, so a build, an agent and MASTERMIND's own scripts would
   never meet at the same paths. This is the same mismatch behind SP5's title.js.
   Fixed: the project imports drop a lone wrapping folder and say so (`wrapper`). It is off for other zip paths.
2. **Nine "roadmaps", and the import refused to choose.** MASTERMIND also has docs/PHASEMAP.md and archived Roadmap.md files.
   Fixed: each is counted. The ones with no phases are left out and listed. The one backed by phases.json is primary and is taken by
   default.
3. **P1's graph said it changes `phasemap/phases.json`.** The importer's own evidence lines named the roadmap by path, and the file
   mapper read that as a file P1 builds. Fixed: the evidence names the file by its bare name; the full paths sit once in the map's
   header.
4. **P1 then had no graph without a model.** File mapping needs Ollama, which is not always up.
   Fixed: the files PHASEMAP.md names under each phase are carried as `named_in_source`, 8 of the 16 phases. P1 now maps to
   `schemas/node.schema.json` and `schemas/edge.schema.json` with no model.
5. **Proof could not run its tests.** MASTERMIND has no `npm test` script; its suites run as `node tests/run-all.js`, which here gives
   51 run, 3 skipped for Electron, exit 0. Fixed: the project's own runner is used, and named.
6. **Its integrity notes never landed.** One note was over the 20,000-character limit, and that stopped every note.
   Fixed: lines and bodies are cut, pointing at the full list, and one failed note no longer stops the rest. On MASTERMIND: 3 notes,
   the largest 5,854 characters.

## Where MASTERMIND stands now (the real run)
- 1,371 files at the repo root (5 omitted: 4 git history bundles under dist/, and build/installer.nsh, because `build` is a skipped
  folder by the import config).
- Indexed in about 18 s: 1,357 components, 5,919 wires, 714 events, 95 routes.
- 16 phases, DAG clean. P1 has a dependency graph and is on the critical path.
- A build of P1 takes a Versionium snapshot, plans, and reaches the agent ladder. Here no agent is reachable, so it stops there; on his
  machine the agents take it from there.
- P0 ("one clean hardware cycle") names no files: it is his to mark done.

## Proof
- tests/modules/test-mastermind-ready.test.js 4/4 (MR-01..04, fixtures in MASTERMIND's shape).
- tests/modules/test-roadmap-import.test.js 5/5, with RI-01 extended.
- Unchanged: proof-run 7/7, phase-proof 7/7, repo-git 11/11, gates-solid 7/7, repo-history 20/20, opportunity 28/28,
  release-version 5/5, contract-phase-build 14/14, approval-chain 6/6, history-import-job 18/18, mcoc-import-baseline 25/25.

## Said, not changed
- `build/` is a skipped folder in the import config, so MASTERMIND's NSIS installer script (build/installer.nsh) is not imported.
  That is listed in the import's omitted files.
- 3 of its suites need Electron (npm install), which this environment does not have.
