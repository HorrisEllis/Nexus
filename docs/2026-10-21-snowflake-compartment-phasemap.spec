# Snowflake working end to end: the page inside the compartment, a real bridge line, optional HTTPS-only, a circuit check, an ordinary-looking window (2026-10-21)

origin: >-
  James, 2026-10-21 (with a screenshot of Settings → Network: tor found, snowflake found, "Not detected on PATH", toast "set a Snowflake
  bridge line first"): "can you get snowflake working. connected to the compartment? optional encryption. Can you look in domains of
  cyber security and all technololgy. find any way to improve snowflake plugin, and make it look as nromal as it can."

Build contract: clear-glass/spec/snowflake.spec (emerge module format, specDepth 1.0). Each phase names `spec:` and the module it builds.
Extends docs/2026-10-15-clear-glass-network-posture-phasemap.spec: SF3 is NP4 (WebRTC) for routed windows, SF5 is a step toward NP5
(a circuit check, not the leak test), SF4 is the reading of "optional encryption" below; NP19 (encrypted container) stays open.

## Ground truth (2026-10-21, read in the source before mapping)

- Settings → Network read `det.torPath`, `det.snowflakePath` and `s.bridgeLine`. The backend sends `detect.tor`, `detect.snowflake`
  and `detect.bridgeLine`. So a found tor showed "Not detected on PATH", and Start refused with "set a Snowflake bridge line first"
  even with a line stored. That is his screenshot.
- The page of every agent window loads in a `<webview>` with no `partition` attribute, which in Electron means the app's DEFAULT
  session (main/index.js §0.39.265 says so). The Snowflake route was applied to `persist:agent-snow-<id>`, the window shell's
  session, so the page itself went direct. This is why "connected to the compartment" was not true.
- Each Snowflake window got a new on-disk partition (`persist:`), never removed, and a random Firefox persona. Over Tor, a Firefox UA
  on a Chromium TLS handshake is a mismatch that stands out.
- A bridge line came only from the installer's own downloaded bundle; a system or Tor Browser install of tor gave none.
- WebRTC was not restricted for routed windows (NP4 open): STUN over UDP can bypass a proxy.
- Electron keeps one onBeforeRequest listener per session; plugins/webrequest-adapter.js owns it for content filters.

## Readings (to confirm)

- "connected to the compartment": his 2026-10-15 "compartment" is the isolated transport (NP1). Read as: what Snowflake opens must
  really go through it, page and all.
- "optional encryption": an HTTPS-only switch for Snowflake windows, on by default, his to turn off. It encrypts end to end past the
  Tor exit relay, which is the one place on this path where traffic can be read in the clear. No home-made cipher (the 2026-10-15
  pushback stands). The encrypted at-rest container is NP19, still open.
- "make it look as normal as it can": the window's traffic looks like an ordinary Chromium. It has one consistent identity: the
  engine's own UA without the Electron and app tokens, with its own client hints and no persona disagreeing with the TLS handshake.
  The Settings page tells the plain truth.

phases:

  SF2_bridge_sources:
    layer: library
    status: DONE 0.60.178
    depends_on: []
    files: [clear-glass/src/net/bridge-sources.js]
    spec: clear-glass/spec/snowflake.spec
    blocks: [MOD-SF-BRIDGE-SOURCES]
    does: >-
      Real bridge lines from named sources: Tor Browser's pt_config.json, the installed bundle, the Debian snowflake-client example
      torrc; the Tor Project's builtin list only when he asks. Tor Browser's own tor and transport programs found too.
    proof: test-snowflake SFW-02, SFW-03

  SF1_honest_detection:
    layer: library
    status: DONE 0.60.178
    depends_on: [SF2_bridge_sources]
    files: [clear-glass/src/net/transport-host.js, clear-glass/src/net/service.js]
    spec: clear-glass/spec/snowflake.spec
    blocks: [MOD-SF-DETECT]
    does: >-
      detect() returns the Detection schema (where each program came from; snowflake-client, snowflake or lyrebird; Tor Browser);
      status() carries bridgeLine 'set'|null and httpsOnly.
    proof: test-snowflake SFW-01

  SF4_https_only:
    layer: library
    status: DONE 0.60.178
    depends_on: []
    files: [clear-glass/src/net/https-only.js, clear-glass/src/plugins/webrequest-adapter.js]
    spec: clear-glass/spec/snowflake.spec
    blocks: [MOD-SF-HTTPS-ONLY]
    does: >-
      decide() upgrades http frames and cancels http subresources; attach() composes with the content-filter listener through
      ses.__cgPreRequest instead of replacing it.
    proof: test-snowflake SFW-04

  SF3_page_in_the_compartment:
    layer: integration
    status: DONE 0.60.178
    depends_on: [SF1_honest_detection, SF4_https_only]
    files: [clear-glass/src/net/compartment.js, clear-glass/src/contexts/manager.js, clear-glass/src/main/index.js, clear-glass/renderer/browser.js]
    spec: clear-glass/spec/snowflake.spec
    blocks: [MOD-SF-COMPARTMENT]
    does: >-
      A via window: in-memory partition cg-snow-<id> for shell AND page, clean engine UA, WebRTC disable_non_proxied_udp on every
      contents of it, HTTPS-only attached, cleared on close. Windows without via are untouched.
    proof: test-snowflake SFW-05; live run on his machine (Electron is not in this sandbox)

  SF5_circuit_check:
    layer: integration
    status: DONE 0.60.178
    depends_on: [SF1_honest_detection]
    files: [clear-glass/src/net/service.js, clear-glass/src/ipc/bridge.js]
    spec: clear-glass/spec/snowflake.spec
    blocks: [MOD-SF-CIRCUIT-CHECK]
    does: >-
      checkCircuit() asks check.torproject.org/api/ip through a session whose only route is the transport; the answer is kept in
      status(). Not the leak test.
    proof: test-snowflake SFW-06

  SF6_surface:
    layer: surface
    status: DONE 0.60.178
    depends_on: [SF1_honest_detection, SF2_bridge_sources, SF3_page_in_the_compartment, SF4_https_only, SF5_circuit_check]
    files: [clear-glass/src/ipc/bridge.js, clear-glass/renderer/settings/sections/network.js, idearium/cli/route-commands.js,
      lib/agent-tools/tools/clear-glass/net.js]
    spec: clear-glass/spec/snowflake.spec
    blocks: [MOD-SF-SURFACE]
    does: >-
      Routes, `net` verbs (bridges, builtin, use, https-only, check), agent read scope (bridges, check), and Settings → Network:
      real program paths, Find bridge line, Ask the Tor Project (opt-in, said), HTTPS-only switch, Check the circuit.
    proof: test-snowflake SFW-07 (field names pinned), SFW-08 (the page driven in Clear Glass's engine against a stub bridge)

## Addendum 2026-10-21 (0.60.180): the bridge set up automatically

James, 2026-10-21 (with a screenshot of Settings → Network asking for a bridge line): "need to have the bridge setup automatically."
This supersedes the coder's 0.60.178 call that asking the Tor Project is only ever his button (SF-007, kept and marked superseded in the spec):
with no line on this machine, Start now asks the Tor Project's builtin list itself, and the page says it does.

  SF7_bridge_automatic:
    layer: integration
    status: DONE 0.60.180
    depends_on: [SF2_bridge_sources, SF6_surface]
    files: [clear-glass/src/net/service.js, clear-glass/src/ipc/bridge.js, clear-glass/renderer/settings/sections/network.js]
    spec: clear-glass/spec/snowflake.spec
    blocks: [MOD-SF-AUTO-BRIDGE]
    does: "ensureBridge before every start: a hand-set line kept; else the first local line; else the Tor Project's builtin; source recorded and shown. Network leads with one status card; manual fields under Advanced."
    proof: test-snowflake SFW-09, SFW-10 (Settings → Network in Clear Glass)


## Addendum 2026-10-21 (0.60.184): host lists through Snowflake

James, 2026-10-21: "you'll be able to import folders and host lists. Same with the Snowflake plugin." Reading, to confirm: a host list (or a
folder of them) = the sites that always go through Snowflake, as origin rules in the one routing table (the policy's collision rule kept).

  SF8_host_import:
    layer: integration
    status: DONE 0.60.184
    depends_on: [SF6_surface, BS16_import_fields]
    files: [clear-glass/src/net/host-import.js, clear-glass/plugins/snowflake/index.js, clear-glass/plugins/snowflake/manifest.json, clear-glass/src/ipc/bridge.js, idearium/cli/route-commands.js, clear-glass/renderer/settings/sections/network.js]
    spec: clear-glass/spec/snowflake.spec
    blocks: [MOD-SF-HOST-IMPORT]
    does: "hostsOf + importHosts (origin rules via transport, tagged by list, collisions skipped and named); the Snowflake plugin's page; /cli/net/routes/import and /lists; net import (person-only); Settings → Network Import host list…"
    proof: test-snowflake SFW-11

## Addendum 2026-10-21 (0.60.185): Reinstall while tor is running

His screenshot: "Reinstall / update" → EPERM on the bundle folder, the transport stuck at "Connecting… 0%".

  SF9_install_in_use:
    layer: library
    status: DONE 0.60.185
    depends_on: [SF7_bridge_automatic]
    files: [clear-glass/src/net/installer.js]
    spec: clear-glass/spec/snowflake.spec
    blocks: [MOD-SF-INSTALL-IN-USE]
    does: "A bundle folder in use is left in place; the new install goes beside it and the record points there; the old is pruned when free."
    proof: test-snowflake SFW-12
