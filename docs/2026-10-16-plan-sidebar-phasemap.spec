# docs/2026-10-16-plan-sidebar-phasemap.spec
# The Plan panel as a sidebar: the plan, its context, its progress. Everything else in its own panel.
# MAPPED 2026-10-16, before building (docs/CLAUDE.md rule 1). Registered in docs/SPEC-REGISTRY.spec.

origin:
  date: 2026-10-16
  james: "Can you make something like the sidebar, for contexT? can you strip the plan panel to just the plan with context, and progress? make the rest theyre own panel? and remove what is creating clutter"
  looking_at: >-
    A screenshot of Claude Code's right sidebar: separate cards (Environment, Context, Outputs). The Context card has
    one line "82% used 822.1k / 1M", a segmented bar, and one row per part (Messages, System tools, MCP tools …) with
    tokens and a percentage.
  reading: >-
    The coder's reading, to confirm. "Something like the sidebar, for context" is a Context card in the Plan panel, built
    like that one: what the agent building the phase is given, part by part (the phase request, the mapped files, the
    charter, the lessons, his note), as tokens and a share of the model's window. "The rest their own panel" means the
    other sections leave the Plan panel for panels of their own in the Code tab's bottom bar.

evidence:
  # read 2026-10-16 on 0.60.105, not from memory
  - "idearium/ui/js/plan-panel.js _planPaint draws ten sections in one scroll: code build, proof, end state, progress bar, charter editor, tasks, plans and file jobs, agents learned, activity (tasks · log · control · versions · machine), and the work surface (every diff, and the tools line)."
  - "Two are drawn twice. The work surface's cards (_wsCard) are also the Code tab's 'changes' view (code-surface.js). The activity views are also the Code tab's bottom panels (code-tab-panels.js CX_PANELS); the bottom panel even says 'also open in the Plan panel's activity section'."
  - "Nothing records what an agent was given, part by part. The 'building' row has promptChars only. lib/economy/tokens.js estimate() is the one token estimate; lib/ollama-activity.js MAX is the window Nexus gives Ollama."

phases:
  PS1_context_recorded:
    status: BUILT 0.60.107
    systems: [idearium, core]
    files: [lib/economy/tokens.js, idearium/api/index.js]
    does: >-
      tokens.breakdown(parts, window) → each part's tokens and share, used, free and the percentage of the window.
      tokens.windowFor(provider) gives the window when Nexus knows it (Ollama: the num_ctx ceiling it sets), else null,
      said as unknown. _phaseBuild puts `context` on the run's 'building' row: request, mapped files, charter, lessons,
      his note, sized as sent.
    proof: tests/modules/test-plan-sidebar.test.js PS-01, PS-02

  PS2_plan_panel_three_cards:
    status: BUILT 0.60.107
    systems: [idearium]
    files: [idearium/ui/js/plan-panel.js, idearium/ui/css/plan-panel.css]
    does: >-
      The panel is three cards, like the sidebar he showed:
      - Progress: the bar and counts, what is building now, the end state in one line, the agent writing live, and one
        line "n proposals waiting → Code › changes".
      - Plan: the tasks (now, next, done fold), as before.
      - Context: for the phase building now (or the last one built), one line "x% used n / window", a segmented bar, and
        a row per part.
      Each card folds, and the fold is remembered per browser.
    proof: test-plan-sidebar PS-03 (Clear Glass)

  PS3_the_rest_their_own_panels:
    status: BUILT 0.60.107
    systems: [idearium]
    files: [idearium/ui/js/code-tab-panels.js, idearium/ui/js/plan-panel.js]
    does: >-
      Out of the Plan panel. Kept, not lost (§0.3):
      - into the Code tab's bottom bar, as new panels: charter (with the end state and its editor), agents (what Nexus
        has learned, plus the repo's lessons from RL4), and jobs (plans and file jobs);
      - already there: activity, tasks, log, control, versions and machine are the bottom panels; the work surface is
        Code › changes.
      The work surface and the activity views are no longer drawn twice.
    proof: PS-04 (Clear Glass)

open:
  - "The window is known for Ollama only; a browser agent's window is shown as unknown, not guessed."
  - "To confirm with James: the Context card's parts, and whether the Plan panel should also be docked (always open) like the sidebar."
