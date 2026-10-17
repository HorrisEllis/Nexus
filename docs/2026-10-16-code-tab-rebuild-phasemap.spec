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

# ADDENDUM 2026-10-16 (a): the Runs tab in detail: every gate, zoom into each, and the traversal between them
addendum_a:
  james: >-
    (with a screenshot of the Code tab today: the Runs strip, a RUNNING phase build, a chain of tool-call chips joined by arrows, and the red line "gate typed and sent · failed · provider 'chatgpt' disconnected mid-flight (retry 1) → the composer or send button was not found — pick them with ◎ (the element picker)")
    "like i want to see each gate, everythinh happening in the run, like i can zoom in to each gate, control, zoom in, see the response, log, etc. also what about the traversal between gates or each step."
  reading: "To confirm. (1) The Runs tab draws a run as a graph: gates and steps are NODES, the moves between them are EDGES, and an edge is data too (why it moved, how long it waited, who decided). (2) Four zoom levels, each one click: run, attempt, node, edge. (3) Every node and edge is a persisted record, so a finished or crashed run can be walked the same way as a live one."
  grounded:
    today: "The strip shows steps as chips joined by '→' (code_search → code_read → …). The arrow carries nothing: no time, no reason, no decider. The gate failure is one red sentence; its detail is not clickable."
    what_is_recorded:
      job_gates: "guardian/lib/gate-trail.js: 8 gates per job, in order: create, tab, ping, deliver, accept, submit, reply, complete. Each entry { gate, state, at, detail, implied }; stored on the job (job.gates), served at GET /status/:jobId, emitted as guardian.job.gate. It already carries a FIX line per gate (e.g. submit: 'pick them with the element picker'). A later gate passing marks earlier ones 'passed (implied)' with at = now: those timestamps are NOT measured."
      tool_steps: "lib/run-state.js (CE1): one .run node per run, steps { n, name, arg, ok, error, attempt, at }, events { kind, text, attempt, at }, attempts. Kept: the LAST 60 steps; older ones drop off the list (the count stays). That is a persistence gap against 'each output persistent'."
      outputs: "the .response files and the job's response; the compartment exchange log (repo_agent_log); logs per system."
      proof_gates: "lib/step-gate.js and lib/step-gates/: the phase's proof checks."
    not_recorded: "The edge: why a step followed another, how long the system sat at the from-node, who chose the next one (the gate, RAID's route, copilot, a retry rule, a person), and a retry's own reason. A fallback or a retry is visible only as a new chip."
  layout: |
    RUNS tab (one thing at a time; the rest of the Code tab is hidden behind its own tabs)
      [run list]  RUNNING  Write ONE file: lib/intent-chain.js   attempt 1 · 65 steps · 0 changed · 04:21   ◀ pick a run
      ── zoom 1: RUN ─ attempts as a strip: attempt 1 ✓/✗ · attempt 2 …  with the reason each ended
      ── zoom 2: ATTEMPT ─ the graph, left to right:
           [goal] ─▶ [gate create ✓ 0.1s] ─▶ [tab ✓] ─▶ [ping ✓] ─▶ [deliver ✓] ─▶ [accept ✓] ─▶ [submit ✗ 90s] ┄retry 1┄▶ [submit …]
                                                                      └▶ [tool code_search ✓] ─▶ [code_read ✓] ─▶ …
           node = colour by state (passed / running (pulses) / failed / waiting / implied (hatched, 'not measured'))
           edge = a line with its cause on hover; a retry, a fallback route or a restart-resume is a DIFFERENT edge style, so the path actually taken is readable
      ── zoom 3: NODE ─ side panel: input (the prompt or the arguments), output (the response), log lines in the window of that node, evidence, timing, the FIX line, and CONTROLS for that node
      ── zoom 4: EDGE ─ why it moved, how long it waited at the previous node, who decided, what changed between (the retry count, the provider, the route)
  controls_on_a_node:
    - "retry from here (CE9: retry from step n), skip (marked skipped, never silent), stop the run, resume"
    - "send to another provider (the RAID route shown first: what it chose, what it fell back to, the cost)"
    - "on a submit or reply gate failure: open the element picker for that provider (the hook the FIX line already names), then retry from that gate"
    - "copy the node's input / output / log"
    - "every control is a command row (nexus.command), so an agent can read the same graph and a person-only row stays person-only"
  phase:
    TB7a_edges_recorded:
      status: OPEN
      depends_on: [TB2_persistence_audit]
      does: "Backend first. An edge record { runId, attempt, from, to, at, waitedMs, kind (passed | failed | retry | fallback | resume | skip), by (gate | raid | copilot | rule | person), reason } written when a move happens, through the writers that exist (the job's gate trail, the .run node's events): extend the entry with the fields, no second store. Implied gates keep at = null and 'implied: true'; the UI says 'not measured', it never invents a duration."
      proof: "a run with a retry and a fallback produces the edges in order; a restart in the middle resumes with an edge of kind 'resume'; an implied gate has no duration."
    TB7b_keep_every_step:
      status: OPEN
      depends_on: [TB2_persistence_audit]
      does: "Lift the 60-step cap's data loss: keep the last 60 in the live node (cheap to read) and append every step to the run's own jsonl (archive, never delete), so zoom 2 can show step 1 of 400. The count stays truthful."
      proof: "a run of 100 steps reads back step 1 and step 100 after a restart."
    TB7c_graph_and_zoom:
      status: OPEN
      depends_on: [TB5_tab_shell, TB7a_edges_recorded]
      does: "The four zoom levels over the records, drawn with the mesh's route-graph (clear-glass/src/mesh/route-graph.js: reuse, one component mounted in the Code tab and the Clear Glass mesh panel). Live: nodes and edges appear and the running node pulses, from guardian.job.gate, idearium.repo.task and idearium.repo.agent.tool, never polled. History: the same view over the stored records."
      proof: "driven in the real Clear Glass page (glass.js), not Playwright: open a run, zoom to a failed gate, see its response, log and FIX line; open an edge and read why."
    TB7d_node_controls:
      status: OPEN
      depends_on: [TB7c_graph_and_zoom]
      does: "The controls above, each a command row first, then a button."
      proof: "retry from the failed submit gate re-runs from there, not from the goal; the element-picker control opens for the right provider."
  failure_modes:
    - "An invented duration: an implied gate shown with a time. Hatched, labelled 'not measured', and a test checks the label."
    - "The graph becomes the new overwhelm (400 steps drawn at once): zoom 2 shows gates and a collapsed group per run of tool calls ('code_search x12'), expanding on click; 'failed only' and 'this file' filters."
    - "Edge records for tool steps guess at 'who decided': the model chose the next tool call, so by = 'agent' for those, not a gate; only gates, RAID and rules are named as deciders."
    - "A control that acts on the wrong run (two runs live): every control carries runId + attempt + node id, and the command refuses a stale one."
  question: "Is this the right shape: a graph with four zoom levels (run, attempt, node, edge), and do you want the tool-call steps drawn as a collapsed group per run (my recommendation) or one node each?"

