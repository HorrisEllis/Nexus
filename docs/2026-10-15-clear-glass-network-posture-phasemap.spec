# docs/2026-10-15-clear-glass-network-posture-phasemap.spec
# Clear Glass network posture: protocol-specific proxy settings (global + per site), a Snowflake/Tor transport run in an isolated compartment,
# a leak test that gates everything, and magnet/P2P on top. MAPPED before building (docs/CLAUDE.md rule 1). Registered in docs/SPEC-REGISTRY.spec.
# Resolves MR12 of docs/2026-10-15-macro-node-recording-phasemap.spec. Nothing below is built.

origin:
  date: 2026-10-15
  james: >-
    "okay, add encrypted wrapper over snowflake, im talking protocol specific proxy settings, with settings for global connection settings, per site settings,
    but inprove thee encryption, maybe run it in a compartment isolated?"
  context: >-
    He was answering the coder's three questions (hotkeys, magnet/Snowflake, investment data). He took the coder's recommendations as written:
    hotkeys focused-only first; magnet handling that refuses to start without a proxy or VPN and fails closed on a leak test, Snowflake for browsing
    only; a hypothesis tracker with no price prediction and no advice. Then he added this.
  decisions_recorded:
    MR7_hotkeys_scope: "focused-only first (the coder's recommendation, accepted 2026-10-15)."
    MR12_p2p_scope: "option B (proxy/VPN required, fails closed) with C (Snowflake for browsing and metadata) as an optional mode (accepted 2026-10-15)."
    MR13_finance_field: "hypothesis tracker, out-of-sample scoring, no prediction, no advice (accepted 2026-10-15)."
  reading: >-
    The coder's reading (his to correct; to confirm). "Encrypted wrapper" and "improve the encryption" are read as: the path must be private end to end,
    and the transport must run walled off. They are NOT read as "invent a new cipher". Per-protocol means different rules for http, https, ws, ftp, DNS and
    torrent-peer traffic. "Compartment" is read as an isolated child process with its own data directory and no access to Nexus state.

axioms_consulted:
  - "§0.1/§1.1 evidence over memory: no 'protected' badge without a passing leak test run against the live path. -> NP5"
  - "§1.2 nothing fails silently: a proxy that drops means traffic stops, never falls back to direct. -> NP3"
  - "REVERSIBILITY / USER_AUTONOMY: every route is a setting he can see and change; defaults never route anything he did not choose. -> NP2"
  - "TRUTH_OVER_COHERENCE: the Settings page states what each mode does NOT hide. -> NP6"

coder_pushback_on_the_encryption_ask:
  said: >-
    Do not add a home-made encryption layer. The Snowflake path is already encrypted at every hop that matters: WebRTC (DTLS) to the Snowflake proxy,
    then Tor's own layered encryption across three relays, then TLS to the site. A custom wrapper on top adds no protection against any observer on that
    path, and a bug in it is a new way to leak. Custom crypto is the thing most likely to make this LESS safe.
  what_actually_improves_safety:
    - "Isolation (NP1): the transport runs in its own process and data directory; a bug in the browser or a page cannot read its keys or circuits."
    - "Authenticated local control: the control port is bound to loopback, uses a random cookie/password per start, and is never exposed to pages."
    - "No DNS leaks (NP3): name lookups go through the proxy (socks5h), never the OS resolver."
    - "No WebRTC IP leak (NP4): pages cannot learn the real address through WebRTC."
    - "Encrypted at rest (NP2): proxy credentials and per-site rules stored encrypted with the OS keystore (Electron safeStorage), not plain JSON."
    - "A layered chain only where it means something (NP2): user's own VPN/SOCKS first, then Snowflake/Tor, as two different operators. That is a real second layer."
  to_confirm: "Whether he wants any of this under the word 'encryption' differently; if he has a specific cipher/protocol in mind, he names it and the coder checks it against this threat model."

limits_stated_up_front:
  - "Tor carries TCP only. Torrent DHT, uTP and UDP trackers do not work over it. A torrent mode over Tor would be TCP-only, slow, and still hands your torrent client's identity to peers. Tor's own guidance is not to do it. NP7 therefore requires a VPN/SOCKS5 for P2P and treats Tor as unsupported for peer traffic."
  - "Snowflake hides that you use Tor from a network that blocks Tor. It does not hide your activity from the site, and it is not a VPN."
  - "Sites can still identify you by login, cookies and browser fingerprint. A proxy changes your address, not who you are to a site you sign in to."
  - "Needs the tor binary and the snowflake client. Neither is in this sandbox, and there is no Electron here: everything about the live path is unverified until run on his machine."

decisions:
  NP0_binaries:
    question: Bundle tor + snowflake-client with Clear Glass, or detect what is installed and guide him?
    coder_recommends: Detect first (path setting + version check). Bundling means shipping and updating a security-sensitive binary, signature-checked; do that only once the rest works.
    chosen: null
  NP0b_default_posture:
    coder_recommends: Everything starts DIRECT. Nothing is routed until he turns a rule on. No 'safe by default' claim.
    chosen: null

phases:
  NP1_compartment:
    status: OPEN
    files: [clear-glass/src/net/transport-host.js]
    does: >-
      Spawns the transport (tor with snowflake as its pluggable transport) as a child process: own data directory, loopback-only SOCKS and control ports on random
      ports, a fresh control password each start, killed with the app, no environment secrets, no access to Nexus data paths. Reports bootstrap progress and state.
    proof: "fake-binary test: starts, picks ports, passes a password, restarts on crash with backoff, is killed on quit, never binds a non-loopback address."
  NP2_policy_and_storage:
    status: OPEN
    files: [clear-glass/src/net/policy.js, clear-glass/src/net/vault.js]
    does: >-
      One pure table of routes: {match: protocol + host pattern, via: direct | socks5(host,port) | http(host,port) | transport | block, dns: proxy | os}.
      Global default plus per-site rules, first match wins, a visible 'why' for each decision. Optional chain (VPN/SOCKS then transport). Stored through safeStorage.
    proof: "table tests: protocol split (https via transport while ftp blocked), per-site override, no-match falls to the global default, secrets never in plain text on disk."
  NP3_apply_to_electron:
    status: OPEN
    files: [clear-glass/src/net/apply.js]
    does: >-
      Turns the policy into Electron session proxy config (per partition) using a generated PAC for per-site rules, socks5h so DNS goes through the proxy, and a
      fail-closed rule: if the chosen proxy is down, requests are blocked, never sent direct.
    proof: "PAC generation tested as pure text; fail-closed tested with a fake session. Real traffic unverified."
  NP4_webrtc:
    status: OPEN
    does: "Force WebRTC to the proxied/non-leaking policy for every page when any rule is active."
  NP5_leak_test:
    status: OPEN
    does: "A check that fetches the observed address through each active route and compares it with the direct address, checks DNS goes through the proxy, and checks WebRTC. A route is shown as Verified only with a passing, recent result."
  NP6_settings:
    status: OPEN
    files: [clear-glass/renderer/settings/sections/network.js]
    does: "Settings > Network: global connection, per-protocol rows, per-site rules, the compartment's state, the leak test, and a plain 'what this does not hide' panel."
  NP7_p2p:
    status: BLOCKED-ON-NP1-NP5
    does: "magnet: handler; engine only starts with a VPN/SOCKS5 route that passed the leak test; TCP/uTP policy per route; fails closed. Tor/Snowflake not offered for peer traffic."
  NP8_macro_hooks:
    status: OPEN
    does: "Macro and automation steps/conditions can read and set the route for a site (e.g. 'run this macro through the transport'), through the policy table only."
