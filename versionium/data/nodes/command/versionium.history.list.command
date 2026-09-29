envelope: 1
uuid: nexus-export-command-versionium.history.list
type: command
id: versionium.history.list
context: versionium command — declared · served unknown (no dispatch extractor)
intent: null
summary: null
system: null
tags:
  - versionium
  - command
  - declared
exported_at: 1790684787528
source: versionium/registry-components.js
occurrences: 1
firstSeenAt: 1789250756046
lastSeenAt: 1790684787528
fingerprint: f4fcaea37e90d05189beeb82
payload:
  method: GET
  path: /api/versionium/history
  declared: true
  served: null
  description: Real commit history, optionally filtered by system
  grammar:
    - versionium history
    - vh
  capability: versionium.history.list
