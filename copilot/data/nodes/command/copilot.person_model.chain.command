envelope: 1
uuid: nexus-export-command-copilot.person_model.chain
type: command
id: copilot.person_model.chain
context: copilot command — declared · served unknown (no dispatch extractor)
intent: null
summary: null
system: null
tags:
  - copilot
  - command
  - declared
exported_at: 1790684787035
source: copilot/registry-components.js
occurrences: 1
firstSeenAt: 1789250730180
lastSeenAt: 1790684787035
fingerprint: da0eec53b5470016f3c6f9fa
payload:
  method: GET
  path: /api/person-model/chain
  declared: true
  served: null
  description: Session hash-chain integrity — reports breaks, attributed to the session
  grammar:
    - model history
    - session chain
  capability: copilot.person_model.chain
