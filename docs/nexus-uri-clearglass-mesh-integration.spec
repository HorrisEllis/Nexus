spec:
  meta:
    name:        nexus-uri-clearglass-mesh-integration
    version:     1.0.0
    status:      proposed
    author:      james-brooks
    compiled_by: claude
    created_at:  2026-09-16T00:00:00Z
    purpose: >
      Maps and phases three integration threads James asked to bring
      together: the nexus:// URI scheme (COS + idearium + ClearGlass), a
      ClearGlass mesh-node capability, and update-system.zip's existing
      push-update pipeline repackaged as a COS blueprint for Electron
      builds. Explicit instruction: mesh-node gets a threat model before
      any code — this doc is that design pass, not an implementation.
      Real stakes: this build is headed toward Freedom of the Press
      Foundation, for journalists in authoritarian states and abuse
      victims — the threat model section applies across all three
      threads, not just the mesh.

  threat_model:
    status: >
      This section governs every decision below. Nothing in threads 1-4
      overrides it. Not a certification — FPF's own security review (and
      ideally an independent audit) is what actually clears this for
      real at-risk users; this is the design discipline that review will
      be checking for.
    audiences:
      journalists_in_authoritarian_states:
        adversary: "state-level network operator / ISP / DPI, legal compulsion of infrastructure, device seizure + forensics"
        capabilities: [traffic analysis, deep packet inspection, compelled/targeted updates, physical device seizure]
      abuse_victims:
        adversary: "someone with physical or logical access to the device — not usually network-sophisticated"
        capabilities: ["reading installed-app lists / registry / recent files", "possible stalkerware or keylogging already present", "device may be shared or monitored"]
    cross_cutting_principles:
      - id: default_off
        rule: No new networking surface (mesh participation) ships enabled by default, on any build channel.
      - id: no_remote_flip
        rule: >
          An update-system push must never be able to silently turn ON a
          privacy/exposure-relevant flag (mesh participation, telemetry).
          Clients accept pushes that turn such a flag OFF; they reject
          any push attempting to turn one ON.
      - id: minimize_forensic_footprint
        rule: >
          For the FPF/abuse-safety build channel specifically, avoid
          persistent discoverable install artifacts — a distinctively
          named tray icon, a distinctively named registered URI scheme,
          a distinctively named background service — any of which is
          evidence, to someone inspecting the device, that this person
          sought this kind of help.
      - id: traffic_shape_awareness
        rule: >
          Raw P2P/WebRTC participation has a distinguishing network
          signature (persistent STUN/TURN, DTLS handshakes to peer IPs)
          that DPI can fingerprint. Must never be enabled without the
          user being told this plainly, with a relay-only fallback offered.
      - id: external_review_required
        rule: None of this is represented as "FPF ready" on the strength of this doc or any chat session alone.

  # ── Thread 1 — ClearGlass mesh-node ─────────────────────────────────────
  thread_1_mesh_node:
    status: design_only_no_code_yet
    instruction: "James: threat model before code — this section is that pass, not a build."
    what_it_means_here: >
      A ClearGlass instance optionally relays or stores capture data for
      OTHER ClearGlass instances in the same trust group, so the
      network's data survives one node going offline or a device being
      seized.
    open_design_questions:
      - question: Who is "in the mesh"?
        options: ["invite-only via signed identity (reuse signaling-envelope.js's Ed25519 identity model)", "open discovery"]
        recommendation: Invite-only, closed group. No discovery broadcast — broadcast presence is itself a signal an adversary can watch for.
      - question: What transport?
        note: >
          update-system.zip's WebRTCTransport + HandshakeRegistry
          (location-based, per-connection revocation) is real, tested,
          and a strong primitive — but its own README says "bring your
          own signaling," and it's built for one-directional server-push,
          not N-peer mesh. Reusing the primitive is reasonable; reusing
          the update-system's push topology as-is is not — a mesh needs
          real redesign here, not a relabel.
      - question: Direct P2P or relay-only?
        recommendation: >
          Force TURN-relay-only for this build channel — never expose
          host ICE candidates. Direct IP exposure to another mesh peer is
          a real deanonymization vector for a journalist and defeats the
          purpose, even though it costs relay infrastructure.
      - question: What gets meshed, by default?
        recommendation: Nothing. Opt-in per capture, never a blanket "everything this browser captures goes to the mesh."
      - question: Kill switch?
        recommendation: Single, obvious control, never overridable by a remote update push (see no_remote_flip above).
    recommendation: >
      Do not write mesh-node code yet. Next real step is James reviewing
      these five questions and giving explicit answers — phase E below
      doesn't start until that happens.
    see_also: >
      docs/clearglass-snowflake-relay.spec — narrows the transport
      question above using Tor Snowflake as real prior art (ephemeral,
      no-VPS relay role + broker). Does not answer the five questions
      above and does not move phase E off blocked.

  # ── Thread 2 — nexus:// URI scheme ──────────────────────────────────────
  thread_2_nexus_uri_scheme:
    status: design_ready_implementation_next
    scheme: "nexus://"
    targets: [cos, idearium, clearglass]
    proposed_route_allowlist:
      - pattern: "nexus://repo/{repoUuid}"
        action: open repo in idearium
      - pattern: "nexus://repo/{repoUuid}/chunk/{chunkUuid}"
        action: open one chunk — the work surface from the chunk-index work
      - pattern: "nexus://compartment/{compartmentId}"
        action: focus or open a COS compartment
      - pattern: "nexus://clearglass/session/{sessionId}"
        action: resume a ClearGlass capture session
    security_requirements:
      - id: closed_allowlist_only
        rule: >
          The route table is a fixed, hardcoded set of patterns. An
          unrecognized route is rejected outright — never passed through
          to a generic handler, shell, or exec path. (Classic URI-scheme
          CVE shape: argument injection into whatever process the scheme
          launches.)
      - id: param_validation_before_use
        rule: >
          Every {param} is validated against a strict format (uuid regex,
          etc.) BEFORE it touches compartment-engine.spawn, RepoLayer, or
          any filesystem path — never string-concatenated into a path or
          command.
      - id: treat_every_uri_as_untrusted
        rule: >
          Any webpage can construct and open a nexus:// link. The handler
          treats every incoming URI as untrusted input from a
          potentially hostile page — same posture as any other external
          input, no implicit trust because it came from the OS shell.
      - id: fpf_build_registration_note
        rule: >
          For the FPF/abuse-safety build channel, consider not
          registering a distinctively named "nexus" protocol handler at
          all — either skip URI registration for that channel entirely,
          or register it under a generic, non-identifying name (see
          minimize_forensic_footprint above).
    implementation_note: >
      One shared route-resolver module, not three separate parsers — COS,
      idearium, and ClearGlass each wire their own action functions into
      the same allowlist/validation code.

  # ── Thread 3 — update-system as a COS blueprint ─────────────────────────
  thread_3_update_system_as_cos_blueprint:
    status: mapped_ready_to_build
    source: >
      update-system.zip — already real and tested: WebRTCTransport,
      HandshakeRegistry (location-based per-connection revocation),
      EventContract (hash + requestId + dedup), UpdateService/UpdateClient
      (checksum verification, staleness rejection, channels, rollback).
      Its own README states plainly what's missing: a signaling layer —
      it assumes one already exists.
    plan: >
      A new COS blueprint, following the real registry.js pattern (role /
      archetypeId / nameTemplate / pipes — same shape as the existing
      fullstack-app blueprint) named electron-build-update: nodes for
      {build, update-server, client-target}, pipes wiring
      update-server → client-target through the existing
      EventContract/WebRTCTransport pair. Any Electron-based COS build
      (bridge-electron, a future ClearGlass desktop shell) spawns from
      this blueprint and gets the push-update pipeline pre-wired.
    security_gap_for_this_mission: >
      Checksum verification (already built) proves integrity of what was
      received, not authenticity of the sender — it does not stop a
      compromised or legally-compelled update server from pushing a
      self-signed malicious update to one targeted client. For the FPF
      build channel this needs real code-signing verified against a
      public key pinned into the client at build time (not fetched from
      the same server doing the pushing), plus ideally an
      out-of-band-published release hash so a targeted user can verify
      independently. Not built yet — flagged, not assumed done.

  # ── Thread 4 — Snowflake: secure connect layer ──────────────────────────
  thread_4_snowflake_secure_connect:
    status: design_only_no_code_yet
    instruction: >
      James: "as secure and encrypted as possible... never exposed to the
      actual network with your exposed ip or user data... CLI first, then
      API, then contract, then UI on top... don't be shy inventing or
      upgrading." Same discipline as thread 1: threat model and real
      inventory before code.
    what_it_means_here: >
      A connect layer, named after Tor's real Snowflake pluggable
      transport (WebRTC + volunteer proxies + domain fronting, purpose-
      built so a censored client never dials the real destination
      directly) — the open-source project James means by "integration
      with open source software like [T]or." Goal: a NEXUS node can join
      a network without ever exposing its real IP, and can obfuscate the
      fact that it's running NEXUS traffic at all, with a kill switch on
      network anomaly and automatic rerouting on failure/detection.

    real_inventory_checked_before_writing_this:
      bridge_os_core: >
        remote-desktop/bridge-os-core — the "demo in bridge." Verified
        real: 7 of 43 Bridge OS modules (identity → core → IME → sngate →
        bus+data → heartbeat → contracts), boots standalone, answers real
        HTTP (/health, /identity, /pulse, /nodes, /sngate/trace|rules,
        /data/*), fail-closed API key auth. bridge-sngate is the real
        signal-gate primitive this thread's CLI would sit on top of.
      bridge_os_full_not_present: >
        The README for the core subset lists 36 cut modules by name,
        including exactly the ones a Snowflake-shaped connect layer
        needs: bridge-onion (onion routing), bridge-steg (steganography —
        traffic obfuscation), bridge-nat, bridge-proxy, bridge-mesh/
        trust-mesh, bridge-sybil (Sybil-attack defense), bridge-dht,
        bridge-gateway, bridge-transport (BLE/cellular fallback paths).
        None of these 36 are in any zip uploaded this session. "The zip
        has it all already" is true of the vital 7; the obfuscation/
        rerouting substance lives in modules not currently in hand —
        flagged as a real gap, not assumed present.
      kern_v2: >
        A second, real, separate mesh runtime (Ed25519 identity per node,
        replay-resistant SNR gate with per-node sequence tracking, sigma/
        delta behavioral drift scoring, a live regime state machine
        STABLE→ACTIVATING→OSCILLATING→UNGROUNDED→DYSREGULATED→COLLAPSING,
        append-only hash-chained ledger, linear-regression drift
        prediction). Directly relevant, already-built primitives:
        - watchdog.js: a REAL predictive kill switch — reads the ledger +
          predict engine on a tick and ejects a peer BEFORE it hits
          COLLAPSING, not after. This is "kill switch if network drops"
          already built, just not wired to this thread's connect layer.
        - probe.js: real round-trip health measurement via signed pulses
          through the mesh itself — "sigma IS the health metric. No
          synthetic paths." A real, non-fabricated anomaly signal.
        - gate.js: real Ed25519 signature verification + per-node replay
          detection at the perimeter — the access-control primitive.
      kern_v2_critical_finding: >
        §THREAT MODEL FLAG, not a footnote: checked mesh.js's actual
        transport — it is raw `net.createServer` / `net.createConnection`,
        direct TCP to a real host:port. kern-v2 in its current form does
        the OPPOSITE of "never exposed to the actual network with your
        exposed ip" — it dials peers by real IP with no relay, no
        obfuscation, no domain fronting. Its identity/gate/watchdog/probe
        layers are real and reusable; its transport is not safe to expose
        to this thread's threat model as-is. Any use of kern-v2 here
        REQUIRES swapping net.connect for a relay/obfuscated transport
        first — same TURN-relay-only, never-expose-host-ICE-candidates
        principle thread_1 already established for the mesh-node work,
        applied here to a plain-TCP primitive instead of WebRTC.
      intelligence_system: >
        docs/intelligence-bridge.spec — real, already-built pattern:
        RAID queries intelligence (crystallised patterns, failure
        precursors, user-model hypotheses) BEFORE every routing decision,
        advisory only, never overriding; logs outcome after, feeding
        pattern engine and opening a tension-bearing gap on failure. This
        is the real mechanism behind James's "could use the intelligence
        system for protection" — extend this existing before/after loop
        to connect-layer routing decisions (which path, reroute or not),
        not a new intelligence hookup invented from nothing.
      copilot: >
        Real precedent for "co-pilot could even help" — guardian's own
        copilot subsystem already does advisory dispatch/ask flows
        elsewhere in this codebase. Scope for this thread: co-pilot can
        SURFACE watchdog/probe/intelligence signals to the user in plain
        language ("this connection looks anomalous, rerouting") — it
        does not gain a say in the security-critical kill-switch/reroute
        decision itself, which must be deterministic and auditable
        (ledger-logged), not LLM-mediated. Stated explicitly because the
        alternative (co-pilot in the trust path) would be a real, novel
        attack surface in exactly the threat model this build is for.

    build_order:
      instruction: "James: CLI first, then API, then contract, then UI on top."
      note: >
        Matches this codebase's own established law (bottom-up: CLI → API
        → interaction contract → UI floats on top — same order as every
        other subsystem's AXIOMS). One command per real capability, not a
        monolithic "connect" verb — each maps to a real module above:
      commands_proposed:
        - "nexus-connect status            — real regime/sigma/probe health, no side effects"
        - "nexus-connect harden            — pre-flight: verify no real IP/identity would be exposed before allowing connect (the 'secure the node before connecting' instruction)"
        - "nexus-connect connect --relay   — refuses to run without an obfuscated/relay transport (see kern_v2_critical_finding — this flag existing at all is the enforcement point)"
        - "nexus-connect disconnect        — manual kill switch"
        - "nexus-connect reroute           — manual trigger of the same path watchdog.js/probe.js would trigger automatically"
        - "nexus-connect obfuscate --mode  — select traffic-shaping/steganography mode, once a real steg module is sourced (bridge_os_full_not_present)"

    open_design_questions:
      - question: Source the missing 36 Bridge OS modules, or build fresh?
        note: >
          bridge-onion/bridge-steg/bridge-proxy/bridge-nat are named,
          real, and already built somewhere outside this session's
          uploads per the core README's own text. Re-deriving onion
          routing or steganography from scratch when a tested
          implementation may already exist is real wasted risk in a
          security-critical path — recommend locating and reviewing
          those modules before writing any new transport code.
        recommendation: Ask James directly whether the full Bridge OS tree can be uploaded before phase G below starts.
      - question: Is kern-v2 the connect layer's identity/health substrate, or does bridge-sngate own that instead?
        note: Both are real and overlapping (Ed25519 identity + gate + heartbeat, in both). Running two parallel identity systems is a real seam-collision risk, same class as the CFR/JaaDB ledger collision already fixed elsewhere in NEXUS.
        recommendation: Pick one as canonical before phase F. Leaning kern-v2 for the drift/regime/predictive-eject machinery bridge-sngate doesn't have — but this is James's call, not assumed here.
      - question: What does "connect" actually dial into — a specific NEXUS peer, a Tor/Snowflake bridge pool, or both?
        recommendation: Needs an explicit answer; changes whether bridge-nat/bridge-proxy or a real Snowflake broker client is the thing to source.

    recommendation: >
      Do not write connect-layer code yet, same reasoning as thread 1 —
      phase F below doesn't start until the two open questions above (the
      module-sourcing decision, and canonical identity/health substrate)
      have real answers, precisely because this thread's own threat model
      is more exposed than any other in this document: this is the layer
      that decides whether a real IP address is ever exposed.

  # ── Phasing (continued) ──────────────────────────────────────────────
  phasing:
    - phase: A
      name: threat model + design sign-off
      covers: [thread_1 open design questions, thread_2 route allowlist]
      status: in_progress — this document
      blocks_on: null
    - phase: B
      name: signaling-gate.js
      covers: closes remote-desktop phase 6 (replay + session-hijack detection) — tracked separately from this doc
      blocks_on: null — independently buildable, can run now
    - phase: C
      name: nexus:// URI handler, real implementation
      covers: thread_2 — shared route-resolver + three call sites (COS, idearium, ClearGlass)
      blocks_on: phase A route-allowlist sign-off
    - phase: D
      name: update-system → electron-build-update COS blueprint
      covers: thread_3, plus the pinned-key signing addition
      blocks_on: null — independently buildable, can run parallel to B and C
    - phase: E
      name: ClearGlass mesh-node implementation
      covers: thread_1
      blocks_on: [James's explicit answers to phase A's five open questions, external security review before any FPF-facing rollout]
      note: Deliberately last. No mesh-node code before phase A is answered.
    - phase: F
      name: connect-layer substrate decision + transport hardening
      covers: thread_4's two open design questions — canonical identity/health substrate (kern-v2 vs bridge-sngate), and swapping kern-v2's raw net.connect for a relay/obfuscated transport before any other phase touches it
      blocks_on: [James's answers to thread_4's open design questions]
      note: Deliberately first of the thread-4 phases — every phase below assumes a substrate decision that hasn't been made yet.
    - phase: G
      name: nexus-connect CLI
      covers: thread_4 build_order — status, harden, connect --relay, disconnect, reroute, obfuscate — against the phase-F substrate only
      blocks_on: phase F
    - phase: H
      name: nexus-connect API
      covers: HTTP surface over phase G's CLI, same one-shared-module discipline as thread_2's resolver
      blocks_on: phase G
    - phase: I
      name: nexus-connect interaction contract
      covers: the real, versioned request/response contract phase H's API commits to — written against what phase H actually does, not speculative
      blocks_on: phase H
    - phase: J
      name: nexus-connect UI
      covers: thin UI over phase I's contract — status, kill switch, reroute control, co-pilot-surfaced anomaly explanations (advisory only, per thread_4's copilot boundary)
      blocks_on: phase I
    - phase: K
      name: obfuscation + fallback routing (Snowflake-equivalent transport)
      covers: bridge-onion/bridge-steg/bridge-proxy/bridge-nat integration once sourced, or their from-scratch equivalents if James confirms build-fresh
      blocks_on: [James's answer on sourcing the missing 36 Bridge OS modules vs building fresh, external security review before any FPF-facing rollout]
      note: Deliberately last, same reasoning as phase E — this is the actual anti-deanonymization layer; no code here before phase F's substrate is hardened and reviewed.
