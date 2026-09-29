envelope: 1
uuid: nexus-export-command-loom.contracts.close
type: command
id: loom.contracts.close
context: loom command — declared · served unknown (no dispatch extractor)
intent: null
summary: null
system: null
tags:
  - loom
  - command
  - declared
exported_at: 1790684787477
source: loom/registry-components.js
occurrences: 1
firstSeenAt: 1789250730150
lastSeenAt: 1790684787477
fingerprint: a5394c2241c9fe1248b3c9aa
payload:
  method: POST
  path: /api/contracts/:id/close
  declared: true
  served: null
  description: Close a contract
  grammar:
    - contracts close
    - contracts-close
  capability: loom.contracts.close
