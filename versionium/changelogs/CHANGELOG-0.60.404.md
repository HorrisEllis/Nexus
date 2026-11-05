# 0.60.404 — The macro toast shows when a macro plays (MT6)

James, 2026-11-05: "so it should work end to end. did you add the toast for the macros??"

## Found (checked, not assumed)
The macro toast was built (MT1), and the bridge sent every step (`macros:progress`, MB4). But nothing in the window listened for those
steps, so a playing macro showed no toast. It was not end to end.

## Built
- The window now listens for macro progress.
- The toast shows step N of M, with the step's label.
- Its **Pause**, **Resume**, **Step** (skip) and **Stop** buttons control the running macro.
- When the macro ends, the toast says it is done, or where it stopped and why, then clears itself.
- Every macro this window runs shows it, including a bookmark's bound macro.

## Proof
- `test-macro-toast-glass` 5/5. MT-06 and MT-07 are driven in Clear Glass.
- `test-cg-bookmark-macros` 5/5. BK-05 checks that the window subscribes.
