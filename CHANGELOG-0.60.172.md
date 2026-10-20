# 0.60.172 — 2026-10-19 — every phase sits in one checked DAG

James, 2026-10-19: "okay all of the idearium phases. every phasemap phase needs extensive dag, that needs to start being standard."

## Built
- **DG3 `lib/phase-dag.js`** — one DAG across every phasemap of a repo, decisions included: declared and inferred edges, cycles, dangling depends_on, phases with no depends_on line, layers, the ready set, the critical path of open phases, and phases changing the same files with no order between them. Each phase gets a slice: everything upstream and downstream, what blocks it, what finishing it unlocks, its conflicts.
- **The build checks it** — a phase in a cycle or with a depends_on that names nothing is refused (409 `DAG_INVALID`; `anyway` overrides, said). The slice is written with the phase's graph and shown on the graph route.
- **Read it** — `GET /api/repos/:uuid/phases/dag[?phase=&map=&cross=1]` · `repo dag <repo> [phase]`.
- **The standard** — written into docs/CLAUDE.md: a depends_on line on every phase (`[]` when none), every name resolving, no cycles, files named.

## Nexus's own maps, as it reads them
149 maps · 1744 phases · 61 decisions · 1272 edges · 11 layers · 556 ready · critical path of 9 open phases · 3 cycles (PV0⇄PV1, PL6⇄RF0, GA6⇄GA9) · 25 dangling (some are prose a malformed depends_on line swallowed; some name decision keys this reader does not find yet) · 525 phases without a depends_on line. Fixing them is DG4 — his call on each cycle.

## Proof
`test-phase-dag` 8/8 · phase-graph 5/5 · phase-deps-gate 3/3 · contract-phase-build 15/15 · chunked-phase-build 17/17 · verify-first 10/10.

## Not proven
Not run on Windows. The Phases panel does not draw the DAG yet (DG5) — it shows the slice's lines through the graph route.
