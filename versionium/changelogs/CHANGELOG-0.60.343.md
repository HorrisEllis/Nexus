# 0.60.343 — MB1 + MB2: macros as blocks, with the gate between them

James, 2026-11-01: "i want the macros in the settings to be blocks with settings, gates between them with the delays type and everything else
the gates can do" · then: "do it"

## What was there
The macro runner (lib/agent-tools/tools/clear-glass/macro.js) already checked a gate after each step: what must hold, a dropdown check,
how long to wait, and retries. So the gate after a step is the gate between two blocks. MB1 adds only what was missing.

## MB1: the runner (gate-eval.js, macro.js)
- `delay`: `{ kind: fixed, ms }`, `{ kind: range, min, max }` or `{ kind: human, ms }`. Human pace spreads 55–145% around ms, and one time in
  eight it adds a longer look away. The delay is waited after the step and before the check. A gate with only a delay is a pause.
- `backoff`: `{ baseMs, factor, capMs }`, the wait before each retry (base × factor^n, capped).
- `onClosed`: `stop` (as before) or `skip`. Skip goes on and says in the run's result that it skipped.
- All of it is checked when the macro is made, and the node schema (`schema.macro`) describes it. A macro without these keys runs as before.

## MB2: Settings › Macros (renderer/settings/sections/macros.js, macros.css)
- Each step is a block. The gate to the next block sits under it, summarised in one line (for example "⧗ pause at a person's pace (~900 ms)
  · wait until #price holds "25" · 5 s, 3 retries, backoff 200 ms ×2 · if closed: skip").
- Opened, the gate shows its settings: the pause and its numbers, what must hold, how long to wait, retries, backoff, and what to do if it
  stays closed.
- **Fixed on the way:** saving a macro in Settings rebuilt each step from its fields and dropped its gate, so editing a gated macro removed
  its gates. Gates are kept now, including keys this editor does not show (a dropdown check).

## Proof
- test-macro-blocks 6/6: validation, the delay kinds, a delay measured between two blocks, backoff gaps measured, skip and stop, an old macro
  unchanged.
- test-macro-blocks-ui 3/3: the real Settings page in Clear Glass's engine. Edit draws the gates; saved untouched, a gate comes back whole;
  set in the editor, it is saved as the runner reads it.
- test-gated-dropdowns 6/6.

## Not built
MB3: one gate editor shared with pipelines. "Ask me" when a gate stays closed needs a place to ask, and is not built.
