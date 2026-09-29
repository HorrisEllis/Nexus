envelope: 1
uuid: nexus-export-command-loom.contracts.handoff
type: command
id: loom.contracts.handoff
context: loom command — declared · served unknown (no dispatch extractor)
intent: null
summary: null
system: null
tags:
  - loom
  - command
  - declared
exported_at: 1790684787478
source: loom/registry-components.js
occurrences: 1
firstSeenAt: 1789250730150
lastSeenAt: 1790684787478
fingerprint: 117fae38c3440fddda8a2d2e
payload:
  method: POST
  path: /api/contracts/:id/handoff
  declared: true
  served: null
  description: Hand off a contract
  grammar:
    - contracts handoff
    - contracts-handoff
  capability: loom.contracts.handoff
