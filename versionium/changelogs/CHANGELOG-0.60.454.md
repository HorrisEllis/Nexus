# 0.60.454 — PC1 reachable everywhere: commands, agents, copilot, and COS's Pipelines page

James, 2026-11-08: "cli commands, agent tools, copilot commands, inject nodes to agents. keep going. i want this built and added to cos ui."

## What it does
- **COS shows any pipeline or procedure as boxes and wires.** It uses Emerge's box shape (`cos/automation/box.eg`):
  - a pipeline comes from COS's own automation engine;
  - a procedure comes from Idearium, by its route.
- **Routes:** `GET /api/cos/boxes?pipeline=<id>` or `?procedure=<id>`, and `GET /api/cos/procedures`. Both are declared in COS's contract, its own registry.
- **Commands:** `cos boxes <pipeline>`, `cos boxes --procedure <id>`, `cos pipelines`, `cos procedures`.
  - They are rows of the one command table, so agents and copilot have them through `nexus.command` (copilot's chat tools carry it). No second tool list.
  - None is person-only.
- **The cockpit's Pipelines page:**
  - lists pipelines and procedures;
  - draws the chosen one with each box coloured by kind (gate, system, agent, macro, pipeline, procedure, tool, build), its ref and id, and whether it is gated;
  - draws curved wires from its DAG;
  - shows a box's whole shape on click, and names every fault.

  It is read-only. Editing happens on the ERAVOS canvas (PC4).

## Fixed
- **The cockpit refused every automation route.** AE6 declared `GET|POST|PATCH|DELETE /api/cos/automation/*`, and the cockpit matched the method as one word. It now reads a `|` list. test-cos-ui CU-02 now reads the contract through the cockpit's own `allowlist()`.

## Where it lives
- **The shape:** Emerge (`cos/automation/box.eg`, `cli.eg`).
- **COS's door to it:** `cos/manager/boxes.js`. It is JavaScript only because COS's manager contract names JavaScript, and it holds no logic of the shape.
- **The page:** `cos/ui/pipelines/`.

## Proof
tests/modules/test-pipeline-box.test.js: 5/5. PB-05 is new:
- a pipeline made in COS's engine comes back as 4 boxes and 4 wires with no faults;
- a stand-in Idearium's procedure comes back as tool, gate, gate;
- an unknown pipeline is 404; a missing name is 400;
- the cockpit forwards the route;
- the three command rows are reachable by agents;
- Clear Glass drives the page: 4 boxes, 4 wires, a box's detail, then the procedure.

test-cos-ui: 6/6. test-cos-hub: 5/5. test-cos-deploy: 5/5. test-cos-network: 5/5.

## Open, his
"inject nodes to agents" can be read two ways. The question was put to him with the release.
