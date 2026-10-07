spec:
  meta:
    name:     idearium-one-surface
    version:  1.1.0
    date:     2026-10-07
    release:  "0.47.0 (one phase: OS1–OS6 land together)"
    uuid:     nexus-idearium-one-surface-phasemap-v1-0000-2026-1007-jamesbrooks-001
    owner:    "idearium ui (plan-panel.js, repo-tasks.js, code-surface.js, app.js renderRepoAgent, repo-settings.js) + idearium api (snapshot summaries)"
    status:   "MAPPED, building"
    origin: >
      James, 2026-10-07, shown the 0.46.0 drawer: "what is that? thats supposed to be a idearium feature. also needs to
      look like the rest of it like the plan panel. also hooked into the code tab, same with the rest of what should be
      interconnected in the repos." · "stop, this is idearium. not sure what that is." · "yeah just needs to not be
      overwhelming, clean and beautiful. also the idearium settings still have iframes. need more settings moved into
      the correct tabs. like all agent options go into the agents tab" · (with the Phases, Spec and Files tabs of the
      browser-engine repo) "look in the agent settings and plan, and code tab for the propals. make sure its enterprise
      grade, consistent with nexus axioms and ideariums style. also the spec engine needs to have autocomplete for the
      areas that are blank. generate the file tree automatically, which feed into the registry as a spine."

  grounded:
    drawer:   "idearium/ui/js/repo-tasks.js + repo-drawer-views.js — a second panel (rt-drawer, its own look) opened by a Tasks button: tasks · log · control · phases · versions · machine"
    plan:     "idearium/ui/js/plan-panel.js — THE panel (#plan-panel: drag, resize, ⤢, nexus-theme tokens): tasks = the phases with gates and ▶ build per step, plans and file jobs, agents · what Nexus has learned, activity (phase runs), the live job, the work surface"
    overlap:  "the drawer's Phases view repeats the plan's tasks; its Log view is a superset of the plan's activity"
    code:     "idearium/ui/js/code-surface.js — the Code tab: a file, its plan and runs; nothing says which commit or task last changed the file"
    commits:  "idearium/repo/snapshot.js summarizeRepoSnapshots drops record.provenance (VR1's who/why/files) — the list cannot say what a commit touched"
    proposals: "three looks for one thing: Settings → Agent lists injects as raw rows (app.js renderRepoAgentSettings); the Plan panel and the Code tab show the work surface's cards (work-surface.js _wsCard: diff, Apply / Reject, open in Code)"
    phases_from_a_section_list: "idearium/repo/spec-plan.js derivePlan splits on top-level YAML keys — a workshop spec (sections: [{id, title, body}]) became two phases, 'spec' and 'sections', whose text is raw YAML (the browser-engine repo: IW0 'Build what the spec states in §spec (line 2)')"
    blanks: "a saved spec's empty sections (purpose: body '') and 0-byte chunk files (06-integration.md) stay blank; idearium/lib/workshop.js already proposes one section at a time (feed kind 'section', assisted / stretched), accepted per proposal, saved back to the repo"
    file_tree: "idearium/spec-engine manifest.fileTree + slotting into registry-components.js exist for skeleton specs (SB30/SB31, lib/repo-expand.js); a spec from the genesis template has no file tree, so nothing feeds the registry"
    settings: "idearium/ui/js/repo-settings.js — Agent → advanced, Hat & tools and Desktop settings are iframes of settings.html; agent options are split between Settings (Agent, Prompt, Hat, Models) and the Agent tab"

  decided:
    one_panel:   "no second panel. The Plan panel gains ONE folded section, activity, whose small views are tasks · log · control · versions · machine; the drawer and its Tasks button go. Phases are the plan's own tasks (no copy)."
    quiet:       "folded by default, one line each; a step that stopped says why in one red line under it, nothing else added to the rows"
    one_look:    "the plan's classes and nexus-theme tokens (pp-sec, pp-act, pp-actwrap); the rt- views restyled to them, not their own palette"
    agent_tab:   "every agent option lives in the Agent tab: who answers + model + tool scope + inject mode (native controls, POST …/agent/settings), prompt blocks (renderAgentBlocks), hat & tools (native, from GET /api/settings/console/:uuid), models (renderOllamaCheck). Settings keeps General, Files, Environment, Desktop."
    no_iframes:  "Desktop settings drawn natively from the same console detail; settings.html stays as the full console window only"

  phases:
    OS1_commits_say_what_they_touched:
      layer: api
      does: "summarizeRepoSnapshots carries provenance (by, refs, files); GET /api/repos/:uuid/history?path= — the commits that touched a file; `idearium repo history <repo> <path>` (CM1 row, so copilot has it)"
    OS2_the_plan_panel_holds_it:
      layer: ui
      does: "plan-panel.js: a stopped step's reason under its row; one folded `activity` section mounting repo-tasks.js's views (tasks · log · control · versions · machine) styled as the plan; the drawer, its button and the duplicate Phases view removed"
    OS3_the_code_tab_knows_its_history:
      layer: ui
      does: "code-surface.js: the open file's line — n versions · last by <who> <when> · <message> — opening the plan's versions view filtered to that file; a proposal links to the task that wrote it"
    OS4_every_agent_option_in_the_agent_tab:
      layer: ui
      does: "renderRepoAgent: folded sections (who answers · prompt · hat & tools · models), native, no iframe; Settings' Agent group removed with a one-line pointer"
    OS5_settings_without_iframes:
      layer: ui
      does: "repo-settings.js: Desktop settings native (compartment, branching, VM: ports, open, stop) from GET /api/settings/console/:uuid"
    OS6_proved_on_the_real_page:
      layer: test
      does: "a Clear Glass probe on Idearium's REAL index.html served by the real Idearium API (startAPI) — the plan's activity section, the Code tab line, the Agent tab sections, no iframe on the Settings tab; screenshots of the real page"

    OS7_one_proposal_surface:
      layer: ui
      does: "the Agent tab's proposals are the work surface's cards (the same as the Plan and the Code tab): diff, Apply / Reject, open in Code, the run that wrote it — the raw inject list goes"
    SP1_phases_from_the_sections:
      layer: library
      does: "derivePlan reads a workshop spec's sections list: one phase per section (grouped within a layer), named by its title, its does the section's first sentence, never raw YAML; the browser-engine spec replans to real phases"
    SP2_complete_the_blanks:
      layer: api+ui
      does: "the Spec tab marks each blank section and empty chunk file; ✦ complete opens the repo's spec in a workshop (source repo) and feeds kind 'section' for that section — proposals, accepted one by one, saved back (a VR1 commit); `idearium repo spec <repo> complete [--section id]`"
    SP3_the_file_tree_is_the_spine:
      layer: library
      does: "a spec without a file tree gets one generated from its sections by layer (the archetype's shape: lib/, api, cli, ui, tests/), each file a pending chunk, slotted into registry-components.js and its nodes through lib/repo-expand's slot path — the registry is the spine the phases build into"

  ordering: "OS1 → OS2 → OS3 → OS4 → OS7 → OS5 → SP1 → SP2 → SP3 → OS6"
