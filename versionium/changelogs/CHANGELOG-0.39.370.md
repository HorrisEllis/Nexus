# 0.39.370 — 2026-10-07

James: "hooks into the desktop envirement. also look at the idearium and cos phases."

## DT1 — the repo's desktop is a source of its activity
Nothing new was built for this. Both paths below go through the existing `repo-activity` tasks, which already feed the Tasks drawer and the activity log.

- **Every run in the repo's compartment is a `run` task.** `lib/cos-run.js` `run()` is the one door for all of these:
  - the entry;
  - a file;
  - the tests;
  - the suite;
  - a syntax check and a dependency check;
  - the test VM.

  Each run is recorded as started, and then one of:
  - passed, with its count;
  - failed, naming the files that failed;
  - refused, saying why. For example, "this repo has no COS compartment to run in".

  So a run shows in the Tasks drawer while it happens, and stays in the log.
- **The desktop setup is a `setup` task on the repo that started it** (`POST /api/repos/:uuid/environment/setup`):
  - each line from the VM setup script (`provision.js`) is a step on the task, and its stderr lines are marked;
  - it ends as ready or failed.

  `cos/testenv/setup-job.js` `start()` now takes an `onEvent` callback for each step and the end, so the file doesn't depend on Idearium.
- **`repo-activity` gains `note()`,** which adds a step to a running task and sends it at once.
- **The drawer** has a chip colour for each of the two new kinds, `run` and `setup`.
- **Loom** gains build-surface's edge into `repo-activity`.

## Proof
- New: `test-desktop-activity` 5/5, against a real COS compartment. It covers:
  - a passing syntax run;
  - a failing one that names `broken.js`;
  - a refused one, with its reason;
  - the log rows: three starts, then ok, failed, failed;
  - the setup's `onEvent`: two steps, one of them stderr, then the end;
  - the setup task's shape.
- Unchanged and passing:

| Suite | Result |
|---|---|
| nexus-self-and-cos-run | 30/30 |
| desktop-setup-popup | 9/9 |
| cos-workspace | 17/17 |
| cos-testenv-any-repo | 63/63, 1 skipped (as before) |
| repo-run | 15/15 |
| setup-job-settles | 5/5 |
| one-idearium-phases-nodes | 21/21 |
| repo-activity | 24/24 |
