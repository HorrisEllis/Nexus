# Node type → system map — Diagnostic

James, 2026-10-17: "the diagnostic needs to be a real system matching genasis." Genesis 1.5.0's `spec/<system>.node-taxonomy.spec`:
each node type diagnostic holds, and where it comes from. The legend is the same as Guardian's, Versionium's and the healer's
(`healer.node-taxonomy.spec`, kept beside this one: the healer joined diagnostic in 0.60.136).

| Type | Status | Grounding |
|---|---|---|
| `capability` | WRITES | `diagnostic/registry-components.js`: the healer's 5 rows and the 30 routes of `interaction-contract.json`, read from it. `lib/system-nodes.js` writes one node per row into `data/nodes/capability/`. |
| `command` | WRITES | The same rows, each marked declared or served (`data/nodes/command/`). `node diagnostic/cli.js` runs them. |
| `system` | WRITES | `data/nodes/system/diagnostic.system`: port, entry, counts, and its relations (`depends_on`, `consumed_by`). |
| `wire` | WRITES | One per system diagnostic requires (`data/nodes/wire/diagnostic--<system>.wire`, `lib/system-boundary.js`). Today: cortex, intelligence, lib, loom. These are the crossings it must close to be sovereign. |
| `healer_proposal` | WRITES (as rows) | `schemas/schema.healer_proposal`. The proposals live in diagnostic's own store (`data/jaa`, table `healer_proposals`), not as node files yet. |
| `component`, `hook`, `node` | VIA LOOM | `loom/scanners/capability-map.js` reads `diagnostic/registry-components.js`. |

Every type above is indexed into diagnostic's own node database, `data/node-index`, by its node registry
(`lib/node-registry.js`), which diagnostic's process starts at boot. That database holds an index and a ledger of every
change.
