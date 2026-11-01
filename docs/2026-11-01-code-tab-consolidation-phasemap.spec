# docs/2026-11-01-code-tab-consolidation-phasemap.spec — the Code tab around what Idearium is for: it builds the project, and the outputs and
# the flight recorder are the point. The idea is James's; the count, the cut and the layout are the coder's reading, said where they are.

origin: >-
  James, 2026-11-01, looking at NEXUS/CORE's Code tab (runs → upload, and the COS view with "the screen for it is not built yet"): "also the
  code tab, can we consolidate it more. idearium is the system. it can build those projects. thats the point the outputs. also the flight
  recorder"

measured_2026_11_01: >-
  The Code tab has 27 ways in on one screen: 5 views (files, changes, plans, runs, COS — code-surface.js CS_VIEWS_IDS), 15 panels under runs
  (activity, work, changes, flight, upload, runs, responses, tasks, log, control, versions, machine, charter, agents, jobs — code-tab-panels.js
  CX_PANELS) and 7 dock rails (plan, outputs, changes, tasks, context, tools, control — code-dock.js DOCK_PANELS). Duplicates: changes ×3,
  runs ×2, control ×2, tasks ×2, plan(s) ×2, versions beside the repo's own Versionium tab. Outputs — what Idearium built — is only a folded
  rail. The COS view is a placeholder. The flight recorder is panel 4 of 15.

readings_to_confirm:
  - "\"idearium is the system. it can build those projects\": read as the Code tab being Idearium's build loop for this repo, not a COS panel; the COS view goes (COS testing is a step of a run, shown inside it when CP builds it). To confirm."
  - "\"thats the point the outputs. also the flight recorder\": read as outputs and the flight recorder being the two things the tab leads with. To confirm."

decisions:
  CC_D0_three_views:
    status: "PROPOSED 2026-11-01 (the coder's cut of his words; to confirm)"
    chosen: >-
      Three views, every existing panel kept and moved, none deleted (§0.3):
        Files  — the code; a changed file carries its diff (files + changes, the work surface's changes).
        Build  — input → plan → run → outputs, one line: upload (an input), charter/agents/jobs/work (the plan), control (play, pause,
                 rewind, who answers), and outputs (proposals and artifacts, accept or refuse) at the end and open by default.
        Flight — the flight recorder as the one history: each run with its agents, attempts, cost, responses, log, versions and the machine;
                 activity, runs, responses, log, tasks, jobs, versions and machine become filters of it, not tabs.
      The dock keeps only what an agent is given (context, tools); its plan, outputs, changes, tasks and control rails go (they are views now).
      The COS view goes; its line becomes the COS step inside a run (CP).
    by_the_axioms: "§8.6 (every panel reused, none rebuilt), §0.3 (moved, not deleted), §5.9 (Idearium's screen shows Idearium's work; COS's own screen is COS's)"

phases:
  CC1_one_model:
    status: OPEN
    depends_on: [CC_D0_three_views]
    files: [idearium/ui/js/code-surface.js, idearium/ui/js/code-tab-panels.js, idearium/ui/js/code-dock.js]
    interface: [html]
    does: "one table of views and the panels each holds (Files, Build, Flight), replacing CS_VIEWS_IDS, CX_PANELS and the dock's duplicate rails; old ids (localStorage, shortcuts) map to their new home"
    proof: "every one of the 27 old ids opens its panel in its new view; nothing is unreachable"
  CC2_build_view:
    status: OPEN
    depends_on: [CC1_one_model]
    files: [idearium/ui/js/code-surface.js, idearium/ui/js/upload-intent.js, idearium/ui/js/code-dock.js]
    interface: [html]
    does: "Build: input (upload) → plan → run (control) → outputs, outputs open by default with accept/refuse"
    proof: "a repo with a proposal opens Code → Build and shows the proposal without a click"
  CC3_flight_view:
    status: OPEN
    depends_on: [CC1_one_model]
    files: [idearium/ui/js/code-tab-flight.js, idearium/ui/js/code-tab-panels.js]
    interface: [html]
    does: "Flight: the flight recorder first; activity, runs, responses, log, tasks, jobs, versions, machine as filters over it"
    proof: "a run opened in Flight shows its responses and log inline"
  CC4_proof:
    status: OPEN
    depends_on: [CC2_build_view, CC3_flight_view]
    files: [tests/modules]
    interface: [html]
    does: "driven in Clear Glass (never Playwright): three views, no duplicate ids, the COS line inside a run"
    proof: "the Clear Glass run's screenshots and counts (27 → 3 views + filters)"
