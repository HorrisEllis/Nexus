# Compartment downloads: magnet links caught, downloads quarantined, a verified torrent hand-off, kill on disconnect (2026-10-21)

origin: >-
  James, 2026-10-21: "add magnet link handling, download manage for the compartment. kill on disconnect."

Build contract: clear-glass/spec/compartment-downloads.spec (emerge module format, specDepth 1.0). Builds NP7, NP15 and NP16 of
docs/2026-10-15-clear-glass-network-posture-phasemap.spec for routed (Snowflake) windows.

## Ground truth (2026-10-21)

- A routed window is one in-memory compartment (cg-snow-<id>, SF3 0.60.178). Its downloads went through downloads/adapter.js to the
  normal Downloads folder: NP16's quarantine was mapped, not built.
- policy.js stores onFailure block | freeze | kill_tabs | kill_compartment per rule; only block is enforced (the PAC blackhole).
- Nothing in Clear Glass handles magnet: links. No torrent library is in the tree.
- His P2P rule (MR12, accepted 2026-10-15): peer traffic needs a proxy or VPN and fails closed; Snowflake/Tor carries browsing and
  metadata only. Tor carries TCP only, and the Tor Project asks that BitTorrent not go over it.

## Decisions

decisions:
  CD0_magnet_client:
    status: DECIDED
    question: Which torrent engine handles a magnet from a routed window?
    chosen: >-
      Decided by his axioms (§0.1 evidence: the client's proxy must be read, not assumed; MR12 fail closed). qBittorrent through its
      Web API, because its preferences can be read and verified before every hand-off. Any other client gets "copy the link", said.
      A built-in torrent engine is not built: it would put P2P inside Clear Glass with no proven path, against MR12.
  CD0_kill_default:
    status: DECIDED
    question: What does "kill on disconnect" do by default for routed windows?
    chosen: >-
      kill_tabs (the coder's reading of his words, to confirm): the windows close, their downloads are cancelled and their torrents
      stopped. kill_compartment (also wipe the transport and the quarantine) and block are his to choose in Settings → Network.

phases:

  CD1_magnet_parse:
    layer: foundation
    status: DONE 0.60.179
    depends_on: []
    files: [clear-glass/src/net/magnet.js]
    spec: clear-glass/spec/compartment-downloads.spec
    blocks: [MOD-CDL-MAGNET]
    does: "parse(link) → Magnet: btih (hex or base32), btmh, dn, xl, tr, ws. Pure."
    proof: test-compartment-downloads CDT-01

  CD2_quarantine_downloads:
    layer: library
    status: DONE 0.60.179
    depends_on: [CD1_magnet_parse]
    files: [clear-glass/src/net/quarantine.js]
    spec: clear-glass/spec/compartment-downloads.spec
    blocks: [MOD-CDL-QUARANTINE]
    does: "A routed window's downloads land in <userData>/net/quarantine/<id>/; release copies out with a hash check; discard archives."
    proof: test-compartment-downloads CDT-02

  CD3_verified_handoff:
    layer: library
    status: DONE 0.60.179
    depends_on: [CD0_magnet_client, CD1_magnet_parse]
    files: [clear-glass/src/net/qbittorrent.js]
    spec: clear-glass/spec/compartment-downloads.spec
    blocks: [MOD-CDL-QBIT]
    does: "qBittorrent's own preferences verified (non-Tor proxy for peers, or a bound interface) before every add; stop by hash."
    proof: test-compartment-downloads CDT-03 (a fake Web API; no live qBittorrent here)

  CD4_kill_on_disconnect:
    layer: integration
    status: DONE 0.60.179
    depends_on: [CD0_kill_default, CD2_quarantine_downloads, CD3_verified_handoff]
    files: [clear-glass/src/net/kill-switch.js, clear-glass/src/net/service.js]
    spec: clear-glass/spec/compartment-downloads.spec
    blocks: [MOD-CDL-KILL]
    does: "An unasked drop runs the rung: kill_tabs closes compartment windows, cancels downloads, stops torrents; kill_compartment also wipes."
    proof: test-compartment-downloads CDT-04

  CD5_surface:
    layer: surface
    status: DONE 0.60.179
    depends_on: [CD4_kill_on_disconnect]
    files: [clear-glass/src/main/index.js, clear-glass/src/ipc/bridge.js, idearium/cli/route-commands.js, lib/agent-tools/tools/clear-glass/net.js,
      clear-glass/renderer/settings/sections/network.js]
    spec: clear-glass/spec/compartment-downloads.spec
    blocks: [MOD-CDL-SURFACE]
    does: "Quarantine and magnet catch wired per compartment; kill switch armed; routes, net verbs, agent read; Settings rung and qBittorrent."
    proof: test-compartment-downloads CDT-05, CDT-06 (Settings in Clear Glass's engine)
