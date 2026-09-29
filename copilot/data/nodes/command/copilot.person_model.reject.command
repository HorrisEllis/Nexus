envelope: 1
uuid: nexus-export-command-copilot.person_model.reject
type: command
id: copilot.person_model.reject
context: copilot command — declared · served unknown (no dispatch extractor)
intent: null
summary: null
system: null
tags:
  - copilot
  - command
  - declared
exported_at: 1790684787070
source: copilot/registry-components.js
occurrences: 1
firstSeenAt: 1789250730179
lastSeenAt: 1790684787070
fingerprint: 202b62d88b8cb02925ebef7c
payload:
  method: POST
  path: /api/person-model/reject
  declared: true
  served: null
  description: Rejects a proposed observation. A reason is required (§IP-6)
  grammar:
    - reject observation
  capability: copilot.person_model.reject
