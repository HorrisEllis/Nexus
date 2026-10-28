# 0.60.272 — the virtual mouse in Ollama's live Nerve stream

James, 2026-10-28: "What about the nexus nerve and interaction field with ollama continuous data stream with its using the virtual input/mouse"

## The gap (from the code)
- `clear-glass/src/driver/index.js` `_pointer` already emitted `field.pointer` for every act, and `clear-glass/src/page/attention.js`
  kept the last one per window, which Nerve carries as `focus.pointer`.
- `lib/nerve-ollama-bridge.js` `pushContext` (copilot pushes it to the `nexus-live` stream every 5 s) sent only DOM-mutation counts
  and page feel. Ollama never heard the virtual mouse.

## What changed
- `field.pointer` carries the act's `label` (`choose` already names its steps: "open BASIC", then the option).
- Attention keeps the last 12 acts per window in `focus.acts`, so between two pushes a choose's open and pick are both kept, not just the
  last click. Nerve passes `focus` through unchanged.
- `pushContext` sends every act since the last push, oldest first, as a line like
  `window w1 · pointer click "3 Days" at (110,260) via eros`, and notes when the target was covered. The result counts `pointerActs`.

## Proof
- `tests/modules/test-nerve-pointer-stream.test.js` 2/2: attention keeps both acts with label and via; pushContext puts them on the
  stream route in order, and a second push with no new act sends none.
- test-field-nerve 5/5 and test-fiverr-pace 2/2 unchanged.
