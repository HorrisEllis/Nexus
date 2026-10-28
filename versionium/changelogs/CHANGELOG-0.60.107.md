# 0.60.107 — 2026-10-16

James: "Can you make something like the sidebar, for contexT? can you strip the plan panel to just the plan with context,
and progress? make the rest theyre own panel? and remove what is creating clutter"

He sent it with a screenshot of Claude Code's right sidebar: separate cards, one of them Context, which shows "82% used",
a segmented bar and one row per part.

The map is `docs/2026-10-16-plan-sidebar-phasemap.spec`. The coder's reading, to confirm: "something like the sidebar,
for context" means a Context card showing what the agent building the phase is given.

## Built

- **PS1, backend.**
  - `lib/economy/tokens.js` gains `breakdown()`.
  - `_phaseBuild` records on the run's "building" row what the agent is given, part by part: phase request, mapped files,
    charter, lessons, and his note.
  - The window is Ollama's num_ctx ceiling. For any other agent it says "window not known" rather than guessing.
  - `idearium/repo/build-plan.js` passes this to the step's ledger.
- **PS2, the Plan panel as three cards.** Each card folds, and the fold is remembered.
  - **Progress:** phases done, the bar, the end state in one line, "n proposals waiting → open in Code › changes", and
    the agent working live.
  - **Plan:** the tasks (now, next, done).
  - **Context:** "x% used n / window", a segmented bar, and a row per part, for the phase building now.
- **PS3, the rest is its own panel.** Nothing deleted.
  - Charter (end state and editor), agents (what Nexus learned, plus the repo's lessons from 0.60.105) and jobs are new
    panels in the Code tab.
  - Activity and the work surface were each drawn twice. Now they are drawn once: activity in the bottom panels, the
    work surface in Code › changes.
  - The activity shortcut opens the Code tab's panel.
  - `cxPanel` brings up Code's runs view, where the panels have lived since 0.60.103.

## Proof

- `tests/modules/test-plan-sidebar.test.js` passes 4/4. PS-03 and PS-04 are driven in Clear Glass.

## Not done (said, not hidden)

- **No live run on his machine yet.**
- **Older builds have no Context card.** Only builds started from this version record their context, so the card says
  "no build has recorded its context yet" until the next ▶ build.
- **To confirm with James:**
  - the Context card's parts;
  - whether the panel should stay docked open like the sidebar.
