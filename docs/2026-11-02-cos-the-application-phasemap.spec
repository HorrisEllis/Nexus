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
    status: "OPEN — his reading to settle first (do not guess)"
    origin: "James, 2026-11-05: \"i was also thinking each compartment can have a different location inside of cos.\""
    depends_on: [CA6_install_asks_where_and_npm_in_program_files]
    files: []
    readings_to_confirm:
      - "(a) each compartment (system) can live in a folder of his choosing, anywhere on disk (another drive too); COS keeps where each one is and starts it from there"
      - "(b) each compartment has its own folder inside COS's root (<COS root>/<system>), and COS lets him move it"
      - "(c) both: a default folder inside COS, movable per compartment"
