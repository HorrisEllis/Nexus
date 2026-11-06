# docs/2026-11-02-cos-enterprise-phasemap.spec
# COS as an enterprise-grade Windows application: updates announced in its UI per system with the update tool behind them, close and
# minimize as his choice, and COS itself as a Windows service. MAPPED 2026-11-02, before building (docs/CLAUDE.md rule 1). Registered in
# docs/SPEC-REGISTRY.spec. Stands on: lib/nexus-update.js (UP1–UP7: check, apply, rollback, the automatic tick), cos/manager (the one
# endpoint, the supervisor that restarts a system), cos/ui (the cockpit, COS's window since MG36), cos/app (settings, tray, start with
# Windows, MG37). Context: docs/2026-10-25-nexus-update-phasemap.spec, docs/2026-10-24-cos-manager-phasemap.spec.

origin:
  date: 2026-11-02
  james: '"i want toasts in cos ui for gibhub updates with a update tool. so i can update nexus automatically. per system" · "Yes. I need the cos ui to be a full enterprise grade, windows service, option to close or minimize to tray, manage systems,"'
  context: >-
    He pasted three boots of 0.60.338 on his machine. The automatic update found 0.60.338 → 0.60.343 every time and stopped with "diverged:
    1 local commit(s) not on GitHub — merging is yours (git pull)". So it never updated. The cockpit already manages systems (start, stop,
    restart, boot, caps, policy through the manager's routes); the COS app already hides to the tray on close and starts with Windows
    hidden (MG36, MG37). There are no toasts anywhere in cos/ui, and nothing installs COS as a Windows service.

census:
  updates: "lib/nexus-update.js check() already names the systems an update changes (folders), restartPlan() the kernels to restart; autoTick() logs only, to the console"
  diverged: "check() returns can: 'diverged…' when HEAD has a commit origin/main lacks; apply() refuses; autoTick() stops for good. His folder has one such commit (made on his machine after the attach; not visible here)"
  window: "cos/app/desktop/main.js: close → tray (fixed); minimize → taskbar (fixed)"
  service: "none: COS runs while he is logged in (login item, MG37)"

decisions:

  CE_D0_per_system_reading:
    status: "his words; read by the coder, TO CONFIRM"
    james: '"so i can update nexus automatically. per system"'
    chosen: >-
      Read as: one update from GitHub (a git fast-forward cannot take half a commit), announced per system. The toast names each system the
      update changes, with his release lines. After it lands, each changed system is restarted by itself, and a system can be restarted
      now or later from its own row. Applying only some systems' folders would leave the tree at no commit at all, and the next update would
      find "local edits" in every one of them. If he meant updating systems separately, that reading changes CE2 and CE4 only.
    by: "his axioms, applied by the coder: §0.0 (a tree that matches no commit cannot say what version it is), §17.12 (every change and version recorded, which needs one version), USER_AUTONOMY (his reading to confirm)"

  CE_D1_diverged_is_kept_never_lost:
    status: DECIDED 2026-11-02 by his axioms
    chosen: >-
      An update blocked by local commits offers "Keep mine and update". The local commits are saved on a branch (local/<date>), data that
      collides is set aside as apply() already does (UP_D3), and the folder moves to GitHub's commit with git reset --keep, which refuses
      rather than overwrite an uncommitted change. Nothing is lost: the branch holds every local commit, and history names it. When every
      local commit is already on GitHub by content (git cherry), the toast says so, and the automatic policy may do this by itself.
    by: "his axioms, applied by the coder: §0.3 (nothing lost: a branch, not a reset that drops), REVERSIBILITY (the branch is the undo), §1.2 (said in the toast and the history)"

  CE_D2_the_windows_service:
    status: "TO HIM: a cost to know about before it is paid"
    supersedes_in_part: >-
      CA_D1 (docs/2026-11-02-cos-the-application-phasemap.spec, the same day, by his axioms: "NOT a Windows service … a service is applicable
      only to a part with no window"). His later words ask for one: "full enterprise grade, windows service". Both hold if the service is the
      part with no window: COS's manager and the systems with no window run as the service, in session 0; the windows (COS's own, Clear
      Glass, ErosmancerOS) start in his session at logon (MG37, kept) and attach to it. CA_D1 stays as written (§0.3); this is its "applicable"
      case, now asked for.
    problem: >-
      Node cannot answer Windows' service manager by itself. A real service (in services.msc, running before anyone logs in, restarted by
      Windows on failure) needs a service wrapper: WinSW (MIT, the one Jenkins uses) or NSSM (public domain), a small .exe that runs as
      SYSTEM and starts COS's manager. That is a third-party binary with SYSTEM rights on his machine. The alternative with no new binary is
      a Task Scheduler task at startup as SYSTEM, with restart on failure: it behaves like a service but is not one, and is not listed in
      services.msc.
    coder_recommends: "WinSW, pinned to one release and checked against its SHA-256 on install, never committed. The COS app then becomes the service's window and tray: closing it never stops a system."

