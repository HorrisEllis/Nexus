# 0.60.468 — the wires carry nodes: .context, .contract, .chunk, any node type

James, 2026-11-09: "i meant the data that runs through the pipeline like idearium pipeline does, emerge, .contracts with .dag, .chunk, .context or any
of the nodes." · "look at the idearium pipeline, don't limit to just my request for the node types".

## Read first
Idearium's pipelines pass nodes, not text:
- the request spine: intent, context obligations, gaps, the chunked `.contract`, the phase DAG, gated steps, then cells;
- the spec engine's `.chunk` nodes;
- RAID's `.contract`;
- the import pipeline: MAPPING, CHUNKING, VERIFYING, INDEXING, GRAPHING.

The types are `lib/node-schemas` (75), each an envelope. Two he named were missing, and are now added (schemas and `KNOWN_TYPES`):
- `.context`: the spine's RQ7 answer, never kept as a node;
- `.dag`.

## Built
- **Takes and gives:** a pipeline task declares `takes` and `gives`, using any node type. `lib/automation/pipeline.js` keeps and validates them.
- **Each output is a node file:** a step's whole output becomes `nodes/<step>/out.<type>`.
  - The node itself, when the step gave one.
  - Otherwise wrapped as the type it gives, or as an `.output`.
- **Provenance:** each `.step` names the node files it took and the ones it gave.
- **The DAG:** `dag.dag` is a `.dag` node (`for`, `boxes`, `wires`), and each wire names the node types it carries.
- **The contract:** a request's contract is a real `.contract` node (schema.contract), in `contract.contract`. `run.run` points at it.
- **The node check:** a gate check `node` (and the shipped `node.gatetype`). A step's data must be a node of the named type, with every field its
  schema requires. A type Nexus does not define is a gap.
- **The full value:** the engine's task event carries the whole value for the host's files. COS strips it from the live stream, so the preview
  stays as it was.

## Proof
- `eg test cos/pipeline/test/gate.test.eg`: 8/8.
- `eg test cos/pipeline/test/runs.test.eg`: 5/5.
- `node tests/modules/test-cos-pipeline.test.js`: 9/9. CP-08 runs `.context`, then `.contract`, then `.chunk` through COS's real engine; a
  `.chunk` missing its fields closes its gate, named.

## Open
Steps that make these nodes from Idearium's own tools, by route:
- RQ7, context;
- RQ9, the chunked contract;
- RQ12, the phase DAG.
