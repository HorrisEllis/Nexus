envelope: 1
uuid: nexus-export-command-guardian.gaps.list
type: command
id: guardian.gaps.list
context: guardian command — declared · served
intent: null
summary: null
system: null
tags:
  - guardian
  - command
  - declared
  - served
exported_at: 1790684787232
source: guardian/registry-components.js + guardian/lib/command-index-extract.js (guardian/server.js)
occurrences: 1
firstSeenAt: 1789250730142
lastSeenAt: 1790684787232
fingerprint: 262e0733168f69383b316573
payload:
  method: GET
  path: /gaps
  declared: true
  served: true
  description: Open gaps detected by guardian
  grammar:
    - gaps list
    - gaps-list
  capability: guardian.gaps.list
