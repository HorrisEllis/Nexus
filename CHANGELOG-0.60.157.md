# 0.60.157 — 2026-10-18

James: "associative lattice, every data node, is a node in the associative lattice, interconnected by the timestamp and cuasal
graph." · "need to get them done bottom up. really need it all working."

GM4 is built. It is the second piece of the gating census's layer 1 (`docs/2026-10-18-gating-census-phasemap.spec`).

## The node lattice

### `intelligence/lattice/node-lattice.js`

Every data node of every system, in one lattice. It is a projection, not a store: each system's nodes are read through Idearium's
route, never from intelligence, and the node files stay the truth.

| Edge | Formed when | Weight |
|---|---|---|
| causal | a node's causedBy names another node | strongest |
| wire | a `.wire` node joins two systems | |
| reference | a node names another node's id, including inside a sentence | |
| temporal | two nodes happened within the window of each other | weakest, and never a cause |

- **What does not count as a reference:**
  - ids under six characters;
  - a name shared by more than eight nodes.
- **What time means.** "When it happened" is the payload's own time, not the time the file was exported. The first run measured
  why this matters: a batch export stamps hundreds of nodes in one second, and joining those would be noise passed off as
  context.
- **The kind travels with every answer**, so a temporal neighbour is never read as a cause. This was the map's pushback, now
  kept in code.

### `lib/node-edges.js`

Each node's edge projection, read from its file: id, type, system, its time and where that time came from, its causes, the short
strings that may name other nodes, and a wire's from and to.

## Delivered in order

- **Backend:** the two files above.
- **Idearium routes:**
  - `GET /api/system/nodes` lists the systems that keep nodes.
  - `GET /api/system/nodes/:system?edges=1` serves each one's edge projection. It works with or without a node database, so the
    five systems the route said had "no database yet" are read the same way.
  - `POST /api/lattice/neighbours` is the UI's door to intelligence, by route.
- **Intelligence routes:** `POST /api/intelligence/lattice/neighbours` and `GET /api/intelligence/lattice/nodes`, both declared in
  `intelligence/registry-components.js`.
- **Command rows:** `lattice neighbours <node | words> [--kinds] [--window] [--limit]` and `lattice nodes`.
- **UI:** the agent's `/lattice <node | words>`. It is checked at source level by NL-04. It was not driven in Clear Glass, for
  the same reason as `/find` in 0.60.156.
- **The pipeline:** the context stream's lattice row (0.60.156) now gets answers. Every gate's context includes what is joined to
  it.

## Measured on this tree

| | Count |
|---|---|
| Nodes | 1,491, in 14 systems |
| Reference edges | 1,176 |
| Causal edges | 0 |
| Wire edges | 0 |
| Nodes with their own event time | 322 |

The zeros are reported, not hidden:
- No node yet names a cause that is another node. FMR0 and IDS3 make writers pass causedBy.
- This tree has no `.wire` node files.

## Proof

| Test | Result |
|---|---|
| `tests/modules/test-node-lattice.test.js` | 4/4 |
| `test-system-boundary` | 10/10 |

The node-lattice test checks:
- the four edge kinds;
- that export times never join;
- that dangling causes are counted;
- that the real route reads every system that keeps nodes;
- that the lattice reads no files itself;
- that it answers the context stream;
- the wiring.

The test is registered in `run-all`, and loom is wired in `loom/maps/build-surface-map.js`.

## Also in this release: LM0, and the three tests that were red on main

### LM0: loom's registry rebuilds the same way twice

James, 2026-10-13: "what aboiut 34000 lines? can you check that for me?" This was found that day, and it was still open.

**The cause, in two parts:**
1. **A wire's id was its position in the scan** (`source.wire.<n>.<from>--<to>`), so one new file renumbered every wire after it.
2. **Every record that still existed was re-declared and hard-rejected as a duplicate.** On 2026-10-18 that was 6,333
   "failures", and the bootstrap exited 1 every time, so a real failure would have been buried.

**The fix:**
- A wire's id is its endpoints (`loom/scanners/source-map.js`).
- The numbered scan wires are pruned as superseded.
- A re-declaration identical to the stored record counts as unchanged. One that differs replaces it (`loom/bootstrap.js`).
- Only a rejection for any other reason is a failure.

