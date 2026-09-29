envelope: 1
uuid: nexus-export-command-orchestrator.any.api.system
type: command
id: orchestrator.any.api.system
context: orchestrator command — declared · served unknown (no dispatch extractor)
intent: null
summary: null
system: null
tags:
  - orchestrator
  - command
  - declared
exported_at: 1790684787513
source: orchestrator/interaction-contract.json
occurrences: 1
firstSeenAt: 1790684787513
lastSeenAt: 1790684787513
fingerprint: d995dcc9fcb7c8ee4aad473f
payload:
  method: ANY
  path: /api/<system>/*
  declared: true
  served: null
  description: >-
    Real cross-system proxy routing (/api/cortex/*, /api/guardian/*, /api/architect/*,
    /api/idearium/*, etc.) — referenced throughout this session's Track D (§5.2) work; each target
    system's own interaction-contract.json is the real authority for what's actually reachable
    through it, not duplicated here
  grammar: []
  capability: orchestrator.any.api.system
