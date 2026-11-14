# 0.60.543 — a pipeline step starts the system it needs

James, 2026-11-14: "need this pipeline woring". He sent a screenshot of the Idearium build pipeline asking him for phase, files, does and why. COS's
sidebar showed 3 of 13 systems up, and Idearium was down. A pipeline whose every step calls Idearium could only fail. Its list of phases that can be
built came from Idearium too, so it was empty.

## Fixed (`cos/manager/server.js`, the resolver for `nexus://<system>`)
- **The system a step needs is marked busy.** When a step resolves `nexus://<system>`, COS touches that system, so its idle rule does not stop the
  system in the middle of a step.
- **A system that is down gets started.** If it is down and not held (paused, or its circuit open after repeated crashes), COS starts it. The ledger
  records the start as `by: pipeline`.
- **The step then waits for it to answer.** It waits 2, 4, 8, 16, then 30 s (0.60.538), so a system that takes a few seconds to boot no longer fails
  the run.

## Proof
- `node tests/modules/test-pipeline-starts-its-system.test.js`, PS-01: a step on `nexus://sleeper` with sleeper declared but down. COS starts it, the
  step passes, and the ledger says `by: pipeline`.
  - **On the old code it fails**: 6 attempts over 60 s, then failed.
- Also passing: cos-hub 12, cos-pipeline 21, cos-console 12, automation-engine 16.

## Said
- A system that cannot start (held under memory, a crash loop) still fails the step. The step's error and the ledger say why.
