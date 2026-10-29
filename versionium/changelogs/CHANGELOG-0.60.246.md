# 0.60.246 — BCR2 GD1: Guardian reaches RAID only through its port

James, 2026-10-24: "can you resolve this?" (claude/brave-cori-eczug1)

The decision this carries out is his, from the brave-cori line: "focus on just decoupling so we can get every system in a cos
compartment. maybe start with one at a time? like guardian?" It stands on BC_D2, "Yes — layer it on RF2": a system reaches another only
through a port.

## What changed (ported from brave-cori's 0.60.240 GD1)
Guardian's last four loads of RAID's code (`cortex/core/raid`) go through `lib/raid-port.js`, RAID's one door:
1. **`/api/intake`'s queue match.** RAID's contract queue is read through the port. The handler is made async so it can wait.
2. **The raw dispatch's decide.** Cortex's RAID decides, with what Cortex has learned. Before, Guardian loaded a second RAID into its own
   process, with its own health and weights. When RAID gives no agent, the fallback to chatgpt is now said, not swallowed (§1.2).
3. **The automatic-chunking approval gate.**
4. **The chat approval gate.**

Only these hunks were taken. The rest of brave-cori's diff of guardian/server.js is older than main: its paths from before RF2, and a
line main has since added (`openTab`).

## Proof
- test-raid-port 4/4. RP-04, "Guardian loads none of RAID's code", passes. The test is now in run-all, as the reconciliation map said it
  would be once RP-04 passed.
- test-guardian-dispatch-ladder 18/18, idearium-guardian-dispatch 5/5, test-guardian-raid-feedback 5/5. The ratchet is green.
- Live: start:core booted Cortex, the orchestrator and Guardian (Guardian ready 12/12, "registered 5 capabilities with RAID"). A real
  `POST /api/intake` ran the port path. It returned the intake's own validation error, which comes after the queue match.

## What is left of BCR2
The other ports brave-cori built: ollama-port, spec-compiler-port, the pulse in core, trust-rule, registry-draft, and loom/lib, each with
its consumers.
