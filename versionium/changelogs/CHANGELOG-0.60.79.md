# 0.60.79 — 2026-10-16

James: "can we not have it chunk everytime it restarts. it needs to persist. all data  is meant to persist. hardcoded has
to earn its place..."

TL1a, the first slice of `docs/2026-10-16-durable-work-timeline-phasemap.spec`.

## What was wrong (read in `idearium/api/index.js` `_phaseBuild` and `cortex/core/raid/contract-adapters.js`)

1. **Every build start asked the planner again.** A restart, a retry from the task list, or ▶ all began by planning
   the phase (chunking it into bricks) from scratch.
2. **A model's plan differs run to run.** Different files, steps or order give a different `plan_hash`.
3. **A different hash threw the saved work away.** `openCheckpoint` saw "the plan changed" and archived the saved
   contract with every passed brick, so the build began again at brick 1. The checkpoints were on disk; the plan that
   made them was not reused.

## What changed

- **The plan is kept on the contract.** `fromPhasePlan` writes the plan itself and a `phase_hash` (the phase's words,
  files and note, without its status lines or the roadmap's edit comments) into the `.contract` file.
- **A build started again reuses it.** `savedPlan` returns the saved plan; the planner is not asked, the contract
  resumes, and its passed bricks are kept. The run log says `planned — kept: the plan saved on the contract, not planned
  again`.
- **Work already on disk resumes too.** A contract saved before 0.60.79 has no plan on it. The newest plan on the run
  log (`idearium_phase_runs` 'planned' rows) whose hash matches the saved contract is the one used.
- **Planned again only when it should be:** the phase's words changed since it was planned, or he asks for it:
  - route: `POST /api/repos/:uuid/phases/build` with `replan: true`;
  - command: `idearium repo phase <repo> <phase> build --replan` (every agent has it through nexus.command);
  - UI: a "plan it again" box in the phase detail (Phases tab). Off by default.
  Replanning still archives the old checkpoint, never deletes it (§0.3).

## Proof

- `tests/modules/test-contract-phase-build.test.js` 13/13. CP-03b is new: the phase is built again while the planner
  would answer a different plan. The saved plan is kept, the planner is not asked, no file is re-sent, and no agent call
  is made at all. CP-04, CP-07 and CP-10 test the planning paths themselves, so they now pass `replan: true`.
- `test-contract-adapters` 19/19, `test-contract-gates` 20/20.

## Not done, said

- The other in-memory jobs (phase mapping, proofs, indexing in `idearium/api/index.js`) still forget themselves at a
  restart: TL2.
- A spec an agent writes over many replies is still on disk only at its final write: TL1.
- The non-contract path (`routing.contract_build: off`) still restarts its file loop at the first file. It is off by
  default.
