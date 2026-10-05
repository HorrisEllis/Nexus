# 0.39.352 — 2026-10-05

James: "the plan needs to only show current work. needs escalating retry logic and fallback routing. like if the 3b fails, switch to the 7b, then the 16b deepseek, then the agents. have all of this configurable." · "completely either need to clear or need a clear complete button. like i want to see the agents activity in the code tab, in real time. like maybe have a little dot blinking next to it"

Mapped first as CT6–CT8 in `docs/2026-10-05-code-tab-and-one-router-phasemap.spec` 1.2.0, then built.

## CT6: the escalation ladder

- **The ladder** (`lib/pipeline-routing.js`). It is either:
  - `routing.escalation` exactly as written, e.g. `ollama:qwen2.5-coder:3b > ollama:qwen2.5-coder:7b > ollama:deepseek-coder-v2:16b > claude`; or
  - derived: the Ollama models smallest first by the size in their name (3b < 7b < 16b; a name with no size comes after), then the chain's agents.
- **Climbing.** A phase build with no agent named climbs it (`climb()`):
  - each rung gets `retries_per_rung` attempts;
  - an outcome in `escalate_on` moves to the next rung in a fresh chat (default failed · blocked · incomplete · tool-errors);
  - each attempt is a row on the Plan with its rung and model, and each climb is a row saying from what, to what and why;
  - the last row says when every rung has been tried.
- **Stopping a looping model.** `max_tool_errors` (default 3) failed tool calls in a row end an attempt (`lib/agent-tools` runToolLoop), so a model that cannot drive a tool stops at 3, not 11 as in the BL30 run. This is the `tool-errors` class: the provider is up, so it never opens a breaker.
- **Settings.** Everything is in Settings → Routing → Escalation ladder, which shows the ladder as it reads now (`GET /api/routing` gives it): `routing.escalate`, `escalation`, `escalate_on`, `retries_per_rung`, `max_tool_errors`.
- **The tool failures from BL30.**
  - `code_check` given `path` now checks that file. The route already read it; the tool wrapper dropped it.
  - `code_edit` sent `changes` now says "you sent "changes", which code_edit does not read", and shows both edit forms. It does not guess the shape.
- **Behaviour change.** With escalation on (the default), a phase build with no agent named starts at the ladder's lowest rung, not at the repo's own agent setting. Turn `routing.escalate` off to build with the repo's agent.
- **Not yet.**
  - An `unproven` phase (its proof's own retries) does not climb.
  - A failed attempt's partial proposals stay on the work surface for you to reject.

## CT7: the Plan shows current work

- Steps that are not complete are listed. Complete steps and complete sections fold into "✓ N … complete — show", one click away. They are hidden, never deleted, and the choice is remembered.

## CT8: the agent's activity, live, in the Code tab

- **How it flows.**
  - Each tool call is reported as it starts and as it ends (runToolLoop `onToolCall`).
  - Copilot posts it to the caller's sink (`tool-runtime` `toolEventSink`, loopback only, fire and forget).
  - Idearium broadcasts `idearium.repo.agent.tool` and keeps the last 80 calls per repo (`POST /api/repos/:uuid/agent/tool-event`, `GET …/tool-events`).
- **In the Code tab.**
  - The call running shows in the activity header with a blinking dot, and the file it names blinks in the tree.
  - Activity lists the live calls ✓ / ✗.
  - Only the tree and the strip repaint, so what you are typing to the agent is kept.

## Tests

- `test-escalation-ladder` 9/9: the ladder, climb, the tool-error stop, the sink, the repo agent's cap and sink, the tool-event route, the code tool fixes, the phase build's climb, Settings.
- `test-code-tab` 15/15: CT-30 the Plan's fold and CT-31 the live dots, driven in Clear Glass.
- Updated for the new shape:
  - test-draft-review DR-20: each later rung or retry gets its own chat.
  - test-agent-tools-and-graph AT-13: the cap and reporter ride along.
  - the build-surface probe's BS9→BS11: the complete step folds.
- Unchanged and passing: pipeline-routing, model-door, ollama-check, code-tools 28/28, copilot-tool-runtime, guardian-tool-runtime, the repo-agent suites, shadow, step-gate, work-surface, the contract tests.
- Still failing, the same way without this change: the probes' W4 and BS10.
