envelope: 1
uuid: nexus-export-command-copilot.person_model.export
type: command
id: copilot.person_model.export
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
fingerprint: 09edaabe94a05083df207d27
payload:
  method: GET
  path: /api/person-model/export
  declared: true
  served: null
  description: Everything held about the user, in one object
  grammar:
    - export my model
    - what do you have on me
  capability: copilot.person_model.export
