envelope: 1
uuid: nexus-export-command-copilot.person_model.state
type: command
id: copilot.person_model.state
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
firstSeenAt: 1789250730180
lastSeenAt: 1790684787070
fingerprint: 650e497f78db60a6ea76561a
payload:
  method: POST
  path: /api/person-model/state
  declared: true
  served: null
  description: The user states something about themselves — the ONLY route into trigger/sensitive/boundary
  grammar:
    - remember about me
    - i am
    - my value
    - my goal
  capability: copilot.person_model.state
