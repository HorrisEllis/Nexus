# 0.60.76 — 2026-10-16

James: "Let’s get this pipeline working"

James: "A brick is a chunk. Like analysis."

James, earlier: "each gate holds the context, which can make tghe agents dumb."

This is GW24 of `docs/2026-10-15-gate-held-work-phasemap.spec`, the first slice. It is step 3 (chunking and gating) of
his order in the pipeline-focus map: the gate keeps the context, and the agent gets a slice sized to it.

## What was wrong (read in source)

- **A brick's dependency code had no total cap.** When a brick imports names that no dependency exports yet, GA1
  (0.60.44) appended up to 120 lines of **every** dependency to its brief. Six dependencies could add about 700 lines,
  which is what a small model fails on.
- **The cut could miss what the brick needed.** A definition past line 120 was never sent.
- **The whole-phase brick carried the full repo context on every rung.** That is the brick for a phase that names no
  files. It got the full context card, memory, atlas and checklist even on a small local model.

## What changed

- **`lib/phase-plan.js` `contextNote({ needs, deps, budget })`.** The dependencies' code is now:
  - **ranked:** the definitions of the names the brick needs come first, in the order it needs them, then each
    dependency's export lines and top-level signatures;
  - **cut to one budget:** the size the first agent on the ladder has passed reliably (Boundaries, learned from every
    gate check, about 4 chars a token), less the brief. Without a learned size it is 6000 chars, and never less than
    1200;
  - **said:** what was cut, and any name no dependency defines, is recorded on the gate as `<gate>.context`.
- **The whole-phase brick goes lean on an Ollama rung.** It sends only the phase and its phase-map block (MP3); the rest
  stays with the gate, and the agent's tools fetch what it asks for. ChatGPT, Claude and the other agents' rungs get the
  full context as before.

## Proof

- `tests/modules/test-context-budget.test.js` 6/6:
  - a definition at line 151 arrives;
  - six dependencies stay within the budget, with the cut listed;
  - definitions outrank signatures;
  - a name defined nowhere is said, not invented;
  - the budget floor holds;
  - the wiring is checked in source.
- Unchanged and green:
  - test-contract-phase-build 12/12
  - test-chunked-phase-build 16/16
  - test-gate-assess 5/5 (GA-05 now checks the new wiring)
  - test-contract-adapters 19/19
  - test-escalation-ladder 9/9
  - test-raid-runs-contract 7/7

## Not proven yet

- **No real run.** No real small model has passed a brick here that it failed before. That needs James's run on this
  release (pipeline-focus step 0).
- **The lean whole-phase brick is checked from source only.** No test fixture drives a whole-phase brick on an Ollama
  rung yet.
