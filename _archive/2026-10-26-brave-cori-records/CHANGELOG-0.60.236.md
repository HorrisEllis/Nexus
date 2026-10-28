# 0.60.236 — 2026-10-24

James: "We need the systems sovereign."

## Sovereign now: components, ollama, cos

Three of his 15. A system is sovereign when nothing it requires is in another system's folder (lib/system-boundary.js sovereignty).

- **warp counts with the kernel, as siso does.** Nine systems use `warp/core`. If warp went into idearium or guardian (his "warp would
  probably be idearium or guardian"), every one of those nine would depend on that system, and none could be sovereign. This was decided
  by his axioms for his goal, and is to confirm. The folder has not moved.
- **The pulse moved to the kernel** (DB17). `orchestrator/lib/pulse.js` → `lib/pulse.js`; it uses Node built-ins only, and the old path is
  a one-line re-export. Cortex, idearium and Clear Glass no longer reach into orchestrator for a heartbeat.
- **ollama:** its one way out was `nexus-connect` `startHeartbeat`, which only handed off to the pulse. It now takes the pulse from the
  kernel.
- **cos:** its one way out was Cortex's `JaaDB` class, used for a compartment's own store. The compartment manager now takes
  `openStore(dir)` from whoever boots it, as it already takes `jaaDB`. Without one, it says so and uses the shared store; it used to fall
  back silently.

No new crossing.

## Next

| system | ways out | what blocks it |
|---|---|---|
| loom | 5 | 3 data (Cortex's jaa-db), 1 nexus-connect, 1 ollama-client |
| architect | 6 | |
| clear-glass | 9 | |

Two files hold most systems back:
- `cortex/memory/jaa-db.js` (data);
- `nexus/nexus-connect.js`. It lazily requires `intelligence/lattice`, so moving it into the kernel as it stands would be an upward
  crossing. Its lattice use has to be cut first.

## Proof

- test-registry-draft 6/6: cos is sovereign, and warp counts with the kernel.
- test-architect-pulse-migration 6/6, test-cortex-heartbeat 4/4.
- ollama: ollama-runtime 8/8, test-ollama-check 8/8, test-lifeline-ollama-dispatch 3/3.
- Also green: test-sovereign-systems 8/8, test-drawbridge-registry 8/8, test-system-registry 9/9.
- Already failing before this change: test-system-boundary SB-06 (the same three old crossings, nothing new) and test-cos-compartment-template
  CT-07.
