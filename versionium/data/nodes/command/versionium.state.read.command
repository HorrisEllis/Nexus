envelope: 1
uuid: nexus-export-command-versionium.state.read
type: command
id: versionium.state.read
context: versionium command — declared · served unknown (no dispatch extractor)
intent: null
summary: null
system: null
tags:
  - versionium
  - command
  - declared
exported_at: 1790684787531
source: versionium/registry-components.js
occurrences: 1
firstSeenAt: 1789250756052
lastSeenAt: 1790684787531
fingerprint: b24b861df2dd55807b754b9d
payload:
  method: GET
  path: /api/versionium/state/:commitId
  declared: true
  served: null
  description: Direct-restore read of a commit's stored state
  grammar:
    - versionium state
  capability: versionium.state.read
