spec:

  # ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
  # clear-glass/spec/compartment-downloads.spec — what a Snowflake (routed) window downloads, the magnet links it meets, and what
  # happens when its connection drops. Format: emerge's module spec, compiled by emerge/compiler/kg-builder.js at specDepth 1.0, no
  # BLACK, invariants valid (tests/modules/test-substrate-spec.test.js). Phases: docs/2026-10-21-compartment-downloads-phasemap.spec.
  # Builds NP7 (magnet/P2P), NP15 (kill switch) and NP16 (quarantine) of docs/2026-10-15-clear-glass-network-posture-phasemap.spec
  # for routed windows, under the decisions he made there.
  # ════════════════════════════════════════════════════════════════════════════════════════════════════════════════

  meta:
    name:        compartment-downloads
    version:     1.0.0
    author:      james-brooks
    created_at:  2026-10-21T00:00:00Z
    status:      specced
    uuid:        nexus-cg-compartment-downloads-spec-v1-0000-2026-1021-jamesbrooks-001
    origin: >-
      James, 2026-10-21: "add magnet link handling, download manage for the compartment. kill on disconnect." Earlier, his and
      binding: 2026-10-15 MR12 "option B (proxy/VPN required, fails closed) with C (Snowflake for browsing and metadata) as an optional
      mode" (accepted) · "maybe a kill if disconnected, like kills the sandbox or compartment completely?".
      The asks and the P2P rule are his. The coder's part: the design, the readings (marked), the code.
    readings: >-
      To confirm. "kill on disconnect" — routed windows default to kill_tabs (the window closes the moment the transport drops, not
      only blocked); kill_compartment (also stop the transport, wipe its data and the quarantine) is his to choose; block stays
      available. "magnet link handling" — under MR12: a magnet in a routed window is caught, parsed and listed (metadata only, nothing
      fetched); it is handed to a torrent client only when that client is verified to send its peer traffic through a SOCKS5/HTTP proxy
      or a bound VPN interface that is NOT Tor (Tor carries TCP only and the Tor Project asks that it not carry BitTorrent). The
      client is qBittorrent through its Web API, because its settings can be read and verified before the hand-off; anything else
      is "copy the link", said. "download manage" — NP16's quarantine for routed windows.
    purpose: >-
      Nothing a routed window downloads lands in the normal Downloads folder until he releases it; a magnet never starts peer traffic
      on an unverified path; a dropped transport closes the windows that depended on it, cancels their downloads and stops the
      torrents they handed off.
    target_runtime: [electron, node]
    language_stack: [javascript]
    paradigm: [fail-closed, injected-impurity, evidence-first]
    axioms: ["§1.2 nothing fails silently (a drop is acted on and said)", "USER_AUTONOMY (release, rung and hand-off are his)",
      "REVERSIBILITY (release copies with a hash check; discard archives unless the kill rung he chose says wipe)",
      "§0.1 evidence over memory (a client's proxy is read from the client, not assumed)", "§8.6 reuse (downloads/store.js, net/service.js, compartment.js)"]
    deps:
      - { name: electron, version: "42.x", required: true, purpose: "DownloadItem, will-download, will-navigate, setWindowOpenHandler" }
      - { name: qbittorrent-webui, version: "4.x / 5.x", required: false, purpose: "the only torrent client hand-off, verified first" }

    constraints:
      - id: CDL-001
        description: "A routed window's download is saved under <userData>/net/quarantine/<id>/, never the Downloads folder, until released."
        type: hard
        enforced_by: [GATE-CDL-QUARANTINE]
      - id: CDL-002
        description: "Release copies to the Downloads folder, checks the sha256 of the copy, then removes the quarantined file; a name clash gets ' (2)'."
        type: hard
        enforced_by: [GATE-CDL-RELEASE]
      - id: CDL-003
        description: "A magnet in a routed window never navigates and never opens an outside app; it becomes a Magnet record."
        type: hard
        enforced_by: [GATE-CDL-MAGNET]
      - id: CDL-004
        description: "A hand-off to qBittorrent happens only after its preferences show peer traffic through a non-Tor proxy or a bound interface."
        type: hard
        enforced_by: [GATE-CDL-VERIFY]
      - id: CDL-005
        description: "When the transport leaves 'ready' without being asked to stop, the chosen rung runs at once, and every action is recorded."
        type: hard
        enforced_by: [GATE-CDL-KILL]

  schemas:

    - id: Magnet
      name: Magnet
      description: "A parsed magnet link (BEP 9 / BEP 53 fields)."
      fields:
        infoHash: "string — 40 hex chars, lower case (a base32 btih is converted)"
        v2:       "string|null — urn:btmh multihash when present"
        name:     "string|null — dn"
        size:     "number|null — xl"
        trackers: "string[] — tr, deduplicated"
        webSeeds: "string[] — ws"
        raw:      "string — the link as met"
      behavioral_contracts: ["parse is pure: no lookup, no network"]
      error_paths: ["no xt=urn:btih or btmh → null with the reason"]

    - id: QuarantineItem
      name: QuarantineItem
      description: "One file a routed window downloaded."
      fields:
        id:        "string"
        partition: "string — the compartment it came from"
        url:       "string"
        filename:  "string — sanitised, no path parts"
        path:      "string — <quarantine>/<id>/<filename>, mode 0600"
        state:     "string — in_progress | quarantined | released | discarded | cancelled | interrupted"
        sha256:    "string|null — of the finished file"
        bytes:     "number"
        kind:      "string — file | magnet"
        magnet:    "Magnet|null"
        handedTo:  "string|null — qbittorrent when handed off"
      behavioral_contracts: ["kept in the quarantine's own index (<quarantine>/index.json, 0600, wiped with it), never the main downloads store: the Library's history must not hold a routed window's URLs"]
      error_paths: ["a file that cannot be hashed stays quarantined, said"]

    - id: KillRecord
      name: KillRecord
      description: "What a disconnect did."
      fields:
        at:       "number"
        rung:     "string — block | kill_tabs | kill_compartment"
        why:      "string — the transport's error"
        closed:   "string[] — compartment partitions whose windows were closed"
        cancelled: "number — downloads cancelled"
        paused:   "string[] — torrent hashes stopped in the client"
        wiped:    "boolean|null"
      behavioral_contracts: ["the last ten kept in status()"]
      error_paths: ["an action that fails is listed with its error; the others still run"]

  interfaces:

    - id: IF-DOWNLOADS-ADAPTER
      name: downloads-adapter
      path: clear-glass/src/downloads/adapter.js
      description: "Ordinary windows' will-download: saves to the Downloads folder and records in the persistent downloads store (JAA). Not attached to compartment sessions."
      exports: ["attach({ session, agentId, store, getDownloadDirectory })"]
      behavioral_contracts: ["persists URL and filename (why compartments do not use it)"]
      error_paths: ["no session → throws"]

    - id: IF-NET-SERVICE
      name: net-service
      path: clear-glass/src/net/service.js
      description: "Policy, transport host (state events), registered sessions, status."
      exports: ["service()", "host(deps).on('state')", "policy()", "status()"]
      behavioral_contracts: ["state events on every transition"]
      error_paths: ["no host yet → nothing to watch"]

    - id: IF-COMPARTMENT
      name: compartment
      path: clear-glass/src/net/compartment.js
      description: "SF3: a routed window's in-memory session (cg-snow-<id>), harden, onContents, dispose."
      exports: ["isCompartment(ses)", "isPartition(p)", "harden(ses)", "onContents(contents)"]
      behavioral_contracts: ["only routed windows are compartments"]
      error_paths: ["missing Electron APIs → logged"]

  modules:

    - id: MOD-CDL-MAGNET
      name: magnet
      uuid: nexus-cg-cdl-magnet-v1-0000-2026-1021-001
      path: clear-glass/src/net/magnet.js
      phase: CD1_magnet_parse
      map: docs/2026-10-21-compartment-downloads-phasemap.spec
      description: >-
        parse(link) → Magnet; isMagnet(url); a base32 btih is decoded to hex; trackers and web seeds deduplicated; display name and
        size read. Pure.
      deps: []
      schema_refs: [Magnet]
      exports: ["parse(link) → Magnet|null", "isMagnet(url) → boolean", "base32ToHex(s) → string"]
      gate_pipeline: ["GATE-MG-001: scheme", "GATE-MG-002: xt", "GATE-MG-003: fields"]
      behavioral_contracts: ["no network"]
      error_paths: ["malformed → null"]
      acceptance: ["hex and base32 btih give the same hash; trackers deduplicated; a v2-only link keeps btmh"]

    - id: MOD-CDL-QUARANTINE
      name: quarantine
      uuid: nexus-cg-cdl-quarantine-v1-0000-2026-1021-001
      path: clear-glass/src/net/quarantine.js
      phase: CD2_quarantine_downloads
      map: docs/2026-10-21-compartment-downloads-phasemap.spec
      description: >-
        The compartment's download manager. attach(session, partition) saves every download of a compartment session under
        <dir>/<id>/<filename> (0600), records it in its own index (not the main downloads store), hashes it when done. catchMagnet(url,
        partition) records a magnet. release(id, downloadsDir) copies out, verifies the hash, removes the quarantined copy. discard(id)
        moves it to <dir>/_discarded. cancelAll(partition?) cancels in-flight items; wipe() removes the folder (kill_compartment only).
      deps: [{ name: magnet }, { name: compartment }]
      schema_refs: [QuarantineItem]
      exports: ["Quarantine({ dir, store, fs, now })", "attach(session, partition) → { detach }", "watch(contents, partition)", "catchMagnet(url, partition) → QuarantineItem", "release(id, downloadsDir) → { ok, path }", "discard(id) → { ok }", "cancelAll(partition?) → number", "list() → QuarantineItem[]", "wipe() → { ok }"]
      gate_pipeline: ["GATE-QU-001: save path", "GATE-QU-002: record", "GATE-QU-003: hash on done", "GATE-QU-004: release copy+hash", "GATE-QU-005: discard archive"]
      behavioral_contracts: ["a released file is never executable-marked by this code", "names are sanitised (no ../, no separators)"]
      error_paths: ["copy hash differs → release refused, both kept"]
      acceptance: ["fake DownloadItem saved under quarantine; release copies with equal hash; clash gets ' (2)'; discard keeps the bytes"]

    - id: MOD-CDL-QBIT
      name: qbittorrent-handoff
      uuid: nexus-cg-cdl-qbit-v1-0000-2026-1021-001
      path: clear-glass/src/net/qbittorrent.js
      phase: CD3_verified_handoff
      map: docs/2026-10-21-compartment-downloads-phasemap.spec
      description: >-
        The only torrent hand-off. verify(prefs, { torPorts }) reads qBittorrent's own preferences: peer traffic through a SOCKS5 or
        HTTP proxy (proxy_type, proxy_peer_connections) that is not a Tor port (the transport's, 9050, 9150), or a bound network
        interface (a VPN). add(magnet) logs in (Web API v2), verifies, adds, and remembers the hash; stop(hashes) stops them (v5
        /torrents/stop, v4 /torrents/pause).
      deps: [{ name: magnet }]
      exports: ["verify(prefs, { torPorts }) → { ok, path } | { ok:false, why }", "QBit({ url, user, pass, fetch })", "add(magnet) → { ok, hash }", "stop(hashes) → { ok }"]
      gate_pipeline: ["GATE-QB-001: login", "GATE-QB-002: read preferences", "GATE-QB-003: verify", "GATE-QB-004: add", "GATE-QB-005: remember"]
      behavioral_contracts: ["no add without a fresh verify in the same call"]
      error_paths: ["unreachable or refused login → ok:false, nothing added; Tor port → refused with the Tor Project's reason"]
      acceptance: ["v4 int and v5 string proxy types read; peer connections off → refused; Tor port → refused; bound interface → ok"]

    - id: MOD-CDL-KILL
      name: kill-switch
      uuid: nexus-cg-cdl-kill-v1-0000-2026-1021-001
      path: clear-glass/src/net/kill-switch.js
      phase: CD4_kill_on_disconnect
      map: docs/2026-10-21-compartment-downloads-phasemap.spec
      description: >-
        Watches the transport host. On a drop it was not asked for (ready → failed/stopped, not intentional) it runs the rung from the
        policy (compartmentOnDisconnect: kill_tabs by default): block — the PAC already blackholes, recorded; kill_tabs — close every
        compartment window, cancel its downloads, stop its handed-off torrents; kill_compartment — kill_tabs, then stop the transport
        with wipe and wipe the quarantine. One KillRecord per drop.
      deps: [{ name: net-service }, { name: quarantine }, { name: qbittorrent-handoff }, { name: compartment }]
      schema_refs: [KillRecord]
      exports: ["KillSwitch({ host, policy, closeWindows, quarantine, qbit, log })", "arm() → { disarm }", "trigger(why) → KillRecord", "records() → KillRecord[]"]
      gate_pipeline: ["GATE-KS-001: was ready, not intentional", "GATE-KS-002: rung", "GATE-KS-003: act", "GATE-KS-004: record"]
      behavioral_contracts: ["a deliberate stop never kills", "one drop, one record (repeated failed states during backoff do not repeat it)"]
      error_paths: ["an action that throws is recorded; the others still run"]
      acceptance: ["fake host ready→failed: windows closed, downloads cancelled, torrents stopped; deliberate stop: nothing; kill_compartment wipes"]

    - id: MOD-CDL-SURFACE
      name: compartment-downloads-surface
      uuid: nexus-cg-cdl-surface-v1-0000-2026-1021-001
      path: clear-glass/src/ipc/bridge.js
      phase: CD5_surface
      map: docs/2026-10-21-compartment-downloads-phasemap.spec
      description: >-
        Wiring: main/index.js attaches the quarantine to each compartment session and catches magnets (will-navigate, will-frame-
        navigate, setWindowOpenHandler); the kill switch is armed with the transport host. Routes /cli/net/quarantine (list),
        /release, /discard, /magnet/handoff, /on-disconnect, /qbit (settings); the `net` command gains quarantine, release <id>, discard
        <id>, handoff <id>, on-disconnect block|kill_tabs|kill_compartment, qbit --url --user --pass; agents read quarantine only.
        Settings → Network: the rung, the qBittorrent connection and its verify result; the toolbar downloads panel lists quarantine.
      deps: [{ name: quarantine }, { name: qbittorrent-handoff }, { name: kill-switch }, { name: downloads-adapter }]
      exports: ["/cli/net/quarantine*", "/cli/net/magnet/handoff", "/cli/net/on-disconnect", "/cli/net/qbit", "net quarantine|release|discard|handoff|on-disconnect|qbit"]
      gate_pipeline: ["GATE-CS-001: wire", "GATE-CS-002: route", "GATE-CS-003: command", "GATE-CS-004: UI"]
      behavioral_contracts: ["release, discard, handoff, rung and qbit settings are person-only"]
      error_paths: ["bridge unreachable → said in the pane"]
      acceptance: ["Settings shows the rung and qBittorrent verify; the panel lists quarantined items with Release / Discard"]

  events:
    net:
      - "net.quarantine.added { id, kind, partition }"
      - "net.quarantine.released { id, path }"
      - "net.kill { rung, closed, cancelled, paused }"

  enforcement:
    gates:
      - { id: GATE-CDL-QUARANTINE, name: quarantine-first, severity: fatal, check: "save path under the quarantine dir for compartment sessions", on_failure: "download cancelled" }
      - { id: GATE-CDL-RELEASE, name: release-hash, severity: fatal, check: "copy sha256 equals", on_failure: "release refused" }
      - { id: GATE-CDL-MAGNET, name: magnet-caught, severity: fatal, check: "magnet navigation prevented in compartments", on_failure: "build failure" }
      - { id: GATE-CDL-VERIFY, name: verify-before-handoff, severity: fatal, check: "verify ok in the same call as add", on_failure: "not added" }
      - { id: GATE-CDL-KILL, name: act-on-drop, severity: fatal, check: "a KillRecord per unasked drop", on_failure: "build failure" }
