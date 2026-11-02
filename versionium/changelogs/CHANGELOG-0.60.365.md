# 0.60.365 — MG36 + MG37: COS is the application (COS 0.3.0)

James, 2026-11-02: "no i mean cos ui as the app. like a full orchastration application. since it's like vmware. not the old one. but maybe add the old one as an manual update feature. clearglass needs a setting for automatically minimizing to tray after a period of time. cos starts up with windows, minimizes to tray unless disabled. admin access and a service if applicable. also what about remote connections via ssh or ddns with a upnp, or can we invent our own upnp."

## The cockpit is the window (MG36)
- **The window is the cockpit.** The exe's window shows COS's cockpit (cos/ui on :7797: systems, ledger, proposals, resources) whenever it answers.
- **Before the cockpit answers,** a starting page shows what COS is waiting for, and offers Start Nexus and Versions & manual update. It covers four cases:
  - no folder linked;
  - linked but not started;
  - the start failed, and why;
  - starting.
- **The window switches by itself.** It checks every 2 s and turns into the cockpit the moment COS's manager answers.
- **The old page is kept** as **Versions & manual update**, in its own window, from the tray and from the starting page. It is where he links a folder, imports a release zip, switches and rolls back.
- **The cockpit's window is locked down.** It may show only the cockpit (127.0.0.1:7797) and the app's own files, and it gets a three-call bridge (why, open Versions, start) and no other power.

## COS starts with Windows (MG37)
- **Start COS with Windows** (on by default) uses an **elevated logon task**: one admin approval when it is set, and no prompt at each start after that.
  - If the approval is declined, COS falls back to the per-user login item and says it is not elevated.
- **Start in the tray** (on by default): a start at logon goes straight to the tray.
- **Admin rights at startup** is the third switch. All three are in the tray menu.
- **No Windows service.** A service runs in session 0 with no desktop, and COS and Clear Glass are windows. A service would only fit a part with no window, and none needs one yet. Decided by his axioms (CA_D1).

## Remote reach — mapped, his choice (CA_D2)
COS's `anonymous` service already holds engines that nothing wires up or supervises yet:
- UPnP;
- PCP/NAT-PMP;
- DDNS (Cloudflare, DuckDNS);
- SSH (the OS's own OpenSSH);
- tunnels (Cloudflare, ngrok).

There are two ways to use them:
- **Outbound only (recommended).** Nothing on his router is opened. His devices reach Nexus through an outbound tunnel. "Our own UPnP" in the form that works is COS's rendezvous: each device keeps an outbound connection, and a tiny rendezvous introduces them for a direct, hole-punched, encrypted link.
- **Inbound.** UPnP or PCP forwards a port, plus DDNS. This is simpler, and it is internet-facing.

UPnP itself cannot be reinvented: it is the router's protocol.

## Proof
- tests/modules/test-cos-app-window.test.js: 6/6, including the starting page in Clear Glass.
- cos-app build 8/8, ui 22/22, link 4/4.

**Unverified until it runs on his Windows machine:** the UAC approval, the logon task, and starting in the tray.
