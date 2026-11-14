# 0.60.534 — BrainOS's backend, the automation engine, moves into COS's own folder

James, 2026-11-14, of the pipeline editor previews: "no the field/workshop would be an extensive editor for gates and steps. all of the pipeline
and workflow automation, systems, commands, all of it, everything, migrating brainos backed not the ui its bad the ui and scrapping it" · then:
"yes and orchastrator, and autopilot are supposed to migrate to the super viser".

## What BrainOS's backend is
BrainOS's screens (lib/ui/brainos, lib/ui/brainos-float) were thin clients over the automation engine: workflows, runs, pipelines, macros,
triggers, steps, the 28 browser actions, the condition operators. COS already ran that engine (AE6, cos/manager/automation-door.js), but its
code still lived in lib/, which is not a home for what a system uses (his rule, 2026-11-03).

## Moved (SW5i slice a, expanding AE6 slice b)
- `lib/automation/*.js` (11 files) → `cos/automation/`, `lib/automation-nodes.js` → `cos/automation/nodes.js`, `lib/automation-registry.js` →
  `cos/automation/registry.js`, by git mv (history kept, `git log --follow`).
- Each old path is now a one-line forwarder that names its new home, so Clear Glass, Idearium and the tests keep working until they reach
  COS by route (slice b), then the forwarders are retired (slice c).
- COS's door (`cos/manager/automation-door.js`) and pipeline (`cos/pipeline/index.js`) load the engine from `cos/automation/`.
- Data stays where it was (the engine's data root is unchanged).
- AE6 planned this move after Clear Glass stopped running its own copy (AE5). Here the move comes first, with forwarders. Found after SW5i was
  written; logged on AE6 in the ledger.

## Not done here
- Clear Glass still runs its own copy through the forwarders. His call the same day: "dont worry about clearglass right now".
- BrainOS's UI is not moved: it is scrapped by its own phase once the Workshop covers it.
- The orchestrator and autopilot into COS's supervisor: already mapped as SW5 and SW5a (docs/2026-11-13-sovereign-and-wired-phasemap.spec).

## Proof
- `node tests/modules/test-cos-automation-home.test.js`: 3 passed, 0 failed (the files are home; each forwarder names its home and gives the
  same module; COS loads nothing from lib/automation).
- Unchanged and passing: automation-engine 16, automation-nodes 8, automation-v2 18, automation-registry 11, cos-pipeline 21, pipeline-nodes 5,
  cos-hub 10, orchestrator-automation 12, automation-driver-port 3, automation-settings-ui 8.