**Proof:**
- **Two bootstraps in a row** give the same set of components, hooks and wires: 3,482, 3,432 and 4,496.
- **Duplicates collapsed.** Wires went from 19,677 to 4,496.
- **Edges carried over.** An edge that lived only as a numbered wire is carried under its stable id when the source still
  proves it. 11 were carried.
- **Edges dropped.** 18 were dropped because the source no longer requires them. One example is guardian's `jaa-store` →
  `lib/ledger-store.js`: that file requires `lib/jaa-store.js` instead.
- **Still open:**
  - 619 wires whose endpoint hooks were never declared. This is LM0's "unresolved export hooks", now counted cleanly.
  - 470 records still read "replaced" on a second run, because something in their payload changes between runs.

  Both are next in layer 0.

### Red on main, now green

| Test | Owner | Cause | Fix |
|---|---|---|---|
| BP-01, "every build path goes through WARP" | the coder | the test writer from TF2 (0.60.141) called its agent outside WARP | it is wrapped like the plan, `kind: 'phase-test-first'`, cache mode, a retry asked fresh |
| PB-05, broken imports | none | three of the 16 came from `tests/modules/fixtures/hat-seed-proposed-0.60.73.js`, a file kept as an agent proposed it and read as text, never run | `cos/runtime/run.js resolveDeps` skips `fixtures/` as it already skips `_archive/`, said in its comment. 13 are left, all tests of removed modules (his call, already listed) |
| LM-07, a stale pin | none | since 0.60.105 the rejected agent is told through `_learnFromRejection`, and the test still looked for the old direct call | the pin follows the current path, and the behaviour is unchanged |

### QA1: four more catalogue checks run

| Check | What it requires | How it is fed |
|---|---|---|
| CK-231, half-states | no run stopped half-way past its timeout without a row saying why | `lib/run-watch.js`'s own definition of "ended"; Idearium's checks route hands in the run rows, so lib does not reach into a system's table |
| CK-237 | every contract condition names a machine check (test, exists, evidence, gate, check), never a free sentence | the contracts |
| CK-239 | every edge in loom's registry has two ends | loom's registry |
| CK-252 | every catalogue check names one of the twelve primitives | the catalogue |

- **Checked against planted defects.** Each runner goes red on a planted defect and green on the clean case, as CK-246 asks:
  `tests/modules/test-checks-layer-one.test.js` 4/4.
- **What the real tree answered:** CK-252 is green over 122 checks, and CK-239 is green over 19,677 wires.
- **No input, no pass.** A check given nothing to read is unverifiable, never a pass.

There are 11 runners now.

### RD0, the declaration half: RAID's routes and events where the contract checker reads them

- **Routes.** `cortex/interaction-contract.json` was missing three RAID routes that `cortex/boot.js` serves:
  `GET /api/raid/status`, `GET /api/raid/officiator` and `POST /api/raid/officiator/unpark`.
- **An event.** `cortex/event-taxonomy.js` was missing `HEAL_REQUESTED`, which self-heal's escalation and RAID's contract intake
  both emit.
- **Still open in RD0:**
  - `/api/raid/decide` reading its POST body;
  - the contract lifecycle on the bus;
  - folding `cortex/core/raid/event-taxonomy.js` into cortex's own taxonomy. Those are two vocabularies, and they are surfaced
    here, not collapsed silently.

### EC-05, red on main, now green: events emitted and never declared

Fourteen events across five systems were emitted with no declaration. Each is now declared in its own system's taxonomy, with
its payload read at the emit site:

| System | Events |
|---|---|
| idearium | `idearium.phase.mapped`, `idearium.repo.carved`, `idearium.repo.released` |
| cos | `op.start`, `op.done`, `auto.switch` |
| versionium | `versionium.tagged`, `versionium.released` |
| clear-glass | the chat crawler's five `crawl.*` events, and `tls.layer.state` |

`test-event-contracts` is 8/8.

## Next in layer 1

- **LM0:** stable wire ids.
- **GW5:** tool parity.
- **QA1:** the rest of the catalogue: CK-234–236, 238, 240–246 and 249–251.
- **RD0's other half, and RD1's read commands** (status, queue, decide). RD1's axiom and gate editing waits on his call,
  `decision_axiom_edit_authority`.

