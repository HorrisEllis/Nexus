# 0.60.400 — No console window per system (SC16)

James, 2026-11-05: "keeps spamming my screen. any way to have those node.exe windows open in the background?"

## Found
COS's supervisor started every system without `windowsHide`. On Windows, a child of a process with no console (COS's window) gets a console
window of its own: one per system, and a new one at each restart. The COS app's own processes already hid theirs.

## Built
- Every process COS starts now hides its console window.
- A windowed system (Clear Glass, which is Electron) keeps its own window.
- Their output is in the Console tab (SC11).
- The door's test runner and core-duties' processes hide theirs too.

## Proof
- `test-cos-hidden-windows` 2/2.
- `test-cos-supervisor` 8/8, `test-cos-console-tab` 4/4 and `test-cos-autopilot-door` 5/5, unchanged.
- On Windows, unverified until your run.
