# docs/2026-11-01-procedures-phasemap.spec — procedures: runnable step files for him and copilot; updates and diffs recorded whole in Versionium.
# The ask is James's; the reading, the cut and the order are the coder's, decided by his axioms (cited per decision).

origin: >-
  James, 2026-11-01, looking at Idearium's Updates page after updating by hand (git branch --set-upstream-to, git pull, type VERSION, start:all):
  "can you make that a macro or framework and then into a command like a batch but a .framework or .macro that me and copilot can use. i feel we
  need more proceedures. maybe also have the update and diff plug into versionium. including the changelog and versoins."

readings_to_confirm:
  - "\"that\": the update he had just done by hand (stop, link the branch, pull, check the version, start), as one runnable procedure. To confirm."
  - "\".framework or .macro\": a file you run like a .bat. .macro is taken (Clear Glass's browser macros, a tab's clicks), so the coder recommends
     .procedure: same node envelope as .pipeline/.task, steps that are Nexus commands, gates where his yes is needed, checks between. His name to choose."
  - "\"more proceedures\": a library of them (update, rollback, restart a system, start COS, back up data, release), each a command for him and copilot."

found_while_mapping:
  - "His update by hand is in no record: Idearium's Updates page shows only the 18:13 attach (0.60.346), not 0.60.346 → 0.60.353, and nothing went to
     Versionium. A git pull outside the tool is invisible. (PD2.)"
  - "VE3 (0.60.278) records each update in Versionium with its files (git diff --name-status), not the releases' changelogs or the version lines. (PD3.)"
  - "The Updates page offers 'Update to 0.60.353' while it says up to date. (PD2.)"
  - "Versionium stalled on his 0.60.346 boot (releases/sync timed out at 120 s; 16+ missed pulses). Records wait in the buffer meanwhile (postDurable),
     so nothing is lost, but PD3's records are only seen once it answers. Its own phase, not this map's."

decisions:
  PD_D0_a_procedure_is_a_node_file:
    status: "DECIDED 2026-11-01 — James chose .procedure; built on his own 0.60.118 .procedure (see PD_D0_addendum, which supersedes the engine reading below)"
    chosen: >-
      A procedure is a node file (<id>.procedure) in the same YAML envelope as .task and .pipeline (lib/automation-nodes.js), run by the existing
      engine (lib/automation/engine.js): its steps are the engine's own kinds (command — a row of the one command table; gate — wait for his yes;
      condition; notify; log), so no second runner. A step that changes Nexus's code or stops a system carries confirm: a gate he answers, and
      copilot gets the same gate, never a way round it (USER_AUTONOMY). Each run is recorded in Versionium (§17.12) and the run log.
    by_the_axioms: "§8.6 reuse before build (engine, node envelope, command table); §5.2/§9.1 every step through the one door; §0.3 archive, never
      delete; §17.12; USER_AUTONOMY for the gates"

  PD_D0_addendum_one_procedure_type:
    status: "DECIDED 2026-11-01 (0.60.354), by his axioms; the name his"
    his_words: >-
      Asked "the file name: .macro is taken … I recommend .procedure, or .framework if you prefer that word. Which one, and shall I start building?",
      James, 2026-11-01: ".procedure"
    found_when_building: >-
      .procedure is already his: lib/repo-procedures.js, 0.60.118 DK1 (James, 2026-10-17: "maybe buttons for agent tools, for the repo, to execute.
      replayable proceedures?") — a repo's tool calls kept as <idearium data>/procedures/<repo>/<id>.procedure, replayed through copilot's one tool door,
      with lib/node-schemas/schema.procedure, the Code tab's dock and the repo procedures / repo procedure rows. Neither the map nor the coder's first draft
      found it (a §8.6 miss, caught by the schema file being there). Also: the engine's 'command' step is an HTTP call to one system, not a row of the
      command table, and its 'gate' waits on a page element, not on his yes — so PD_D0's "the engine's own kinds" did not hold.
    chosen: >-
      One .procedure type, his (§8.6 reuse before build; §10.3 two truths for one type are a failure). lib/repo-procedures.js gains two step kinds beside
      { tool, args } — { confirm } (his yes; without it the run waits there, copilot too) and { check: { of, contains|equals|matches|notEmpty } }
      (pipeline.js gateOpen) — plus a library of procedures shipped with the code. A library step is { tool: nexus.command, args: { command, args?, flags? } }:
      the one door. After his yes it runs as the person (command.js runAsPerson); without it, with an agent's limits, so a person's row is refused.
      The coder's first draft (lib/automation/procedure.js, never committed) duplicated this and was dropped; nothing of his was lost (§0.3: a true
      duplicate, reported here).
    placement: >-
      The library is idearium/procedures/ (not a root procedures/ folder no system owns): Idearium serves it at /api/procedures (§5.9, §5.15), and
      hands the folder to lib/repo-procedures.js, so lib reads no system's folder itself.
    by_the_axioms: "§8.6, §10.3, §5.15, §5.2/§9.1 (one door), USER_AUTONOMY (the confirm step; --yes refused to an agent), §0.3, §17.12 (each library run recorded)"

