# 0.60.144 — 2026-10-18

James: "You got it persistent per gate"

**Reading.** This is the coder's reading, to confirm. The reply should be kept per gate: per contract brick, which is the
unit a build resumes at. Being kept per job is not enough. Mapped in `docs/2026-10-16-durable-work-timeline-phasemap.spec`
addendum (e).

## What 0.60.143 did not do

0.60.143 kept each reply per Guardian or Ollama job, and a job did not know its gate:

- a Guardian frame carries only its `jobId`;
- a gate's `jobId` reaches Idearium only after the reply has ended.

So the reply was on disk, but nothing said which gate or attempt it belonged to.

## TL1c — kept per gate

- **The task carries the gate.** `lib/repo-activity.js` tasks now carry their contract gate (`brick`, as
  `<map>::<phase>::<gate>`). `lib/repo-agent.js` passes it from the phase build's dispatch.
- **Each frame is filed under its gate.** Idearium's two feed paths hand the frame's task to the journal.
  `lib/work-journal.js` records the reply with its gate, its phase run and its task.
- **`gates(repo, { brick })`** returns every attempt at a gate, oldest first, failed attempts included, with how the last
  one ended. It is read from the jobs themselves, so there is no second record. A job with no gate (a chat) is counted
  apart.
- **Route:** `GET /api/repos/:uuid/agent/feed?gate=<map>::<phase>::<gate>`. A `<map>::<phase>` prefix returns every gate of
  that phase; `?gates=1` returns all gates.
- **Command:** `repo feed <repo> --gate <key>` or `--gates`.
- **UI:** the live header shows "gate <phase> · <gate> · attempt n of m", restored or live.

## Fixed on the way

A frame without a session went to the newest running task, so two gates building at once could file each other's replies.
A frame now goes to the task that already took its job. Failing that, it goes to the newest task with no job yet.

## Proof

| test | result | what it shows |
|---|---|---|
| `test-work-journal` | 4/4 | WJ-04: two attempts at one gate, through the real router, come back in order after a restart; a phase prefix finds the gate; two gates at once keep their own jobs. WJ-03: the gate and the attempt shown in Clear Glass. |
| `test-contract-phase-build` | 14/14 | |
| `test-repo-activity` | 24/24 | |
| `test-ollama-activity` | 5/5 | |
| `test-agent-live` | 5/5 | |
| `test-live-everywhere` | 3/3 | |
| `test-change-record` | 7/7 | |

## Open

- **The key is still positional.** A gate's key is the brick id, `b<n>.<file>`, numbered by its place in the plan. DBG1
  in `docs/2026-10-18-debugging-product-phasemap.spec` names it for what it is.
- **A late reply has no gate.** A reply that arrives after its task ended is kept, but without a gate, and is counted as
  ungated.
