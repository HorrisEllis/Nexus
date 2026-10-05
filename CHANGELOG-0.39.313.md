# 0.39.313 — 2026-10-05

James: "yes add it the spec for genesis. like genesis is the exact architecture for a new system template. like look at the directory. loom, like it needs to build a new system. and click into it. like look at the atlas template"

## Genesis is the template's architecture (genesis 1.3.0)
- **Domain 0a "shape":** for each section of the system template, it names which part of genesis that section is.

  | Template section | Genesis part |
  |---|---|
  | identity | identity, the system node, its data folder, config, heartbeat |
  | context | axioms, spine, sovereignty, config layers, pulse, phases |
  | file structure | the manifest |
  | modules | compartments with their seams, config and node types |
  | components | component nodes with capability, command and event nodes |
  | generated | contract, taxonomy, node index, registry, atlas, never written by hand |

  A template section with no domain, or a domain with no section, is a gap.
- **`capability_node`** is added to the registry domain. Each command now invokes one of its component's capabilities.
- **His rules as axioms:**
  - `COMPONENT_SHAPE`: every component has at least one capability, at least one command, and its events, each a node.
  - `SYSTEM_OWNS_ITS_OWN`: a system holds its own data, schemas, contract, config, heartbeat and pulse, in its own folder.

## The three agree (SB17 done)
- **The system template** names genesis as its architecture.
- **`docs/architecture-spec/architecture-spec.spec` 0.9.0** extends genesis 1.3.0 and defers to it for pulse, the taxonomy, the component shape and ownership.

## Mapped (build-from-the-spec 1.8.0)
- **SB24, Loom builds a new system you click into.** `loom/templates/system-scaffold.js` can already build a system, but nothing calls it, and its output isn't shaped like genesis.
- **SB25, the atlas template in his structure.** It's already close: each module lists its commands with the node each acts on. It still uses separate sections and has no capabilities or node types per component.

## Proof
- **Genesis wiring check:** clean, 42 files, 7 layers.
- **`test-genesis-and-architecture-spec`:** passes **5/5**. GA-04 now checks the shape domain, capability nodes and both axioms. GA-01 now accepts the architecture spec at 0.9.
- **Unchanged:** `test-manifest-phase1` 16/16, `test-system-template` 5/5, `test-build-from-the-spec` 5/5, `test-nexus-atlas-refs` 51/51.
