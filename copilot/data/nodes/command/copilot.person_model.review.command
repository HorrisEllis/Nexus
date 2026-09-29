envelope: 1
uuid: nexus-export-command-copilot.person_model.review
type: command
id: copilot.person_model.review
context: copilot command — declared · served unknown (no dispatch extractor)
intent: null
summary: null
system: null
tags:
  - copilot
  - command
  - declared
exported_at: 1790684787038
source: copilot/registry-components.js
occurrences: 1
firstSeenAt: 1789250730179
lastSeenAt: 1790684787038
fingerprint: 5250be292fad761eba6bcfef
payload:
  method: GET
  path: /api/person-model/review
  declared: true
  served: null
  description: Observations the co-pilot has proposed about the user — pending, never claims (§IP-5)
  grammar:
    - review queue
    - what have you noticed
    - pending observations
  capability: copilot.person_model.review
