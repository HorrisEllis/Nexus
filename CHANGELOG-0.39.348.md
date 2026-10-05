# 0.39.348 — 2026-10-05

James: "and learn from it. failure modes, dynamically switch models, if its not equipped for the task"

CT2 done. Switching on a crash came with CT1. CT2 teaches the router what a model is up to: the verifiers' word goes back to copilot's door, not only cut or empty answers.

- **Verdicts** (`lib/pipeline-routing.js` `VERDICTS`: test-failed · dismissed · constraint).
  - Recorded as a failed hop for that kind of job, so the learned order counts it.
  - They never open a breaker. The provider answered; it was not up to the job.
  - `lib/model-door.js` `outcome({ verdict: true })` skips the breaker, either way.
- **Idearium sends them** (`idearium/api`).
  - The prove loop: a file whose test fails → `test-failed` for the model that built it (the last ok hop of its chunk's route). A proven build → ok for every model that built a chunk.
  - The workshop: a draft dismissed → `dismissed`; accepted → ok.
- **Not yet.** Constraint verdicts: no station checks Emerge constraints until RS4. The seam detector's word is not sent.
- **Tests.** `test-model-door` 8/8:
  - MD-07: four `test-failed` verdicts open no breaker, and that kind of job goes to the model that passed first.
  - MD-08: Idearium sends the verdict for the chunk's builder, marked `verdict`.

  Unchanged and passing: pipeline-routing 19/19, spec-workshop 8/8, registry-drives-build 5/5, build-surface 3/3, prove-loop 7/7, agent-context-always 5/5, repo-chunks-tool 11/11.
- **Next.** CT3: the Code tab as the work surface.
