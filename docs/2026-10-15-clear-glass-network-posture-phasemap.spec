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
    status: PARTIAL-BUILT-0.60.60
    built_note: "process isolation, loopback ports, cookie auth, empty env, backoff, wipe. Fake-tor tests only; real tor and snowflake-client unverified."
    files: [clear-glass/src/net/transport-host.js]
    does: >-
      Spawns the transport (tor with snowflake as its pluggable transport) as a child process: own data directory, loopback-only SOCKS and control ports on random
      ports, a fresh control password each start, killed with the app, no environment secrets, no access to Nexus data paths. Reports bootstrap progress and state.
    proof: "fake-binary test: starts, picks ports, passes a password, restarts on crash with backoff, is killed on quit, never binds a non-loopback address."
  NP2_policy_and_storage:
    status: PARTIAL-BUILT-0.60.60
    built_note: "policy table, precedence, collisions refused, PAC. Stored in plain options, NOT encrypted; needs NP19."
    files: [clear-glass/src/net/policy.js, clear-glass/src/net/vault.js]
    does: >-
      One pure table of routes: {match: protocol + host pattern, via: direct | socks5(host,port) | http(host,port) | transport | block, dns: proxy | os}.
      Global default plus per-site rules, first match wins, a visible 'why' for each decision. Optional chain (VPN/SOCKS then transport). Stored through safeStorage.
    proof: "table tests: protocol split (https via transport while ftp blocked), per-site override, no-match falls to the global default, secrets never in plain text on disk."
  NP3_apply_to_electron:
    status: PARTIAL-BUILT-0.60.60
    built_note: "PAC per registered session, fail closed. Only agent windows are registered; provider and login windows not yet. Unverified in Electron."
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

