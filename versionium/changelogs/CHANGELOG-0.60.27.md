# 0.60.27 — 2026-10-13

James: "conintue"

After "next. fix anything you can." (0.60.26), the coder picked the next piece: AG1's counting half. It had been open
since James set the agent rule:

> "it would be nice to use agents intentionally for what theyre best at. as little as possible. like spread agents out
> opimally for what theyre best at. less tokens from you, the better."

docs/CLAUDE.md ends that rule with "Count it." This release is the count. Choosing it now was the coder's call. It is
AG1a in `docs/2026-10-13-gates-that-learn-and-priorities-phasemap.spec`.

## What a phase cost, in agent calls and tokens

Every agent call of a phase build already wrote its own row:
- the planner (`planning`);
- each coder attempt (`replied`, `failed`, `incomplete` or `blocked`, with its provider);
- the reviewer (`reviewing`).

Now each of those rows also carries its estimated tokens in and out. They are estimated where the call happens with
`lib/economy/tokens.js` (estimate-v1; there is no vendor tokenizer).

`lib/phase-cost.js` (new, pure) counts a phase:
- calls by role (plan, code, review) and by agent;
- local (Ollama) against remote;
- tokens in and out;
- each run on its own, with a run's review counted inside that run.

Retrying, escalating, chunk-stopped and proof rows are not calls. Older rows without estimates use chars/4, and the
result says which method it used.

Where to see it:
- **Idearium → a repo → Plan**: each phase that has run shows one line, for example
  `agents: 5 calls (plan 1 · code 3 · review 1) · 2 local · 3 remote · ~2.6k tokens in, ~600 out`.
- **Route**: `GET /api/repos/:uuid/phases/cost?phase=&map=` gives one phase with each run. Without `phase` it gives
  every phase, most calls first.
- **Command**: `repo cost <repo> [phase]`. Every agent has it through nexus.command.

## Found by the count

The live test counted 7 calls where the agent had answered 8. When a repo builds with a fixed backend (no ladder), a
failed coder call whose reply did not name its agent was written with no provider. The record could not say who failed.
It now names the backend the call was sent to.

## Also

The pre-commit check had been blocking on three specs whose version lagged the code. Each is now matched, and its line
says what moved it:
- architect 1.0.0 → 1.1.0;
- ollama 1.1.0 → 1.4.0;
- intelligence 1.0.0 → 1.1.0.

The pre-commit check passes.

## Proof

- `test-contract-phase-build` CP-06 runs real builds through the real route, with only the model stubbed:
  - the calls counted equal the dispatches the agent saw;
  - tokens are estimated at the source;
  - each run has its own count;
  - the route, the all-phases view and the Plan agree;
  - every failed coder call names its agent.
- `test-phase-cost` 5/5:
  - only calls count;
  - local against remote;
  - tokens, including the review's answer and the older-row fallback;
  - per run;
  - the line.
- Unchanged and green:
  - build-surface 13 and build-surface-2 3;
  - chunked-phase-build 15 and draft-review 12;
  - escalation-ladder 9 and plan-code-run-attention 40;
  - run-watch 5 and shadow 16;
  - cg-command-index 2 and loom-map 19.

Not done here:
- **The Plan line in Clear Glass.** It is proven on the data the panel paints (CP-06) and on the panel's source, but it
  has not been looked at in a Clear Glass window.
- **AG1b**, a review only after a cheap check has failed, is still open.