phases:

  CE1_close_and_minimize_are_his:
    layer: backend
    status: DONE 0.60.376 — test-cos-app-window CW-07; on Windows unverified until his run
    depends_on: []
    files: [cos/app/settings.js, cos/app/desktop/main.js, tests/modules/test-cos-app-window.test.js]
    does: "settings onClose: tray | quit (default tray) and onMinimize: taskbar | tray (default taskbar); main.js follows them; the tray menu and the cockpit's settings show both"
    proof: "settings round-trip and refusal of an unknown value; main.js reads both"

  CE2_updates_as_cos_routes:
    layer: backend
    status: DONE 0.60.376 — test-cos-updates CU-01..06
    depends_on: [CE_D0_per_system_reading]
    files: [cos/manager/updates.js (new), cos/manager/update-run.js (new), cos/manager/server.js, cos/manager/contract.json, lib/nexus-update.js, idearium/api/index.js, idearium/cli/route-commands.js, tests/modules/test-cos-updates.test.js (new)]
    does: >-
      GET /api/cos/updates → the check with each changed system named and its restart; POST /api/cos/updates/apply → apply, then each changed
      system restarted through the supervisor (Clear Glass never under him); POST /api/cos/updates/keep-local (CE3). The manager re-checks
      on the policy's schedule and broadcasts cos.update.available on its event stream. A command row: cos update.
    proof: "against a fixture repo: available, per-system list, apply restarts only the changed systems"

  CE2b_updates_restart_cos:
    status: "BUILT 0.60.417 — test-cos-updates CU-08..CU-12 (12/12; CU-11 restarts the real manager both ways); on Windows under NSSM and the COS exe unverified until his run"
    origin: >-
      Expanded from CE2 on 2026-11-06. James, 2026-11-06: "updates need to restart cos." Asked what restarts and what happens to Clear Glass
      (restarting COS's manager stops every system it runs): "the applicable system or module. as long as its done writting." · on Clear
      Glass: "Ask me first". Before this, an update that changed cos/ or lib/ only said "the next start of COS loads it" (CE2), and Clear
      Glass only "waits for you".
    readings_to_confirm:
      - "\"done writing\": the update has finished writing: its own process ended (git and npm install done) and git's index.lock is gone. The
         coder's reading; another is \"the system is not in the middle of writing its own data\"."
      - "\"system or module\": the system whose folder changed, as CE2 does; COS itself when cos/ or lib/ changed. Restarting a single module
         inside a running system (a hot reload) is not built: to confirm whether he meant it."
    depends_on: [CE2_updates_as_cos_routes, CA4_the_supervisor_as_a_windows_service]
    files: [cos/manager/updates.js, cos/manager/relaunch.js, cos/manager/server.js, cos/manager/contract.json, lib/nexus/autopilot.js, cos/ui/updates/page.js, cos/ui/updates/page.css, idearium/cli/route-commands.js, tests/modules/test-cos-updates.test.js]
    file_roles: "route: server.js; config: contract.json; ui: page.js, page.css; command: route-commands.js"
    does: >-
      After an update or a roll back has finished writing, each changed system restarts by itself (CE2, now after the write is checked done).
      What would close something under him is asked, never done: a change to COS (cos/ or lib/) asks "Restart COS now" (saying Clear Glass
      closes, when this COS runs it), and Clear Glass asks "Restart Clear Glass now"; each is kept as a pending ask (the Updates page, the
      bell) until he answers or a later update replaces it. POST /api/cos/update/restart { by: person, what: cos | <system> }, refused while
      an update is still writing. COS restarting itself: its systems stopped, then the manager exits with code 75 ("restart me"). Started by
      autopilot (the Windows service and the COS app both run lib/nexus/autopilot.js), autopilot starts the manager again and boots its
      systems, under the same pid NSSM and the COS app track. Started by hand (no autopilot), relaunch.js waits for the old process to end
      and its port to free, then starts the same command with --boot. A command row: cos restart <cos|system> (person-only).
    proof: "test-cos-updates CU-08..CU-10: a change to cos/ asks, never restarts by itself; restart refused while writing; a system restarts on yes; COS restarts and comes back on its port (relaunch); the Updates page shows the asks"

  CE3_keep_mine_and_update:
    layer: backend
    status: DONE 0.60.376 — test-nexus-update UP-14, test-cos-updates CU-04
    depends_on: [CE_D1_diverged_is_kept_never_lost]
    files: [lib/nexus-update.js, tests/modules/test-nexus-update.test.js]
    does: "nexus-update keepLocal({ root, confirm }): the branch, the data set aside, git reset --keep to origin; check() also says whether every local commit is already on GitHub (git cherry)"
    proof: "a fixture with one local commit: kept on local/<date>, the folder at origin's commit, the commit reachable from the branch"

  CE4_toasts_in_the_cockpit:
    layer: ui
    status: DONE 0.60.376 — test-cos-updates CU-07 (the card in Clear Glass); the Windows notification unverified until his run
    depends_on: [CE2_updates_as_cos_routes, CE3_keep_mine_and_update]
    files: [lib/ui/update-popup/update-popup.js, cos/ui/shell/index.html, cos/app/desktop/main.js, tests/modules/test-cos-updates.test.js]   # the existing popup (UP9) extended, not a second toast
    does: >-
      A toast in every cockpit page when an update is on GitHub: the version, his release lines, the systems it changes. Update now; Keep mine
      and update (when diverged); Later. After it lands, a toast per system that is waiting to restart, with Restart now. The COS app shows
      the same as a Windows notification while its window is hidden.
    proof: "driven in Clear Glass: the toast shows for a fixture update, Update now calls the route, a system's Restart now calls its route"

  CE5_cos_as_a_windows_service:
    layer: integration
    status: OPEN
    depends_on: [CE_D2_the_windows_service]
    files: [cos/app/service.js (new), cos/app/desktop/main.js]
    does: "install, uninstall, status of the COS manager as a Windows service (the wrapper his call chooses); the app attaches to the running service instead of starting its own manager"
    proof: "unverified until his run on Windows: services.msc lists it; logging off leaves the systems running"

  CE6_the_exe_carries_it:
    layer: integration
    status: DONE 0.60.377 (COS 0.4.0) — the cos-app workflow's own check (no change to the exe's files since its tag without a bump); on Windows unverified until his run
    depends_on: [CE1_close_and_minimize_are_his, CE4_toasts_in_the_cockpit]
    files: [cos/app/version.js]
    origin: '"Look cos 0.3.0" (James, 2026-11-02, after 0.60.376 was pushed). Read by the coder as: check COS 0.3.0, the exe he runs, against the new work — to confirm.'
    found: >-
      COS 0.3.0 (cos-v0.3.0, built from main at e4409e7f, setup downloaded twice, portable once) is his exe. 0.60.376 changed cos/app/desktop/main.js
      and cos/app/settings.js but left cos/app/version.js at 0.3.0. On merge, .github/workflows/cos-app.yml would fail ("already released, but the files
      its exe is built from changed"), and CE1 and CE4's Windows notification would never reach him. The Nexus-side work (the card, the routes, keep
      mine) reaches him through his folder's update; only the window's behaviour needs the new exe.
    does: "COS 0.4.0: the bump, so merging to main publishes cos-v0.4.0 (portable and setup, SHA256SUMS), which 0.3.0's own update check (app-update.js) announces"
    proof: "git diff cos-v0.3.0 HEAD -- cos/app names main.js and settings.js; the version is now untagged, so the workflow builds"

  # ── ADDENDUM 2026-11-02 — "Also where are the agent features. Also make it borderless." (CE7 built; the agents mapped as CE_D3, to him) ──
  CE7_borderless:
    layer: ui
    status: DONE 0.60.378 (COS 0.4.0, the same unreleased exe as CE6) — test-cos-app-window CW-08 and CW-08b (Clear Glass), test-cos-ui-theme; on Windows unverified until his run
    depends_on: [CE1_close_and_minimize_are_his, CE6_the_exe_carries_it]
    files: [cos/app/window.js, cos/app/settings.js, cos/app/desktop/main.js, cos/app/desktop/starting-preload.js, cos/app/desktop/starting.html, cos/ui/shell/page.css, cos/ui/shell/page.js, tests/modules/test-cos-app-window.test.js]
    origin: '"Also make it borderless." (James, 2026-11-02)'
    does: >-
      COS's window has no Windows frame or title bar. Windows still draws its own minimize, maximize and close over the top right
      (titleBarStyle hidden with titleBarOverlay), so snap layouts, double-click to maximize and Aero snap keep working, and close still
      follows his onClose. The cockpit's top bar is where the window is dragged (app-region), its buttons stay clickable, and ends before
      the three buttons; the room comes from the meters (numbers kept, bars drawn on wide windows) and the manager's pill (shortened, full text
      in its title), found by the first Clear Glass shot, where Go to spilled out of the bar. The preload marks the page (data-cos-frame) so the same cockpit in a browser is unchanged. settings.frame:
      none (the default) | windows, in the tray menu, on the next start of the window: the way back if borderless misbehaves on his machine.
    by: "his axioms, applied by the coder: §8.6 (Electron's own overlay, not hand-drawn buttons that lose snap), REVERSIBILITY (the setting), §1.2 (the menu says when it applies)"

