# 0.60.462 — the supervisor is the orchestrator; the Automation tab's backend first

James, 2026-11-08: "no, the cos backend, or the supervisor is the orchastrator. ui is only ever supposed to use the cli and api routes while floating on the interaction contract. like always backend first, with commands, events, and updated maps."

## Decided (AE_D6, his)
The orchestrator is COS's backend, its supervisor. COS's UI is a projection: it only uses COS's command line and API routes, on the interaction contract. This supersedes AE_D5's "Cos ui is the orchestrator", which is kept with a pointer to this decision.

## Changed
- **COS's command line gains the pipeline commands the Automation tab needed:**
  - `automation pipelines`: the list;
  - `automation pipeline <id>`: its steps and its last run;
  - `automation pipeline-run <id>`: runs it;
  - `automation runs [id]`: the runs;
  - `automation stop <run>`: stops a run;
  - `automation pipeline-export <id> [file]`: writes the real `.pipeline` file.

  `automation import` now takes `.pipeline`, `.workflow` and `.macro` files. Running, stopping and importing are a person's act; an agent proposes them.
- **COS's contract declares the four pipeline events:** `automation.pipeline.start`, `.task`, `.done` and `.created`.
- **The page no longer calls itself the orchestrator.** It says everything on it is also a command.

## Proof
`test-cos-hub` 7/7. HB-07 now runs, lists, exports and imports by command as well as on the page, and checks the events are declared.

## Mapped
- His Settings layout is recorded on SC7: a Network tab, a Startup and services tab, an Update tab, and no compartment named in the UI's code. A preview comes before it is built.
