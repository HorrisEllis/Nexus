envelope: 1
uuid: nexus-export-command-guardian.providers.list
type: command
id: guardian.providers.list
context: guardian command — declared · served
intent: null
summary: null
system: null
tags:
  - guardian
  - command
  - declared
  - served
exported_at: 1790684787234
source: guardian/registry-components.js + guardian/lib/command-index-extract.js (guardian/server.js)
occurrences: 1
firstSeenAt: 1789250730133
lastSeenAt: 1790684787234
fingerprint: 0a58d426c1179a7d2f9ac577
payload:
  method: GET
  path: /providers
  declared: true
  served: true
  description: Connected NCP browser tab providers
  grammar:
    - providers list
    - providers-list
  capability: guardian.providers.list
