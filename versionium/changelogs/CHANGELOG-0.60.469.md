# 0.60.469 — BrainOS's conditions, triggers and events, in COS's engine

James, 2026-11-09: "No. The data folder and cortex. Are not it. Data is stored in the relevant systems data folder. Cortex is the book keeper. Also
conditions, triggers, events, etc. migrate BrainOS' features to the engine."

## Read first
BrainOS has no backend: it drove the engine's routes. Its own header named what the engine lacked:
- an event-driven trigger;
- a schedule;
- a real branch race or merge.

The engine has since gained manual, every, daily, cron, event and webhook triggers, and 17 condition operators.

Still missing in COS:
- Nothing ever fed an event to the engine, so "When something happens" never fired there.
- A pipeline step had no condition.
- A pipeline started by a trigger kept no vars, so its request could not be resumed.

## Built
- **Conditions on pipeline steps:** `when: { left, op, value }`, using the engine's own comparison.
  - False: the step is skipped, with what it saw.
  - A step whose every step it waits on was skipped is skipped too, and a join runs.
  - A skipped step is met in the request's files.
- **Events into the engine.** A workflow's event trigger now hears:
  - `cos.ledger`, with subject `<system> <kind>`;
  - `pipeline.request.met`, `held`, `not_met` and `cancelled`;
  - `pipeline.gate.closed` and `gap`;
  - any event a system sends by `POST /api/cos/automation/events`, or the `cos event` command.

  An agent's event is refused. COS's events wait 10 s between starts of one trigger, so a workflow cannot loop on its own ledger row.
- **Vars on the start event:** a pipeline started anywhere carries its vars on the start event, kept off the live stream, so it is a request that
  resumes.
- **His data rule:** written into `docs/CLAUDE.md`. Each system keeps its data in its own data folder, and Cortex keeps the books.

## Proof
- `node tests/modules/test-cos-pipeline.test.js`: 11/11.
- CP-09 covers conditions, skips and a join.
- CP-10 covers a held request, a gate gap, a ledger row and a system's event, each starting the workflows listening, and an agent's event refused.

## Open
- **Branch race and merge:** first-of and all-of joins.
- **Booking each request with Cortex:** his "Cortex is the book keeper", reading to confirm.
- **BrainOS's screen:** archived once ERAVOS's canvas shows these.