# ADDENDUM 2026-10-16 (b): everything saves to Nexus, and agents ask Nexus first (recall before a tool call)
addendum_b:
  james: >-
    "need everything to save to nexus. and for the agents to query that first, so they dont waster tokens on the same tool calls over and over"
  context: "Said right after the Runs-tab graph map. It makes TB2-TB4 the first thing to build, ahead of the screens: it saves money on every run, and the Runs tab needs the records anyway. It closes a gap he named himself on 2026-09-08 (tool-call-listener.js header): \"persistent storage using cortex memory architectures, vector in the lib. reusing outputs.\""
  grounded:
    one_dispatch_point: "lib/agent-tools/index.js executeTool() (about line 81): every tool call in Nexus (~71 tools) passes through it, so a recall layer goes here once, not per tool."
    what_it_records_now: "executeTool inserts tool_input and tool_output rows into event_log with the tool name, agent, intent, outcome and time: NOT the arguments and NOT the result. So the same code_search can be asked and paid for again and nothing remembers the answer."
    what_already_exists: "lib/agent-tools/tool-call-listener.js: table guardian_tool_calls in JAA (so cortex's embedding/vector search applies), recordCall / recordResult, and findRecentResult(jaa, tool, args) with a 10-minute freshness window. Its own header says what it does NOT do: 'automatic interception/skipping of a tool call when a cached result exists ... it observes and makes reuse POSSIBLE; it doesn't yet enforce it.' It is also fed only by guardian.tool.called (browser agents reading tool calls out of the DOM), not by executeTool, so repo agents' calls (the code_* tools in the screenshot) are not in it."
    run_state_has: "lib/run-state.js keeps the goal, the files read/changed and the last 60 steps; the task header's {done} placeholder already tells a resumed run what it did. That is per run; nothing answers 'did ANY run already ask this?'."
  design:
    recall_first_in_the_dispatcher: >-
      Before tool.execute(), for a tool on the RECALLABLE allowlist, executeTool looks up (repo, tool, normalized arguments, state key). A valid exact hit returns the stored result at once, marked recalled { from run, at, ~tokens saved }, and the tool does not run. A miss runs the tool and records args + result through the one writer. An allowlist, not a blocklist: a tool is recallable only when someone has said it is read-only and its answer depends on a state Nexus can check.
    state_key_not_a_clock: >-
      The 10-minute window is a guess. Validity is the state the answer depends on: code_read on a file = that file's content hash; code_chunk/code_refs = the file(s) it covers; code_search/code_grep/code_map = the repo's index version plus its changed-file set; loom/atlas lookups = the registry version. Changed state = a different key = a miss, so a stale answer is never returned as fresh. A tool with no checkable state keeps the time window as an upper bound and says so.
    agents_ask_nexus_first: >-
      (1) The dispatcher does it silently for exact repeats (above). (2) A read-only tool `nexus_recall` is the one door for 'what does Nexus already hold': tool results from this and other runs of the repo, files read and changed, responses (.response nodes), gate outcomes, contracts, notes, the chat ledger for the repo, the recent event ledger. It answers compactly with where each came from and its age. (3) The task header (the editable 'task-header' block) gains one line telling the agent to call nexus_recall before searching or reading. (4) A near match (semantic, not exact) is offered as a hint, never substituted: 'a similar search at 04:21 returned these 3 files'.
    save_everything: >-
      Each kind is written once, through the writer that already owns it, and found again by nexus_recall and the Runs tab: tool calls + results (guardian_tool_calls, extended and also fed by executeTool; a result over a size cap is stored as a node file and referenced, never truncated silently), gate trail and edges (the job, TB7a), every run step (the run's jsonl, TB7b), responses (.response), contracts, logs. Append-only; archive, never delete.
  phase:
    TB3a_tool_calls_saved:
      status: OPEN
      depends_on: [TB2_persistence_audit]
      does: "executeTool records { repoUuid, runId, agent, tool, args, argsHash, stateKey, result (or a node reference), ok, ms, tokensEst, ts } into guardian_tool_calls through tool-call-listener's writer. One table for browser agents and repo agents."
      proof: "a repo agent's code_search is read back after a restart with its arguments and result; a browser agent's call lands in the same table."
    TB4a_recall_in_the_dispatcher:
      status: OPEN
      depends_on: [TB3a_tool_calls_saved]
      does: "The allowlist (first: code_read, code_chunk, code_refs, code_map, code_search, code_grep) with each tool's state key. Exact valid hit returns recalled; counts recall.hit / recall.miss / recall.stale as events. Never recalls an error result. Off switch per tool and globally (a setting, default on for the allowlist)."
      proof: "the same code_read twice returns the second from Nexus without running the tool; editing the file between them makes the second a miss; a tool not on the allowlist always runs; a failed call is never recalled."
    TB4b_nexus_recall_tool:
      status: OPEN
      depends_on: [TB3a_tool_calls_saved]
      does: "The nexus_recall tool and its command row (agents and people get the same door), the task-header line, and the near-match hint."
      proof: "an agent asking recall for a file it read in an earlier run gets that run's result with its age; an unrelated repo's results never appear (the key includes the repo)."
    TB4c_measure:
      status: OPEN
      depends_on: [TB4a_recall_in_the_dispatcher]
      does: "Tokens saved and calls avoided per run, per repo, overall; shown as 'recalled' nodes (their own edge kind) in the Runs tab, and as a number in the run header. 'As little as possible' becomes a count (docs/CLAUDE.md, agents)."
  failure_modes:
    - "A stale answer returned as fresh: the state key, and a test that edits a file between two identical calls."
    - "A recalled result hides that the code changed in a way the key does not cover (a dependency file): the key for chunk/refs tools covers the files they read; where it cannot, the tool is not on the allowlist."
    - "Recalling something an agent must re-do on purpose (it wants a fresh look): the call carries fresh:true, honoured and counted."
    - "Cross-repo leakage: the repo is part of the key and of every nexus_recall query."
    - "Secrets or private text stored in results: results are what the tool returned, with the same trust as a fresh call; secret-like keys masked as elsewhere, and nothing from personal-chat capture is written here (that has its own ledger and settings)."
    - "A bigger table: size cap, node references for large results, and a retention decision (TB0): the recommendation is to keep, because they are the proof and the reuse source."
  build_order_change: "TB2 -> TB3a -> TB4a -> TB4b -> TB4c first (backend, token savings from day one, no screen needed; the CLI shows hit/miss counts), then TB7a/TB7b (edges, every step), then the tab shell and the Runs tab. This reverses the earlier order (screens before reuse) because he named cost."
  question: "Start with TB2 (the audit of what is saved where, as a table) and TB3a/TB4a (record every tool call with its arguments and result, then recall exact repeats first for the read-only code tools)? That touches the one dispatcher every tool uses, so it ships behind a setting and with the tests above."

# ADDENDUM 2026-10-17 (c): the dock — separate panels on the right edge, each its own tab, open all of them or none
addendum_c:
  james: >-
    "i want the code tab better. like you have on the right. outputs for proposals and artifacts. changes  for the
    worksurface and workspace. background tasks for anything else running in the repo. i want the panels completely
    seperate from each other, collapasable, organized and updated in real time. maybe buttons for agent tools, for the repo,
    to execute. replayable proceedures? i love the context panel they need to be sperated panels though, bot just a space,
    but tabs on the collapsable panels. like how you click the tab on the right of the screen. i want to eb able to open all
    of them, or none of them."
  context: >-
    Said looking at the Code tab after 0.60.107 (the Plan panel as Progress · Plan · Context cards, opened by the PLAN tab on
    the right edge of the screen). "like you have on the right" read as that edge tab. His decisions, recorded as his: each
    panel is its own panel with its own edge tab; any number open at once, all or none; collapsible; real time; panels:
    outputs (proposals + artifacts), changes (work surface + workspace), background tasks, context, agent tools with
    replayable procedures.
  reading: >-
    The coder's reading, to confirm: (1) the dock holds the panels as a column on the right; each open panel is a section with
    a header (collapse, close) and the column scrolls; the edge rail keeps a tab per panel, lit when open. (2) The Plan panel
    keeps its own floating window and tab; Context, which was a card inside it, is also its own dock panel (the card stays,
    §0.3). (3) "artifacts" = the code blocks Guardian's artifact store saved from replies (GET guardian /artifacts), shown
    beside the repo's proposals. (4) "workspace" = the repo's file states against its last version (uncommitted), next to the
    work surface (the agent's proposals and staged changes) and the change records (FR1). (5) Which panels are open is a
    per-browser view preference (localStorage), the one thing the rule allows there; procedures are files.
  grounded:
    - "the edge tab: idearium/ui/js/plan-panel.js planTabSync (#plan-tab, fixed right, vertical label, live dot)"
    - "proposals: GET /api/repos/:uuid/worksurface (work-surface.js _wsCard: diff, Apply / Reject)"
    - "file states: GET /api/repos/:uuid/files/state (file-manage.js); change records: GET /api/repos/:uuid/changes (FR1)"
    - "tasks: GET /api/repos/:uuid/tasks + SSE idearium.repo.task (repo-tasks.js rtIn, _rtTree, _rtRow)"
    - "context: plan-panel.js _ppContext(steps) over GET /api/repos/:uuid/plan"
    - "tools: GET /api/repos/:uuid/agent/tools (lib/repo-agent.js listTools via copilot /api/tools/list); a tool runs through
      copilot POST /api/tools/run (repo-agent _runTool, scope enforced) — no route lets a person run one from the page yet"
    - "a run's tool calls: lib/run-state.js steps { name, arg } — arg is JSON cut at 110 chars, so a step whose arg does not
      parse cannot be replayed exactly; said, never guessed"
  phase:
    DK1_procedures_backend:
      status: 'BUILT 0.60.118 (tests/modules/test-repo-procedures.test.js 7/7; test-code-dock DK-01)'
      systems: [core, idearium]
      files: [lib/repo-procedures.js (new), lib/repo-agent.js, idearium/api/index.js, idearium/cli/route-commands.js, tests/modules/test-repo-procedures.test.js (new)]
      does: >-
        A procedure is a file: <idearium data>/procedures/<repo>/<id>.procedure (node-export envelope): name, steps [{ tool,
        args }], made from (a run, or by hand), runs [{ at, ok, results }]. save, list, get, remove (archived, never deleted),
        fromRun (the run's steps whose arguments are whole; the cut ones named), replay (each step through the one tool door,
        in order; stops at the first failure and says which). Routes: GET/POST /api/repos/:uuid/procedures, POST
        .../procedures/:id/replay, POST .../procedures/from-run, POST .../agent/tools/run (one tool, as a person). Command rows:
        repo tool run, repo procedures, repo procedure save|replay|from-run.
      proof: "a procedure saved from a run replays its steps in order through an injected tool runner; a failing step stops it and is named; the file survives a reload of the module"
    DK2_the_dock:
      status: 'BUILT 0.60.118 (tests/modules/test-code-dock.test.js DK-10..17, driven in Clear Glass)'
      depends_on: [DK1_procedures_backend]
      systems: [idearium]
      files: [idearium/ui/js/code-dock.js (new), idearium/ui/index.html, idearium/ui/js/code-surface.js, idearium/ui/js/repo-tasks.js, tests/modules/test-code-dock.test.js (new)]
      does: >-
        The edge rail (under the PLAN tab): one tab per panel (outputs, changes, tasks, context, tools), each with a count or a
        live dot. A click opens or closes that panel only; 'all' and 'none' at the rail's foot. Open panels stack in the dock
        column, each with a header (collapse ▾ / ▸, close ×). Real time: tasks from idearium.repo.task, outputs and changes
        from the inject / file / phase events the Code tab already hears; only open panels repaint. Tools: the repo's tools as
        buttons grouped by kind, each opening its arguments as JSON and running it; procedures listed with replay, and "save
        the last run as a procedure".
      proof: "driven in Clear Glass: open all, close all, open two, collapse one; a task event updates the tasks panel without a fetch; a tool button runs through the route; a procedure replays"
  question: "Is the dock a column on the right with the panels stacked (my reading), or should each panel float on its own like the Plan window?"

# ADDENDUM 2026-10-17 (d): DK3, the Control panel — built 0.60.121
# James: "like yours but with a control panel." (looking at Claude Code's right-hand panels) · then: "ide, then use clearglass
# with the search engine tool for the ui editor ui?" — his order, recorded as his: the IDE (this Code tab) first, then the UI
# editor, its UI found through Clear Glass's search-engine tool (lib/agent-tools/tools/clear-glass/search-engine.js) rather than
# designed from nothing. The coder's note: existing open-source visual editors are the candidates to find and compare first
# (licence checked before anything is reused).
# DK3 built: the dock's Control panel — play / pause / rewind (POST /api/repos/:uuid/run/:op, lib/repo-run-state.js), what is
# running, and who answers (POST /api/repos/:uuid/agent/settings). Proof: tests/modules/test-code-dock.test.js DK-18.