# ═══ ADDENDUM 2026-10-15 (b) — scope, incognito, plugin split, macros (MAPPED, nothing below is built) ═══
addendum_b:
  james: >-
    "with extensive options for this to enable for each site, maybe add incognito mode, cli first, always then the browser.html and settings html.
    provider or url specific, site or cli specific, options for using incognito mode, add extensive support to the macro and automation features,
    maybe make snowflake a plugin for clearglass? like i want to start using plugins to seperate features from clearglass. good idea? right click context
    menu, open in snowflake? open with sentinel? or something?"
  reading: >-
    The coder's reading (to confirm). (1) Order of delivery is his standing rule: CLI verb and API first, then browser.html, then settings.html. (2) A route
    can be scoped by provider (ChatGPT, Claude...), by URL pattern, by origin (site) or by caller (a CLI / agent call vs a person's tab). (3) Incognito is a
    per-tab or per-window mode that composes with a route. (4) "Sentinel" is not defined anywhere in the repo; the coder reads it as a NAME for a hardened
    preset (incognito + transport route + leak test must pass + no userscripts/extensions injected + no history). If he means something else he says so.
  coder_answer_good_idea: >-
    Yes to a plugin, with one hard condition. The plugin system already has the right shapes (context-menu-item, toolbar-command, permission-filter,
    request-interceptor; clear-glass/src/plugins/contribution-types.js). The seam to cut is: the TRANSPORT (tor + snowflake, its settings, its menu items, its
    status) is the plugin; the ENFORCEMENT stays in core. If enforcement lived in a plugin, a disabled, crashed or missing plugin would mean traffic goes
    direct, which is the exact failure this feature exists to prevent. So core owns a small 'route slot': the policy table, the fail-closed rule, and the leak
    test gate. A plugin fills a slot ('transport'); an empty or dead slot means BLOCK for any route that points at it. This is also the template for moving
    other features out of core: plugin owns the capability, core owns the invariant.
  plugin_system_gaps_to_close_first:
    - "no contribution type for a network transport/route (NP12 adds 'network-transport')"
    - "no contribution type for a Settings section or a CLI verb from a plugin (type 'cli' exists in COS vocabulary; verify Clear Glass maps it)"
    - "a plugin that spawns a child process needs a declared permission (permissions.process) so it is visible and revocable"

scope_model:
  matches: [provider, url_pattern, origin, caller]   # caller: person-tab | cli | agent:<id> | macro:<name> | automation:<id>
  precedence: "most specific wins: macro/automation > url_pattern > provider > origin > caller default > global. Ties are a hard error (collision), never a silent winner (SISO law 1)."
  per_rule: [via, dns, protocols, incognito, allow_userscripts, allow_extensions, require_leak_test, on_failure=block]
  incognito_note: >-
    Electron partitions whose name has no 'persist:' prefix live in memory and vanish on close. Incognito = such a partition, no history, no autofill save, no
    rewind, no ledger of page content, userscripts off by default. It hides nothing from the network by itself: only the route does. The UI says so.

decisions:
  NP9_sentinel_meaning:
    question: What is 'Sentinel'?
    coder_recommends: A named preset ('Sentinel' = incognito + transport route + leak test required + userscripts/extensions off), shown as a context-menu item and a CLI flag. Presets are data, so he can define more.
    chosen: null
    to_confirm: true

phases:
  NP9_cli_first:
    status: PARTIAL-BUILT-0.60.60
    built_note: "service, /cli/net/*, the net command, the clear_glass_net agent tool. Browser and Settings surfaces still open."
    does: >-
      Verbs through nexus.command and the Clear Glass CLI: net route list|add|rm|test, net transport status|start|stop, net preset list|apply,
      open <url> --via <route> --incognito --preset sentinel. API routes under /cli/net/*. Every later surface calls these.
    proof: "route CRUD and precedence/collision tests; 'open' refuses a route whose leak test is stale."
  NP10_browser_surface:
    status: OPEN
    depends_on: [NP9_cli_first]
    does: "browser.html: a route indicator per tab (direct / via X / incognito / blocked-and-why), New incognito window, New window via..., and a per-site quick toggle in the address bar."
  NP11_context_menu:
    status: OPEN
    depends_on: [NP9_cli_first]
    does: "Right click a link or page: Open in incognito, Open via <transport>, Open with <preset>. Contributed by the transport plugin through context-menu-item; the core only provides the slot."
  NP12_plugin_split:
    status: OPEN
    does: >-
      New contribution type 'network-transport'. The Snowflake/Tor transport becomes plugins/snowflake (manifest permissions.process=true, network=true).
      Core keeps the route slot, policy table, fail-closed rule and leak-test gate. Disabled/crashed plugin => routes that point at it BLOCK.
    proof: "disable the plugin under test: every route via it blocks and the UI says why; nothing goes direct."
  NP13_settings_html:
    status: OPEN
    depends_on: [NP9_cli_first, NP10_browser_surface]
    does: "Settings > Network (last, per his order): global, per provider, per URL/origin, per caller, presets, incognito defaults, transport state, leak test, the 'what this does not hide' panel."
  NP14_macros_and_automation:
    status: OPEN
    depends_on: [NP9_cli_first]
    does: >-
      Steps: set_route, open_in (incognito / preset / route), net_test. Conditions: route_is, leak_test_passed, transport_up. Triggers: leak_test_failed,
      transport_down. A macro or workflow can DECLARE a required route/preset (macro node field requires.route) and refuses to run, with the reason, if it
      cannot be met. Agent jobs carry a route. Recorder option: record in incognito/preset. All through the same policy table, never a side door.
    proof: "a macro requiring 'sentinel' does not run on a tab with a stale leak test; a trigger fires on transport_down."

# ═══ ADDENDUM 2026-10-15 (c) — kill switch (MAPPED, nothing below is built) ═══
addendum_c:
  james: "maybe a kill if disconnected, like kills the sandbox or compartment completely?"
  reading: "The coder's reading (to confirm): if the protected path is lost, tear down everything that depended on it, not only stop the traffic."
  coder_says: >-
    Yes, and it is a ladder, not one switch. The fail-closed rule (NP3) already blocks traffic the moment a route's transport is down; that costs nothing and is
    always on. A kill goes further and destroys state, so it is a per-rule choice: on_failure = block | kill_tabs | kill_compartment.
      block              traffic stops; tabs, cookies and the transport process stay. Resumes when the route is verified again.
      kill_tabs          every tab on that route is closed and its in-memory/incognito partition destroyed (cookies, storage, cache gone).
      kill_compartment   kill_tabs, plus the transport process is killed, its data directory wiped, control credentials discarded; a restart is a fresh start.
    The watchdog that decides must live in core and outside the transport. A kill switch inside the thing that failed does not run when it fails.
  triggers: [transport_process_exit, heartbeat_miss (control-port ping), circuit_lost_and_not_rebuilt_in_N_seconds, leak_test_failed, os_network_change, sleep_wake, route_removed_while_in_use]
  failure_modes_to_test:
    - "Race: a request already in flight when the transport dies. The block is applied at the session layer before the kill, and in-flight requests are cancelled, not retried direct."
    - "False positive: a slow bootstrap or brief hiccup kills a long session. N seconds and a 'warn first' grace are settings; the default is block (reversible), not kill (destructive)."
    - "Kill that fails: the process will not die or the wipe errors. The route stays BLOCKED and the UI says the kill failed (§1.2 nothing fails silently)."
    - "Persistent profiles: kill_tabs on a persistent (non-incognito) route destroys logins he may want. The setting says so and asks once; incognito and Sentinel default to kill_tabs."
    - "Auto-reconnect after a kill is off by default; a new transport needs a click, a CLI call, or an explicit setting."
    - "Macros and agent jobs mid-run on a killed route are stopped with the reason in the run, not left half done."
phases:
  NP15_kill_switch:
    status: OPEN
    depends_on: [NP1_compartment, NP3_apply_to_electron, NP5_leak_test]
    does: "Core watchdog (heartbeat + triggers above) applying the rule's on_failure; kill ladder; a Panic button and CLI verb (net kill [--route R] [--all]); events for macro/automation triggers (NP14)."
    proof: "fake transport: exit => block within one tick; kill_tabs destroys the partition; kill_compartment wipes the data dir; a failing wipe leaves the route blocked and reports it; in-flight request is not retried direct."

# ═══ ADDENDUM 2026-10-15 (d) — a safe download pipeline from the compartment (MAPPED, nothing below is built) ═══
addendum_d:
  james: "downloads any files into the sandbox, shows in the downloads library, a safe pipeline."
  reading: "The coder's reading (to confirm): files downloaded by a tab on a protected route land in a quarantine folder inside the compartment, not the normal Downloads folder; they appear in the Library's Downloads area marked 'quarantined'; a person (or a rule) releases them after checks."
  grounding: >-
    Reuse, do not rebuild. src/downloads/store.js (the list), adapter.js, intake-bridge.js (regular downloads -> Guardian artifacts), providers/download-capture.js
    (provider chat downloads) and the Library Downloads area already exist. The new work is a QUARANTINE state in front of them, not a second downloads system.
  pipeline:
    1_land: "Download completes into <compartment>/quarantine/<id>/<name>, mode not executable, never opened by the OS or an app. The route's partition owns it."
    2_record: "Downloads store row with state=quarantined, route, source URL, size, time, SHA-256 (computed while streaming)."
    3_check: >-
      Cheap deterministic checks first (§ leverage rule): size cap, extension vs sniffed type mismatch, double extensions, executable/script/installer types flagged,
      archive bombs (depth and expansion ratio), known-hash list (his own allow/deny list), and an optional external scanner IF one is installed (ClamAV or Windows Defender
      through its CLI). No scanner installed = the row says 'not scanned', never 'clean'.
    4_release: "Release is a click, a CLI verb (downloads release <id> [--to DIR]) or a rule (e.g. images under 5 MB from this site). Release MOVES the file out and then hands it to the existing intake-bridge. Flagged types need an explicit confirm."
    5_destroy: "kill_compartment (NP15) wipes the quarantine folder with the rest; released files are untouched."
  honest_limits:
    - "Quarantine is a folder plus checks, not a virtual machine. A file that is released and then opened runs with his user's rights. The pipeline lowers risk; it does not make an unknown executable safe."
    - "Hash/type/archive checks catch the careless cases. A new malicious file passes them. Without a real scanner the label stays 'not scanned'."
    - "True detonation (running the file in a VM) is a different system and is out of scope here."
decisions:
  NP16_default_quarantine:
    question: Quarantine for every download on a protected route only, or for all downloads?
    coder_recommends: Protected routes and incognito/Sentinel by default (the ones he marked as risky); a setting to quarantine everything; normal browsing unchanged.
    chosen: null
phases:
  NP16_quarantine_pipeline:
    status: OPEN
    depends_on: [NP1_compartment, NP9_cli_first]
    does: "CLI first: downloads list|show|check|release|delete [--quarantined]. Then the Library Downloads area gets a state column, a Check and Release button and a filter; then Settings > Downloads gets the rules, caps, scanner path and the allow/deny hash lists."
    proof: "tests: a file lands in quarantine and is never moved to Downloads without release; type/extension mismatch and a zip-bomb fixture are flagged; no scanner => 'not scanned'; release hands the file to intake-bridge exactly once; kill_compartment removes the folder."

# ═══ ADDENDUM 2026-10-15 (e) — freeze and resume on connection loss (MAPPED, nothing below is built) ═══
addendum_e:
  james: >-
    "could even freeze the process on connection loss, using the rewind engine, then resume if the connection is established. with a timer. erosmancer and
    copilot. cleardriver and agent mesh. but remember a plugin that can be removed and disabled or re-enabled."
  reading: "The coder's reading (to confirm): a gentler rung on the kill ladder (NP15). Instead of destroying the tabs, hold them still, keep the rewind snapshot as the safety net, and carry on if the route comes back before a deadline; if it does not, escalate to the rule's kill."
  ladder_now: "block (always) -> freeze with a deadline (new) -> kill_tabs -> kill_compartment. The rule picks the highest rung; the deadline moves it up automatically."
  coder_says:
    freeze_is_not_rewind: >-
      Two different tools, used together. FREEZE keeps the live page in memory exactly as it was (a pause: Chromium's page lifecycle 'frozen' through the debugger protocol,
      plus the network block). The REWIND engine saves cookies, storage and scroll position, not live memory, so it cannot bring back a running page; it is the fallback if the
      page is discarded, the app restarts, or the deadline passes and he chooses restore over kill. Resume = unfreeze if the page is still alive, else restore from the snapshot.
    what_does_not_survive: >-
      Requests in flight, open sockets and streams (a ChatGPT or Claude reply mid-stream is cut and needs a re-ask), video/calls, and any server-side session that times out
      while frozen. Resume brings the page back; it cannot un-break a connection the other side dropped.
    the_exit_changes: >-
      A rebuilt Tor circuit usually exits from a different address. To a site that is a new location mid-session, which can log him out or flag the account. So resume is
      not automatic for signed-in sites: the rule has 'resume on a new exit: allow | ask | never'. The default is ask.
    timer_lives_in_core: >-
      The deadline must be enforced by core, not by the plugin. If the plugin that froze the tabs is removed or disabled, a plugin-held timer would leave them frozen forever.
      Core's 'hold' primitive refuses a hold without a deadline, and escalates at the deadline whether or not any plugin is alive.
  plugin_contract:
    core_owns: ["the hold primitive with a mandatory deadline", "block-on-loss (always)", "escalation at the deadline", "the recorded state of every hold"]
    plugin_adds: ["the graceful behaviour: freeze, snapshot, resume checks, the timer settings UI, notices", "per-system adapters for the four systems below"]
    removed_or_disabled: "Core falls back to the stricter rung (block, then the rule's kill at the deadline). Never looser. Anything frozen when the plugin goes is escalated at once, not left frozen."
    re_enabled: "The plugin reads core's recorded holds and reconciles. It does not assume a clean slate, and it does not resume a hold whose deadline has passed."
  systems_and_what_each_does_during_a_hold:
    erosmancer: "Virtual input stops. Its queue is paused, not dropped; on resume each queued pointer action is re-checked against the page (target still there, same position) or discarded with a note."
    copilot: "Proposed actions are held and shown as held, with the countdown. Nothing auto-runs on resume: it re-reads the page (semantic tree) first, then asks or continues per its action setting."
    cleardriver: "Calls to a held tab return a typed 'route_held' result with retry_after and the deadline, instead of hanging or failing generically; no call is sent direct."
    agent_mesh: "Jobs on that route become 'held', not failed and not retried on another route. They resume in order after the route is verified, or fail with the reason at the deadline."
    macros_and_automations: "A run pauses at a step boundary and, on resume, re-checks the last step's page condition (wait_for) before continuing; the same events feed triggers (transport_down, route_held, route_resumed)."
failure_modes_to_test:
  - "Deadline passes with no route: escalates to the rule's kill, once, and logs why."
  - "Plugin removed while frozen: tabs are escalated at once, none stay frozen."
  - "Plugin re-enabled mid-hold: it adopts the hold, does not duplicate it, does not extend the deadline."
  - "Route flaps (up, down, up): holds are not stacked; the deadline is from the first loss unless the route stayed verified for N seconds."
  - "Leak test fails on return: stays held/blocked, never resumes unverified."
  - "Resume on a new exit with 'never': goes to kill_tabs, with the reason."
  - "Frozen tab closed by the person: the hold ends with it, snapshot kept per retention."
phases:
  NP17_hold_primitive:
    status: OPEN
    depends_on: [NP15_kill_switch]
    does: "Core: hold(route, deadline, reason) with mandatory deadline, recorded state, escalation, events (route_held, route_resumed, hold_expired); adapters for ClearDriver and agent mesh first (CLI first: net hold list|release|extend)."
  NP18_freeze_plugin:
    status: OPEN
    depends_on: [NP17_hold_primitive, NP12_plugin_split]
    does: "The plugin that freezes pages (page lifecycle), snapshots with the rewind engine, resumes or restores, and wires Erosmancer, the co-pilot, macros and automations; its Settings part, and the exit-change rule."
    proof: "all the failure modes above, with a fake driver and a fake clock; remove/disable/re-enable tested explicitly."

# ═══ ADDENDUM 2026-10-15 (f) — Snowflake by CLI, agent tools, and the encrypted container ═══
addendum_f:
  james: >-
    "im saying add support for snowflake, using cli, then you can add the commands to the agents, or make agent tools. what about an encrypted container,
    only accessable through clearglass?"
  built_0_60_60:
    - "clear-glass/src/net/policy.js: rules by provider, url pattern, origin and caller; most specific wins; equally specific overlapping rules with a different route are refused at add, and compile CLOSED if one is already stored; PAC compiler; transport down = closed port, never DIRECT."
    - "clear-glass/src/net/transport-host.js: tor with Snowflake as the bridge in an isolated child (loopback ports, cookie auth, empty environment, backoff, deliberate stop never restarts, wipe)."
    - "clear-glass/src/net/service.js + /cli/net/* + the `net` command + the clear_glass_net agent tool (lib/agent-tools/tools/clear-glass/net.js)."
    - "Default posture NP0b applied: nothing is routed until a rule exists; with no rules no session is touched."
  decisions_applied_by_default_his_to_change:
    NP0_binaries: "detect, do not bundle (the coder's recommendation, applied because it was not answered). tor and snowflake-client paths are settings; a Snowflake bridge line is required and is NOT hardcoded (it changes; Tor Browser ships the current one)."
    agents_read_only: >-
      The coder's call, not his instruction: agents can READ routes and the transport (status, routes, detect, resolve) but not change them (add, rm, default, bridge, paths, start, stop).
      An agent that could remove a rule could quietly send his traffic direct. The `net` command marks those verbs personOnly; the tool refuses them. He can open a rule to agents later on purpose.
  not_built_and_said_so_in_status: ["leak test NP5 (so nothing is ever shown Verified)", "provider-chat and login windows are not routed yet", "browser.html and Settings surfaces (his order: CLI first)", "kill switch and freeze (NP15, NP17)", "proxy credentials (need NP19)"]
  encrypted_container:
    reading: "The coder's reading (to confirm): one encrypted store for what must not sit readable on disk (quarantined downloads from NP16, the transport's state, and proxy credentials, which NP2 refuses until this exists), opened only by Clear Glass."
    coder_says: >-
      Yes, worth building, and it pays for itself twice: it unlocks proxy credentials, and it makes the kill switch instant. If the key is destroyed first, the container is unreadable even if deleting the
      files fails or is slow (crypto-shred). Use the project's own pieces: clear-glass/src/security/vault-key.js (a random key sealed by the OS keystore through Electron safeStorage) and Node's built-in AES-256-GCM.
      No new cipher.
    must_differ_from_the_existing_vaults: >-
      vault-key.js falls back to a HARDCODED key when the OS keystore is unavailable (that is how the password and cookie vaults behave today). That is not encryption. The container must refuse to open
      unless the key really came from the keystore (or from a passphrase), and say why.
    format: "A folder of blobs. Each file is encrypted in chunks (AES-256-GCM, a nonce from a counter, the chunk number and a final-chunk flag authenticated, so chunks cannot be reordered, dropped or truncated), names and sizes live in an encrypted manifest, one key per container. Optional second factor: a passphrase run through scrypt and mixed with the sealed key."
    lock: "Key held in memory only while unlocked. Locks on idle (setting), sleep, quit, and kill_compartment."
    honest_limits:
      - "It protects data at rest: a stolen disk, another OS user, a copied backup, someone browsing the folder."
      - "It does NOT stop malware running as him. On Windows the keystore opens for any process of the same user, and a process can read memory while the container is unlocked. The passphrase factor and the idle lock narrow this; they do not remove it."
      - "A file released out of the container (to open it in another app) is plaintext on disk again. Release is a decision, and it is logged."
      - "'Only accessible through Clear Glass' means: only through its code and keys. It is not an OS-level mounted drive; that needs a driver (VeraCrypt-style) and is out of scope."
  decisions:
    NP19_passphrase:
      question: Passphrase as a second factor, or the OS keystore alone?
      coder_recommends: Optional, off by default, with an idle lock; the keystore alone is the default because a forgotten passphrase destroys the data for good (the same property that makes the kill switch work).
      chosen: null
  phases:
    NP19_container:
      status: OPEN
      depends_on: [NP1_compartment]
      does: "clear-glass/src/vault/container.js (chunked AEAD, manifest, lock/unlock, crypto-shred), a `vault` CLI first (create, status, put, get, ls, release, shred, lock), then the Library and Settings; NP2 then stores proxy credentials in it, and NP16's quarantine lives in it."
      proof: "tests: tamper, reorder, truncate and wrong-key all fail; refuses to open on a legacy-key fallback; shred makes every blob unreadable even if the files remain; lock zeroes the key; a 0-byte and a multi-chunk file round-trip."
