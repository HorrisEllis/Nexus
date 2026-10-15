# 0.60.38 — 2026-10-15

James: "we added gating and chunking recursively, dynamically, like bricks … i feel something happened" · "read it all, map it first, in the phases"

## BR1: bricks on every path

**Before.** A build became bricks only when a plan held. That needed both an Ollama model and a reasoning agent on the ladder. Otherwise the build fell back to an older path with no gates and no checkpoints: one request for the whole phase, or files one after another. That happened when:
- Ollama was down or held by lean mode;
- no planner was ready;
- the plan failed.

That's exactly when things are going wrong.

**Now** every build is bricks, run through RAID:
- **No plan mode:** Nexus writes the plan from the phase itself, without asking a planner (the 0.60.28 no-model plan), and builds it as bricks.
- **A phase that names no files:** it becomes one whole-phase brick (`fromWholePhase`). The phase still passes only when its proof run passes, and the brick is still checkpointed and has its failures classified.
- **The old paths are kept** behind `routing.contract_build: off`.

## Proof

- test-contract-phase-build 11/11:
  - CP-10: with no plan mode, a build is still bricks, planned without a model, through RAID, proven.
  - CP-11: the off switch keeps the old path.
- test-raid-runs-contract 7/7. RR-07: a whole-phase brick passes only once the proof passes.
- test-chunked-phase-build 15/15. It's now pinned to `contract_build: off`, so it keeps guarding the one-file-at-a-time path.
- Other suites unchanged:
  - hardening 9/9
  - phases tab 5/5
  - contract-adapters 19/19
  - contract-gates 20/20
  - workshop-full 10/10
  - prove-loop 7/7

## Next

GS1: a Versionium snapshot at each gate. A failed brick is rewound to its last good state before it retries, and you can compare a gate now against what passed.
