# 0.60.77 — 2026-10-16

James: "Step 4"

James: "A brick is a chunk."

From the map, his: "make each agent able to not need the same chat, like the gates, and nexus hold the persistent data,
so we could use a different chat or agent each gate"

This is GW2 of `docs/2026-10-15-gate-held-work-phasemap.spec`, the first slice. It is step 4 (gating) of his order in the
pipeline-focus map: the run follows the brick, not the chat.

## What was wrong (read in source)

- **Every attempt of a brick began a blank run.** A retry, the next rung of the ladder and a fallback each came with
  either a new chat session or a goal changed by the gate's feedback. `lib/run-state.js` resumed a run only on the same
  session **and** the same goal. So the next attempt, or the next agent, knew nothing of what the last one read, changed,
  or why it stopped.
- **The resumed-run header never reached Ollama.** Copilot adds it only on the browser-tab path
  (`copilot/tool-runtime.js` `makeNcpCallModel`), so a local model resuming a brick was told nothing.

## Measured on the way

- **The fail/rewind repeats in his screenshot are bounded.** A scheduler run with a brick that always fails stops at
  3 failures and 3 rewinds (capability) or 6 failures (transient). They are not an endless loop.
- **His 3-hour phase is the lost-job case.** A tab was handed a job and did nothing. CE10 (0.60.50) already moves such
  a job to the next agent, but he runs 0.60.44.

## What changed

- **`lib/run-state.js` 1.1.0.** `runIdFor` and `begin` take a `brick`. A brick's run is resumed by every attempt, rung,
  fallback and chat:
  - its attempt goes up by one, and its steps are kept;
  - its goal is updated to what is asked now;
  - the agents that tried it are listed;
  - the session is only a pointer.

  Runs without a brick behave as before.
- **Wiring:**
  - Idearium passes `<map>::<phase>::<gate>` on every brick attempt, planned and whole-phase;
  - `lib/repo-agent.js` keys the run by it, and both fallbacks (the routing door and the lost job) carry it;
  - on Ollama, a resumed run gets the task header ahead of its prompt.
- **On screen:** the trace (`?trace=1`, the Plan panel's trace button) shows each brick's run: its attempt, which
  agents tried it, how many steps, and which files were read and changed.

## Proof

- `tests/modules/test-run-state.test.js` 33/33. New cases RS-50 to RS-55:
  - a retry in a new chat, with feedback in its goal, on another agent, resumes the brick's run with its steps;
  - the agents that tried it are listed;
  - the next attempt's header says what was done;
  - two bricks never share a run;
  - runs without a brick are unchanged;
  - the wiring is checked in source.
- `tests/modules/test-contract-phase-build.test.js` 12/12:
  - CP-04: a real failed brick and its retry carry one brick key;
  - CP-05b: the trace route returns a brick's run.
- Unchanged and green: chunked phase build 16/16, escalation ladder 9/9, composed prompt 20/20, agent memory 9/9,
  checklist and copilot working sets.
- **One unexplained run:** the first run of the contract suite after an edit came back all red. It did not reproduce
  in three later runs.

## Open

- **GW0b, his decision:** when a gate opens a new chat. Today a contract retry reuses the brick's session.
- **GW1:** make the gate's packet the one handoff.
- **Not proven live:** that a real agent picks up where the last one stopped. That needs his run on this release.
