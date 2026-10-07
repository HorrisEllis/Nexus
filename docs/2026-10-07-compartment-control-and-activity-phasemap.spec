spec:
  meta:
    name:     compartment-control-and-activity
    version:  1.0.0
    date:     2026-10-07
    release:  0.39.367 (base) → each phase its own patch
    uuid:     nexus-compartment-control-activity-phasemap-v1-0000-2026-1007-jamesbrooks-001
    owner:    "idearium + cos — continues docs/2026-10-01-idearium-agent-ready-master-phasemap.spec (HC1, AG1, UI2),
               docs/2026-10-05-cos-machines-phasemap.spec (VM1) and docs/nexus-repo-compartment-and-rich-dispatch-phasemap.spec (NC1, NC2)."
    status:   "BUILT 2026-10-07 — every phase, one at a time: CC1 (0.39.367), AL1 (0.39.368), AL2 (0.39.369), DT1 (0.39.370), VM1 + CK1 (0.39.371), NC2 (0.39.372), BO1 (0.39.373); CM1 (0.39.374) — every capability a command; CM2 (0.39.376) — every command for copilot and every agent. MAPPED, not built: UN1, SP1, DC1, DX1 (copilot drives the UI)."
    origin: >
      James, 2026-10-07: "the background tasks, i want that for each repo" · "I also want to have a full extensive activity
      log in each repo." · "Do you think we should have each repo a control panel for the system, and compartment for the
      nexus repos?" · "hooks into the desktop envirement. also look at the idearium and cos phases." · "okay begin building
      this, phase it, build it, one by one, focus on coding using overlapping primitives … i want to be able to begin using
      you inside of the nexus repo. make it enterprise, consistent both in style and architecture, most amount of leverage,
      least amount of tokens without losing capability or power."

  # The primitives. Every phase below is one of these used again, never a second way of doing the same thing.
  primitives:
    land:      "lib/repo-inject.js land() — ONE file an agent produced → its gate (code.write), the collapse guard, then
                proposed / staged / applied by the repo's mode; a Nexus repo always through the approval gate. Every
                agent's files pass it: fenced reply blocks, Claude Code's diff, later a desktop run's changed files."
    activity:  "lib/activity-log/compartment.js record() — ONE durable row per thing that happened in a compartment: { compartment,
                kind, actor, hat, status, title, ref, ts }. The Tasks panel, the Log tab and BrainOS read it."
    dispatch:  "lib/repo-agent.js dispatch() — the one door to the agent wearing a hat (0.39.366 records each call)."
    intent:    "cos/foundation/intent.js — a compartment's end state / conditions / axioms (0.39.363)."

  decided:
    NC1: >-
      Answered (docs/nexus-repo-compartment-and-rich-dispatch-phasemap.spec NC1): Idearium never edits the files the
      running Nexus is made of except through the approval gate that already exists (lib/nexus-self/inject-gate.js) —
      every agent's change to a Nexus repo is a proposal, applied to the live tree only when James approves it. A
      Nexus system's desktop (COS) runs a COPY of Nexus, where an agent may build and run freely (DT phases below).
    claude_code_inside_nexus: >-
      Claude Code is already a provider (lib/claude-code-backend.js, IN2a). Its files were written straight through the
      repo layer — past review mode and the Nexus approval gate. CC1 puts them through land(). Then picking claude-code
      on nexus/core is "using Claude inside the Nexus repo", safely.

  phases:
    CC1_claude_code_lands_like_every_agent:
      systems: [idearium]
      status: "DONE (0.39.367) — land() + fromChanges() in lib/repo-inject.js; Claude Code's diff lands through them; settings names claude-code. CC-04, IG-009."
      files: [lib/repo-inject.js, lib/repo-agent.js, lib/claude-code-backend.js, idearium/ui/settings.html]
      does: >-
        land() extracted from fromReply()'s per-file loop; fromChanges() lands a list of { path, content, op }. Claude
        Code's diff goes through fromChanges(): a Nexus repo → proposals on the work surface, the live tree touched only
        on approval; review → proposals; auto → written; off → kept. The settings card names claude-code as a choice.
      proof: "a claude-code run on a Nexus repo leaves proposals and writes nothing; on an auto repo it writes; a collapsed file is refused — one test, the stand-in claude binary"

    AL1_activity_log:
      systems: [idearium]
      status: "DONE (0.39.368) — lib/activity-log/compartment.js; sources: repo-activity (tasks, phase rows), repo-inject _write (every proposal event, the actor named), fault-log (repo faults); GET /api/repos/:uuid/activity, SSE idearium.repo.activity. test-compartment-activity-log 6/6."
      depends_on: [CC1_claude_code_lands_like_every_agent]
      files: [lib/activity-log/compartment.js, lib/repo-activity.js, idearium/api/index.js, docs/nexstore-writers.yaml]
      does: >-
        One durable table (activity_log), written by record(). Sources, each one line at a point that already exists:
        a task's start and end (repo-activity), every phase-run row, every inject's propose / apply / reject / revert
        (actor: the agent or James), every fault. The Tasks panel's history reads it (not only repo_agent_log), so a
        restart keeps everything. GET /api/repos/:uuid/activity?kind=&actor=&status=&before=&limit=.
      proof: "the rows of a phase build, its proposals and James's revert are in the log in order, survive a reload, and filter by kind and actor"

    AL2_log_tab:
      systems: [idearium]
      status: "DONE (0.39.369) — the drawer's Activity log view (idearium/ui/js/repo-tasks.js rtLog*): facets, failed, actor, search, older…, detail, live rows. tests/probe/repo-tasks-drawer-glass.js 11/11 (Clear Glass)."
      depends_on: [AL1_activity_log]
      files: [idearium/ui/js/repo-tasks.js, idearium/ui/css/repo-tasks.css]
      does: "The Tasks drawer gains a Log view of the same rows: filters, paging back, a row opens to its detail (the task, the inject's diff, the fault). One drawer, two views — not a second panel."
      proof: "chromium: the Log view lists the scenario's rows, filters, and opens a row"

    DT1_desktop_into_the_log:
      systems: [cos, idearium]
      status: "DONE (0.39.370) — lib/cos-run.js run() is a 'run' task; the repo setup route makes setup-job a 'setup' task (onEvent). test-desktop-activity 5/5."
      depends_on: [AL1_activity_log]
      files: [lib/cos-bridge.js, cos/testenv/setup-job.js, lib/cos-run.js]
      does: "The repo's desktop (COS) is a source: setup steps, boot, each run in it, snapshots — record() with the repo's compartment."
      proof: "a stub COS run and a setup step appear in the repo's log"

    VM1_checkpoints_on_the_log:
      systems: [cos]
      status: "DONE (0.39.371) — cos/workspace/vm-control.js (pause, resume, live checkpoints, rewind over QMP); repo-activity start() checkpoints the running desktop before each task; the drawer rewinds. test-vm-control 7/7."
      depends_on: [DT1_desktop_into_the_log]
      does: "VM1 as mapped (pause, live snapshots, checkpoints before every agent action); each checkpoint's id is written on the activity row it precedes, so the log is the rewind: 'back to before this row'."

    NC2_nexus_systems_as_compartments:
      systems: [idearium, cos]
      status: "DONE (0.39.372) — the compartments already existed (nexus-self); built: autopilot controlKernel + POST /control/:name/:op; GET/POST /api/repos/:uuid/system; the charter set as its compartment's intent and read with what it inherits (_charterOf); the drawer's Control view. test-system-control 7/7, probe 16/16."
      depends_on: [AL1_activity_log]
      does: "Each Nexus system repo linked to its COS compartment (one stored intent, not two copies), nested under Nexus; its panel shows the system's live health and controls routed through the supervisor (autopilot), never the system itself."

    BO1_brainos_reads_the_log:
      systems: [brainos]
      status: "DONE (0.39.373) — GET /api/activity (every compartment, named); BrainOS ACTIVITY tab, live over idearium SSE. AL-07."
      depends_on: [AL1_activity_log]
      does: "BrainOS's system-wide view reads activity_log for every compartment — one stream, two views."

    CM1_every_capability_a_command:
      systems: [idearium]
      status: "DONE (0.39.374) — idearium/cli/route-commands.js: one table, one runner; idearium/cli/store-chatter.js keeps stdout the answer. test-cli-route-commands 8/8."
      james: '"That was fantastic. Everything needs to be available as commands."'
      files: [idearium/cli/route-commands.js, idearium/cli/store-chatter.js, idearium/cli/index.js, cli/nexus.js]
      does: "Every capability above, and the repo agent, its proposals and its charter, as an idearium command (and through nexus /idearium): one row each in a table run by one runner, --json for scripts and agents."
      proof: "the real CLI, as its own process, against the real API: help lists every row; agent, ask, changes, apply, activity, tasks, charter set/check; refusals exit 1 with the reason"

    CM2_every_command_for_every_agent:
      systems: [idearium, copilot, orchestrator]
      status: "DONE (0.39.376) — nexus.command.tool (lib/agent-tools/tools/nexus/command.js) over CM1's table; the MCP server's nexus_command (Claude Code, its repo passed as NEXUS_MCP_REPO); the repo agent's prompt names it. test-nexus-command-tool 7/7."
      james: '"Yes. And copilot. Copilot is the entrance of nexus. Like I want it to be able to do anything, nexus can."'
      files: [lib/agent-tools/tools/nexus/command.js, idearium/cli/route-commands.js, orchestrator/lib/mcp-server.js, lib/claude-code-backend.js, lib/repo-agent.js]
      does: >-
        ONE tool over CM1's ONE table: a new command row is a new agent capability with nothing else written. A row's
        personOnly (approving a proposal; stopping, starting or restarting a Nexus system) is refused with how the
        person does it, read from the words alone, so it is refused before anything is looked up. Every act is
        attributed to the caller in the activity log. Answers are trimmed for a small model, and say how to narrow them.

    CM3_this_sessions_work_as_commands:
      systems: [idearium, cortex, ollama, copilot]
      status: "DONE (0.45.0) — test-cm3-commands 4/4, test-chunked-phase-build CB-09"
      james: '"where is any of this? like i dont see any changes. like what have you been adding? also next make sure these are all commands first, api routes if applicaple. also where is the background tasks? it hasnt built any phase yet."'
      files: [idearium/cli/route-commands.js, idearium/api/index.js, cortex/boot.js, cortex/memory/table-compactor.js, ollama/routes/tape.js, lib/ollama-tape.js]
      does: >-
        Rows in CM1's table (so CLI + copilot + Claude Code's MCP at once): `repo phasemap <repo>` (every phase: done,
        ready, blocked, last run), `repo phase <repo> <phase> [build]` (its runs and why one stopped; or build it now
        as a background task — POST phases/build now finds the map from the phase), `repo versions <repo>` (VR1's
        commits), `store` (cortex GET /api/store: each table's base, segments, cap, archive), `ollama tape [<run>]`
        (ollama GET /api/tape, /api/tape/:run: the runs and a run's macro). `repo phases`/`repo build` stay the spec
        chunk commands they were.

  # ── NEXT — mapped 2026-10-07, NOT built ──────────────────────────────────────────────────────────────────────────
  # James: "Like look at nexus nerve and tv ui and the interaction field. Like I want it to be able to navigate the ui,
  # check when something didn't work when I click it and run diagnostics. But worry about that after." · "Oh and
  # spotlight, but you're almost out of tokens so don't forget to map."
  # Substrate that already exists (reuse, do not rebuild):
  #   clear-glass/src/page/field.js          — the interaction field: numbered targets, x/y/z, at(), spotlight(), describe()
  #   clear-glass/src/copilot/tools.js       — field / pointer / at / spotlight / fieldOff / readPage (Clear Glass's copilot)
  #   lib/agent-tools/tools/clear-glass/browser.js — clearglass.browser.tool: copilot → :7702 /cli/driver, one hop, sequence
  #   ui/tv-shell/spotlight/spotlight.js     — the TV shell's spotlight: an element registry by NAME, steps, tension,
  #                                            execute(ui{}), navigate(channel), _observeConfusion → /api/guardian/copilot/observe
  #   ui/tv-shell/nerve/nerve.js + lib/nerve — attention: what is knowable now (read-only — never decides)
  #   clear-glass/src/diagnostic/engine.js   — assertion runner; diagnostic/error-capture.js — every error, live over SSE
  #   lib/activity-log/compartment.js        — AL1 record(): where a dead click and its diagnosis are written
  # Gap: these are four ways of seeing/pointing that do not know about each other. Copilot can drive a WEB page in
  # Clear Glass, but not Nexus's own surfaces by name; nothing notices that a click did nothing.

    UN1_nexus_surfaces_in_the_field:
      systems: [clear-glass, copilot, ui]
      status: MAPPED
      depends_on: [CM2_every_command_for_every_agent]
      files: [clear-glass/src/page/field.js, lib/agent-tools/tools/clear-glass/browser.js, ui/tv-shell/spotlight/spotlight.js]
      does: >-
        Nexus's own pages (the TV shell and its channels, Idearium, BrainOS, nerve) are surfaces copilot opens and
        reads through the field it already has. field() also names a target by spotlight.js's element registry (a
        data-nx-name, which the shell already speaks in), so copilot says "the Apply button on the work surface", not a
        selector. clearglass.browser.tool gains `surface` (open a Nexus page by name) and nothing else; acting is still
        pointer. No second browser, no second registry.
      proof: "Clear Glass: copilot opens the work surface by name, its field lists the named targets, and a pointer click on one lands"

    SP1_one_spotlight:
      systems: [ui, clear-glass, copilot]
      status: MAPPED
      depends_on: [UN1_nexus_surfaces_in_the_field]
      files: [ui/tv-shell/spotlight/spotlight.js, clear-glass/src/page/field.js]
      does: >-
        One spotlight verb for copilot, whatever surface James is on: the TV shell's (by name, steps, POST
        /api/ui/spotlight/*) and the field's (by number / x,y). The field's spotlight() is the page-side ring; the shell's
        is the same call with its name resolved by its registry. Spotlight is how every later phase shows James where the
        agent is about to act, and where a click failed.
      proof: "the same spotlight call rings a named target on the TV shell and a numbered target on an Idearium page"

    DC1_a_click_that_did_nothing:
      systems: [clear-glass, ui, idearium]
      status: MAPPED
      depends_on: [UN1_nexus_surfaces_in_the_field]
      files: [clear-glass/src/page/field.js, clear-glass/src/diagnostic/error-capture.js, lib/activity-log/compartment.js]
      does: >-
        Every click (copilot's pointer and James's own on a Nexus surface) is followed by one short look: did the
        URL, the DOM under it, the field, or the network change, and did error-capture see an error or a failed request?
        Nothing changed, or an error → a 'ui.deadclick' activity row (AL1 record: the target's name, the surface, what
        was expected, the error), shown in the Log and in BrainOS. spotlight.js's _observeConfusion already watches for
        repeated clicks: it reports into the same row, not a second log.
      proof: "a button wired to a dead route: clicking it (copilot, then a synthetic person click) writes one ui.deadclick row with the failed request; a working button writes none"

    DX1_diagnose_it:
      systems: [clear-glass, copilot, idearium, nerve]
      status: MAPPED
      depends_on: [DC1_a_click_that_did_nothing, SP1_one_spotlight]
      does: >-
        A dead click (or copilot asked "why didn't that work?") runs a diagnosis made only of things that exist: the
        failed request's route checked against the system that serves it (nexus.command: repo system status, perf),
        error-capture's rows around the click, the nerve snapshot for the system it belongs to, and the diagnostic
        engine re-running the click as an assertion. The answer is one diagnosis row on the dead-click row (cause, the
        system, the file if known), spotlighted on the target, and offered to the repo agent as a task.
      proof: "the dead route's dead click is diagnosed as 'route not served by <system>', the row says so, the target is ringed"

  ordering_next: "UN1 → SP1 → DC1 → DX1. UN1 is copilot navigating; SP1 is it showing James; DC1 noticing; DX1 explaining."

  ordering: "CC1 → AL1 → AL2 → DT1 → VM1 → NC2 → BO1. Each is usable on its own; each later one makes the earlier ones worth more."
