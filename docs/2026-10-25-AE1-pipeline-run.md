# AE1 — Idearium pipeline dry run (simulate before building)

James, 2026-10-25: "can you build like idearium would be building. like simulate the pipeline as much as possible."

Built the way the pipeline builds: a phase does not get code until its graph passes (DG2) and the boundary ratchet and
verify-first gates clear. This is the dry run the pipeline does first — no files changed. It is grounded in the real graph,
loom wiring and the actual consumer code (§0.1), and it stops where a gate blocks, naming why (§1.2).

```
══ AE1_move_the_core — pipeline dry run ══════════════════════════════
phase: docs/2026-10-25-automation-engine-to-orchestrator-phasemap.spec::AE1_move_the_core

[GATE 1 · DG2 graph] PASS  — graph 667d1ab3 present

[GATE 2 · plan] move 8 files  clear-glass → orchestrator/automation/:
   mv  clear-glass/src/mesh/automation-engine.js
   mv  clear-glass/src/automation/cron.js
   mv  clear-glass/src/automation/template.js
   mv  clear-glass/src/automation/steps.js
   mv  clear-glass/src/automation/dom.js
   mv  clear-glass/src/automation/nodes.js
   mv  clear-glass/src/automation/from-macro.js
   mv  clear-glass/src/automation/templates.js

[GATE 2 · plan] PASS  — 8 files, all present: true

[GATE 3 · boundary ratchet] if the 8 files move but these stay, each becomes a NEW crossing INTO the orchestrator:
   ✗ clear-glass  clear-glass/src/mesh/agent-mesh.js  →  automation-engine.js   (new AutomationEngine() + .start() — OWNS + RUNS it, sync)
   ✗ clear-glass  clear-glass/src/automation/routes.js  →  automation-engine.js   (NODES_DIR const)
   ✗ clear-glass  clear-glass/src/ipc/bridge.js  →  automation-engine.js   (NODES_DIR const)
   ✗ clear-glass  clear-glass/src/main/index.js  →  agent-mesh (_automation)   (setHooks + emitEvent, sync)
   ✗ clear-glass  clear-glass/src/gates/index.js  →  agent-mesh (_automation)   (listWorkflows/getWorkflow/runWorkflow, sync)
   ✗ clear-glass  clear-glass/src/macros/live-recording.js  →  nodes.js   (require)
   ✗ lib (core)   lib/agent-tools/tools/clear-glass/macro.js  →  nodes.js   (require)

[GATE 3 · boundary] REFUSE — NEW CROSSING  — 7 consumers would cross clear-glass/lib → orchestrator; a bare move is REJECTED (DG2: design it out first)

[design-out] the engine must RUN in the orchestrator; every consumer reaches it by port (nexus-client → :9000):
   · agent-mesh: stop `new AutomationEngine()`; its automation methods call the orchestrator door
   · routes.js/bridge.js: NODES_DIR from the orchestrator (or a shared core const)
   · lib macro.js: node-building over the door

[GATE 4 · verify-first] the design-out changes clear-glass/src/{mesh,gates,main}.js:
   · agent-mesh automation methods are SYNC today (listWorkflows() → array); the port is ASYNC (nexus-client.call)
   · consumers gates/index.js + main/index.js call them SYNC → a sync→async ripple across the Electron app
   · the Electron app + the clear-glass automation suites need a RUNNING app — not available headless

[GATE 4 · verify-first] BLOCKS HEADLESS  — the live two-process (orchestrator + Clear Glass) run and the sync→async change can only be verified on his machine

══ VERDICT ══════════════════════════════════════════════════════════
AE1 is ATOMIC and LIVE: the move + orchestrator-ownership + the clear-glass port are one cutover
(a bare move fails the boundary gate; the port fails the verify-first gate headless).
Deterministic gates I CAN prove here: moved files parse+resolve, engine unit tests at the new path,
the AU1 registry re-point (test green), loom shows the engine sovereign under the orchestrator.
The LIVE gate (running Clear Glass ↔ orchestrator, the sync→async surface, the CG automation suites) is yours.
```

## What the simulation decides (and what I build vs you verify)

AE1 is **atomic and live** — the file move, the orchestrator taking ownership, and Clear Glass reaching it by port are one
cutover. A bare move fails the **boundary ratchet** (7 consumers would cross into the orchestrator). The port cutover changes
Clear Glass's `agent-mesh` sync methods to an async door and ripples into `gates/index.js` + `main/index.js` — which fails
**verify-first** here, because the running Clear Glass Electron app and its automation suites are not available in a cloud
container.

**I can build and prove headless:**
- the 8 moved files parse and resolve under `orchestrator/automation/`;
- the engine's own unit tests (pure Node) pass at the new path;
- the orchestrator instantiates + serves the engine's door on :9000; agent steps route through RAID;
- the AU1 registry re-point (:7704 → :9000) keeps `test-automation-registry` green;
- loom shows the engine sovereign under the orchestrator; the boundary census shows no new static crossing.

**Only your machine can verify (the live gate):**
- the running Clear Glass ↔ orchestrator two-process behavior;
- the sync→async change across the Electron app;
- the Clear Glass automation suites and the browser-step port (AE2).

So the move is real and ready to build — but landing it means a two-process cutover that can only be *confirmed* with Clear
Glass running, which is yours. Say go and I build the full cutover in one reversible commit, prove every gate above here, and
hand you the live verify.
