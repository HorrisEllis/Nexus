spec:
  meta:
    name:     bridge
    version:  3.0.0
    foundation: nexus-system-foundation@1.0.0
    port:     9999
    uuid:     nexus-bridge-v3-0000-2026-0615-jamesbrooks-001
    purpose: >
      The trust relay. Every request between systems passes through Bridge.
      Ledger-backed persistence. Circuit breaker. Identity trust tiers.
      If a downstream system is down, Bridge holds requests and replays them.

  core:
    schemas:
      - BridgeRequest:  "{ uuid, from, to, method, path, body, status, retries, ts }"
      - TrustRecord:    "{ systemId, trust, lastSeen, consecutiveFails }"
    axioms: [AX-002, AX-003]
    constants:
      TRUST_TIERS:      "{ UNKNOWN, CANDIDATE, MEMBER }"
      CIRCUIT_STATES:   "{ CLOSED, HALF_OPEN, OPEN }"
      REPLAY_LIMIT:     3
      HB_POLL_MS:       5000

  events:
    emits:
      - "bridge.booted"
      - "bridge.request.received"
      - "bridge.request.forwarded"
      - "bridge.request.held"
      - "bridge.request.replayed"
      - "bridge.circuit.opened"
      - "bridge.circuit.closed"
      - "bridge.identity.upgraded"
    handles:
      - "system.registered → identity.candidate"
      - "heartbeat.tick    → registry.poll"

  handshake:
    components:
      - id: "bridge.status"
        grammar: ["bridge status", "bridge"]
        route: { method: GET, path: "/api/bridge/status" }
        description: "Bridge trust registry and circuit state"

      - id: "bridge.held"
        grammar: ["bridge held", "held"]
        route: { method: GET, path: "/api/bridge/held" }
        description: "Requests currently held pending downstream recovery"

  ui:
    type: "panel in nexus-shell"
    hotswap: true
