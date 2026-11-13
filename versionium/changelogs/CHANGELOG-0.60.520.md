# 0.60.520: PC11, an attempt that never reached its agent teaches nothing

James, 2026-11-13: "yes. then the highest leverage. ollama can can now run the pipeline"

## Why this was the highest leverage
With no agent named, the phase build already climbs his Ollama ladder first (CT6), so Ollama runs the pipeline as it is. What still stopped
an unattended build was found on 2026-11-11 and never fixed. Run phrun-mwbvr9la's contract said "failed it before, skipped: gemini, chatgpt,
claude", though nothing had been sent to any of them, so every later build of that phase gave up in about 35 s.

## Found
`lib/pipeline-routing.js` `classify()` did not know "nothing was sent", "no-answer", "provider-down" (with its hyphen) or Copilot's door
unreachable, and read them as `unknown`. `cortex/core/raid/contract-gates.js` `classifyFailure` files `unknown` as **capability**. The
agent then went on the brick's skip list (`.exclude`), the door's learned order recorded a failure, and Boundaries learned a size lesson.
All three are falsehoods when the agent never received the work.

## Built
Those four are `provider-down` now. That is transient: retried on the same agent, no retry spent, nothing excluded, nothing learned. An
agent that answered and fell short (any other text) stays capability, as GT-02 holds. A signed-out tab is left as it was: a login never
falls through, by his rule. Mapped first as PC11 (docs/2026-11-08-pipeline-canvas-phasemap.spec), with its graph written before the code.

## Proof
PR-05b and GT-01b added. test-pipeline-routing 20/20, test-contract-adapters 20/20, test-gate-tracking 4/4, test-run-state 33/33,
test-starved-machine 5/5.

## Not done, said
Contracts already on his disk that carry a skip list from such a night keep it: the one found on 11-11 was archived by hand. A command to
clear the skips that rest on "nothing was sent" evidence is a later step if more turn up.
