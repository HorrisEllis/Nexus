envelope: 1
uuid: nexus-export-command-copilot.person_model.accept
type: command
id: copilot.person_model.accept
context: copilot command — declared · served unknown (no dispatch extractor)
intent: null
summary: null
system: null
tags:
  - copilot
  - command
  - declared
exported_at: 1790684787065
source: copilot/registry-components.js
occurrences: 1
firstSeenAt: 1789250730179
lastSeenAt: 1790684787065
fingerprint: f71bf7567928087679a0ed17
payload:
  method: POST
  path: /api/person-model/accept
  declared: true
  served: null
  description: USER-ONLY. Promotes an observation to a stated claim. No agent path exists (§IP-5)
  grammar:
    - accept observation
  capability: copilot.person_model.accept
