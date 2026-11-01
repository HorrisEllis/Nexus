# 0.60.359 — the macro toast: which step, pause, skip, back (MB4)

James, 2026-11-01:
> "also the macro toast for playback and recording, shows what step your on, out of how many. with a pause and skip, goes back one step."
> · choosing it next: "Macro toast first"

## Built
- **One toast in Clear Glass** for every macro run and recording.
  - **Playback:** "▶ name · step i of n · the step", with Pause/Resume, Back (the step before runs again), Skip (passed, and said in the
    results as skipped by a person) and Stop.
  - **Recording:** "● Recording name · step N", with Pause (nothing that happens on the page is kept) and Back (the last step is dropped,
    and its events are kept on the session).
  - **The end:** done, or where it stopped and why. The toast goes after 4 s.
- **The real runner** (`lib/agent-tools/tools/clear-glass/macro.js`) asks a run control (`macro-control.js`) before each step. An agent's
  run carries none and runs straight through, as before.
- **One recorder.** Found while wiring: the panel and the copilot each made their own recorder, though AD_D2 said there is one. Now there
  is one, and it reports its step count to the toast.

## Proof
- `tests/modules/test-macro-toast.test.js` **5/5**, on the real runner and the real recorder.
- `test-macro` 22/22 and `test-macro-blocks` 6/6, unchanged.
- **Not yet proven in Clear Glass:** its UI tests cannot start beside his running Clear Glass (single instance), the same reason CU-06
  fails. With Clear Glass closed, `node tests/modules/test-macro-blocks-ui.test.js` runs the macro UI.
