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

---

*The same number, a second release (two sessions released 0.60.454 on 2026-11-08; merged together, nothing lost, §0.3):*

# 0.60.454 — PIL3 slice a: Pillar's conformance, and its first finding

James, 2026-11-08: "Continue." · "Focus on primitives. Build using emerge right?"

- **Conformance in Emerge.** `pillar/conformance/conform.eg` is the judge, and `constraint.eg` holds 7 known answers for pillar:constraint.
  - The cases are derived from the contract, as data, and each carries its provenance.
  - A case without provenance is refused.
  - Nothing conforms without a boundary case and an adversarial case.
- **Emerge's JS core answered through its own harness** (`tests/modules/test-pillar-conform.test.js`), and Pillar judged. Pillar never runs foreign
  code.
- **Finding:** 6 of 7 pass. The JS core's `evaluate()` treats a needed field holding `null` as present, while the contract and Emerge's language
  say it is a gap. It is recorded, not fixed here; which side is right is his call.
- **Proof:** conform.test.eg 5/5; test-pillar-conform 3/3, registered in run-all.
- **Next:** pillar:history, run against Emerge's History and WARP's Ledger, with the differences named.
