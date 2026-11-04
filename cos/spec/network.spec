spec:

  # cos/spec/network.spec — COS's network settings and the gate in front of every engine that reaches outside (CA3 of
  # docs/2026-11-02-cos-the-application-phasemap.spec). Emerge's module format, compiled at specDepth 1.0, no BLACK (SS-01, compile only).

  meta:
    name:        cos-network
    version:     1.0.0
    author:      james-brooks
    created_at:  2026-11-02T00:00:00Z
    status:      specced
    uuid:        nexus-cos-network-spec-v1-0000-2026-1102-jamesbrooks-001
    origin: >-
      James, 2026-11-02: "both but extensive settings for all of this. Get this done as soon as possible to push." · "Gate behind settings to
      open. Make a full detailed settings for network." (CA_D2: both outbound and inbound reach, every engine off until he opens it.)
    purpose: >-
      One settings store, owned by COS, for every way Nexus reaches or is reached from outside: outbound (tunnel, rendezvous), inbound (UPnP /
      PCP / NAT-PMP port mapping, DDNS, SSH), TLS, and each compartment's network switch and throttle. Every reach engine refuses to start
      unless its switch is on. Shown and edited on the cockpit's Network page, the `cos network` rows, and GET/PATCH /api/cos/network.
    target_runtime: [node]
    language_stack: [javascript, html, css]
    paradigm: [off-by-default, gate-before-start, secrets-never-read-back]
    axioms: ["§4.3 security: nothing open until he opens it; SSH keys only; TLS required inbound", "USER_AUTONOMY: opening the network is a person's act, never an agent's",
      "§5.15: COS owns the store; others ask its route", "§17.12: every change recorded in Versionium, secrets redacted", "§8.6: the anonymous service's engines reused"]
    deps:
      - { name: node, version: ">=20", required: true, purpose: "the manager's process" }

    constraints:
      - id: NET-001
        description: "Every reach engine (tunnel, rendezvous/relay, upnp, ddns, ssh) refuses to start unless its master and own switch are on."
        type: hard
        enforced_by: [GATE-NET-OFF-BY-DEFAULT]
      - id: NET-002
        description: "A secret (a token) is never returned by any read: it is shown as set or not set."
        type: hard
        enforced_by: [GATE-NET-SECRETS]
      - id: NET-003
        description: "Only a person (or a rule RAID approved) changes network settings; an agent is refused."
        type: hard
        enforced_by: [GATE-NET-PERSON]

  schemas:

    - id: NetworkSettings
      name: NetworkSettings
      description: "Every network setting; each engine off by default."
      fields:
        outbound:     "{ enabled: false, tunnel: { enabled, provider: cloudflare|ngrok, token (secret), systems: string[] }, rendezvous: { enabled, url, deviceName, allowedDevices: string[] } }"
        inbound:      "{ enabled: false, mapping: { enabled, protocols: (upnp|pcp|natpmp)[], ports: { external, internal, system }[], leaseSeconds 60–86400 }, ddns: { enabled, provider: duckdns|cloudflare, domain, token (secret), intervalSeconds 60–86400 }, ssh: { enabled, port 1–65535, keysOnly: true (fixed), allowedKeys: string[] } }"
        tls:          "{ requiredInbound: true (fixed), certPath, keyPath }"
        compartments: "{ <system>: { network: on|off|throttled, bytesPerSec: number|null } }"
      behavioral_contracts: ["unknown keys refused", "keysOnly and requiredInbound cannot be turned off", "each value validated (ranges, enums, ports)"]
      error_paths: ["an invalid patch → 400 naming the field and why, nothing written"]

  interfaces:

    - id: IF-VERSIONIUM-RECORD
      name: versionium-record
      path: lib/versionium-record.js
      description: "The one recorder; buffered when Versionium is down."
      exports: ["record({ kind, message, change, causedBy, by }) → Promise"]
      behavioral_contracts: ["never blocks the change"]
      error_paths: ["never throws to the caller"]

    - id: IF-ANONYMOUS-KERNEL
      name: anonymous-kernel
      path: cos/services/anonymous/nexus.js
      description: "COS's network service kernel: starts its engines (dns, ddns, tls, proxy, relay, …) as child processes."
      exports: ["spawnEngine(def)", "startEngines(names)"]
      behavioral_contracts: ["an engine not found is skipped, said"]
      error_paths: ["an engine that exits is said on its log"]

  modules:

    - id: MOD-NET-SETTINGS
      name: network-settings
      uuid: nexus-cos-network-settings-v1-0000-2026-1102-001
      path: cos/manager/network-settings.js
      phase: CA3_network_settings
      description: >-
        load() / view() (secrets as { set: bool }) / patch(patch, { by }) (validated against NetworkSettings, a person or a rule; an agent
        refused; a secret kept when the patch leaves it out; recorded in Versionium, secrets redacted) / gate(engine) → { ok, why } (NET-001).
        Stored in COS's own data (COS_MANAGER_DATA/network.json).
      deps: [{ name: versionium-record }]
      schema_refs: [NetworkSettings]
      exports: ["load()", "view()", "patch(patch, { by }) → { ok, settings } | { ok:false, code, error }", "gate(engine) → { ok, why }", "DEFAULTS", "REACH"]
      gate_pipeline: ["GATE-CA3-001: by a person or a rule", "GATE-CA3-002: validated, nothing written on an error", "GATE-CA3-003: secrets never read back"]
      behavioral_contracts: ["everything off by default", "the fixed safety values cannot be changed"]
      error_paths: ["the store unreadable → the defaults (all off), said"]
      acceptance: ["defaults all off and every engine gated; a patch opens one engine only; a token is never read back; an agent is refused"]

    - id: MOD-NET-ROUTES
      name: network-routes
      uuid: nexus-cos-network-routes-v1-0000-2026-1102-001
      path: cos/manager/server.js
      phase: CA3_network_settings
      description: "GET /api/cos/network → { settings (secrets as set/not set), gates: { engine: { ok, why } } }; PATCH /api/cos/network { patch, by }; rows `cos network`, `cos network set <path> <value>`."
      deps: [{ name: network-settings }]
      schema_refs: [NetworkSettings]
      exports: ["GET /api/cos/network", "PATCH /api/cos/network"]
      gate_pipeline: ["GATE-CA3-010: by named", "GATE-CA3-011: the store's verdict passed through"]
      behavioral_contracts: ["the contract lists both routes"]
      error_paths: ["400 / 403 from the store, said"]
      acceptance: ["GET shows all off and every gate closed; PATCH by person opens one; by agent 403"]

    - id: MOD-NET-PAGE
      name: network-page
      uuid: nexus-cos-network-page-v1-0000-2026-1102-001
      path: cos/ui/network/page.js
      phase: CA3_network_settings
      description: >-
        The cockpit's Network page: every setting in sections (outbound, inbound, TLS, compartments), each engine with its switch and what its
        gate says now; secrets shown as set / not set with a field to replace; Save asks first and says what it opens.
      deps: [{ name: network-routes }]
      schema_refs: [NetworkSettings]
      exports: ["#/network"]
      gate_pipeline: ["GATE-CA3-020: confirm before opening anything"]
      behavioral_contracts: ["the page shows each engine's gate verdict"]
      error_paths: ["a refused save is shown with its reason"]
      acceptance: ["in Clear Glass: all off shown; switching the tunnel on and saving opens only the tunnel's gate"]

    - id: MOD-NET-GATE
      name: reach-gate
      uuid: nexus-cos-network-gate-v1-0000-2026-1102-001
      path: cos/services/anonymous/nexus.js
      phase: CA3_network_settings
      description: "spawnEngine refuses a reach engine (tunnel, relay, upnp, ddns, ssh) whose gate is closed, said on its log (NET-001)."
      deps: [{ name: network-settings }, { name: anonymous-kernel }]
      schema_refs: [NetworkSettings]
      exports: ["the gate in spawnEngine"]
      gate_pipeline: ["GATE-CA3-030: gate(engine) before spawn"]
      behavioral_contracts: ["engines that do not reach outside are unaffected"]
      error_paths: ["the settings unreadable → closed, said"]
      acceptance: ["ddns not spawned while closed; spawned once opened"]

  events:
    network:
      - "versionium cos.network { changed paths, by } (secrets redacted)"

  enforcement:
    gates:
      - { id: GATE-NET-OFF-BY-DEFAULT, name: off-by-default, severity: fatal, check: "defaults close every gate", on_failure: "suite red" }
      - { id: GATE-NET-SECRETS, name: secrets, severity: fatal, check: "no read returns a token", on_failure: "suite red" }
      - { id: GATE-NET-PERSON, name: person, severity: fatal, check: "an agent's patch is refused", on_failure: "suite red" }

  tests:
    - "tests/modules/test-substrate-spec.test.js — compiles"
    - "tests/modules/test-cos-network.test.js — each module's acceptance"
