# 0.60.240 — 2026-10-24

James: "focus on just decoupling so we can get every system in a cos compartment. maybe start with one at a time? like guardian?"

Guardian first. The map is `docs/2026-10-24-guardian-into-cos-phasemap.spec`: GD0–GD8, from dead edges to Guardian booting in its own COS
compartment. Every one of Guardian's 33 crossings is classified there.

## GD0: dead edges

- `/forge/health` required `cockpit/forge`, which is not in the tree, so the route only ever threw. It now says forge is gone.
- A comment that the census read as a require of `meta/gap/hunter` is reworded.

## GD1: RAID is reached, never loaded

Guardian required `cortex/core/raid` and ran RAID inside its own process: a second RAID, beside Cortex's. Your axiom §9.1 says RAID is the
only write authority. In a compartment, that second copy could not load at all.

- **`lib/raid-port.js`.** Cortex provides RAID in its own process; every other system asks Cortex's routes. Approval fails closed: if RAID
  is unreachable, the action is denied with the reason.
- **Cortex serves `POST /api/raid/approve-tool`.** The feedback route's logic became one function, so an outcome lands the same way
  over the route or in-process.
- **Guardian asks the one RAID** for approval (/build, forge, chunking, chat, browser jobs), for the routing decision, for outcomes and for
  the contract queue.

**Three defects the move found and fixed.** Each one only looked like it worked:
- **/build never reached RAID.** It named a `raid` that was never defined in that scope, so every call threw.
- **RAID never learned from Guardian's API calls.** `recordOutcome` got a job id where it takes the agent. It now gets the provider.
- **Raw jobs were routed by a second RAID.** The decision ran inside Guardian with Guardian's own copy of RAID's health, never what Cortex
  had learned. Cortex decides now, with its own CFR field.

## Proof

- **Run:** a booted Cortex, asked through the port from another process:
  - approve chat → approved;
  - no source → refused ("source is required");
  - decide → ollama ("health=100 regime=stable");
  - outcome → recorded.
- **Census:** Guardian has 27 → 20 ways out, and there is no new crossing.
- **Tests:** test-raid-port 4/4 (new). It covers in-process, the routes with their real shapes, failing closed when Cortex is down, and
  that Guardian loads no RAID.

## Found, not fixed (logged)

Booting Cortex under the test sandbox still ran its data-home clear-up against the real tree. It moved one data file and wrote state.
All of it was restored, and none was committed. `lib/data-home.js` `atBoot` does not honour the sandbox for a booted system.

## Next

GD2: the pure primitives (liminal, the gap hunter, baseline) move to the kernel.
