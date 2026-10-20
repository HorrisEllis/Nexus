spec:

  # ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
  # clear-glass/spec/snowflake.spec — Snowflake working end to end: the page inside the compartment, a bridge line found and never
  # invented, optional HTTPS-only, a circuit check, and a window that looks like an ordinary Chromium.
  # Format: emerge's module spec; compiled by emerge/compiler/kg-builder.js at specDepth 1.0, no BLACK, invariants valid
  # (tests/modules/test-substrate-spec.test.js). Phases: docs/2026-10-21-snowflake-compartment-phasemap.spec.
  # Builds on docs/2026-10-15-clear-glass-network-posture-phasemap.spec (NP0–NP19); does not replace it.
  # ════════════════════════════════════════════════════════════════════════════════════════════════════════════════

  meta:
    name:        snowflake
    version:     1.0.0
    author:      james-brooks
    created_at:  2026-10-21T00:00:00Z
    status:      specced
    uuid:        nexus-cg-snowflake-spec-v1-0000-2026-1021-jamesbrooks-001
    origin: >-
      James, 2026-10-21, with a screenshot of Settings → Network (tor found, snowflake found, "Not detected on PATH", toast "set a
      Snowflake bridge line first"): "can you get snowflake working. connected to the compartment? optional encryption. Can you look
      in domains of cyber security and all technololgy. find any way to improve snowflake plugin, and make it look as nromal as it
      can." Earlier, his and kept: 2026-10-15 "okay, add encrypted wrapper over snowflake ... but inprove thee encryption, maybe run
      it in a compartment isolated?" · 2026-10-19 "right click on links to open with snowflake."
      The direction and the asks are his. The coder's part: the root causes, the readings (marked), the design, the code.
    readings: >-
      To confirm. "connected to the compartment" — his 2026-10-15 "compartment" is the isolated transport (NP1); read as: what
      Snowflake opens must actually be inside it. Root cause found: the page of a Snowflake window loads in a <webview> with no
      partition, i.e. Electron's default session, so it went DIRECT while only the window shell was routed. "optional encryption" —
      read as an HTTPS-only switch for Snowflake windows (on by default, his to turn off): end-to-end encryption past the Tor exit,
      the one place on this path traffic can be read in the clear. Not a home-made cipher (the 2026-10-15 pushback stands); the
      encrypted at-rest container stays NP19, open. "make it look as normal as it can" — read as: the window's traffic looks like an
      ordinary Chromium (one consistent identity: the real engine's UA with the Electron and app tokens removed, its own client hints,
      no persona whose UA disagrees with the TLS handshake), and the Settings page shows plain truth.
    purpose: >-
      Right-click → Open link with Snowflake gives a window whose page, every subresource and every name lookup go through Tor over
      Snowflake, fail closed; whose storage lives in memory and is gone when it closes; whose WebRTC cannot reveal the real address;
      whose http is upgraded or refused when HTTPS-only is on; and which can prove its circuit exits through Tor.
    target_runtime: [electron, node]
    language_stack: [javascript]
    paradigm: [fail-closed, evidence-first, injected-impurity]
    axioms: ["§1.2 nothing fails silently (a down transport blocks, never falls back direct)", "§0.1 evidence over memory (the circuit check, not a badge)",
      "USER_AUTONOMY (every switch his; nothing routed he did not choose)", "TRUTH_OVER_COHERENCE (the page says what it does not hide)",
      "§8.6 reuse before build (installer.bridgeLines, requestHook, webrequest-adapter, net/service)"]
    deps:
      - { name: electron, version: "42.x", required: true, purpose: "session partitions, webRequest, setWebRTCIPHandlingPolicy, ses.fetch" }
      - { name: tor-and-snowflake-client, version: "Tor Project", required: true, purpose: "the transport (NP1); never shipped, found or installed" }

    constraints:
      - id: SF-001
        description: "A Snowflake window's page uses the same routed session as its shell; no page of it ever loads in the default session."
        type: hard
        enforced_by: [GATE-SF-PARTITION]
      - id: SF-002
        description: "A bridge line is only ever one read from a named source (a file on this machine, the installed bundle, or the Tor Project's own builtin list asked for by him); none is invented or carried in code."
        type: hard
        enforced_by: [GATE-SF-NO-FABRICATION]
      - id: SF-003
        description: "A Snowflake window's storage is in memory (a non-persist partition) and is cleared when the window closes."
        type: hard
        enforced_by: [GATE-SF-EPHEMERAL]
      - id: SF-004
        description: "A Snowflake window's WebRTC uses disable_non_proxied_udp: no UDP that bypasses the proxy, so no address leak through STUN."
        type: hard
        enforced_by: [GATE-SF-WEBRTC]
      - id: SF-005
        description: "With HTTPS-only on, a plain-http navigation is upgraded to https and a plain-http subresource is cancelled; nothing is sent in the clear past the exit."
        type: hard
        enforced_by: [GATE-SF-HTTPS-ONLY]
      - id: SF-006
        description: "The UI reads exactly the fields the backend sends (detect: tor, snowflake, from; status: bridgeLine 'set'|null); a test pins them."
        type: hard
        enforced_by: [GATE-SF-FIELDS]
      - id: SF-007
        description: "Asking the Tor Project for its builtin bridges is a person's explicit act, says that it contacts bridges.torproject.org directly, and is never automatic."
        type: hard
        enforced_by: [GATE-SF-OPT-IN]

  schemas:

    - id: Detection
      name: Detection
      description: "What the transport host found, in the names the UI reads."
      fields:
        tor:           "string|null — the tor program's path"
        snowflake:     "string|null — the Snowflake client's path (snowflake-client, snowflake or lyrebird)"
        torFrom:       "string|null — set | path | tor-browser"
        snowflakeFrom: "string|null — set | path | tor-browser"
        bridgeLine:    "string|null — 'set' when one is stored; the line itself is never sent back"
        missing:       "string[] — what start() would refuse for"
      behavioral_contracts: ["a configured path wins over PATH; PATH over a Tor Browser install"]
      error_paths: ["nothing found → nulls and missing names each, never a guess"]

    - id: BridgeCandidate
      name: BridgeCandidate
      description: "One Snowflake bridge line and where it was read."
      fields:
        line:    "string — starts with 'snowflake ' (the 'Bridge ' prefix removed)"
        source:  "string — tor-browser | bundle | system-example | tor-project-builtin"
        path:    "string|null — the file it was read from, or the URL asked"
      behavioral_contracts: ["deduplicated by line; order: tor-browser, bundle, system-example, tor-project-builtin"]
      error_paths: ["a line that does not start with 'snowflake ' is dropped"]

    - id: CompartmentWindow
      name: CompartmentWindow
      description: "A window opened through a route (ctx.via): its own in-memory session for shell and page."
      fields:
        agentId:   "string — snow-<uuid>"
        partition: "string — cg-snow-<uuid> (no persist: prefix, so nothing reaches disk)"
        via:       "string — transport (or another via the policy accepts)"
        httpsOnly: "boolean — from the net policy (default true)"
        ua:        "string — the engine's own UA with Electron/Node/Clear Glass tokens removed"
      behavioral_contracts: ["registered with net/service under its partition; unregistered and cleared when closed"]
      error_paths: ["the transport cannot come up → no window is opened (bridge._netOpenVia), said in a toast"]

    - id: CircuitCheck
      name: CircuitCheck
      description: "The answer of check.torproject.org/api/ip asked through the transport."
      fields:
        ok:     "boolean"
        isTor:  "boolean|null — the Tor Project's own answer"
        ip:     "string|null — the exit address it saw"
        at:     "number"
        error:  "string|null"
      behavioral_contracts: ["asked through a session whose only route is the transport; not a leak test (NP5) and never shown as Verified"]
      error_paths: ["transport not ready → ok:false, 'start the transport first'"]

  interfaces:

    - id: IF-NET-SERVICE
      name: net-service
      path: clear-glass/src/net/service.js
      description: "The one door for routes and the transport (NP1–NP3): policy store, register/applyTo sessions with a PAC, setup, status."
      exports: ["NetService", "service()", "EMPTY", "register(partition, ses, ctx)", "unregister(partition)", "status()", "setBridge(line)", "setPaths(p)"]
      behavioral_contracts: ["a window with ctx.via gets a one-default policy, fail closed"]
      error_paths: ["a session not registered is never routed"]

    - id: IF-TRANSPORT-HOST
      name: transport-host
      path: clear-glass/src/net/transport-host.js
      description: "tor with Snowflake as its bridge, as an isolated child: loopback ports, cookie auth, empty env, backoff, wipe."
      exports: ["TransportHost", "torrc(o)", "STATES"]
      behavioral_contracts: ["start() refuses while anything is missing, naming it"]
      error_paths: ["tor exits → failed, restarted with backoff up to 5 times"]

    - id: IF-INSTALLER
      name: installer
      path: clear-glass/src/net/installer.js
      description: "Tor Expert Bundle download, sha256 check, unpack; bridgeLines(text) reads Snowflake lines wherever a pt_config.json keeps them."
      exports: ["TorInstaller", "bridgeLines(text)", "findFile(fs, root, name)"]
      behavioral_contracts: ["bridgeLines never returns a ClientTransportPlugin line"]
      error_paths: ["unparseable JSON → []"]

    - id: IF-CONTEXT-MANAGER
      name: context-manager
      path: clear-glass/src/contexts/manager.js
      description: "One Chromium session per agent window; Firefox persona headers through requestHook; registers with net/service."
      exports: ["ContextManager.create({ agentId, url, via })"]
      behavioral_contracts: ["routing errors never stop a window opening"]
      error_paths: ["create for an existing id returns it"]

    - id: IF-REQUEST-HOOKS
      name: request-hooks
      path: clear-glass/src/plugins/webrequest-adapter.js
      description: "Electron keeps one onBeforeRequest listener per session; attachContentFilters owns it for content-filter plugins. contexts/session-headers.js requestHook does the same for onBeforeSendHeaders."
      exports: ["attachContentFilters(session, bus, { signatures, exempt })", "requestHook(ses, name, fn)"]
      behavioral_contracts: ["a second onBeforeRequest registration replaces the first — composition must be explicit"]
      error_paths: ["a hung filter fails open after timeoutMs"]

    - id: IF-IPC-BRIDGE
      name: ipc-bridge
      path: clear-glass/src/ipc/bridge.js
      description: "Clear Glass's :7702 /cli/* door; /cli/net/* and _netOpenVia (start the transport, wait, open a window with via)."
      exports: ["/cli/net/status", "/cli/net/transport", "/cli/net/bridge", "/cli/net/open", "_netOpenVia(url)"]
      behavioral_contracts: ["nothing here decides a route"]
      error_paths: ["every route answers ok:false with the error, never throws"]

  modules:

    - id: MOD-SF-DETECT
      name: sf-detect
      uuid: nexus-cg-sf-detect-v1-0000-2026-1021-001
      path: clear-glass/src/net/transport-host.js
      phase: SF1_honest_detection
      map: docs/2026-10-21-snowflake-compartment-phasemap.spec
      description: >-
        The root cause of the screenshot: Settings → Network read det.torPath / det.snowflakePath / s.bridgeLine, which nothing sends,
        so a found tor read "Not detected on PATH" and a set bridge line read "set a Snowflake bridge line first". detect() returns
        the Detection schema (adds torFrom/snowflakeFrom, tries snowflake-client, snowflake, lyrebird, then a Tor Browser install
        through an injected locate()); status() carries bridgeLine 'set'|null and httpsOnly; the UI reads exactly those.
      deps: [{ name: transport-host }, { name: net-service }]
      schema_refs: [Detection]
      exports: ["TransportHost.detect() → Detection", "NetService.status() → { …, bridgeLine, httpsOnly }"]
      gate_pipeline: ["GATE-SD-001: configured path", "GATE-SD-002: PATH (three client names)", "GATE-SD-003: Tor Browser (locate)", "GATE-SD-004: missing list"]
      behavioral_contracts: ["the line itself never leaves the service"]
      error_paths: ["locate throws → treated as not found, said in the log"]
      acceptance: ["a fake which() finding only lyrebird → snowflake set, snowflakeFrom 'path'; a stored line → status bridgeLine 'set'"]

    - id: MOD-SF-BRIDGE-SOURCES
      name: sf-bridge-sources
      uuid: nexus-cg-sf-bridge-sources-v1-0000-2026-1021-001
      path: clear-glass/src/net/bridge-sources.js
      phase: SF2_bridge_sources
      map: docs/2026-10-21-snowflake-compartment-phasemap.spec
      description: >-
        Where a real bridge line comes from, without inventing one. local({ fs, platform, home, env, bundleDir }) reads Tor Browser's
        pt_config.json in its usual install places (Linux ~/.local/share/torbrowser, ~/tor-browser*; macOS /Applications/Tor
        Browser.app; Windows Desktop and Program Files), the installed Expert Bundle, and the Debian snowflake-client example torrc;
        it also returns the Tor Browser tor and transport programs when found. builtin({ fetch }) asks the Tor Project's Moat
        circumvention endpoint for its builtin bridges — only when he presses for it.
      deps: [{ name: installer }]
      schema_refs: [BridgeCandidate]
      exports: ["torBrowserDirs({ platform, home, env }) → string[]", "local(o) → { lines: BridgeCandidate[], torBrowser: { dir, tor, snowflake }|null }", "builtin({ fetch }) → { ok, lines: BridgeCandidate[] } | { ok:false, error }", "linesFromTorrc(text) → string[]"]
      gate_pipeline: ["GATE-BS-001: candidate dirs", "GATE-BS-002: read pt_config.json / torrc", "GATE-BS-003: validate 'snowflake ' lines", "GATE-BS-004: dedupe in source order"]
      behavioral_contracts: ["read-only on the machine", "builtin is never called by detect, start or setup"]
      error_paths: ["an unreadable file is skipped; builtin unreachable → ok:false with the reason (the network may block the Tor Project — then a line from Tor Browser is the way)"]
      acceptance: ["a fake Tor Browser tree yields its line and its programs; a torrc with a commented and a live Bridge snowflake line yields the live one; nothing found → []"]

    - id: MOD-SF-COMPARTMENT
      name: sf-compartment
      uuid: nexus-cg-sf-compartment-v1-0000-2026-1021-001
      path: clear-glass/src/net/compartment.js
      phase: SF3_page_in_the_compartment
      map: docs/2026-10-21-snowflake-compartment-phasemap.spec
      description: >-
        The window a route opens is one compartment: partitionFor(agentId) → cg-snow-<id> (in memory); harden(ses) sets the clean
        engine UA (no persona, so UA, client hints and the TLS handshake agree — ordinary Chromium), and marks the session so every
        webContents created on it gets setWebRTCIPHandlingPolicy('disable_non_proxied_udp'); dispose(ses) clears storage and cache.
        contexts/manager.js create({ via }) uses it instead of persist:agent-<id> and the Firefox persona; main/index.js passes the
        same partition to the shell and to the <webview> (wvPartition), skips the spoof script, and disposes on close; browser.js
        accepts that partition name.
      deps: [{ name: context-manager }, { name: net-service }]
      schema_refs: [CompartmentWindow]
      exports: ["partitionFor(agentId) → string", "isCompartment(ses) → boolean", "cleanUserAgent(ua) → string", "harden(ses, { httpsOnly }) → ses", "onContents(contents) → boolean", "dispose(ses) → Promise"]
      gate_pipeline: ["GATE-CP-001: partition", "GATE-CP-002: UA", "GATE-CP-003: https-only", "GATE-CP-004: register via", "GATE-CP-005: webRTC on each contents", "GATE-CP-006: dispose on close"]
      behavioral_contracts: ["a window without via is untouched (persist:agent-<id>, persona, as before)"]
      error_paths: ["setWebRTCIPHandlingPolicy missing (old Electron) → logged, the window still opens routed"]
      acceptance: ["fake session: harden sets the cleaned UA and the mark; onContents sets the policy only on marked sessions; dispose clears storage"]

    - id: MOD-SF-HTTPS-ONLY
      name: sf-https-only
      uuid: nexus-cg-sf-https-only-v1-0000-2026-1021-001
      path: clear-glass/src/net/https-only.js
      phase: SF4_https_only
      map: docs/2026-10-21-snowflake-compartment-phasemap.spec
      description: >-
        His "optional encryption", read as HTTPS-only for Snowflake windows. decide({ url, resourceType }) → allow | upgrade
        (http://… → https://…, ws:// → wss://) for frames | cancel for http subresources; loopback is allowed (the policy keeps local
        tools local). attach(ses, enabled) installs it through the session's one onBeforeRequest: it sets ses.__cgPreRequest, and
        webrequest-adapter's listener runs that first, so content filters and HTTPS-only compose instead of replacing each other.
      deps: [{ name: request-hooks }, { name: net-service }]
      exports: ["decide({ url, resourceType }) → { action, redirectURL? }", "attach(ses, enabled: () => boolean) → boolean"]
      gate_pipeline: ["GATE-HO-001: enabled?", "GATE-HO-002: scheme", "GATE-HO-003: frame → upgrade, else cancel"]
      behavioral_contracts: ["https, wss, data, blob, about, devtools, chrome and file pass untouched"]
      error_paths: ["a site with no https answers with an error page — the cost of the switch, said in Settings"]
      acceptance: ["http frame → upgrade; http image → cancel; https → allow; 127.0.0.1 → allow; disabled → allow; adapter runs the pre-gate before filters"]

    - id: MOD-SF-CIRCUIT-CHECK
      name: sf-circuit-check
      uuid: nexus-cg-sf-circuit-check-v1-0000-2026-1021-001
      path: clear-glass/src/net/service.js
      phase: SF5_circuit_check
      map: docs/2026-10-21-snowflake-compartment-phasemap.spec
      description: >-
        "Check the circuit": NetService.checkCircuit({ fetchVia }) asks https://check.torproject.org/api/ip through a session whose
        only route is the transport (ipc/bridge.js builds it: an in-memory partition with a SOCKS5 proxy at the transport port, the
        same DNS-through-proxy behaviour) and returns CircuitCheck. Not the leak test: nothing becomes Verified.
      deps: [{ name: net-service }, { name: ipc-bridge }]
      schema_refs: [CircuitCheck]
      exports: ["NetService.checkCircuit({ fetchVia }) → CircuitCheck"]
      gate_pipeline: ["GATE-CC-001: transport ready", "GATE-CC-002: fetch through it", "GATE-CC-003: parse IsTor/IP"]
      behavioral_contracts: ["the last check is kept in status() with its time"]
      error_paths: ["timeout or a non-JSON answer → ok:false, said"]
      acceptance: ["fake fetch answering {IsTor:true,IP:'x'} → isTor true; transport stopped → refused"]

    - id: MOD-SF-SURFACE
      name: sf-surface
      uuid: nexus-cg-sf-surface-v1-0000-2026-1021-001
      path: clear-glass/renderer/settings/sections/network.js
      phase: SF6_surface
      map: docs/2026-10-21-snowflake-compartment-phasemap.spec
      description: >-
        His order (backend → route → command → UI). Routes /cli/net/bridge/find (local), /cli/net/bridge/builtin (opt-in),
        /cli/net/bridge/use, /cli/net/https-only, /cli/net/check; the `net` command gains bridges, builtin, use <n>, https-only on|off,
        check (person-only for the ones that change things); the agent tool can read bridges and check. Settings → Network: the
        Programs row shows the real paths and where they came from; "Find bridge line" lists what was found with "Use"; "Ask the Tor
        Project" says it contacts bridges.torproject.org directly; an HTTPS-only switch; "Check the circuit" with its answer.
      deps: [{ name: sf-detect }, { name: sf-bridge-sources }, { name: sf-https-only }, { name: sf-circuit-check }, { name: ipc-bridge }]
      exports: ["/cli/net/bridge/find", "/cli/net/bridge/builtin", "/cli/net/bridge/use", "/cli/net/https-only", "/cli/net/check", "net bridges|builtin|use|https-only|check"]
      gate_pipeline: ["GATE-SU-001: route", "GATE-SU-002: command row", "GATE-SU-003: agent tool scope", "GATE-SU-004: Settings"]
      behavioral_contracts: ["the page never shows a stored bridge line back in full; a found line is shown so he can see what he is choosing"]
      error_paths: ["bridge :7702 unreachable → the pane says so"]
      acceptance: ["Clear Glass driver (glass.js) on Settings → Network: Programs shows paths; Find lists candidates; the switch and Check answer"]

  events:
    net:
      - "net.bridge.found { count, sources }"
      - "net.bridge.used { source }"
      - "net.circuit.checked { isTor, at }"

  enforcement:
    gates:
      - { id: GATE-SF-PARTITION, name: page-in-compartment, severity: fatal, check: "wvPartition equals the shell partition for a via window", on_failure: "window not opened" }
      - { id: GATE-SF-NO-FABRICATION, name: no-invented-bridge, severity: fatal, check: "every candidate has a source and path", on_failure: "candidate dropped" }
      - { id: GATE-SF-EPHEMERAL, name: memory-only, severity: fatal, check: "partition has no persist: prefix; dispose on close", on_failure: "build failure" }
      - { id: GATE-SF-WEBRTC, name: no-udp-leak, severity: fatal, check: "policy set on every contents of a compartment session", on_failure: "logged and said in status" }
      - { id: GATE-SF-HTTPS-ONLY, name: no-cleartext, severity: high, check: "http frame upgraded, subresource cancelled when on", on_failure: "build failure" }
      - { id: GATE-SF-FIELDS, name: ui-reads-backend, severity: high, check: "test pins detect/status field names", on_failure: "build failure" }
      - { id: GATE-SF-OPT-IN, name: builtin-is-asked, severity: fatal, check: "builtin only from its own route", on_failure: "build failure" }
