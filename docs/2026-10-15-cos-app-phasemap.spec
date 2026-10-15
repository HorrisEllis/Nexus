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
    - "cos/spec/cos.spec and cos-design-v1.7.0.md: an 'exe' runtime archetype (Windows native EXE runtime, section 46): runs an exe INSIDE a compartment. Not an exe that IS COS."
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
    status: OPEN
    does: >-
      Layout under %LOCALAPPDATA%\COS\projects\<project>\: versions\<version>\, data\ (persistent), current, previous, state.json. Import a zip (file picker or drop into an Inbox folder that COS watches):
      read the VERSION file, verify the checksum when one is given, refuse path traversal and oversize, extract beside the others, junction data\ in. CLI first: cos app import|list|status.
    proof: "a zip with ../ entries is refused; a corrupt zip leaves nothing half-extracted; two versions sit side by side with one shared data folder; import of the same version twice is a no-op."
  COSA2_runtime_and_dependencies:
    status: OPEN
    depends_on: [COSA1_version_store_and_import]
    does: "Pinned Node bundled; node_modules in a shared cache keyed by package-lock hash; npm ci --ignore-scripts; a preflight (Node version, required files, a boot check) before a version may be chosen."
  COSA3_run_and_supervise:
    status: OPEN
    depends_on: [COSA2_runtime_and_dependencies]
    does: "Start nexus/autopilot.js with NEXUS_DATA_ROOT set; wait for :7799/status; detect a port already in use and say which program holds it; graceful stop; rotated logs; tray status. CLI: cos app start|stop|status|logs."
  COSA4_switch_and_rollback:
    status: OPEN
    depends_on: [COSA3_run_and_supervise]
    does: "Stop, snapshot the data, point current at the new version, start, and require healthy within N seconds, else roll back to previous and restore the data snapshot, saying why. Keep the last K versions, prune older ones with a report."
    proof: "a version that fails its health check is rolled back automatically with its data restored; a version that passes stays; the failed one is kept for inspection."
  COSA5_data_root:
    status: OPEN
    does: "lib/data-root.js, one honoured NEXUS_DATA_ROOT, replacing the 37 hardcoded data paths. Until done, COSA1's junction carries it. Test: a grep-based check that no module computes its own data folder."
  COSA6_the_exe:
    status: OPEN
    depends_on: [COSA1_version_store_and_import]
    does: "Electron shell (tray, project list, versions, logs, Start/Stop/Switch/Rollback) built by a GitHub Actions Windows job with electron-builder (portable and installer), attached to the release with SHA256SUMS. Screens come after the CLI, per his order."
  COSA7_clear_glass_delivers:
    status: OPEN
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
