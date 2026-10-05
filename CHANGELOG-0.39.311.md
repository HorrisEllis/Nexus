# 0.39.311 — 2026-10-05

James: "like with the genasis spec, needs to have the component registry event interaction contract, with the heartbeat and pulse system, node based data structure using jaa tables as a node index."
James: "like can you make sure this is all added to the system template. like look at the architecture spec. this needs to be mapped first"

## Mapped first: the system template
`docs/2026-10-05-build-from-the-spec-phasemap.spec` 1.3.0. Three files describe what a sovereign system is, and none of them is complete:

| Where | Has | Missing |
|---|---|---|
| `genesis.spec`, the default template for a system spec | interaction contract, registry, pulse | JAA and a node index, until today |
| `docs/architecture-spec/architecture-spec.spec` | JAA node index, watcher, ledger | pulse, event taxonomy |
| `architecture-spec.template.yaml`, the system spec template | — | interaction contract, taxonomy, CLI, JAA; heartbeat and pulse get one line each. No code reads it. |

Measured against Guardian, no system has all seven pieces of the shape.

**Phases added:**
- **SB17:** one complete shape in all three files.
- **SB18:** the template is actually used when a system spec is built.
- **SB19:** atlases list each component with its routes, commands, events and node types.
- **SB4:** widened to check every system against Guardian, element by element.

## Built before it was mapped: SB16, genesis 1.2.0 Domain 2d "nodes"
I wrote this before the map, against your rule. It's recorded as built-before-mapped and committed with the map. It describes Guardian's real model:
- **The record:** the node's file (`data/nodes/<type>/<id>.<type>`) is the canonical record.
- **The index:** one JAA table per node type (`nodes_<type>`), with an append-only ledger table (`nodes_<type>_ledger`), in the system's own data folder.
- **Types and checks:** a schema per type, the types named in the taxonomy, and a watcher per type folder.
- **Moving data:** data moves between systems as nodes, through the interaction contract.

It also adds the file `registry/node-index.js`, a binding that makes every node change an Event, the axiom `NODE_INDEX_IS_JAA`, and node counts in the pulse.

## Proof
- **Genesis's own wiring check:** clean, 42 files, 7 layers.
- **`test-genesis-and-architecture-spec`:** passes **5/5**. GA-04 now checks the nodes domain.
- **`test-manifest-phase1`:** passes **16/16**. Its pinned count is 42 files, one more for the new file.
- **Unchanged:** every other suite that reads genesis passes.
