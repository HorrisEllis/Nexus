# 0.55.1 — 2026-10-10

James: "plan panel, needs to not show all the phases. it is for the current plans only, basically the queue also for the build surface which has vanished." · "look at the .response in clearglass. the problem with copilot is i dont get an understanding of why a agent didnt work. just says copilot." · "we need to prioritize on getting it stable and working."

## The Plan is the queue (HP9)

On "every phasemap", the Plan listed all 1,000 steps. The CT7 filter only folded away the finished ones, so every not-started phase of every map showed, shelved phases included. The Plan now shows:

- **Now:** every step with runs, or marked active.
- **Next:** three not-started steps from the maps that have something now, or from the map you chose.
- **The rest:** one line with its count, which you can open.
- **Done:** still folded into one line.
- **The shelf:** never listed, only a count.

## The build surface is back in view (HP10)

The work surface sits below the queue. It had been pushed off the bottom by a thousand steps. With the short queue it's visible again.

## A reply on the page is never sent again (HP11)

"No reply element found … findResponseEl() matched nothing" means the page changed, not that the agent failed. The prompt used to be typed into the same chat again, up to four times.

Now guardian reads the chat transcript and the Clear Glass `.response` first:
- **The answer is there:** the job completes from it.
- **It isn't:** the job asks you to pick the reply with ◎. The pick is saved for every job after, and the prompt is not sent twice.

## A failure names the agent (HP12)

A timed-out dispatch used to say only "copilot :3750 did not answer in time". It now names:
- the agent, or the Ollama model;
- the route it took;
- how long it waited;
- for a browser agent, where guardian's job for this repo stood: its gate sentence, job id and status.

When copilot is unreachable, it says nothing was sent to that agent.

## Tests

| Suite | Result |
|---|---|
| test-hardening-pass (HR-08, HR-09 new) | 9/9 |
| test-guardian-retry-novelty-installs (3 new checks) | 52/52 |
| test-repo-agent | 17/17 |
| test-repo-agent-provider | 67/67 |
| test-build-surface | 13/13 |
| test-build-surface-2 | 3/3 |
| test-code-tab | 16/16 |
| test-phases-tab | 5/5 |
| test-escalation-ladder | 9/9 |
| test-lifeline-guardian-timeout | 6/6 |
