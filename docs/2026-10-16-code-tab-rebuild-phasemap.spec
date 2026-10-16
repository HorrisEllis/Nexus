# docs/2026-10-16-code-tab-rebuild-phasemap.spec — the Code tab rebuilt as five tabs; the Runs tab persists every gate, output, response, job and contract
# MAPPED, NOTHING BUILT. Owner of the Code tab's STRUCTURE. The data and events it shows stay owned by:
#   docs/2026-10-15-code-tab-run-state-phasemap.spec (CE1-CE5, CE10 built 0.60.50; CE6/CE9/CE11/CE12 are absorbed here: see TB phases)
#   docs/2026-10-15-gate-held-work-phasemap.spec (GW1-GW16; GW9 the contract panel = the Runs tab's contracts view, built once, here)
meta:
  name: 2026-10-16-code-tab-rebuild-phasemap
  version: 1.0.0
  origin: >-
    James, 2026-10-16: "Rebuild the code tab. It's too overwhelming. Tabs for the file tree. One for the files, one for the new code or Uncommited changes/new changes, one for the current plans files? And one for the cos file tree? one for the gating and runs, and responses in real time. Like this needs to be persistent each gate, each output, reuse responses, jobs, contracts etc"
    Context: said mid-turn while the COS work (0.60.68-0.60.72) was finishing. Earlier he decided one Code tab, not two (CE0, 2026-10-15: "yes one tab."), and asked "the code tab upgraded" (pipeline focus). This rebuild is that upgrade, now in his words.
grounded:
  what_exists:
    - "idearium/ui/js/code-surface.js (424 lines, 0.39.349 CT3): left = files with state, middle = search + open file + outline + diff cards, right = chunk card + docked agent, bottom = activity strip. Four regions open at once: this is the overwhelm."
    - "idearium/ui/js/work-surface.js + file-manage.js: per-file state (modified | new | deleted | pending) and the agent's changes as diff cards with Apply / Reject (GET .../files/state, GET .../worksurface)."
    - "idearium/ui/js/plan-panel.js (481 lines): the plan, its current step, runs on the open file."
    - "idearium/ui/js/repo-tasks.js, repo-drawer-views.js: tasks / log / control / versions / machine."
    - "lib/repo-run-state.js, lib/run-state.js (CE1, 0.60.50): the run state; lib/step-gate.js, lib/step-gates/: the gates; lib/contract-queue.js and the contract writers; guardian GET /jobs; lib/repo-activity.js (tasks, IN MEMORY, bounded, rebuilt from the compartment's exchange log repo_agent_log after a restart)."
    - "Events: idearium.repo.task, idearium.repo.agent.tool (+ GET .../agent/tool-events for a page opened mid-run), CE5 run events. Real time already exists as events; the panel has to subscribe, not poll."
  not_known_yet: "What is persisted today and what is only in memory, per kind (gate result, output, response, job, contract). repo-activity is in memory. A persistence audit (TB2) comes before any new store: reuse before build."
design:
  principle: "One thing on screen at a time. Five tabs; the default is Files. The right rail and the bottom strip are gone from the default view: the docked agent becomes a drawer opened on demand, and the activity strip becomes the Runs tab. Nothing is deleted (CLAUDE.md rule 5): the old regions are reused as the contents of the tabs."
  tabs:
    files: "The repo's file tree and the open file (search, outline, chunk card on click). Today's left + middle, nothing else."
    changes: "New and uncommitted work: files by state (modified / new / deleted / pending) against the last version, and the agent's proposed changes as diff cards with Apply / Reject. A count badge on the tab. Reuses file-manage.js state + work-surface.js cards."
    plans: "The current plan's files: the plan, its steps, the step in progress and the runs on each. Reuses plan-panel.js. TO CONFIRM: 'plans files' read as the plan and its phasemap/spec files."
    cos: "The COS file tree: the repo's compartment as COS holds it. TO CONFIRM which: (a) the repo's own compartment files (its desktop/VM or COS-run workspace), (b) Nexus's cos/ directory, (c) the nested compartment tree per system (COSA11). Coder's reading: (a) with (c) as the way to pick the compartment."
    runs: "Gating and runs and responses, live: the run as phase -> steps -> gates (CE9's pipeline graph), each gate's last result and evidence, each output and response (status badge, kind, grouping), jobs (Guardian /jobs and repo tasks), contracts (GW9/CP1), the RAID route and cost. Control: pause, resume, retry from step n, stop, send to another provider. A dot blinks while something runs (his CT8 request, kept)."
  persistence_rule: "Every gate result, output, response, job and contract is a record that survives a restart and can be looked at later, not only while it runs. The Runs tab reads the records; live events add to them as they happen. 'Reuse responses' = a stored response can be offered again for the same ask instead of a new model call (see TB4, with the cost of being wrong)."
