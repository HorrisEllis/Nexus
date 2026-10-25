# 0.60.251 — AE1: the automation engine is the orchestrator's now (nothing coupled)

James, 2026-10-25: "the orchastrator" · "just make sure you dont couple anything. modules are supposed to be the same way." · "merge and push. once we can orchastrate. well be closer to being able to have nexus build itself."

Built the way Idearium builds (his "simulate the pipeline") — the DG2 move-aware graph (0.60.250) named the crossings the move would create, and each was designed out before the move, not caught by the ratchet after.

## What moved
- `clear-glass/src/mesh/automation-engine.js` → `orchestrator/automation/engine.js`, with its neutral helpers (`cron`, `template`, `steps`, `dom`, `from-macro`, `templates`) and the door (`routes.js`). The engine is the platform's; it now lives in the system whose job is orchestration, so automation no longer depends on a front-end being up.
- `nodes.js` → `lib/automation-nodes.js` (**core**): a node-file utility used by ≥2 systems, so by the placement axiom it is the kernel's — reachable by clear-glass, lib and the orchestrator with no crossing. It is the one source of `NODES_DIR`.

## Nothing coupled (his rule)
The engine is a dependency-injected neutral core — it *receives* its hooks, it never reaches into a system. So:
- the **orchestrator hosts it** (`orchestrator/automation/index.js`): constructs it, serves `/automation/*` on :9000, provides hooks — browser/macro steps are a fail-soft port back to Clear Glass (:7704), agent steps route through RAID.
- **Clear Glass reaches it by port** (`clear-glass/src/mesh/automation-client.js`), never by require — a cache-backed client that keeps `agent-mesh`'s sync read surface, so no consumer rippled. Zero static crossing.

DG2 on AE1 now reports **0 created crossings**; the boundary ratchet is green.

## Proof (headless)
automation-engine 16/16, automation-v2 18/18, automation-nodes 8/8, automation-registry 11/11, test-system-boundary 10/10 (no new crossing), test-phase-graph 6/6. The orchestrator door served list/create/catalogue in-process.

## Remaining (his machine / later phases)
The **live** two-process run (Clear Glass ↔ orchestrator), **AE2** (Clear Glass serving the browser-driver port so browser steps run), and **AE4/AE5** (the automation UI + agent-tools clients re-pointed `:7704` → `:9000`). Until AE4/AE5, Clear Glass's own automation screen still calls the old :7704 door.