phases:
  PD1_procedure_nodes_and_commands:
    status: "DONE (0.60.354) — test-procedures PD-01..09 9/9; test-repo-procedures 7/7 unchanged. Built per PD_D0_addendum, not the files first listed."
    depends_on: [PD_D0_a_procedure_is_a_node_file, PD_D0_addendum_one_procedure_type, OC1_task_nodes]
    files_first_mapped: [lib/automation/procedure.js, lib/node-schemas/schema.procedure, procedures/update-nexus.procedure, idearium/cli/route-commands.js, tests/modules/test-procedures.test.js]
    files: [lib/repo-procedures.js, lib/agent-tools/tools/nexus/command.js, idearium/api/index.js, idearium/cli/route-commands.js, idearium/procedures/update-nexus.procedure, loom/maps/build-surface-map.js, tests/modules/test-procedures.test.js, tests/modules/run-all.js]
    graph: >-
      Run by hand before code (2026-11-01): lib/repo-procedures.js (kernel) → lib/automation/pipeline.js (kernel, lazy); idearium/api/index.js → kernel
      (allowed); command.js → idearium/cli/route-commands.js (already in the baseline). No new crossing. test-system-boundary SB-06 reports two
      crossings, both cos/manager/autopilot-door.js, there before this phase; SB-08 fails on Windows (ESM 'd:' scheme), also before it.
    left_for_later: >-
      No command row restarts a system, so update-nexus says "restart what changed" as a step's text rather than doing it (PD5 / the Updates page). The
      version check is a pattern, not "equals the version the update brought" (a check cannot read two steps yet).
    does: >-
      The .procedure node (parse, validate, save, list, archive — task-node.js's shape) and its command rows: procedure list | show <id> |
      run <id> [--yes], for him and copilot alike. The first one, update-nexus: update check → (gate: his yes) → update apply → restart what changed
      → check the version. A version that does not match after is a failed run, said.
    proof: "a procedure runs its command steps in order; the gate holds without a yes; a failing check fails the run, said"

  PD2_updates_by_hand_are_recorded:
    status: OPEN
    depends_on: [UP11_an_attached_folder_tracks_origin]
    files: [lib/nexus-update.js, idearium/ui/update.html, tests/modules/test-nexus-update.test.js]
    does: >-
      At boot (and each check) the update tool compares HEAD with the last commit it recorded; a move it did not make (his git pull) is recorded as
      kind 'update', by 'hand', from → to, in the history and in Versionium, like any other. The Updates page greys Update when up to date.
    proof: "a git pull outside the tool appears in history and Versionium on the next check, once"

  PD3_versionium_holds_the_whole_update:
    status: OPEN
    depends_on: [PD2_updates_by_hand_are_recorded, VE3_updates]
    files: [lib/nexus-update.js, versionium/lib/nexus-releases.js, tests/modules/test-nexus-update.test.js]
    does: >-
      Each update's Versionium record carries, beside its files, every release between from and to: its version line (his words) and its
      changelog, read from the new tree. Versionium's GET /api/versionium/nexus/releases already holds the releases; the update links to them by
      version. 'versionium diff <from> <to>' shows the files and the releases between any two versions.
    proof: "an update 0.1.0 → 0.1.2 records both releases' lines and changelogs; diff between them lists files and releases"

  PD4_the_procedure_library:
    status: OPEN
    depends_on: [PD1_procedure_nodes_and_commands]
    files: [procedures/]
    does: >-
      More procedures, each a few command steps: rollback-nexus, restart-system, start-cos, back-up-data, release-check. Each one has a test that runs it
      against stand-ins.
    proof: "each runs green against stand-ins"

  PD5_procedures_on_screen:
    status: OPEN
    depends_on: [PD1_procedure_nodes_and_commands]
    files: [lib/ui/tv-shell/menu.js, idearium/ui/update.html]
    does: "The floating menu's ⇪ UPDATE and the Updates page run the update-nexus procedure (one path for screen, command and copilot), and a Procedures list in the menu runs any of them"
    proof: "in Clear Glass: the menu runs update-nexus through its gate"

order: "PD2 first (his update is unrecorded now), then PD1 → PD3 → PD5 → PD4."
