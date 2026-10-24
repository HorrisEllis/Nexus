# 0.60.230 — 2026-10-24

James: "in the idearium pipeline, building phases, extending, building from scratch. run deep and recursive simulations, of every
possible failure mode, loop until we get a solid pipeline."

SL10 of the self-building-loop map: the last of the four phases mapped for this request (SL7, SL8, SL9, SL10). SL3 was mapped before.

## Built

`tests/modules/test-pipeline-sim.test.js` runs **25 scenarios** on the real phase-build route, the real repo layer, the real inject
path, the real contract scheduler and the real proof run. Only the model is scripted.

| Area | Scenarios |
| --- | --- |
| From scratch (a new system) | A01–A13: a good agent; no reply; timeouts; prose with no code; a refusal; a spec instead of code (your RF2 run); the right code under the wrong path; a path outside the repo; a syntax error; a partial file; an unclosed fence; the other file's code; an agent that falls over once |
| Extending existing code | E01: a change keeps the export its consumer uses. E02: the change drops it |
| The gates | G01–G09: a finding, a decision, an open dependency, a cycle (with and without `anyway`), a dangling reference, no graph (the agent can map it / can't), a complete phase (with and without `rebuild`), a phase that doesn't exist |
| The UI | U01: the run shows why a brick didn't pass |

Each scenario names what the pipeline must do, and the suite checks it on the run's rows, the proposals and the disk.

## What the loop found, each fixed at its root, the whole matrix re-run after each

1. **My first matrix design was wrong.** After A01, every scenario resumed its checkpoints and passed without asking the agent. That's
   correct resume behaviour, so each scenario now builds a fresh phase.
2. **`anyway` past a cycle recorded nothing.** DG3's rule says it is "said on the run". Every row now carries `dagOverride`.
3. **Every failed brick said only "FAILED".** A syntax error, a refusal and an empty reply ended identical in the record (§1.2). The
   contract audit now gives each brick that didn't pass its reason, and the Plan panel shows it.
4. **repo-inject's refusals were dropped.** "Does not parse as js: SyntaxError", "unsafe path", "unclosed fence" were all reported as
   "the reply did not bring back the file". The reason is carried now.
5. **A wrong-path reply left junk in your review queue.** It left 3 identical proposals of a file nobody asked for, from one failed
   brick; in auto mode the file was written to disk. Now it is rejected (or reverted, when applied), with its reason. It is kept in the
   record, never deleted, and you can still apply it by hand.
6. **`idearium repo plan --dry --file <spec>` printed its usage** (test-plan-lands PL-31, red on main). The route table shadowed the
   hand-written command. The other collision, `log`, is left as it is: its row replaced the old Vortex log with Nexus's logs on
   purpose, it seems.

## Confirmed already solid (no change needed)

- A refusal is blocked at the reply gate.
- Dropping an export another file requires is refused ("it removes export"), so the brick fails and says so.
- A flaky agent recovers on retry, and a transient failure doesn't burn retries.
- Every failing run ends within its attempts; none hang.

## Said, not hidden

One traced run before the last fix showed a single failure whose name I didn't capture. It didn't reproduce in the eight runs after.

## Proof

| Suite | Result |
| --- | --- |
| test-pipeline-sim | 25/25, eight runs in a row |
| test-plan-lands | 18/18 (was 17/18 on main) |
| contract-phase-build | 14/14 |
| chunked-phase-build | 16/16 |
| contract-adapters | 19/19 |
| contract-gates | 20/20 |
| phase-close | 6/6 |
| evidence-close | 5/5 |
| plan-code-run-attention | 40/40 |
| verify-first | 10/10 |
| build-queue | 6/6 |
| phase-graph | 4/4 |
| phase-deps-gate | 3/3 |
| agent-maps-phase | 4/4 |
| phase-groom | 6/6 |
| phase-nodes-all | 5/5 |
| phase-dag | 8/8 |
| phase-specs | 4/4 |
| substrate-spec | 3/3 |

Phase nodes: 1939, 0 drift.
