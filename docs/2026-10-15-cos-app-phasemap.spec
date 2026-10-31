# docs/2026-10-15-cos-app-phasemap.spec
# COS as a Windows application that runs and manages his projects (Nexus first): drop a new zip in, the old version is kept, Clear Glass can fetch the next one.
# MAPPED before building (docs/CLAUDE.md rule 1). Registered in docs/SPEC-REGISTRY.spec. Nothing below is built.

origin:
  date: 2026-10-15
  james: >-
    "cos exe for my pc to run nexus on, so i can just replace the zip each time. so i can manage them better, then clearglass could automatically download to and run it.
    like cos as a windnows application for running my projects, its phased already."
  context: >-
    His run is a downloaded copy (D:\Backups\Downloads\Nexus v0.39.300\Nexus-main) on nexus@0.60.44 while the repository is at 0.60.61, so updating is manual today and he is 17 releases behind.
  reading: >-
    The coder's reading (his to correct; to confirm). A small, stable Windows app, "COS", that (1) keeps each project's versions side by side, (2) imports a new zip dropped into it,
    (3) runs the chosen version and supervises it, (4) switches and rolls back safely, and (5) lets Clear Glass hand it a newly downloaded release. Not read as: a virtual machine or a
    sandbox for Nexus (that is the compartment system, different), and not read as auto-running whatever Clear Glass downloads without his say.
  already_mapped_not_built:
    - "cos/spec/cos.spec section GAP 2026-08-14: the '.cos' portable archive (a tar.gz of a compartment's file contents with the snapshot chain and spec). Mapped, not built. It is a compartment's source artifact, not an app updater."
    - "cos/spec/cos.spec and cos-design-v1.7.0.spec: an 'exe' runtime archetype (Windows native EXE runtime, section 46): runs an exe INSIDE a compartment. Not an exe that IS COS."
    - "docs/2026-10-05-cos-machines-phasemap.spec: downloads and verifies OS images; offered, never forced onto running compartments. Its update rule is reused here."
    - "So 'its phased already' is true for the pieces (archive, exe runtime, verified downloads) and not for COS as an application."
  reuse:
    - ".github/workflows/release.yml + scripts/release-zip.js: already publish nexus-<version>.zip with a VERSION file inside, tagged v<version>, on every release (VR1, 0.60.34)."
    - "nexus/autopilot.js: already starts and supervises every service (status on :7799). COS starts autopilot; it does not become a second supervisor."
    - "clear-glass/package.json already carries electron-builder; versionium and the snapshot compartments already snapshot and restore."

