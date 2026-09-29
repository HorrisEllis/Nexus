envelope: 1
uuid: nexus-export-command-copilot.person_model.forget
type: command
id: copilot.person_model.forget
context: copilot command — declared · served unknown (no dispatch extractor)
intent: null
summary: null
system: null
tags:
  - copilot
  - command
  - declared
exported_at: 1790684787068
source: copilot/registry-components.js
occurrences: 1
firstSeenAt: 1789250730181
lastSeenAt: 1790684787068
fingerprint: e0b54983932b3b691faa9e2a
payload:
  method: POST
  path: /api/person-model/forget
  declared: true
  served: null
  description: Archives a node with a required reason (§0.3 — never a silent delete)
  grammar:
    - forget that
  capability: copilot.person_model.forget
