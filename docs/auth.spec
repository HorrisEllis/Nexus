spec:
  meta:
    name:        auth
    version:     1.0.0
    foundation:  nexus-system-foundation@1.0.0
    uuid:        nexus-auth-v1-0000-2026-0615-jamesbrooks-001
    purpose: >
      First-principles authentication layer.
      RSA-2048 + AES-256-GCM. No passwords. No JWT. No third party.
      SNR gate runs before any crypto — behaviorally inconsistent
      requests dropped before they reach cryptographic verification.
      Hotswappable policy via auth/policy.json (fs.watch, 500ms).

  core:
    axioms: [AX-001, AX-002]
    constants:
      KEY_SIZE:       2048   # RSA bits
      NONCE_BYTES:    32
      NONCE_TTL_MS:   60000  # single-use, 60 second window
      RATE_LIMIT:     "5/min per UUID and IP"
      SNR_THRESHOLD:  0.75
      CLIENT_DIR:     "auth/clients/"     # .pub files — drop to grant, delete to revoke
      POLICY_FILE:    "auth/policy.json"  # watched, hotswap in 500ms
    crypto:
      asymmetric: "RSA-2048 — keypair per NEXUS instance, generated on first boot"
      symmetric:  "AES-256-GCM — session key via RSA key encapsulation"
      nonce:      "32 bytes random, single-use, 60s TTL"
      signature:  "RSA-PKCS1v15 over (nonce + timestamp + clientUUID)"

  modules:
    - id: server
      path: "auth/server.js"
      description: >
        Gate layer. Every request passes through:
        1. SNR gate (fidelity + freshness + behavioral consistency)
        2. Rate limiter (5/min per UUID and IP)
        3. Nonce check (single-use, 60s)
        4. Whitelist check (auth/clients/<uuid>.pub)
        5. RSA signature verification
        6. AES-256-GCM session establishment
        All hotswappable. Policy changes live in 500ms.
        Below SNR threshold → silent drop, no timing oracle.

    - id: client
      path: "auth/client.js"
      description: >
        Remote CLI for the full NEXUS system.
        Handles setup, login, all authenticated commands.
        Human-readable output throughout — no raw JSON, typed field
        printers, ANSI color, event formatter.
        Commands: status, gaps, search, failures, friction,
        memory, heal, version, components.
        Extensible: new commands appear automatically from component registry.
      commands:
        status:     "Full system status + AI provider availability"
        gaps:       "Open gaps with severity and friction"
        search:     "Semantic memory search with SNR scores"
        failures:   "Active failure modes requiring human action"
        friction:   "Fault class friction table"
        components: "Component registry browser"
        version:    "NEXUS version registry"
        heal:       "Trigger self-heal for a gap UUID"
        liminal:    "Interstitial space state (Phase 5)"

    - id: policy
      path: "auth/policy.json"
      description: >
        Runtime policy. fs.watch — changes live in 500ms.
        Fields: snrThreshold, rateLimit, nonceWindow, allowedClients.
        Allows zero-downtime permission changes.

  handshake:
    note: "Auth is a middleware layer, not a registered service. No components."

  security_model:
    revocation:   "Delete auth/clients/<uuid>.pub — immediate effect"
    key_rotation: "Replace auth/nexus.pem — restart required"
    policy_change: "Edit auth/policy.json — 500ms hotswap"
    snr_bypass:   "Not possible. SNR gate is pre-crypto."
