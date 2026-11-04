# 0.60.299 — a macro run's step counter, pause and play, skip and previous; the recording indicator; Service type waited for

James, 2026-11-04, with Fiverr's Service type still SELECT A SERVICE TYPE:
> "service type still gets skipped. needs more timing. also gating needs to hault. macros need a toast when executing. with a steps counter,
> pause and play. skip and previous. also when macros are recording a recording indicator in the taost when recording macros."

## Grounded first

- **0.60.298 was on the branch, not on main.** A copy of main had no Service type step at all.
- **Service type appears only after the subcategory is chosen.** His screenshot shows the row there, empty, so even 0.60.298 would have
  skipped it. A gig that names no service type had nothing to pick, and the fill passed over it without saying so.
- **A macro run showed nothing while it ran, and had no controls.** The macro tool ran its steps straight through.
- **There were two macro recorders.** The window's record buttons used a second `LiveRecorder` made in the IPC handlers, while `/cli` used
  `_macroRecord`'s. So a recording started from the window was not the one the status route saw. test-cg-agent-doors AD-02 had been failing on
  this.

## Built (MR1)

- **The run toast** (`clear-glass/renderer/macro-run-toast.js` and `.css`, in every Clear Glass window). For every macro run as him, it shows:
  - the macro;
  - "Step n of m" and what the step does (for example `choose SELECT A SUBCATEGORY → AI Development`);
  - a progress bar;
  - ⏮ previous, ⏸/▶ pause and play, ⏭ skip, ■ stop.

  Done fades. Failed or stopped stays, with the reason, until he closes it.
- **The controls are real.** The macro tool's `run` takes a `control`, consulted before each step:
  - pause holds the run there, and no step runs until play;
  - skip leaves out the step about to run, and the result says it was skipped;
  - previous runs the step before it again;
  - stop ends the run, said as stopped by him.

  The bridge keeps one control per run and broadcasts each state to every window (`macros:runState`). The buttons come back through
  `macros:runControl`.
- **A gate that stays closed halts the run at that step.** The toast keeps what the gate saw.
- **The recording indicator.** While a macro is recorded, a card shows a pulsing red dot, the macro's name, the steps recorded so far (read
  each second), and Stop.
- **One recorder.** The window's record buttons go through `_macroRecord`, the same as `/cli`. The second recorder was a true duplicate and
  is dropped, which this entry reports. AD-02 passes.
- **Service type, waited for.**
  - The fill waits up to 8 s for the Service type row after the subcategory.
  - With `serviceType` in the gig, it is chosen in its row and checked on that dropdown.
  - Without one, the fill stops there, and the toast names the dropdown's options so he can put one in the gig. The options are read by the
    driver's new `choose { list: true }`, which opens the dropdown, reads it and closes it.
  - Clear Glass's own spotlight label is never read as an option or as the page's words.

## Readings (to confirm)

- **"every pipeline is editable, managable, gated each step, and is saved to a .workflow tool."**
  - Pipelines are already editable in Settings › Pipelines, gated per task, and each one is its own `.pipeline` node file (0.60.296).
  - One reading: every pipeline also becomes a tool a workflow can use. It already can, as a "Run a pipeline" step.
  - Another reading: each pipeline is saved as a `.workflow` file.
  - Which he meant is his to say. Nothing was changed for it.

## Proof

- `test-macro-run-toast` 3/3:
  - MR-01: each step is said. Pause holds (no step runs while paused), skip leaves out "two", previous runs "one" again, stop ends the run.
  - MR-02: a closed gate halts at its step.
  - MR-03, in Clear Glass: the toast's counter, its buttons, a failure kept, the recording dot and its step count.
- `test-gig-stop-and-toast` 6/6. GS-06 is new: the row appears late and is waited for, and a gig with no service type stops with the
  options named.
- `test-cg-agent-doors` 7/7. AD-02 had failed before this release.
- Still green: test-fiverr-overview-and-a11y, test-element-gates, test-pipeline-gates, test-pipeline-nodes, and the rest of the regression set
  listed in the commit.
