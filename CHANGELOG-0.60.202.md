# 0.60.202 — a refused proposal goes back to its agent with the failing test

James, 2026-10-21, on SP5's title.js: "need a retry or automatically ask for the fix if possible, or a tool or something" · "still didn't
work." · "that error needs to be fixed."

## What his screenshots showed
- Gemini's title.js kept changing the error message from "Input must be a string" to its own wording.
- tests/sp5-title.test.js checks that message (`/Input must be a string/`), so the regression gate refused every Apply. It was right to.
- The agent never saw which test failed or what it expected. Each new attempt, and his line-edit request, rewrote the message again.
- Each click added another full copy of the refusal to the screen: five of them.

## What changed
- **The refusal goes back to the agent.** When the gate refuses an agent's proposal because a test that passes now would fail, the
  proposal is rejected with the refusal as its reason: the failing test, what it expected, what the new version gave, and "keep the
  behaviour these tests check exactly". It goes through the same path as his Reject (RL2, 0.60.105): the agent is told, the lesson is
  kept, and the phase is built again within the daily cap (repos.reject_retries).
- The answer says it was sent back, and the Code tab shows it as a warning, not a failure.
- `repos.retry_on_refusal: false` (or `sendBack: false` on the call) leaves the proposal to him, as before. A person's own change is
  never sent anywhere.
- **Toasts:** an identical message already on screen is counted (×N) instead of stacked again. A long one shows its first line, and
  the whole text on hover.

## Proof
- tests/modules/test-refusal-sendback.test.js 4/4:
  - RS-01, through the real API: refused, then rejected with the failing test, then said as sent back; a second click sends nothing;
  - RS-02 / RS-02b: switched off it stays proposed; a person's change is untouched;
  - RS-03, in Clear Glass: five identical errors give one toast ×5, and the whole text is on hover.
- Unchanged: approval-chain 6/6, phases-tab 5/5, cm3 4/4, code-surface-state 6/6, pipeline-root-causes 19/19, roadmap-import 5/5.
- test-work-surface WS-22 fails the same way before and after this release.

## Found, not changed
The evidence (the linked tests run on a proposal) is gathered in the background after the proposal arrives. An Apply clicked before it
finishes is not checked against the tests. It did not happen in his session; it is written down here.
