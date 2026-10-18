# 0.60.156 — 2026-10-18

James: "it needs to be non linear and agnostic" · "look at siso" · then: "need to get them done bottom up. really need it all
working."

GM5 is built. It is the first piece of layer 1 of the gating census (`docs/2026-10-18-gating-census-phasemap.spec`), to the
design of `docs/2026-10-18-gate-memory-phasemap.spec` addendum (b).

## The context stream

### `lib/context-stream.js`

It is built on `siso/`: Event → Gate → Stream, with a StreamLog.

- **The flow.**
  - A `context.request` reaches the request gate.
  - The request gate emits one `context.ask.<signature>` per source.
  - Each source gate emits its `context.piece` events.
  - The piece gate collects them.
- **No order.** Every free source is asked at once. The answer is the same whatever order the pieces arrive in.
- **Residue.**
  - A source named in the table but with no ask stays in `pending[]` and is reported as `absent`.
  - A source that errors is `failed`, with its reason and the phase that builds it.
  - The need no piece covered is named.
- **Inside out, as cost.** Only that residue is asked of a `model` source. What is still uncovered is returned as `build`, which
  is what a build would be asked. The finder never builds.

### `lib/context-sources.js`

This is the table. A source joins by adding a row, and the finder names none of them. The rows:

| Row | What it reads |
|---|---|
| atlas | `lib/context-atlas.js` |
| components | the component store |
| ledger | the gate's own contract ledger, through gate-context |
| vector | vector memory. It says when it was never initialised instead of answering empty |
| intuition | intelligence's route |
| lattice | GM4's route, asked and failing until GM4 serves it |
| fulfilled | GM3's route, asked and failing until GM3 serves it |
| agent-tools | the model tier |
| build | the build tier |

Another system is reached only by its route.

## Delivered in order

- **Backend:** the two files above.
- **Routes:**
  - POST `/api/context/find`
  - POST `/api/repos/:uuid/context/find`
  - GET `/api/context/sources`
- **Command rows:** `context find <text> [--need=a|b] [--repo] [--gate] [--sources]` and `context sources`.
- **UI:** `/find <words>` in the repo agent's panel prints each piece with its source, kind and score, then what failed, what
  was absent and what was not found. It is checked at source level by CS-05. It was not driven in Clear Glass this release:
  the panel's commands have no Clear Glass harness yet, and that is said here, not hidden.
- **The pipeline:** every gate's attempt (`idearium/api/index.js` makeAttempt) asks the stream once per gate and carries its
  note after the gate's own context. The gate's ledger is already in that note, so it is not asked twice.
  `NEXUS_CONTEXT_STREAM=0` turns it off.

## Fixed on the way: a regression of the coder's

The boundary test run for this release found SB-06 red on main. In 0.60.153, the coder's `lib/readme-generate.js` required
`loom/scanners/phasemap-map.js`, which is a lib → loom crossing.

- **The fix:** the phases are handed in by `scripts/generate-atlases.js`, which belongs to no system.
- **Result:** `test-system-boundary` is 10/10. SB-08 was also red on main, and passes with it.

## Proof

| Test | Result |
|---|---|
| `tests/modules/test-context-stream.test.js` | 5/5 |
| `test-gate-context` | 6/6 |
| `test-work-journal` | 5/5 |
| `test-system-boundary` | 10/10 |

The context-stream test checks:
- the same answer from three sources in three arrival orders;
- absent and failed sources reported as residue;
- the model asked only the residue;
- a fourth source joining by one row;
- a signature collision as a hard error;
- the real table answering.

The test is registered in `tests/modules/run-all.js`, and loom is wired in `loom/maps/build-surface-map.js`.

## Next in layer 1

- **GM4:** the node lattice, and with it the lattice row starts answering.
- **LM0:** stable wire ids.
- **GW5:** tool parity.
- **QA1:** the remaining catalogue runners.
- **RD0/RD1:** RAID's own contract and commands.
