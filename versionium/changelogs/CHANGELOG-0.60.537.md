# 0.60.537 — ▶ Run shows the pipeline running in real time

James, 2026-11-14, a screenshot of COS's Automation tab with the Idearium build pipeline open: "okay clicking play should show it running in
real time"

## Built (PC4, the canvas, continued)
- **▶ Run opens the canvas on the run.** This works from the page or from the canvas. If the pipeline asks for a value first, it is asked on
  the page, then the canvas opens.
- **Live from COS's event stream.** Each step lights the moment COS's engine reports it (`/api/cos/events`, `automation.pipeline.task`).
  Polling is no longer the main source; the 1.5 s read stays only as a fallback, and the run window says which one is in use.
- **Time is shown as it runs.**
  - The running step pulses and counts its seconds.
  - A finished step shows its state and time.
  - The run window counts the run's time.
- **Pause and Stop are labelled in words.**

## Proof (Clear Glass)
- `node tests/modules/test-cos-hub.test.js`: 12 passed, 0 failed. HB-12 shows:
  - ▶ Run on the page opened the canvas.
  - A 2.5 s step was seen running, with its time.
  - It then showed as done.
  - The updates came live from COS's event stream through the cockpit.
- Screenshot: `cos/ui/pipeline-editor/built-canvas-live.png`.
