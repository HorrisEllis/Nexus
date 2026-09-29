envelope: 1
uuid: nexus-export-command-copilot.person_model.health
type: command
id: copilot.person_model.health
context: copilot command — declared · served unknown (no dispatch extractor)
intent: null
summary: null
system: null
tags:
  - copilot
  - command
  - declared
exported_at: 1790684787036
source: copilot/registry-components.js
occurrences: 1
firstSeenAt: 1789250730181
lastSeenAt: 1790684787036
fingerprint: 2cf285ff5b4f1b7458b48276
payload:
  method: GET
  path: /api/person-model/health
  declared: true
  served: null
  description: Person-model stats + chain state
  grammar:
    - copilot person_model health
  capability: copilot.person_model.health
