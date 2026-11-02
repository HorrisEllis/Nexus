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
    status: "PROPOSED 2026-11-02 — his to choose: it opens his machine to the internet (a cost to know before it is paid)"
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

phases:
  CA1_clear_glass_to_the_tray:
    status: OPEN
    depends_on: []
    spec: clear-glass/spec/tray.spec
    blocks: [MOD-CGT-IDLE-TRAY]
    files: [clear-glass/src/main/idle-tray.js, clear-glass/src/main/index.js, clear-glass/src/options/store.js, clear-glass/renderer/settings/sections/general.js, clear-glass/assets/tray.png, tests/modules/test-cg-idle-tray.test.js]
    does: "a Clear Glass setting: minimize to the tray after N minutes with no input (off by default; 5, 15, 30, 60), restored from the tray; a page playing media or a macro running keeps it up"
    proof: "with a short period, the window goes to the tray after no input and comes back from the tray; a running macro keeps it up"
  CA2_remote_reach:
    status: "OPEN — waits on his choice in CA_D2"
    depends_on: [CA_D2_remote_reach]
    spec: "to be written once he chooses (CA_D2)"
    blocks: []
    files: [cos/services/anonymous, cos/manager, cos/ui]
    does: "the chosen reach, supervised by COS's manager as a compartment, on the cockpit's menu: on/off, who can connect, every connection on the ledger"
    proof: "from another network, his device reaches Nexus only after the handshake; with reach off nothing answers from outside"
