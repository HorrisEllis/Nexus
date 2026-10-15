# 0.60.37 — 2026-10-15

James, 2026-08-28: "we have all contracts, whether its from loom, idearium, co-pilot, self-heal go to raid's input folder, and queue, then through raid" · 2026-10-15: "i feel something happened" · "read it all, map it first, in the phases"

## RD1a: every build goes through RAID

- **Phase builds:** Idearium now runs each phase build's contract through RAID (`runContract`), instead of running the scheduler itself. Each build:
  - gets a row in RAID's queue;
  - passes RAID's gates before anything runs (the constitution, then Idearium's RAID contract);
  - runs its bricks;
  - gets RAID's verdict, and asks self-heal for help if it fails.

  The build's own record names RAID's row, so you can follow one from the other.
- **Spec-chunk builds and compile:** these used to report to RAID "for observability" only. Now they pass RAID's gates before they run (`gateBefore`): the hat's intent contract when a hat is worn, then RAID's approval. If RAID refuses, the chunk fails and the reason is recorded (HTTP 403 `RAID_REFUSED`).
- **Ladder models:** a model on the escalation ladder, like `ollama:qwen`, isn't a base agent, so it isn't asked the base agent's intent question. RAID's approval still applies to it.

## Found by the test

A contract loaded from a checkpoint carries no version field, so RAID refused it. Fixed.

## Not yet: RD1b

RD1b would make a spec's chunks bricks of one contract. A chunk often finishes later, through a Guardian job callback, so the spec engine's own loop has to become the scheduler's. It's a separate phase.

## Proof

- test-raid-runs-contract 6/6. The new RR-06 checks:
  - a source RAID doesn't let build is refused;
  - a hat that doesn't exist is refused;
  - a ladder model gets through on RAID's approval;
  - Idearium no longer runs the scheduler itself;
  - both chunk paths are gated.
- test-contract-phase-build 9/9. The new CP-09 checks that the build's RAID row is a `.contract` row that passed, with the same contract file.
- Build and spec suites unchanged:
  - build-context 15/15
  - build-verify 11/11
  - pipeline-routing 19/19
  - prove-loop 7/7
  - spec-workshop 8/8
  - workshop-full 10/10
  - raid-isolation 6/6

  The architect theme test fails 7 checks, the same 7 as on main.
