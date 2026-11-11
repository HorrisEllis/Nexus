# 0.60.496 — a pipeline step holds for him instead of failing (PC8 expanded)

James, 2026-10-26: "the gate doesn't wait for me to accept it or not before it fails."
James, 2026-11-11, shown the order (commit; the pipeline holds for his verdict; the proof on Gemini; COS restarted; the stale contract): "Do it"

## Before
The build pipeline met seven steps and then failed whole at `evidence` on a phase nothing can check (runs `aaa327d9`, `5047dbb3`).

## Built
- `lib/automation/pipeline.js`: a task's `onFail` may be `hold`. The step that cannot pass pauses the run, by the pipeline, naming the step
  and why. The step stays waiting. Continue (the door, the command and the button of 0.60.484) asks it again.
- `idearium/pipelines/idearium-build.pipeline`: `evidence` holds.
- `idearium/api/index.js`: evidence asked for one phase that is already done answers ok and says so, so a run continued after his
  acceptance goes on to the ledger.
- `cos/ui/automation/engine.js`: the run panel shows which step waits and why.

## Proof
test-pipelines PL-03b: held with its reason; held again when still not met; passes on the third ask and the rest run; cancelled while held, it ends.

## Not done, said
- **Not live.** The engine is the running COS, which is not restarted (his). No pipeline run was made on this release.
- **Idearium was down when this was written.** The coder restarted it to take its half; COS held the start at "waiting-memory"
  (6 to 9% free, floor 10%).
- test-pipelines is 6 of 7: PL-06 fails with "Clear Glass host exited". Not looked into.
- His acceptance is two acts: accept the phase in Idearium, then Continue.
- A held run does not outlive a COS restart.
- 0.60.487 to 0.60.495 are one commit on branch `claude/pipeline-working-0.60.495` over origin/main. Not pushed.
- Not yet in Versionium (§17.12).

## After, the same day
James, 2026-11-11: "Firefox Closed." Free memory rose to 11.3% and COS started Idearium by itself (health 200). Asked live,
`POST /api/repos/nexus/phases/evidence {"phase":"IN0_baseline","apply":true}` answered `already: true`, status done, "nothing left to judge".
The hold itself is still not live: COS is not restarted.
