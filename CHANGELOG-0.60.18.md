# 0.60.18 — 2026-10-13

James: "Yes. Build the agent and phase adapters next, then wire Idearium's phase build through the contract scheduler... build and test the adapters independently first, then connect the phase-build action." · "the scheduler must distinguish a failed task from a task that has no available executor. The latter should be reported as blocked or unsupported, not repeatedly retried or incorrectly marked complete." · "Keep the existing tool registry as the execution boundary, avoid duplicating routing logic and make the first real phase build produce an auditable record of every brick, dependency, checkpoint and gate."

The order was his: adapters first, each tested alone, then the Build action. It was built in that order (phasemap EX0a–f in `docs/2026-10-13-nexus-memory-gates-and-contract-phasemap.spec`).

## The scheduler knows blocked from failed (EX0a)

- An executor can answer `{ unsupported, why }`. The brick is set aside under `blocked[]`, recorded as `<brick>.blocked`, never retried, never FAILED, and the contract is not complete.
- `{ decompose }` splits a brick into its steps. A brick that is one step already is never blocked for size; see the agent adapter below.
- A FAILED brick with retries left runs again (recovery). A brick that failed twice and has steps is split instead of being sent a third time the same way.
- Every pass is a checkpoint: `state.checkpoints[]` (gate, time, input hashes, agent). The `onCheckpoint` hook lets the caller save after each one.

## The agent adapter (EX0b)

`cortex/core/raid/contract-adapters.js` `agentExecutor({ route, dispatch })` adds no routing of its own:

- The route comes from the model door (`lib/model-door.js`) by the brick's kind, or from the caller. In Idearium that is the ladder the build already climbs.
- The dispatcher is the caller's existing runner. In Idearium that is `climb` + `makeAttempt`, with their retries and escalation.
- What it adds is a check of each routed agent's learned budget (`Boundaries`) against the brick's packet:
  - over-budget agents are skipped, and the skip is recorded;
  - a brick too big for every agent is decomposed when it has steps;
  - a brick that is one piece already goes to the agents anyway, largest budget first, and its route says so.
- Evidence recorded: `<brick>.agent`, `<brick>.route`, and the runner's verification.

## The phase adapter and checkpoints (EX0c, EX0d)

- `fromPhasePlan(plan)` builds a v2 contract from a held Idearium plan:
  - one brick per planned file, with its purpose, exports and component as the requirement and its steps as its actions;
  - the plan's import edges as `depends_on` (`lib/phase-plan.js` `depsOf`);
  - completion is `<brick>.verified` (every planned export present), plus `{ exists }` when writes go to disk;
  - a parent `phase` gate that passes only on `phase.integrated` matching `^met`, the proof run.
- `openCheckpoint` resumes a saved contract:
  - PASSED bricks are kept;
  - a changed input makes its brick and its dependents STALE;
  - bricks out of retries get a fresh budget, with the old attempts kept in `state.history`;
  - a contract whose plan changed is rejected and archived beside it as `.superseded-<ts>`, never deleted.
- `audit(p)` lists every brick (agent, attempts, verification), every dependency edge, every checkpoint, every gate, and every split.

## Build runs through it (EX0e, EX0f)

When a plan holds, `_phaseBuild` runs it as a contract:

- The contract is saved at `<idearium data>/phase-contracts/<repo>/<map>.<phase>.contract`. That is state, never committed.
- Independent files are built at the same time (`routing.contract_concurrency`, default 2).
- The integration gate is the existing `_provePhase`.
- The Plan shows two rows:
  - `contract`: fresh or resumed, what was kept, what went stale;
  - `contract-complete` or `contract-incomplete`, with the full audit.
- `routing.contract_build: off` brings back the old one-file-after-another loop. That code is kept, not removed.

Where to find it:
- Route: `GET /api/repos/:uuid/phases/contract?phase=&map=`.
- Commands: `repo contract <repo> <phase>`, `contract audit <file>`, and `contract run` now lists blocked bricks.
- Settings: Routing → "Plan, then code" has contract_build and contract_concurrency.

## Found by the end-to-end test

The first full run (CP-04) deliberately failed one brick with a provider error. That single failure taught `Boundaries` a size cap (×0.8 of the failed size), and the next brick, slightly larger and indivisible, was then blocked as "too big".

Two fixes:
- A transient failure (the provider never answered) no longer teaches size.
- An indivisible brick over every budget is tried anyway and its route says so, rather than being blocked.

## Proof

- `tests/modules/test-contract-adapters.test.js` 11/11. These are the adapters on their own:
  - routed, with evidence;
  - decomposed;
  - over budget and indivisible, tried anyway;
  - no executor reads as blocked, not failed;
  - overlap and recovery;
  - plan → contract;
  - a stale input re-runs only its brick and its dependents;
  - a changed plan rejects the checkpoint;
  - integration unmet means not complete;
  - the audit.
- `tests/modules/test-contract-phase-build.test.js` 5/5 on the real `POST /phases/build` route, real skeleton repo, real inject path, real proof run. Only the model is stubbed.
  - CP-01: bricks, edges, checkpoints.
  - CP-02: complete only through the proof.
  - CP-03: building again resumes and sends no file again.
  - CP-04: a changed plan's checkpoint is archived; a failed brick recovers.
  - CP-05: the route, command and Plan panel.
- `test-contract-gates` 20/20, and CC-19 now expects blocked, not waiting.
- Phase-build suites unchanged and green: chunked-phase-build 15, escalation-ladder 9, plan-code-run-attention 40, shadow 16, draft-review 12.
- CT0 went stale on these edits and was re-run through its own gates; it is complete.

Not yet proven: a live run on his machine with Ollama on update-system. The steps for him are below.

## Run it on update-system (his machine, Ollama)

1. **Build.**
   ```
   idearium repo phase update-system <PHASE> build --note "contract run"
   ```
   The planner plans and the Plan shows a `contract` row. Then:
   ```
   idearium repo contract update-system <PHASE>
   ```
   That gives each brick, its agent, the dependencies and the checkpoints. Independent files show overlapping `brick-running` events.
2. **Deliberate failure.** Stop Ollama while a brick is building (`ollama stop qwen2.5-coder:7b`, or quit it). The brick reads FAILED. Start Ollama again; the brick is retried and passes. A second Build resumes and sends nothing that already passed.
3. **Invalidation.** Edit the phase's block in its phasemap, or a file the phase edits, then Build again. The `contract` row lists the stale bricks, and only those and their dependents are sent.
4. **Integration.** `idearium repo contract update-system <PHASE>` shows the `phase` gate. It passes only when the proof row reads `proven`. Unmet conditions leave it FAILED and the contract `contract-incomplete`.
