# 0.60.335 — MT1: the macro recording toast with the classic breathing red dot

James, 2026-10-31: **"a toast with playback controls … the classic red dot breathing when recording."** · **"step by step macro recorder, with a hotkey"**

## What was built
`clear-glass/renderer/macro-toast.js` + `.css` — one persistent toast (`window.CGMacroToast`), two states:
- **Recording** — a breathing red dot (CSS pulse), "Recording macro", a live step count, and **Stop**.
- **Playing** — the macro name, step **N / M**, a progress bar, and **Pause / Step / Stop**.

It's drawn in Clear Glass's own window (like the autofill chip), and wired into the **record hotkey** (`browser.js` `cg.macroRecord`: shows on start with a working Stop, hides on stop), replacing the plain "● Recording a macro" line.

## Reuse
The existing record start/stop hooks — this adds the visible toast on top.

## Proof (a real browser, via glass.js)
`tests/modules/test-macro-toast-glass.test.js` 3/3 — recording shows the breathing dot + Stop; playing shows the name, "step 3/5", a 60% bar, and the controls; hide clears it.

## Next (MT2)
The player's **live** progress and Pause/Step come from the macro runner emitting a per-step event and holding on pause (`lib/agent-tools/tools/clear-glass/macro.js`) — mapped, not yet built.
