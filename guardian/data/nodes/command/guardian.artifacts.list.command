envelope: 1
uuid: nexus-export-command-guardian.artifacts.list
type: command
id: guardian.artifacts.list
context: guardian command — declared · served
intent: null
summary: null
system: null
tags:
  - guardian
  - command
  - declared
  - served
exported_at: 1790684787228
source: guardian/registry-components.js + guardian/lib/command-index-extract.js (guardian/server.js)
occurrences: 1
firstSeenAt: 1789250730142
lastSeenAt: 1790684787228
fingerprint: d6710e77e509b301c21c7ea2
payload:
  method: GET
  path: /artifacts
  declared: true
  served: true
  description: SHA-256 deduplicated code artifacts
  grammar:
    - artifacts list
    - artifacts-list
  capability: guardian.artifacts.list
