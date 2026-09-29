envelope: 1
uuid: nexus-export-command-guardian.events
type: command
id: guardian.events
context: guardian command — declared · served
intent: null
summary: null
system: null
tags:
  - guardian
  - command
  - declared
  - served
exported_at: 1790684787231
source: guardian/registry-components.js + guardian/lib/command-index-extract.js (guardian/server.js)
occurrences: 1
firstSeenAt: 1789250730132
lastSeenAt: 1790684787231
fingerprint: 6f32c5a5ddfec6dec757ab99
payload:
  method: GET
  path: /events
  declared: true
  served: true
  description: SSE — all guardian bus events
  grammar:
    - events
    - events
  capability: guardian.events