findings_that_shape_the_design:
  data_is_inside_the_folder:
    said: >-
      Replacing the zip would lose his data. 37 modules compute their data folder from their own location (path.join(__dirname, '..', 'data')) with no override (guardian jobs, the node registry, the
      response sink, loom's cortex sync and more), and only 23 files honour NEXUS_DATA_ROOT. So a new version unzipped over the old one wipes jobs, hats and registries that live in data/.
    two_fixes:
      junction: "COS keeps one persistent data folder per project and links it into each version folder (a Windows directory junction, no admin needed). Works today with no code change. Chosen first."
      one_root: "A single lib/data-root.js that every module uses, honouring NEXUS_DATA_ROOT, replacing the 37 hardcoded paths. The proper fix; mechanical but wide; its own phase."
  rollback_is_not_just_code:
    said: "A newer version may write data an older one cannot read. Rolling back the code alone can break on the new data. A switch therefore snapshots the data first, and a rollback restores that snapshot with the old code."
  the_updater_must_not_be_the_thing_updated:
    said: "Clear Glass is part of Nexus. If Clear Glass downloads the next Nexus and replaces itself while running, that is the classic self-update failure. COS is the small outer shell that changes rarely; Clear Glass only DELIVERS the zip to COS, and COS stops, switches and restarts."
  code_from_the_internet_runs_with_his_rights:
    said: >-
      Auto-download then run is a supply-chain risk. Controls: a pinned source (the repository's releases), a SHA-256 check against a published checksum file, zip-slip (path traversal) refusal, a size cap,
      npm lifecycle scripts off by default (npm ci --ignore-scripts), and a first run of each new version only after his approval. Updates are offered, not forced; an optional auto-switch applies only when he enables it.
  windows_limits:
    - "An unsigned exe triggers Windows SmartScreen ('unrecognized app'). Signing needs a certificate (cost, identity checks). Until then he clicks 'Run anyway' once per download; stated, not hidden."
    - "Ports are fixed (9000, 7820, 4800, 7799 and more), so two versions cannot run at the same time. COS runs one version per project and says so."
    - "Building a Windows exe from this Linux sandbox is fragile (the cos-machines map says so too). The honest build is a Windows runner in GitHub Actions, attached to the release."

decisions:
  COSA0_shell:
    question: What is COS.exe made of?
    coder_recommends: >-
      Electron (tray icon and a window), because Electron 42 and electron-builder are already in the repo and Clear Glass proves the pattern, and it bundles Node so he installs nothing.
      A pinned Node runtime is shipped inside COS; the project's node_modules live in a shared cache keyed by the lockfile hash, so a version that did not change dependencies does not reinstall.
    chosen: null
  COSA0b_signing:
    coder_recommends: "Unsigned first (free, works), signing later if he wants the warning gone."
    chosen: null
  COSA0c_update_source:
    coder_recommends: "The repository's GitHub releases (github.com/HorrisEllis/Nexus), the asset nexus-<version>.zip plus a SHA256SUMS file the release workflow also publishes (a small addition to release.yml)."
    chosen: null

phases:
  COSA1_version_store_and_import:
    status: BUILT-0.60.87
    built_note: "cos/app/store.js, cos/app/cli.js (node cos/app/cli.js import, inbox, list, status, remove), tests/modules/test-cos-app-store.test.js CA-01..13. Windows junction UNVERIFIED (Linux symlinks proven). No cos app entry in the compartment CLI yet."
    does: >-
      Layout under %LOCALAPPDATA%\COS\projects\<project>\: versions\<version>\, data\ (persistent), current, previous, state.json. Import a zip (file picker or drop into an Inbox folder that COS watches):
      read the VERSION file, verify the checksum when one is given, refuse path traversal and oversize, extract beside the others, junction data\ in. CLI first: cos app import|list|status.
    proof: "a zip with ../ entries is refused; a corrupt zip leaves nothing half-extracted; two versions sit side by side with one shared data folder; import of the same version twice is a no-op."
  COSA2_runtime_and_dependencies:
    status: BUILT-0.60.88
    built_note: "cos/app/runtime.js preflight + bundled js-yaml via NODE_PATH; RT-01,07. Windows taskkill and ELECTRON_RUN_AS_NODE unverified."
    depends_on: [COSA1_version_store_and_import]
    does: "Pinned Node bundled; node_modules in a shared cache keyed by package-lock hash; npm ci --ignore-scripts; a preflight (Node version, required files, a boot check) before a version may be chosen."
  COSA3_run_and_supervise:
    status: BUILT-0.60.88
    built_note: "cos/app/runtime.js start/stop/status/logs; RT-02..09. Windows taskkill and ELECTRON_RUN_AS_NODE unverified."
    depends_on: [COSA2_runtime_and_dependencies]
    does: "Start nexus/autopilot.js with NEXUS_DATA_ROOT set; wait for :7799/status; detect a port already in use and say which program holds it; graceful stop; rotated logs; tray status. CLI: cos app start|stop|status|logs."
  COSA4_switch_and_rollback:
    status: BUILT-0.60.88
    built_note: "cos/app/switch.js; SW-01..10. Windows taskkill and ELECTRON_RUN_AS_NODE unverified."
    depends_on: [COSA3_run_and_supervise]
    does: "Stop, snapshot the data, point current at the new version, start, and require healthy within N seconds, else roll back to previous and restore the data snapshot, saying why. Keep the last K versions, prune older ones with a report."
    proof: "a version that fails its health check is rolled back automatically with its data restored; a version that passes stays; the failed one is kept for inspection."
  COSA5_data_root:
    status: OPEN
    does: "lib/data-root.js, one honoured NEXUS_DATA_ROOT, replacing the 37 hardcoded data paths. Until done, COSA1's junction carries it. Test: a grep-based check that no module computes its own data folder."
  COSA6_the_exe:
    status: BUILT-0.60.89
    built_note: "cos/app/controller.js, cos/app/desktop/*, scripts/build-cos-app.js, .github/workflows/cos-app.yml; UI-01..11, CT-01..05, BD-01..06. UNVERIFIED: the Windows build itself, tray, file dialog, drag-drop paths, junctions, taskkill. Unsigned exe (SmartScreen warns once). Clear Glass is not started by COS."
    depends_on: [COSA1_version_store_and_import]
    does: "Electron shell (tray, project list, versions, logs, Start/Stop/Switch/Rollback) built by a GitHub Actions Windows job with electron-builder (portable and installer), attached to the release with SHA256SUMS. Screens come after the CLI, per his order."
  COSA7_clear_glass_delivers:
    status: BUILT-0.60.93
    built_note: "clear-glass/src/releases/deliver.js + service.js, nexus-release command, /cli/releases/*, job template, release.yml publishes SHA256SUMS; RD-01..13 against a local GitHub stand-in. NOT built: the NP16 quarantine (vault not built), a token setting. Not run against real GitHub."
    depends_on: [COSA1_version_store_and_import]
    does: "Clear Glass checks the releases, downloads the asset and checksum into COS's Inbox through the downloads pipeline (the NP16 quarantine applies), and tells COS. COS verifies and offers the switch; a setting allows auto-switch only while idle. Clear Glass never replaces itself."
  COSA8_other_projects:
    status: OPEN
    depends_on: [COSA3_run_and_supervise]
    does: "Any project with a COS spec (the archetype/blueprint system) is a COS project: its own versions, data, run command and port map. Nexus is the first."

# ADDENDUM 2026-10-15 (b): COS syncs with Idearium, so repos are managed from the app
addendum_b:
  james: "holy shit, what if the exe syncs with idearium. like i can manage repos with it."
  reading: "To confirm. COS.exe is a second front-end on Idearium's repo system: the same repos, versions, notes, phasemaps and runs, listed and driven from the desktop app. Idearium stays the source of truth; COS holds no second copy."
  grounded: "Substrate exists and is reused, not rebuilt: the repo.* command rows (repo versions, diff, restore-file, history-import, phasemap, phase build, notes, run), lib/repo-releases.js, lib/repo-run.js, lib/repo-run-state.js, lib/repo-history.js, lib/component-store.js, docs/nexus-repository-system.spec. A repo's snapshot versions (VR1) and COS's installed versions are the same idea at two layers."
  coder_opinion: >-
    Good idea, and it removes a duplicate: COSA1's version store should not invent its own version model. A COS project IS an Idearium repo; an installed version is a release of that repo; a switch is "run this version".
    Idearium is the one door (nexus.command); COS calls it, so agents and the app share every capability.
  failure_modes:
    - "Idearium down: COS must still start, stop and roll back the last installed version on its own (it cannot depend on the thing it supervises). Sync is optional, never a start condition."
    - "Two writers: COS must not write repo state directly; all writes go through Idearium (RAID is the only write authority, AXIOMS 5.2/9.1)."
    - "Auth: the local API is loopback; COS should hold a token rather than trust any localhost caller."
    - "Offline edits: if COS records a switch while Idearium is down, it queues the event and replays it, in order, with the original timestamp."
  phase:
    COSA9_idearium_sync:
      status: OPEN
      depends_on: [COSA1_version_store_and_import, COSA3_run_and_supervise]
      does: "COS lists Idearium repos, shows versions/phasemap/notes, imports a repo's release as an installed version, reports run state back (started, healthy, rolled back) as repo activity, and queues events while Idearium is down. CLI first: cos app repos|sync|link <repo>."
      proof: "a switch while Idearium is down is queued and replayed once; COS still starts the last good version with Idearium off; a repo's activity log shows the switch and any rollback with its reason."
  question: "Which repo actions do you want from the app first: only version/run (list, switch, roll back), or also phasemap builds and notes? I recommend version/run first."

# ## ADDENDUM 2026-10-16 — COS to manage his projects; a new Nexus hooks in on arrival (mapped, no code)
# James (2026-10-16): "check everythign in nexu that can help pipeline, clearglass. cos for windows. automation and macros.
# tell me whats the most important. i figure cos could be helpfui for managing my projects so im not so overwhelmed.
# alos what if when i download the newest version of nexus whether on git and drag it into clearcos, or i download it in
# clearglass, and aurtomatically open it in cos, it can hook into nexus systems."
# Context: asked with his WB choice (option 1, built 0.60.73). Read in source the same day (two read-only surveys).
# The coder's reading (to confirm):
#   "managing my projects" = one overview of every repo: open todos/questions (lib/repo-notes.js counts), the next open phase
#     (repo.phasemap), the last activity (repo.activity), sorted by what moved last. Everything it needs exists; no route-commands
#     row lists repos (repo.list is a local idearium CLI call only), so agents cannot see it either. Proposed COSA10 below.
#   "drag it into clearcos / download it in clearglass ... hook into nexus systems" = COSA7 (Clear Glass hands a release zip to
#     COS) → COSA1 (version store + import; reuse lib/history-import-job.js and lib/zip-ingest.js, already a safe zip inbox) →
#     COSA2/3 (install, start autopilot) on the SAME data root (COSA5) → COSA4 (switch, roll back; reuse lib/nexus-self/store.js
#     checkout and apply.js rollback). Found: systems are found by fixed ports and entry files (nexus/autopilot.js ALL_KERNELS,
#     lib/nexus-self/systems.js), not by registration, so "hooking in" is automatic once the new copy runs on the same data root
#     and ports; the blocker is COSA5 (about 42 files compute <file>/../data themselves; recount 2026-10-16, the map said 37).
# No decision of his is recorded here yet: COSA0 (shell, signing, update source) and the COSA9 question stay open.
#
# COSA10_my_projects (proposed, OPEN; depends on nothing):
#   does: one route-commands row `projects` (and repo.list) reading GET /api/repos plus, per repo, notes counts, the first open
#     phase and the last activity; Idearium shows it first; COSA9's `cos app repos` later calls the same row. Read-only.
#   proof: three fixture repos sort by last activity; a repo with 2 open todos and an open phase shows both; an agent gets the
#     same list through nexus.command.
# 2026-10-16 (later) — COSA10 BUILT 0.60.74: idearium/lib/projects.cjs, GET /api/my-projects (projects.overview), the `projects`
# command row, Idearium's repo rail "My projects" button (idearium/ui/js/projects.js); test-projects-overview PJ-01..06.
# Found: GET /api/projects was already the uploaded-zip shelf (project.list); the router takes the first match silently, so the new
# route was shadowed until renamed. PJ-06 now fails on any two API routes sharing a method and path.
# Open: Nexus's "next" is the first in-progress or ready phase over all of its maps; it should follow
# docs/2026-10-15-pipeline-focus-phasemap.spec's order instead.

# 2026-10-16 (merge) — two sessions each named a phase COSA10 the same day: COSA10_my_projects (above, built 0.60.74) and
# COSA10_compartment_window (addendum c below, PR #91). Both are kept as written (§0.3); refer to them by their full keys.

# ADDENDUM 2026-10-16 (c): each compartment is a VM-style window, with the rewind engine and system-state controls
addendum_c:
  james: >-
    "on cos will be an electron app. what about integratoing idearium with cos" then "i want each compartment to be like the vm window, but with the rrewind engine and system state controls."
  reading: >-
    To confirm. "The vm window" = the compartment desktop built in 0.39.371 (VM1, "like full VMware style. Not actual VMware."). Each compartment in COS gets that same window: one pane per compartment showing it live, with the controls along its edge.
    "Rewind engine" = the existing repo.run play/pause/rewind (0.60.0 RS1): pause, restore a version with a pre-restore snapshot verified against disk. "System state controls" = pause/resume/checkpoint/checkpoints/status.
  grounded: "Reused, not rebuilt: POST /api/repos/:uuid/run/:op (pause|play|rewind {commitId}), /desktop/:op (pause|resume|checkpoint|rewind {tag}), /desktop/checkpoints, lib/cos-bridge.js desktopControl, cos/workspace/vm-control.js (QMP stop/cont/savevm), cos/app/switch.js snapshotData/restoreData."
  coder_opinion: >-
    One strip of controls, two honest meanings underneath. A VM compartment gets true state: pause freezes memory, a checkpoint is a live snapshot. A host project (Nexus run by COS, no VM) cannot: pause is suspending the process tree, a checkpoint is version + data snapshot, rewind is restore both and restart. The window must say which kind it is and what a checkpoint holds ("includes running memory" or "files and version only"). Same buttons, never a promise the layer cannot keep.
  failure_modes:
    - "A checkpoint that does not include memory shown the same as one that does (a lie by omission): label it."
    - "Suspending a Windows process tree has no taskkill-like one-liner (needs NtSuspendProcess); unverified, may ship as stop/start only."
    - "Rewind while a switch or import is running: refused with 'busy' (the controller already serialises per project)."
    - "COS depends on Idearium for the VM path; with Idearium down, host-project controls must still work."
  phase:
    COSA10_compartment_window:
      status: OPEN
      depends_on: [COSA6_the_exe, COSA9_idearium_sync]
      does: "CLI first: cos app state|pause|resume|checkpoint|checkpoints|rewind <project>, host projects through cos/app/switch.js, VM compartments through Idearium's existing routes. Then the window: VM-style pane per compartment (noVNC for VM, status+logs for host), control strip, checkpoint list with 'holds memory: yes/no'."
  question: "Are your compartments the QEMU desktops (real VM window), the host projects COS runs (Nexus), or both? I assumed both, VM first."

# ADDENDUM 2026-10-16 (d): the nested containers already exist in Idearium; COS lists them, it does not create them
addendum_d:
  james: >-
    "do it. then each systems nested container automatically." then "idearium has nested containers,"
  reading: >-
    Settled by his correction, to confirm: COS does not invent a container per system. Idearium's Nexus-self already has one (0.39.261, his words: "i want a nexus repo in idearium, that immutable with nested compartments per system so i can manage nexus from inside nexus"). COS discovers that tree and gives every node the COSA10 window and controls without anyone adding it by hand.
  grounded: "idearium/repo/nexus-self.js ensureCompartments() (parent compartment 'nexus' + one child per entry of lib/nexus-self/systems.js SYSTEMS, 16 entries incl. core, components, cos; live dirs mounted read-only; networkIsolated), cos/spec/cos.spec (cos is the nested repo nexus/cos)."
  phase:
    COSA11_nested_tree:
      status: OPEN
      depends_on: [COSA9_idearium_sync, COSA10_compartment_window]
      does: "COS reads the compartment tree from Idearium (parent -> systems), draws it as nested windows, and a new system in systems.js appears with no COS change. Each node shows its kind: has a process (port, health), has a VM desktop, or logical only (components, cos, core). Controls are enabled per kind."
      proof: "adding an entry to SYSTEMS shows a new nested window after a refresh; a logical-only node shows no pause button and says why."
  to_verify: "Whether these compartments have a VM desktop at all (repo.compartmentId set, vm-control reachable) or are logical + read-only mounts. Not yet checked against a running Idearium. If they have none, pause/checkpoint for a system means its kernel process (autopilot) and the data snapshot, not a VM."

# ADDENDUM 2026-10-16 (e): COS behaves like VMware: minimizes to the taskbar, updates itself from dropped or downloaded zips, versions recorded in Versionium through Idearium
addendum_e:
  james: >-
    "i want this almost like vmware. minimize to taskbar. auto updates from dropping in new zips, downloading it from clearglass. versions using versionium  in idearium"
  reading: >-
    To confirm. (1) Window: a normal Windows window that minimizes to the taskbar like VMware Workstation; the tray stays as a second place, not the only one. (2) Updates: a zip dropped on the window or into the inbox, or one Clear Glass downloaded, installs by itself and, within a rule he sets, switches by itself. (3) Versions: each install, switch and rollback is a Versionium record made through Idearium, so the history of what ran when is Versionium's, not a second log in COS.
  grounded:
    window: "cos/app/desktop/main.js today hides to the tray on close and has no taskbar-minimize behaviour set; Electron minimizes to the taskbar by default, so the change is: closing still hides (VMware keeps VMs running), minimize goes to the taskbar, tray click restores. Quit stays the only thing that stops what COS started."
    updates: "COSA1 inbox watcher already installs a dropped zip and offers the switch; COSA7 (Clear Glass downloads the asset and its checksum into the inbox through the downloads pipeline, NP16 quarantine applies, Clear Glass never replaces itself) is OPEN and unchanged."
    versionium: "versionium/server.js is its own system on :3754 (VS1, 2026-09-02, his words: 'versionium is its own folder. it's system with a server.js. cli. api.'); Idearium's VR1 makes every repo change a commit; the repo routes /api/repos/:uuid/git/*, repo versions and repo diff exist."
  coder_opinion: >-
    Versionium holds the HISTORY and the metadata of a version (number, checksum, who/what installed it, when, the outcome, the rollback reason, a link to the data snapshot), not the 100s of MB of release files. The zips stay in COS's store, because COS must install and roll back with Idearium and Versionium down. Putting blobs in Versionium would make the supervisor depend on what it supervises. So: COS is the store, Versionium is the record and the diff, and COS queues events while Idearium is down and replays them in order (already in addendum_b).
    Auto-switch is the risky word. A dropped zip that switches by itself can replace a running Nexus in the middle of a job. The rule I recommend: auto-INSTALL always (safe, nothing running changes), auto-SWITCH only when the running version is idle and the candidate's preflight passes, and every auto-switch is a normal switch (data snapshot first, health check, automatic rollback), so a bad one undoes itself. He sets it to off / ask / auto.
  phase:
    COSA12_vmware_window:
      status: BUILT-0.60.90
      built_note: "minimize to taskbar (Electron default, kept), close hides to tray, bounds remembered in settings.json, status strip; UI-12..14. Windows behaviour unverified."
      depends_on: [COSA6_the_exe]
      does: "Minimize to the taskbar, close hides to the tray, taskbar and tray both restore; window size, position and last selected project remembered; a status strip like VMware's (project, version, running/paused, health) always visible."
      proof: "UI-tested in Clear Glass, never Playwright (docs/CLAUDE.md); Windows behaviour unverified until a Windows run."
    COSA13_auto_update:
      status: PARTIAL-0.60.90
      built_note: "policy off|ask|auto, drop and inbox, auto only when verified+newer+idle; AU-01..09. 0.60.92: the autopilot idle signal exists (GET /idle) and COS asks it; a Nexus older than 0.60.92 has none, so auto waits for it. NOT built: Clear Glass download (COSA7)."
      depends_on: [COSA1_version_store_and_import, COSA4_switch_and_rollback]
      does: "Setting update.policy: off | ask | auto (default ask). auto-install on any arrival (drop, inbox, Clear Glass); auto-switch only when idle and preflight passes; notification says what happened and how to undo. Never installs a zip that fails the checksum or the NP16 quarantine."
      proof: "a dropped zip installs with no click; with policy auto and an idle Nexus it switches and is healthy; with a crashing release it rolls itself back with the reason shown; with a job running it waits."
    COSA14_versionium_record:
      status: BUILT-0.60.279
      built_note: "cos/app/versionium.js (its own outbox, because the exe ships without lib), hooked on install (inbox drops too), remove, switch and rollback; replayed at start and every minute; direct to Versionium's contract, not through Idearium (see the 2026-10-29 addendum: §5.15, §17.12). test-versionium-everywhere VE-06. Windows unverified."
      status_before: OPEN
      depends_on: [COSA9_idearium_sync, COSA13_auto_update]
      does: "Every install, switch, rollback and remove is written to Versionium through Idearium (the one write door, RAID is the only write authority), with checksum, outcome, reason and the data-snapshot reference; queued and replayed when Idearium is down. COS's version list can be shown from the record (Nexus's own history in Idearium's repo view), and `repo diff` between two Nexus releases works from it."
      proof: "a switch while Idearium is down is recorded once, in order, after it returns; the record and COS's store agree (a test compares them); Idearium shows the switch and any rollback with its reason."
  failure_modes:
    - "Auto-switch during a running job: idle check plus the normal snapshot and rollback."
    - "Record and store disagree (record says v2 running, store says v1): the test compares them and COS's store wins, the difference is reported, never silently fixed."
    - "A release that downloads from Clear Glass is a stranger's zip: checksum and quarantine apply before install, same as a drop."
    - "Taskbar/tray behaviour differs on Windows: unverified here."
  question: "Is the update rule off / ask / auto with auto-switch only when idle, as I recommend? And do you want the Versionium record to also hold the release files (I advise no, for the reason above)?"

# ## ADDENDUM 2026-10-16 (later) — the first Windows build failed; root cause fixed (0.60.96)
# James (2026-10-16): "okay the cos windows app?"
# Found: the cos-app workflow ran once, when PR #94 merged (run 38887590255, windows-latest), and failed in 50 s. Its log says
# "COS undefined", then electron-builder: "Please specify 'version' in the package.json". Root cause: cos/app/version.js was 0 bytes
# on main. It was written at 0.60.89 (398 bytes, version 0.1.0) and emptied at 0.60.90 by a bad write (a pure 4-line deletion, the
# same failure that branch had already hit on package.json). No other tracked file in the repo is empty where history had content
# (checked). The tests passed throughout because none read the version.
# Fixed: the file restored as written (0.1.0, never published: no cos-v tag exists). scripts/build-cos-app.js refuses a missing
# version and names the file. The workflow's first step fails with that message. test-cos-app-build BD-07/BD-08.
# Still unverified, as the map always said: the Windows exe itself, the tray, the file dialog, drag-drop paths. The next run on
# windows-latest is the first that can say.
# Open: COSA0 decisions (shell, signing, update source: built as the coder recommended, Electron + unsigned + GitHub releases,
# but never chosen by him), COSA5 data root, COSA8, COSA9, COSA10_compartment_window, COSA11, COSA13 (partial), COSA14.


# ## ADDENDUM 2026-10-16 (0.60.111): COSA1 import naming
# James: "please fix this. the naming in github doesn't even match that..." (COS refused "Nexus-main" and "Nexus v0.60.110").
# The store names a zip from its contents: lib/release-version.js fromFiles (VERSION, then lib/version.js, then package.json);
# every version stated inside, and the folder's when it has one, must agree. The project is package.json's name, else the folder's.
# Root cause of the delay: the 0.60.103 store fix never reached an exe, because COS stayed 0.1.0 and cos-app.yml only watched
# version.js. COS is now 0.1.1, the workflow watches every file the exe is built from, and a change without a bump fails, said.
#
# ADDENDUM 2026-10-17 — his projects folder (COSA14), and COS that says it is out of date
# James, 2026-10-17, with screenshots of COS refusing a release zip and of D:\Projects (38 folders, more inside some): "also can
# you fix cos for me? the zip doesn't have nested folders anymore. these are all my projects i have so far. way more. in some
# folders. i was hoping to use idearium and cos to manage them"
# - COS: his COS was 0.1.0; the root-layout zip has been read since COS 0.1.1 (cos-v0.1.1, 2026-10-16). COS 0.1.2 (Nexus
#   0.60.137) says when a newer COS is out (cos/app/app-update.js); Clear Glass's delivery picks the newest v<x.y.z>, not the
#   repo's "latest" (a cos-v release had been it).
# - COSA14_his_projects_folder (BUILT 0.60.139): idearium/lib/projects-folder.cjs scans the folder he names (projects by their
#   markers, also inside group folders; a folder of files is a project too, marked weak; an empty folder is said), and brings the
#   ones he ticks into Idearium — each zipped from his disk with the import's own skip rules and caps and imported through
#   repo.import-archive, the same door as an uploaded zip, so each gets its repo, chunks, index and COS container as any import
#   does. The folder is read, never changed. Routes GET/POST /api/my-projects/folder, POST /api/my-projects/folder/import;
#   commands `projects folder [<dir>]`, `projects import <path…>`; My projects → "Projects folder" in Idearium.
#   Open: COSA15 — a project's own runs and versions in COS (start, stop, its branches), as Nexus's are.
#
# ADDENDUM 2026-10-17 (b) — who brings his projects in
# Context: the coder's summary of 0.60.139 told him how to point Idearium at D:\Projects and said the scan was tested only on a
# test folder. James, 2026-10-17: "no. ill import them" · "no with the idearium. make it a feature if you want to do that"
# - Decided (his): he imports his projects himself, with Idearium. The coder does not import them for him.
# - The folder scan stays what 0.60.139 built: a feature of Idearium (My projects → "Projects folder", the routes and commands
#   above), run by him. Nothing was imported by the coder; the coder has no access to D:\Projects.
# - Reading, to confirm: "make it a feature if you want to do that" is read as "the folder scan belongs in Idearium as its own
#   feature, not a one-off the coder runs" — which is how it was built. If he meant something more (a separate feature page,
#   a watch on the folder), that is open.
#
# ADDENDUM 2026-10-17 (c) — sync first; the projects folder out of Idearium until then (0.60.140)
# James, 2026-10-17, after addendum (b) read his "make it a feature" as already done: "im saying add a sync feature to idearium.
# remove it from idearium unntil then"
# - Decided (his): Idearium gets a SYNC feature. Until it exists, the projects-folder feature (COSA14, 0.60.139) is not in
#   Idearium. Addendum (b) is kept and superseded here (§0.3): the coder's reading there was wrong.
# - Done (0.60.140): idearium/lib/projects-folder.cjs and its test archived to _archive/2026-10-17-projects-folder-until-sync/;
#   the routes, the two commands, the UI section, the run-all row and the loom wires removed. COSA14 status: ARCHIVED.
# - COSA16_idearium_sync (OPEN, mapped, not built):
#     reading, to confirm: a project in Idearium stays in step with its folder on his disk. He picks the folder; Idearium
#     brings in what changed (new files, edits, removals said, never silent) as a new version of that repo, not a new repo.
#     His folder is not written unless he asks for that direction.
#     substrate (§8.6): the archived scan and zip; repo.import-archive; the repo's versions (`repo versions`, `repo diff`).
#     open questions for him, only if the axioms do not settle them: one-way (disk → Idearium) or both ways; on demand or
#     watched.
#     order (his rule): backend, route, command, UI, in one phase.

## ADDENDUM 2026-10-25 (0.60.252, UP) — the co-pilot's update tool; COS is its end state
James, 2026-10-25: "can we make a tool for the copilot (remmber copilot is meant to be a hat.) like a update tool using github?" Asked how
an update should land (git clone, through COS, or zip side by side), he said: "first one but the second one needs to be the end state".
- **Built (docs/2026-10-25-nexus-update-phasemap.spec UP1–UP4):** `lib/nexus-update.js`, one interface over drivers. The `git` driver
  is built.
- **Tool:** `nexus.update.tool` is on the co-pilot hat. The routes are `/api/update*`, the rows `update …`, and the page
  idearium/ui/update.html.
- **The COS driver is UP5 (OPEN).** When the install is a COS store version, `detect` already names it, and says this tool is not wired
  to it yet. The tool will then ask COSA7 to fetch into the inbox, and COSA4/COSA13 switch with a snapshot and rollback.
  - The tool, its rows and its page stay the same.
  - It waits on COS's Windows build being verified, and on him running Nexus from the COS app.

# ── ADDENDUM 2026-10-29 — categories and cos.exe as the full compartment manager (his) ──
# James, 2026-10-29: "catagories using either the architypes or the templates, with a full manager and editor, with the schemas, then catagories
# which can be managed, including systems which would then list each system compartment. also really need cos.exe to be a fully compartment
# manager with controls for the rewind engine, diagnostic tools, versions, data browser and tools. cli access. index.html/ui for the
# thumbnail. look at all of the cos phases, and add all of this to them." · and: "yes, clear glass macros and settings too."
# Mapped in full in docs/2026-10-24-cos-manager-phasemap.spec (addendum 2026-10-29: MG10 categories, MG11 the category manager UI, MG12 the
# exe is the compartment manager, MG13 CLI in the exe, MG14 live thumbnails).
# Here:
# - COSA6_the_exe and COSA12_vmware_window are what MG12 grows from. The exe becomes the manager: a category tree, and per compartment the
#   Rewind, Diagnostics, Versions, Data and Tools tabs, plus thumbnails (MG14).
# - COSA14_versionium_record is BUILT 0.60.279, ahead of its depends_on (§17.12, his law, made it due): cos/app/versionium.js records every
#   install, remove, switch and rollback, with its own outbox in COS's store, because the exe ships without lib. It is replayed at start
#   and every minute. It goes direct to Versionium's contract, not through Idearium as first mapped: the one owner is Versionium (§5.15),
#   and Idearium need not be running. Proof: test-versionium-everywhere VE-06.

# ── ADDENDUM 2026-10-30 — one exe runs Nexus, replacing PowerShell; his update-system read (his) ─────────────────────────────────────
# James, 2026-10-30, sending update-system.zip: "it will be what runs nexus. replacing powershell. / just one exe. then we can drag and drop
# new systems onto it, or use idearium to have one built from the pipeline, or copilot. copoilot it an etry point. / then we can have an
# updater using github. or this?"
# What exists for it (read 2026-10-30): the exe (COSA6), a release zip dropped on it is imported (COSA1, the drop overlay in desktop/ui),
# switch and rollback (COSA4), the update policy off/ask/auto, GitHub as the release source (COSA0c, cos/app/app-update.js checks
# cos-v<x.y.z>), and COS's one recorder (cos/app/versionium.js). With docs/2026-10-24-cos-manager-phasemap.spec MG_D4 (COS is the one
# supervisor) the exe is what runs Nexus, and lib/nexus/autopilot.js stops being the entry PowerShell starts.
# His update-system (10 files, 876 lines: UpdateService, UpdateClient, HandshakeRegistry, EventContract, ContractTransport, WebRTCTransport,
# a drop zone): server-push revisions over WebRTC data channels, checksum, staleness, rollback as a publish, heartbeat catch-up, a
# location per handshake that can be revoked, and dedup. Probed by the coder with in-memory transports, two defects:
#   (1) dedup keys on the payload's hash, so a second identical event on one location is dropped (two {} pings: 1 received; a repeated
#       request() would time out);
#   (2) a client that acks rejected-stale or failed makes the server force a full resend at once, with no backoff: 28,773 pushes in
#       300 ms to a client already on the latest revision.
# The coder's reading, TO CONFIRM: GitHub stays the source of releases for the exe (built); his update-system is the push channel between
# machines (Bridge, :9999, which already has the signaling it needs), for pushing a revision to another device or a remote compartment,
# once (1) keys dedup on requestId and (2) retries with the growing delay of the dependency gate (architecture-spec 0.13.0 RULE D).
# Its envelope (location + requestId + hash) is the same shape as the handshake §5.11 asks for; it should be the one envelope, not a second.