phase:
  TB0_decisions:
    status: OPEN
    does: "Four answers (decisions_needed below). The recommendations are written so a one-word reply settles each."
  TB1_read_model_per_tab:
    status: OPEN
    depends_on: [TB0_decisions]
    systems: [idearium]
    does: "Backend first, per his order: one read per tab over EXISTING routes, no new store: files (repo.files + state), changes (state + worksurface), plans (the plan + steps), cos (per TB0), runs (CE1 run-state + gates + responses + jobs + contracts). Each also a command row (nexus.command), so agents read what he reads (CE8)."
    proof: "each read returns the same data the old regions showed; a test per tab."
  TB2_persistence_audit:
    status: OPEN
    depends_on: [TB1_read_model_per_tab]
    does: "For gate result, output, response, job, contract: where it is written today (jaa table, ledger, file, memory only), its retention, and whether it survives a restart. Output is a table, not a guess. The gaps become TB3."
    proof: "a test restarts the repo layer and reads back one record of each kind; the ones that do not come back are listed by name."
  TB3_close_the_persistence_gaps:
    status: OPEN
    depends_on: [TB2_persistence_audit]
    does: "Only what TB2 found missing, written through the one writer that already exists for that kind (ledger, jaa table, repo_agent_log), never a second record (AXIOMS 7.6: the ledger is the record). Gate results carry input hash, result, evidence, time, run id. Append-only, archive never delete."
  TB4_reuse_responses:
    status: OPEN
    depends_on: [TB3_close_the_persistence_gaps]
    does: "A stored response is offered again when the ask AND its context match (hash of the ask, the file/lines, the dependencies' state, the provider/model, the gate set). It is offered, not applied: the Runs tab shows 'a response from <time> answers this: use it / ask again'. Counts reuse so 'as little as possible' (docs/CLAUDE.md, agents) is a number."
    failure_modes: ["A stale response reused after the code changed: the context hash includes the files' versions, so a change misses the cache.", "A reused response hides a model regression: it shows its age and model."]
  TB5_tab_shell:
    status: OPEN
    depends_on: [TB1_read_model_per_tab]
    does: "The five-tab frame in code-surface.js (or a new code-tabs.js it mounts): tab bar, badges (changes count, a dot on Runs while something runs), default Files, the agent as a drawer, remembers the last tab per repo. Old regions kept behind the tabs, nothing removed."
  TB6_files_changes_plans_cos_tabs:
    status: OPEN
    depends_on: [TB5_tab_shell]
    does: "Mount the existing pieces in their tabs; no new behaviour except the Changes tab's count and its Apply all / Reject all with a snapshot first (REVERSIBILITY)."
  TB7_runs_tab:
    status: OPEN
    depends_on: [TB5_tab_shell, TB3_close_the_persistence_gaps]
    does: "CE9 + CE11 + GW9 built once here: the pipeline graph (route-graph.js), gates with evidence, responses ledger, jobs, contracts, RAID route; live from events; history from the records; controls (pause / resume / retry from n / stop / another provider). Filters: this run | this file | failed only."
  TB8_proof_and_wiring:
    status: OPEN
    does: "Tested in Clear Glass, never Playwright (docs/CLAUDE.md): drive the real page with clear-glass/src/driver/glass.js. Loom wires for each new file. Addenda to the CT3/CT5/CT8 specs and to CE6/CE9/CE11/CE12/GW9 saying 'built in TB5-TB7'. Version bump."
build_order: "TB0 -> TB1 -> TB2 -> TB3 -> TB5 -> TB6 -> TB7 -> TB4 -> TB8. Backend and records first, the tab shell second, the live tab last. TB4 (reuse) last because it is the only phase that changes what the system does, not what it shows."
decisions_needed:
  - "COS tab: (a) the repo's compartment files, (b) Nexus's cos/ directory, (c) the per-system nested tree? Recommend (a), reached through (c)."
  - "Plans tab: the plan + steps (plan-panel) and its phasemap/spec files? Recommend yes."
  - "The docked agent: a drawer opened from any tab (recommended), or its own sixth tab?"
  - "Retention: keep every gate result and response forever (recommended; they are the proof and the reuse source), or bounded with an archive?"
failure_modes:
  - "Rebuilding the surface and losing a function the old one had: every region's function is listed above and moves, none is dropped; TB8 checks the list."
  - "A second record of the same event (a gate result in the ledger and again in a new table): TB2 exists to prevent this."
  - "Live panel polling instead of subscribing: events exist; polling is a defect."
  - "Persisting responses that contain secrets or private chat text: TB3 states what is stored and masks by key name; unverified until the audit lists real contents."
