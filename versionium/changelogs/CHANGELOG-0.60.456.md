# 0.60.456 — a Nexus pipeline opens on ERAVOS's own canvas

James, 2026-11-08: "no i meant the entire canvas. i want nothing about the canvas changed. i want the tools compatable with eravos independantly. eravos is the build surface for nexus. that way if something needs to be built, we can make a tool for eravos. not rebuild it." · "then it can be the entire visual surface for nexus. architect, the wire harness for a visual debugging ui, code generation ui for emerge, debugging, endless possiblies. already a domain for the automation, eventually i want ot add eravos as a system or a compartment at least. it should slot right in"

## What it does
- **ERAVOS gets tools, not a new canvas.** On ERAVOS's branch `claude/orchestration-domain` there is an Orchestration domain with one tool, the Box (`eravos.orchestration.box`), in ERAVOS's own format.
  - A Box knows no kind, system or address. It is given its kind, what it names, its state and its whole step.
  - It passes what arrives as `{ step, kind, ref, value }`.
  - Nothing in ERAVOS's canvas changed: its boundary test is 10/10.
- **Nexus hands a pipeline or procedure to ERAVOS as an ordinary `.erv`.** Emerge's `box.eg` writes it with `to_erv`:
  - one Box tool per step, laid out by the DAG;
  - the wires as dataflow wires;
  - written as JSON, which is YAML, so no YAML writer is needed.

  The route is `GET /api/cos/boxes?as=erv`, and the row is `cos erv <pipeline>` (agents and copilot reach it too). ERAVOS opens the file with its own Open.

## Proof
- `eg test cos/automation/test/box.test.eg`: 9/9.
- `test-pipeline-box`: 5/5. PB-05 reads the `.erv` through COS.
- In ERAVOS's real canvas, Nexus's `fiverr-gig.erv` opens with `Erv.open` as 3 boxes and 2 wires, with no faults. The screenshot is `docs/previews/orchestration.png` there.
- Box tool contract 4/4; its own tests 3/3; 259 manifests valid.

## Next
- Run state on the boxes, from COS's run events.
- The cockpit's Pipelines page retired once he has seen the canvas.
- ERAVOS as a Nexus system (ERV1).
- His list, each a domain of tools when asked: Architect, the wiring harness as a visual debugger, the Emerge code-generation UI, debugging.
