spec:
  meta:
    name:        contracts
    version:     1.0.0
    uuid:        nexus-contracts-v1-0000-2026-0615-jamesbrooks-001
    purpose: >
      Interaction contracts for every NEXUS system.
      The contract is a system's self-description: routes, events,
      schemas, axioms it enforces. The orchestrator fetches and
      verifies each contract on registration. Hash-compared.
      Trust state: VERIFIED / DEGRADED / MISMATCH / UNREACHABLE.

  files:
    - path: "contracts/nexus-interaction-contract.js"
      description: >
        The master contract. Describes the full system — all services,
        all routes, all events, all schemas.
        getVersionedContract() returns the full object.
        getContractForSystem(id) returns one system's slice.
        Used by orchestrator for cross-system verification.

    - path: "contracts/nexus-interaction-contract-v1.json"
      description: >
        Static JSON snapshot of the contract at v1.
        Used as baseline for MISMATCH detection.

  contract_shape:
    fields:
      - systemId:   "string"
      - version:    "string"
      - port:       "number"
      - routes:     "{ method, path, description, auth?, body?, returns? }[]"
      - events:     "{ type, description, payload }[]"
      - schemas:    "{ name, fields }[]"
      - axioms:     "string[]"
      - components: "Component[]"

  verification:
    on_register:   "Orchestrator fetches GET /:port/contract"
    hash:          "SHA-256 of JSON.stringify(contract)"
    trust_states:
      VERIFIED:    "Hash matches expected. Routes verified. All OK."
      DEGRADED:    "Contract accessible but hash mismatch. Version drift."
      MISMATCH:    "Contract structure doesn't match expected shape."
      UNREACHABLE: "HTTP timeout or ECONNREFUSED on /contract endpoint."
    retry:         "3× on socket hang-up before marking UNREACHABLE"
