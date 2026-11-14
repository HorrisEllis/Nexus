# docs/2026-11-02-cos-the-application-phasemap.spec — COS as the application: the cockpit is the window; it starts with Windows; Clear Glass
# to the tray; remote reach. The asks are James's; the readings, the cuts and the order are the coder's, decided by his axioms (cited).

origin: >-
  James, 2026-11-02, after COS 0.2.0 shipped with its old window (project cards, versions): "no i mean cos ui as the app. like a full
  orchastration application. since it's like vmware. not the old one. but maybe add the old one as an manual update feature. clearglass needs a
  setting for automatically minimizing to tray after a period of time. cos starts up with windows, minimizes to tray unless disabled. admin
  access and a service if applicable. also what about remote connections via ssh or ddns with a upnp, or can we invent our own upnp."

readings_to_confirm:
  - "\"cos ui as the app\": the exe's window IS COS's cockpit (cos/ui, the orchestration UI — systems, ledger, proposals, resources, the
     console as it grows, OC_D4), not the old project-cards page. The old page becomes one panel of it: Versions & manual update."
  - "\"a service if applicable\": read with the axioms below — what can be a Windows service is what has no window."

decisions:
  CA_D0_the_cockpit_is_the_window:
    status: "DECIDED 2026-11-02 (his)"
    chosen: >-
      The exe opens on COS's cockpit (cos/ui, served by COS's manager on :7797). While Nexus is starting, a small starting page says what it
      is waiting for; when the cockpit answers, the window is the cockpit. The old window (cos/app/desktop/ui) stays (§0.3) as the panel
      "Versions & manual update": link a folder, import a release zip, switch, roll back. The tray and Quit are unchanged.
    by_the_axioms: "§5.12 (the UI is a projection: the cockpit is the one UI of COS's state), §10.3 (one UI, not two competing ones), §0.3 (the old kept, as a panel)"
  CA_D1_with_windows_elevated_no_service:
    status: "DECIDED 2026-11-02 by his axioms (his ask; the mechanism the axioms')"
    chosen: >-
      COS starts with Windows by a scheduled task at logon (Task Scheduler, run with highest privileges): one admin approval when it is set up,
      no prompt at each start, admin rights for what needs them (the network switch and throttle, CP6e; process priority above normal). It
      starts minimized to the tray unless he unticks it. NOT a Windows service: a service runs in session 0 with no desktop, and Nexus's
      systems include windows (Clear Glass, COS's own) that cannot run there; a service is applicable only to a part with no window, and none
      needs it now (COS's manager is started by the app). Set and removed from COS's settings; the Run-key login item is the fallback when
      he declines admin (no elevation, said).
    by_the_axioms: "§0.0 (a service cannot show a window: said, not attempted), §4.3 (least privilege: elevated once, by him), §0.5 (no service until something needs one), USER_AUTONOMY (each one a setting he can turn off)"
  CA_D2_remote_reach:
    status: "DECIDED 2026-11-02 (his): both, gated behind settings"
    his_choice: >-
      James, 2026-11-02, asked outbound-only (recommended) or inbound (UPnP/PCP + DDNS + SSH): "both but extensive settings for all of this. Get
      this done as soon as possible to push." · "Gate behind settings to open. Make a full detailed settings for network." Both are built; every
      engine is OFF until he opens it in Network settings; nothing reaches outside without his switch (§4.3 still: keys only for SSH, TLS and
      the app password for anything inbound).
    was: "PROPOSED 2026-11-02 — his to choose: it opens his machine to the internet (a cost to know before it is paid)"
    found: >-
      COS already has it, unwired: cos/services/anonymous (its own kernel, nexus.js) with engines upnp (UPnP IGD port mapping), tunnel (direct
      → UPnP → PCP/NAT-PMP → Cloudflare Tunnel → ngrok, first that works), ddns (Cloudflare, DuckDNS), autodns, ssh (the OS's own OpenSSH,
      wrapped, never reimplemented) and sshkeys, with pages. Not supervised by COS's manager and not on its menu.
    options: >-
      (a) Outbound only (recommended by the coder): nothing on his router is opened. His devices reach Nexus through an outbound tunnel —
      WireGuard between his own devices, or Cloudflare Tunnel — authenticated end to end. "Our own UPnP" in the sense that works: COS's
      rendezvous — each of his devices keeps an outbound connection, and a tiny rendezvous (on a free host, or his phone) introduces them for a
      direct, hole-punched, encrypted link. No inbound port, no router support needed.
      (b) Inbound with UPnP/PCP + DDNS: the router forwards a port to the machine, a DDNS name points at it, SSH (keys only) and Nexus behind
      TLS and its app passwords. Simplest, but every open port is internet-facing attack surface.
      UPnP itself cannot be reinvented: it is the router's protocol, and the router decides; only the outbound designs need no router at all.
    by_the_axioms: "§4.3 (military-grade security: no open inbound port by default), §5.11 (every boundary a handshake: identity first), §8.6 (the anonymous service's engines reused, not rebuilt), §0.5"
  # moved here 2026-11-06 from where it was written (outside decisions:, so the DAG could not resolve it); content unchanged
  CA_D1b_the_supervisor_as_a_service:
    status: "DECIDED 2026-11-04 (his: \"run in service with admin privilages for more control and power\"); the split the axioms' (§0.0)"
    chosen: >-
      Nexus's headless part runs as the Windows service NexusCOS through NSSM (his named tool; a Node process cannot answer the service control
      manager by itself): LocalSystem, automatic at boot, restarted by NSSM if it dies, logs rotated. In it, COS's manager starts every system
      except the ones with a window (an Electron process, Clear Glass): those are said as "starts in your session" and the COS window starts them
      at logon. A tray switch turns the service off (removed, the app starts Nexus again as before). Needs nssm.exe (cos/bin/nssm.exe, NSSM_EXE, or
      PATH): without it, said with where to put it; nothing installed silently. CA_D1 is kept (§0.3): its logon task is still how the windows start.
    by_the_axioms: "USER_AUTONOMY (his call), §0.0 (session 0 has no desktop: said, designed around), §4.3 (admin by one approval, his), §5.9 (one system down — the service — breaks no window), §8.6 (NSSM and COS's supervisor reused)"

phases:
  CA1_clear_glass_to_the_tray:
    status: "DONE 0.60.366 — test-cg-idle-tray 3/3; the tray icon and the idle time on Windows unverified until his run"
    depends_on: []
    spec: clear-glass/spec/tray.spec
    blocks: [MOD-CGT-IDLE-TRAY]
    files: [clear-glass/src/main/idle-tray.js, clear-glass/src/main/index.js, clear-glass/src/options/store.js, clear-glass/renderer/settings/sections/general.js, clear-glass/assets/tray.png, tests/modules/test-cg-idle-tray.test.js]
    does: "a Clear Glass setting: minimize to the tray after N minutes with no input (off by default; 5, 15, 30, 60), restored from the tray; a page playing media or a macro running keeps it up"
    proof: "with a short period, the window goes to the tray after no input and comes back from the tray; a running macro keeps it up"
  CA3_network_settings:
    status: "DONE 0.60.379 — test-cos-network 5/5 (the page through the real cockpit in Clear Glass). The engines themselves (tunnel, rendezvous, mapping, DDNS, SSH) start behind the gate; wiring each to its settings is CA2"
    depends_on: [CA_D2_remote_reach]
    spec: cos/spec/network.spec
    blocks: [MOD-NET-SETTINGS, MOD-NET-ROUTES, MOD-NET-PAGE, MOD-NET-GATE]
    files: [cos/manager/network-settings.js, cos/manager/server.js, cos/manager/contract.json, cos/ui/network/index.html, cos/ui/network/page.js, cos/ui/network/page.css, cos/services/anonymous/nexus.js, idearium/cli/route-commands.js, tests/modules/test-cos-network.test.js]
    requires: [node 20+, COS's manager running for the page and rows]
    prerequisites: [CA_D2_remote_reach decided (his: both, gated)]
    does: >-
      James, 2026-11-02: "Gate behind settings to open. Make a full detailed settings for network." One NetworkSettings store owned by COS
      (every engine off by default): outbound — tunnel (provider, token, which systems), rendezvous (devices, keys); inbound — UPnP/PCP/NAT-PMP
      (ports, lease, which systems), DDNS (provider, domain, token, interval), SSH (port, keys only, allowed keys), TLS; and the per-compartment
      switch and throttle (CP6e). GET/PATCH /api/cos/network, rows `cos network`, the cockpit's Network page; each engine refuses to start
      unless its switch is on, said; every change in Versionium (secrets redacted).
    proof: "with every switch off nothing listens or connects outside; turning one on starts only that engine; the page shows and edits all of it"
  CA2_remote_reach:
    status: "OPEN — waits on his choice in CA_D2"
    depends_on: [CA_D2_remote_reach]
    spec: "to be written once he chooses (CA_D2)"
    blocks: []
    files: [cos/services/anonymous, cos/manager, cos/ui]
    does: "the chosen reach, supervised by COS's manager as a compartment, on the cockpit's menu: on/off, who can connect, every connection on the ledger"
    proof: "from another network, his device reaches Nexus only after the handshake; with reach off nothing answers from outside"

# ── ADDENDUM 2026-11-04 — his decision: a Windows service, with admin rights; supersedes CA_D1's "no service" for the part that has no window ──
# James, 2026-11-04, uploading NSSM.zip (his NSM v2 and the NSSM install notes, written for the old bridge on :3747): "build that for clearglass
# then make sure cos.exe is completely borderless. also run on startup with an option to disable. run in service with admin privilages for more
# control and power.  maybe move the system to the cos folder."
# Grounded (the coder, 2026-11-04, against main 0.60.388):
#   - Already in COS 0.4.0 (cos-v0.4.0, CE7, MG37): borderless by default (Windows' own min/max/close over the top right; "With Windows' frame"
#     the way back), start with Windows (default on, a tray switch), admin rights at startup (one approval, a tray switch).
#   - His NSM v2 is COS's supervisor already, rule for rule (backoff 1 s→30 s, a circuit after 6 crashes in 5 min, phases gated on health, a
#     ledger): reused, not rebuilt. What it has that COS has not: running as a real Windows service (before logon, through logoff, LocalSystem),
#     and restarting a process that is up but unhealthy. Its bridge/:3747 targets are gone. Kept in _archive/2026-11-04-nsm-upload (§0.3).
#   - A Windows service runs in session 0 with no desktop (§0.0): Clear Glass and the COS window cannot run there. So the service is the part with
#     no window (Nexus started headless: autopilot → COS's manager → the headless systems), and the windows stay with the logon task in his session.
decisions_addendum_2026_11_04:
phases_addendum_2026_11_04:
  CA4_the_supervisor_as_a_windows_service:
    status: "BUILT 0.60.389 (COS 0.5.0) — test-cos-service 7/7; the service on Windows unverified until his run (no Windows here)"
    depends_on: [CA_D1b_the_supervisor_as_a_service, MG37_starts_with_windows]
    files: [cos/app/service.js, cos/app/desktop-systems.js, cos/app/controller.js, cos/app/settings.js, cos/app/desktop/main.js, cos/app/version.js, cos/manager/supervisor.js, scripts/build-cos-app.js, tests/modules/test-cos-service.test.js]
    does: >-
      cos/app/service.js: find nssm.exe; the commands that install NexusCOS (node + the linked folder's lib/nexus/autopilot.js, COS_SERVICE=1, its
      folder, logs rotated at 10 MB, restart after 2 s, SERVICE_AUTO_START, LocalSystem) and remove it; run them with one admin approval; read its
      status. Setting runAsService (a tray switch). COS's supervisor under COS_SERVICE=1 leaves a windowed process unstarted and says why. The COS
      window, when the service holds Nexus, starts the windowed systems itself in his session.
    proof: "test-cos-service: the install and remove commands exactly; nssm found or said missing; status read; the supervisor leaves Clear Glass to
      the session under COS_SERVICE=1 and starts it otherwise. On Windows: unverified until his run (said)."

# ── ADDENDUM 2026-11-04 (b) — his: COS installs Nexus from GitHub itself ─────────────────────────────────────────────────────────────
# James, 2026-11-04, with COS 0.5.0 open on "no Nexus folder is linked yet": "okay. what is this ? where is the cos ui ? also, have it pull from the
# git. it should be installing the cos ui. this is redundant garbage." · "i know i downloaded it. this is what i get."
phases_addendum_2026_11_04_b:
  CA5_cos_installs_nexus_from_github:
    status: "BUILT 0.60.390 (COS 0.6.0) — test-cos-install 6/6; on Windows unverified until his run"
    depends_on: [MG35_the_exe_starts_nexus, MG36_the_cockpit_is_the_window]
    files: [cos/app/install.js, cos/app/controller.js, cos/app/window.js, cos/app/settings.js, cos/app/desktop/main.js, cos/app/desktop/starting.html, cos/app/desktop/starting-preload.js, cos/app/version.js, scripts/build-cos-app.js, tests/modules/test-cos-install.test.js]
    does: >-
      Nothing linked on first launch: COS installs Nexus into <COS root>/nexus — git clone (partial) when git is on the machine, else the latest
      release's nexus-<version>.zip — then npm install, links it, sets it to start with COS and starts it, so the window becomes the cockpit.
      Each step on the starting page; a failure stops with its reason and an Install Nexus button; nothing half-done is linked. autoInstall
      (default on) is his switch; linking his own folder still works (Versions & manual update).
    proof: "test-cos-install: the clone and npm commands exactly, a clone pulled, the release-zip path, a failure stopping with its reason, the
      controller linking and starting, the starting page's states"
  CA6_install_asks_where_and_npm_in_program_files:
    status: "BUILT 0.60.391 (COS 0.7.0) — test-cos-install IN-07..IN-09; on Windows unverified until his run"
    origin: >-
      James, 2026-11-05, with COS 0.6.0 open on "installing Nexus's dependencies (npm install …) failed (exit 1): 'C:\\Program' is not
      recognized as an internal or external command, operable program or batch file.": "needs to ask for install location also. i was also
      thinking each compartment can have a different location inside of cos."
    depends_on: [CA5_cos_installs_nexus_from_github]
    files: [cos/app/install.js, cos/app/controller.js, cos/app/settings.js, cos/app/desktop/main.js, cos/app/version.js, tests/modules/test-cos-install.test.js]
    does: >-
      (1) The root cause of his screen: npm on Windows is npm.cmd under C:\\Program Files\\nodejs; a .cmd needs cmd.exe, and spawn with
      shell:true joined the path unquoted, so cmd split it at the space. Now a .cmd runs as cmd.exe /d /s /c ""<path>" args" with verbatim
      arguments (install.js spawnSpec), every part with a space quoted. (2) Every install asks where (a folder dialog, the last place chosen or
      <COS root> preselected); Nexus goes into <chosen>/nexus unless the chosen folder is already named nexus or is empty. Cancelling installs
      nothing and says so. The place is kept in the setting installDir.
    proof: "IN-07 a .cmd under Program Files is quoted for cmd.exe; IN-08 the folder rule (nexus/empty/else <chosen>/nexus); IN-09 installDir
      kept, cancel installs nothing"
  CA7_each_compartment_its_own_location:
    status: OPEN   # reading settled 2026-11-13 (his): (c)
    status_previous: "OPEN — his reading to settle first (do not guess)"
    decided: '2026-11-13, his: asked "what does each system get a location for", with "Whole system: default + movable" as the second option: "second one, can be moved anbd changed in each systems individual settings." Reading (c): each system, code and data, lives in a folder inside COS by default; it can be moved and changed from that system own settings.' 
    origin: "James, 2026-11-05: \"i was also thinking each compartment can have a different location inside of cos.\""
    depends_on: [CA6_install_asks_where_and_npm_in_program_files]
    files: []
    readings_to_confirm:
      - "(a) each compartment (system) can live in a folder of his choosing, anywhere on disk (another drive too); COS keeps where each one is and starts it from there"
      - "(b) each compartment has its own folder inside COS's root (<COS root>/<system>), and COS lets him move it"
      - "(c) both: a default folder inside COS, movable per compartment"

    expanded_2026_11_13: >-
      Read from the code: every system today lives inside the Nexus folder, which lives inside COS (COS root/projects/nexus/versions/<v>, its
      data in projects/nexus/data, COSA1): the default is already inside COS. What stops a system from being MOVED is measured, not guessed:
      its code reaches into other systems by relative path (lib/system-boundary.js counts 396 crossings, 2026-11-13) and shared code in lib/
      (SW7), and its data is found through the root data/ in 50 files (SW4). A system moved before those are gone stops working. So: each
      system's settings show its location and its size now; Move is offered for a system whose crossings in and out are zero and whose data
      resolves through its own folder, and for every other one it says what still holds it there (the counts, by name). As SW4, SW6 and SW7
      land, more systems can move, with no change here.
    slices:
      a: "each system's location, size and whether it can move (and why not): GET /api/cos/systems/:name/location; `location <system>` in COS's console; its own settings page shows it"
      b: "the move: copied, checked, the supervisor's declaration pointed at the new folder, started from there; the old folder kept as a note of where it went (§0.3); refused while it cannot move, with why"
      c: "the wizard's storage step (CA8) shows the same for every system"
    depends_on_for_b: [SW4_own_data_by_default, SW6_the_drawbridge_the_only_way_in, SW7_lib_goes_home]
  CA8_first_time_setup:
    status: OPEN
    depends_on: [CA5_cos_installs_nexus_from_github, CA6_install_asks_where_and_npm_in_program_files, CA7_each_compartment_its_own_location]
    james: '"can you finish cos ui? should be a first time setup wizard, storage location of each system/nexus, etc" (2026-11-13)'
    files: [cos/app/desktop/main.js, cos/app/desktop/ui/app.js, cos/app/desktop/ui/index.html, cos/app/desktop/ui/style.css, cos/app/settings.js, cos/manager/server.js, cos/manager/cli.js, cos/manager/contract.json, cos/ui/settings]
    does: >-
      The first time COS opens, a setup in steps, in COS's own window (it must run before Nexus exists, so it is the exe's, not the cockpit's),
      each step skippable and every answer changeable later in Settings: (1) Nexus: install from GitHub, link a folder he has, or import a
      zip, and where (CA5, CA6: today a bare folder dialog); (2) where things live: COS's root, Nexus's data folder, and each system's
      location (CA7 slice a), with sizes and free space; (3) start: with Windows, in the tray, as a Windows service (SC7, CA4); (4) agents:
      Ollama found or not, its models, which one builds first (EMB2), Clear Glass's sign-ins named as his to do; (5) resources: the heavy-work
      line and the memory floors (CP6a); (6) review, then apply, each act said. Kept: what was chosen and when (cos/app/settings.js); a
      setup already done is not shown again unless asked (Settings › Run setup again).
    order: "backend (the answers kept, each step's apply) → route → command → UI, step by step; step 2 waits on CA7 slice a"
    proof: "on a fresh COS root: the setup shows; each step's answer applied and read back; skipped steps keep the defaults; a second start does not show it; Settings re-opens it; in the COS window"
# ── ADDENDUM 2026-11-13 (0.60.525) — CA7 slice a built; the move and CA8 pinned (his) ──
# James, 2026-11-13: "okay, just make it so nexus can be anywhere." then "put a pin in the can be moved anywhere. need the pipeline building all of
# my requests." Built: cos/sovereign/location.eg, GET /api/cos/locations, GET /api/cos/systems/:name/location, `location [system]`. Pinned: CA7 b
# (the move; his last reading: Nexus as a whole anywhere, not each system) and CA8 (the first-time setup), until he picks them up.
# ── ADDENDUM 2026-11-13 (0.60.528, COS 0.9.0; numbered 0.60.516 on its branch, and its phase CA8, renamed CA9 at the merge 2026-11-14: main had a different CA8, the first-time setup) — his: the service host built from scratch, no nssm.exe ─────────────────────────────────────
# James, 2026-11-13, told the service switch needs nssm.exe, which is not on his machine and not in his NSSM.zip (that is his NSM v2): "need to build it from scratch."
# Earlier the same day, pointing at NSSM.zip: "might need to add or integrate into the superviser. also look at emerge the latest commit, can be used for cos more"
# Found on his machine: COS 0.8.0's switch answers "nssm.exe was not found"; no nssm.exe in NSSM_EXE, beside COS or on PATH. Emerge's native
# binary (0.60.512, process control) is a Linux ELF: it cannot answer Windows' service control manager today, so the host cannot be Emerge yet.
decisions_addendum_2026_11_13:
  CA_D9_the_host_is_csharp_built_by_windows_own_compiler:
    chosen: >-
      Decided by his axioms (the coder applies them): the host is one C# file built by csc.exe, the compiler every Windows 10/11 carries with
      .NET Framework 4.x. Options weighed: (a) nssm.exe downloaded or bundled (not "from scratch", a third party's binary); (b) Emerge (no
      Windows target: a whole compiler back end first); (c) a boot task as SYSTEM in Task Scheduler (no new program, but not a service: not in
      services.msc, no stop/start contract); (d) C# with the in-box compiler (a real service, nothing to download, builds on his machine and on
      the CI's Windows runner, runs with nothing installed). (d).
    by_the_axioms: "§17.13 (non-Emerge code named by the project: his 'build it from scratch'), §17.4 (reproducible from an empty machine: the compiler is Windows' own), §0.5 (one file, 19 KB), §5.14 (service.js keeps the NSSM way behind the same contract: either satisfies it), §0.3 (NSSM's path kept)"
    to_move_later: "when Emerge has a Windows target, the host's loop (start, wait, restart, health) is Emerge's proc_* primitives; the SCM handshake stays native"
phases_addendum_2026_11_13:
  CA9_cos_own_service_host:
    status: "BUILT 0.60.528 (COS 0.9.0; 0.60.516 on its branch) — test-cos-service 11/11 on his machine (SV-08..SV-11; SV-11 runs the built exe). The service itself installed on Windows: unverified until his switch (it needs his admin approval)"
    origin: "James, 2026-11-13, told the service switch needs nssm.exe, which is not on his machine and not in his NSSM.zip (that is his NSM v2): \"need to build it from scratch.\""
    depends_on: [CA4_the_supervisor_as_a_windows_service]
    spec: cos/spec/cos-console.spec
    files: [cos/app/service-host/cos-svc.cs, cos/app/service-host/build.cmd, cos/app/bin/cos-svc.exe, cos/app/bin/cos-svc.exe.sha256, cos/app/service.js, cos/app/window.js, cos/app/desktop/main.js, cos/app/version.js, scripts/build-cos-app.js, tests/modules/test-cos-service.test.js]
    requires: ["Windows 10/11 with .NET Framework 4.x (in-box)", "one admin approval to install or remove the service"]
    expanded_2026_11_14: >-
      James, 2026-11-14, after his COS app (older than 0.9.0) said "nssm.exe was not found": "need to create nssm.exe" · sharing his NSM v2
      (NSSM.7z): "use this and create a exe and build it into cos" · asked A/B/C: "a. im not attached to it. do what ever. write it in emerge if
      possible." Decided by the axioms (§8.6 reuse before build, §17.13 Emerge first, §1.2 said): no second exe. cos-svc.exe already is the nssm.exe
      replacement and answers Windows' Service Control Manager, which Node (and so an nsm.exe from NSM v2) cannot; Emerge cannot build a Windows exe
      yet (native_windows, E2). His NSM v2 is kept whole in _archive/2026-11-14-nsm-v2-upload/. Its remaining inventions go to COS's supervisor, in
      Emerge, as their own slice once E2 lands: start order by dependency (after:), a JSONL metrics stream per service, profiles, secrets masked
      in logs, drain in reverse dependency order. What he needs now: COS 0.9.0 (release cos-v0.9.0), whose switch uses cos-svc.exe.
    does: >-
      cos-svc.exe (cos/app/service-host/cos-svc.cs): install <config> creates NexusCOS (auto start, LocalSystem) running itself with that config;
      start, stop, remove, status (in NSSM's words, so service.js reads either); run is what Windows starts; console runs the same loop in a
      terminal. The loop: node + autopilot with COS_SERVICE=1, output to service.log and service-error.log rotated at 10 MB, started again when
      it exits (2 s, doubling to 30 s, back to 2 s after a minute up) and, his NSM v2's rule, when it is up but its health URL has not answered
      three checks in a row (after a two-minute grace). Stop ends the whole process tree. service.js: findHost, hostConfig (the one JSON file,
      written to <folder>/data/cos-service/service.json), hostInstallCommands, hostRemoveCommands; apply uses the host first and nssm.exe only
      when the host is missing. The exe ships inside COS (scripts/build-cos-app.js FILES). The switch's words no longer ask for nssm.exe.
    proof: "SV-08 the config and the commands exactly; SV-09 apply prefers the host, writes its config, removes through it, falls back to nssm, says when neither; SV-10 the exe matches its SHA256 and is in the exe's file list; SV-11 (Windows) the built exe starts a process with its env and arguments, logs it, restarts it at 200, 400, 800 ms, ends it on stop, and says a missing service"
    not_built: "the first-run wizard and where Nexus installs (his, the same day): its own phase, to write"

  CA10_cos_updates_itself:
    status: OPEN
    origin: "James, 2026-11-14, told the COS app only says a newer COS is out and he installs it by hand (cos/app/app-update.js: \"it downloads nothing and replaces nothing\"): \"so this cant use the update tool?\" · offered COS updating itself from Settings › Update: \"yes.\""
    depends_on: [CA9_cos_own_service_host]
    spec: cos/spec/cos-console.spec
    files: [cos/app/app-update.js, cos/app/controller.js, cos/app/desktop/main.js, cos/app/desktop/starting-preload.js, cos/app/version.js, cos/ui/updates/index.html, cos/ui/updates/page.js, tests/modules/test-cos-app-self-update.test.js]
    requires: ["Windows (the installer is a Windows NSIS setup)", "the release reachable: public, or his GitHub sign-in kept by git's credential helper"]
    does: >-
      COS updates itself from Settings › Update, beside Nexus. The window's door gains appCheck and appInstall (the cockpit page reaches only those).
      appInstall: the newest cos-v release's COS-<v>-setup.exe and SHA256SUMS are downloaded into COS's own folder (cos-updates/<v>/); the setup's
      SHA-256 must equal its line in SHA256SUMS, else nothing runs and the files are removed; the setup runs silently (/S), COS closes, the new
      one starts on the same Nexus folder; the last installer is kept for a roll back. A private repo: the download uses the GitHub sign-in git
      already keeps (git credential fill, no prompt), so one sign-in serves both updates; none found is said with the fix.
    by_the_axioms: "§8.6 (checkApp's release list reused; git's own credential store reused, no second login), §1.2 (a mismatch, no sign-in, not Windows: each said), REVERSIBILITY (the previous installer kept), §5.15 (the app updates itself; the cockpit page asks through the window's door only)"
    proof: "a stub release: the checksum matches → the setup is run with /S and COS asks to close; a mismatch → nothing runs, the files are gone, said; not Windows → refused, said; a private release → the token from git credential fill is sent"

# ── ADDENDUM 2026-11-13 (map only, merged 2026-11-14) — CA8 expanded: his second ask for the wizard, from his own PC, with what was found there ──
# James, 2026-11-13 (a local session on his PC, after the ask CA8 quotes): "and can we that feature to the install for cos, like when downloading
# it, asks where nexus should install to. my c drive is almost full.  cos have a full first time run wizard."
# Found on his PC the same day: C: 0.6 GB free of 222 GB, D: 3,001 GB free; COS's installDir is D:\Backups\Downloads\nexus-0.60.356 (chosen in
# CA6's dialog); a second Nexus checkout sat under C:\Users\...\AppData\Local\COS\nexus (0.4 GB) that COS did not run. Expands CA8's steps 1 and 2:
#   - the place step shows each drive with its free space, warns on a nearly full one, and never preselects C: when another drive has more room;
#   - it says which folder COS actually runs, and names any other Nexus checkout it finds, so two are not mistaken for one (what happened that day:
#     the checkout on C: was updated while the one COS ran, on D:, stayed on 0.60.391).
# Reading his (CA8_R1): "when downloading it" — (a) the COS setup exe asks where Nexus goes, before COS opens; (b) COS's first launch asks, in
# the wizard (what CA8 describes); (c) both. CA8 stays pinned until he picks it up (0.60.525's addendum).
