# 0.60.523: CS11 step 1, group A: filing work with RAID goes by RAID's route

James, 2026-11-13: "cs11, then pc12." · "i want raid to be the hub that all systems run througj" · "moves into cos. i feel like."

## Why
RAID moves into COS (CS11). For the move to break nothing, every system must reach RAID by its routes, not by loading its files: 24 system
callers did. Group A is filing work with RAID: a contract, its outcome, RAID's gate before a build, reading a contract back.

## Built
- **Cortex:** `POST /api/raid/contracts/:id/outcome { status: pass|fail, verdict? }` and `POST /api/raid/gate-before`.
- **Found and fixed:** Cortex's `GET /api/raid/contracts/:id` read `v2` as a contract id, so on a real Cortex `GET /api/raid/contracts/v2`
  (0.60.522's list) answered "no contract v2" and COS's sync would have had no RAID pipelines. The stand-in in 0.60.522's proof ran the v2
  door alone and could not see it.
- **Architect** (5 calls): filing and outcomes by route. These are observability calls, so Cortex is not woken and nothing waits more
  than 3 s.
- **Copilot:** `/build` files its contract by route, and wakes Cortex if asleep.
- **Idearium:**
  - the verdict's outcome;
  - the spec build's filing, its gate and its outcomes;
  - the chunk build's filing, gate and outcome;
  - the queue read, which now reads one contract, not the whole queue.

  A gate RAID does not answer refuses the build and says so: RAID decides, and a build it never saw does not run.

## Left, said
- Group B: RAID's routing decisions (11 callers).
- Group C: RAID's contract engine running inside Idearium's process for phase builds (with Idearium's executors and versioning), and
  RAID's gate logic used as a library (route-commands, ck-247). Moving it means RAID calls back to the system for each brick: its own design.
- Group D: the worker and officiator (SW5b).
- Groups E and F: the noise filter, and the routing description.
- `scripts/mco5`, `scripts/mco6`: RAID's own lifecycle proofs, run inside its process on purpose. They move with RAID.

## Proof
- A real Cortex in the sandbox:
  - the v2 list answers;
  - a contract filed by route, its outcome reported, read back as passed;
  - the gate before a build answers;
  - a bad status is refused in RAID's own words.
- Architect started: its scan was filed with RAID and reported passed, by route.
- Tests: test-gate-waits-for-verdict 5/5 and test-raid-runs-contract 7/7 (their source-text checks now read the route form; the intent
  is unchanged), test-chunked-phase-build 16/16, test-hardening-pass 9/9, test-plan-lands 18/18, test-raid-port 4/4.
- One run of test-chunked-phase-build failed 13 while the proof's Cortex and Architect were up on their real ports. It passed 16/16 once
  they were stopped, and before and after the change.
