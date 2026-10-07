spec:
  meta:
    name:     compartment-control-and-activity
    version:  1.0.0
    date:     2026-10-07
    release:  0.39.367 (base) → each phase its own patch
    uuid:     nexus-compartment-control-activity-phasemap-v1-0000-2026-1007-jamesbrooks-001
    owner:    "idearium + cos — continues docs/2026-10-01-idearium-agent-ready-master-phasemap.spec (HC1, AG1, UI2),
               docs/2026-10-05-cos-machines-phasemap.spec (VM1) and docs/nexus-repo-compartment-and-rich-dispatch-phasemap.spec (NC1, NC2)."
    status:   "MAPPED 2026-10-07 — built one phase at a time, in the order below. CC1 built (0.39.367), AL1 built (0.39.368), AL2 built (0.39.369)."
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
      status: OPEN
      depends_on: [AL1_activity_log]
      files: [lib/cos-bridge.js, cos/testenv/setup-job.js, lib/cos-run.js]
      does: "The repo's desktop (COS) is a source: setup steps, boot, each run in it, snapshots — record() with the repo's compartment."
      proof: "a stub COS run and a setup step appear in the repo's log"

    VM1_checkpoints_on_the_log:
      systems: [cos]
      status: OPEN — the COS machines map's VM1, with one addition
      depends_on: [DT1_desktop_into_the_log]
      does: "VM1 as mapped (pause, live snapshots, checkpoints before every agent action); each checkpoint's id is written on the activity row it precedes, so the log is the rewind: 'back to before this row'."

    NC2_nexus_systems_as_compartments:
      systems: [idearium, cos]
      status: OPEN
      depends_on: [AL1_activity_log]
      does: "Each Nexus system repo linked to its COS compartment (one stored intent, not two copies), nested under Nexus; its panel shows the system's live health and controls routed through the supervisor (autopilot), never the system itself."

    BO1_brainos_reads_the_log:
      systems: [brainos]
      status: OPEN
      depends_on: [AL1_activity_log]
      does: "BrainOS's system-wide view reads activity_log for every compartment — one stream, two views."

  ordering: "CC1 → AL1 → AL2 → DT1 → VM1 → NC2 → BO1. Each is usable on its own; each later one makes the earlier ones worth more."
