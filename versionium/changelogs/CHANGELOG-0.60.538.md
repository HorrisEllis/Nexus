# 0.60.538 — nothing in flight lives only in memory: every step a node file, every cut-off run resumed

James, 2026-11-14, after his first run of the Idearium build on the canvas. Idearium restarted mid-build, "The build landed" failed, and asking it
again said "no build of CS12_the_mover_is_proven has been started here". His words:
- "need an event ledger per step also i feel like, so we can debug it"
- "thats wrong. dag is a node file, contract is a node file, each step can be a node file. each .pileline is a node file. stop using memory for
  storage. persistence is non negiatiable until the contract has been fullfilled, or dag is complete"

## Found
- **COS's engine kept each step's whole output only in memory.** Later steps read that output, and the run record held only a preview.
- **A run's vars were in memory too.**
- **A COS restart left a run "running" on disk forever.** Nothing resumed it.
- **Retries came back to back.** "The build landed" spent its 6 attempts in 9.1 s, while Idearium took about 13 s to boot.

## Built (COS's automation engine, cos/automation/pipeline.js)
- **Each step of a run is a node file:** `runs/<run>/<step>.process_step`, in the `lib/node-export.js` envelope. It is written on every change and
  holds:
  - the step's state;
  - its event ledger (every change in order: running, each attempt, each wait, the gate, a decision, done or failed);
  - its whole output, up to 2 MB, with the size said past that.
- **The run keeps its vars on disk.**
- **Resume after a restart.** When COS boots, a run still "running" on disk with no driver is marked *interrupted*. A new run of the same pipeline
  starts with its finished steps already met from their step nodes, so only the rest run. The log says so, and the old run names the new one.
- **A system that does not answer is waited for.** Refused, reset or unreachable means the next attempt comes after 2, 4, 8, 16, then 30 s, and the
  step says so. A step that gets an error back is still retried at once.
- **The canvas** shows each step's LEDGER under OUTPUTS.

## Law
- His rule is now in the contract: the root `CLAUDE.md` (Law) and `docs/CLAUDE.md` (addendum 2026-11-14).
- `cos/spec/pipeline.spec` gets addendum (i), PL-011.

## Proof
- `node tests/modules/test-pipeline-waits-for-a-system.test.js`: 5 passed, 0 failed.
  - PW-01: a system that comes up 3 s late is waited for.
  - PW-02: an answered error is not waited for.
  - PW-03: the ledger is in order.
  - PW-04: each step is a .process_step node on disk, with its ledger and whole output.
  - PW-05: a run cut off mid-flight resumes from disk. Only the unfinished step runs, with the run's own vars, and the old run is marked
    interrupted.
- `test-cos-hub` HB-11 now also checks the step's ledger on the canvas, in Clear Glass.

## Not yet
- **A run paused before a restart** stays paused. Continue after a restart is not yet proven.
- **Idearium's own build** is still driven inside Idearium's process. Its 404 after the restart says no build of CS12 was recorded at all, which is
  still to be read on his PC. The build itself resuming on Idearium's boot is the next phase.
- **The run's `.dag` and `.contract`** are not yet written as node files beside its steps.
