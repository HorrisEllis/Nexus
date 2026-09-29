envelope: 1
uuid: nexus-export-command-versionium.restore.read
type: command
id: versionium.restore.read
context: versionium command — declared · served unknown (no dispatch extractor)
intent: null
summary: null
system: null
tags:
  - versionium
  - command
  - declared
exported_at: 1790684787530
source: versionium/registry-components.js
occurrences: 1
firstSeenAt: 1789250756048
lastSeenAt: 1790684787530
fingerprint: f1408183f56165d69a995856
payload:
  method: GET
  path: /api/versionium/restore/:commitId
  declared: true
  served: null
  description: Real temporal replay — read-only
  grammar:
    - versionium restore
  capability: versionium.restore.read