decisions_addendum_2026_11_02:
  CE_D3_where_the_agents_are:
    status: "TO HIM: the direction (what COS shows of the agents first)"
    james: '"Also where are the agent features." (2026-11-02) · 2026-10-31 (MG_D17, recorded, never phased): "a full meta control panel, reploymet, cli interface for the round table, be able to address specific agents, oarchastration pipeline workflow and cli interface. like this needs to be fully, built, deploy agents to systems, have them do tasks, jobs, map them to each system like a drone."'
    found: >-
      COS's UI has no agent feature: only the proposals agents raise (Proposals, Overview's count). The agents live elsewhere: Idearium's
      repo agent (repo.agent.prompt, feed, stream, history, memory, tools, settings, gate: ~30 command rows) and its page agents (AC5);
      Copilot's agent suite and switch (/api/agent/suite, current, switch; /api/agents/capability); the round table (lib/roundtable.js, the
      roundtable agent tool) and the council (lib/agent-council.js) with no route of their own; orchestrator automation (AE3–AE4). His
      2026-10-31 vision for COS (MG_D17) was recorded and never turned into phases; AC1–AC3 (the agents' control panel in Idearium) are OPEN.
    coder_recommends: >-
      An Agents page in COS (its own .html, MG_D18) that reads through each system's routes, never their files (§5.9): first who the agents
      are and what each is doing now (Copilot's suite, Idearium's repo agents, the proposals), and address one agent with a prompt; then the
      round table with its CLI (it needs a route first, in its owning system); then deploying an agent to a system (MG_D17's drones).
