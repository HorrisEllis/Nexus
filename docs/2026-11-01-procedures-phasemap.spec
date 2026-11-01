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
    status: "PROPOSED 2026-11-01 (the name his: .procedure recommended)"
    chosen: >-
      A procedure is a node file (<id>.procedure) in the same YAML envelope as .task and .pipeline (lib/automation-nodes.js), run by the existing
      engine (lib/automation/engine.js): its steps are the engine's own kinds (command — a row of the one command table; gate — wait for his yes;
      condition; notify; log), so no second runner. A step that changes Nexus's code or stops a system carries confirm: a gate he answers, and
      copilot gets the same gate, never a way round it (USER_AUTONOMY). Each run is recorded in Versionium (§17.12) and the run log.
    by_the_axioms: "§8.6 reuse before build (engine, node envelope, command table); §5.2/§9.1 every step through the one door; §0.3 archive, never
      delete; §17.12; USER_AUTONOMY for the gates"

phases:
  PD1_procedure_nodes_and_commands:
    status: OPEN
    depends_on: [PD_D0_a_procedure_is_a_node_file, OC1_task_nodes]
    files: [lib/automation/procedure.js, lib/node-schemas/schema.procedure, procedures/update-nexus.procedure, idearium/cli/route-commands.js, tests/modules/test-procedures.test.js]
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
