envelope: 1
uuid: nexus-export-command-copilot.person_model.purge
type: command
id: copilot.person_model.purge
context: copilot command — declared · served unknown (no dispatch extractor)
intent: null
summary: null
system: null
tags:
  - copilot
  - command
  - declared
exported_at: 1790684787069
source: copilot/registry-components.js
occurrences: 1
firstSeenAt: 1789250730181
lastSeenAt: 1790684787069
fingerprint: f7bbe24a168aeede3425eb13
payload:
  method: POST
  path: /api/person-model/purge
  declared: true
  served: null
  description: HARD DELETE of the whole model. Requires an explicit confirmation string
  grammar:
    - copilot person_model purge
  capability: copilot.person_model.purge
