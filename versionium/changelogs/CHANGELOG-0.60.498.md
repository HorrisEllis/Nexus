# 0.60.498 — the sovereignty scorecard (SW0)

James, 2026-11-13: "We need each system sovereign. Then using the drawbridge as the only way to access files. Basically looms map but per
system and it’s in charge of its own map. They all need routes and command nodes, with events per call and command" · "Each system needs
their database and server.js." · asked whether to build the scorecard while the pipeline is proved on his machine: "Yes."

## Built
- `cos/sovereign/card.eg`, in Emerge: for each system, whether its own folder holds
  - a `server.js`;
  - its registry;
  - its contract;
  - its event taxonomy;
  - command nodes (counted);
  - its own data folder;
  - and whether its data is still at the root (`data/<system>`).
- The ratchet (`worse`): a part lost, fewer command nodes, or data back at the root is named. A reading is not kept while anything is worse.
- Through COS: `GET /api/cos/sovereign`; `POST` keeps the reading (a person's; an agent is refused); `cos sovereign [--keep]`.

## First reading (2026-11-13, kept in cos/sovereign/baseline.json)
0 of 14 systems whole; 63 of 98 parts.

| System | Parts | Lacks |
|---|---|---|
| guardian | 6/7 | data still at the root |
| intelligence | 6/7 | data still at the root |
| emerge | 6/7 | command nodes |
| copilot, cortex, diagnostic, versionium | 5/7 | command nodes; data still at the root |
| ollama | 5/7 | event taxonomy; data still at the root |
| cos | 4/7 | server.js, registry, command nodes |
| loom | 4/7 | event taxonomy, command nodes; data still at the root |
| architect, clear-glass, idearium | 3/7 | server.js, event taxonomy, command nodes; data still at the root |
| orchestrator | 3/7 | server.js, registry, command nodes; data still at the root |

## Mapped
`docs/2026-11-13-sovereign-and-wired-phasemap.spec`: his five decisions and SW0–SW7, expanded the same day with the node taxonomy, a command
with events for every capability, a database and server.js per system, and the heartbeat (PR6).

## Proof
`cos/sovereign/test/card.test.eg` 3/3; test-cos-pipeline 21/21 (the route on the real tree).

## Not on the card yet
The crossings between systems (Idearium's `system sovereign` has them), an event per call, a database per system. "Data still at the
root" was read in the coder's container, where test runs made those folders; his machine is read when he runs `cos sovereign`.

## JavaScript, said
The card is Emerge. Its door is a few lines in COS's existing JavaScript door (`cos/pipeline/index.js`).
