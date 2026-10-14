# 0.60.30 — 2026-10-14

James chose "Build GT1 here (Recommended)". The priority map (docs/2026-10-13-gates-that-learn-and-priorities-phasemap.spec) puts it first: "GT1: gates classify before they learn. 0.60.18 showed that learning from unclassified failures poisons routing. Every later build runs through gates."

## What changed

Before: every failed gate taught Boundaries "this agent can't hold a piece this big", whatever the reason. A provider that timed out was learned as one that couldn't do the work, and the next attempt went to the same agent.

Now every failure is classed first (`cortex/core/raid/contract-gates.js` `classifyFailure`), and only the right lesson is learned:

| class | what it means | what happens | learns |
|---|---|---|---|
| transient | the agent never really answered (timeout, empty, down, sign-in, rate limit) | retried on the same agent; no retry spent (up to the limit in a row) | nothing |
| capability | it answered and the work didn't meet the gate | the next attempt skips that agent | the door's order (a verdict; no breaker moves), Boundaries |
| context | the piece was too big (truncated, context limit) | split at once if it has pieces | Boundaries |
| spec | the gate can't be checked (unverifiable, names a missing test) | a question for a person, not a retry | nothing |
| verification | the check's runner broke | a question, not a retry | nothing |
| tool | nothing here can run it (unsupported, failing tool calls) | set aside, said | nothing |

Every class writes fault-taxonomy friction (`contract.<class>`). The check's own words are recorded (`<gate>.feedback`) and handed to the dispatcher on the retry (RQ3). `agentExecutor` skips agents that failed the brick on capability; when every routed agent has, it tries them all again and says so.

## Found on the way

Main emitted two events it never declared (`idearium.repo.phases.mapped`, `guardian.accounts.chain`), so the EV0 contract check was red. Both are declared now.

## Proof

- test-contract-adapters 18/18. GT-01..07 plant a failure of each class: each takes its own path, and only capability and context change routing or budgets.
- test-contract-gates 20/20, test-contract-phase-build 8/8, test-chunked-phase-build 15/15, test-event-contracts 8/8.
- CT0's self-contract re-checked by the evaluator after the evaluator changed: 5/5 gates PASSED.

## Not done

Idearium's coder prompt doesn't read `feedback` yet. It's passed through; putting it in the prompt is RQ3's other half. The live run on his PC is still the proof that matters.
