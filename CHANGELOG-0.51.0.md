# 0.51.0 — 2026-10-08

James: "okay now the phases with the spec workshop. needs to be rebuilt, enterprise grade. interconnected"

RS11 is done, built on the workshop the other session shipped (WS7) instead of building a second one. RS6 is re-mapped: its editor is WS7, and what's left of it is the macro timeline, which needs RS1 and RS2 first.

## In the workshop: each section knows its phases

- **Reading the thread.** It reads the saved spec's thread on open, after save, plan and build, and when the window comes back into focus. There's no polling.
- **Each section shows a strip of its phases**, by key and state: planned, active, the run's state (e.g. ESCALATING), done or failed. Clicking one opens Idearium's Phases tab on this spec with that phase open.
- **The outline** shows a dot per phase.
- **A changed section.** A section changed since it was planned says ↻ CHANGED SINCE IT WAS PLANNED, and REPLAN opens the pipeline's replan.
- **Unsaved edits.** A planned section edited and not saved says SAVING THIS CHANGES N PLANNED PHASES.
- **Opening at a section.** `?block=<section>` opens the writer at that section.

## In the Phases tab

- **Open in the workshop** opens the session that saved the spec, at the phase's block. The thread now names that session.

## Found on the way, fixed

- **A click lost to a repaint.** Selecting a section repaints, and the phase strip was rewritten on every repaint, swapping its buttons under the pointer. A strip is now rewritten only when it changed.
- **A hand-off lost on a repo switch.** A spec and phase handed over by the workshop were wiped when the Phases tab switched to another repo. They now survive the reset.

## Not built

- **Planning only the picked sections.** The pipeline plans the whole spec, and a replan does not carry the old map's statuses over. This is said here, not hidden.

## Tests

- `test-workshop-thread` 4/4, driven in Clear Glass with the real workshop page and the real lib/workshop.js, spec-plan, spec-document and thread.
- `test-phases-tab` 5/5 (PT-05 is new).
- Unchanged and passing: thread, spec-document, plan-lands, code-tab, the contract tests.
- Main's `test-workshop-full` and `test-template-picker` (TP-03) flicker the same with and without this change. Three runs each way: workshop-full failed 2 of 3 without it and 0 of 3 with it; TP-03 failed either way. Main's changelog already recorded TP-03 as intermittent.
