envelope: 1
uuid: nexus-export-command-guardian.health
type: command
id: guardian.health
context: guardian command — declared · served
intent: null
summary: null
system: null
tags:
  - guardian
  - command
  - declared
  - served
exported_at: 1790684787233
source: guardian/registry-components.js + guardian/lib/command-index-extract.js (guardian/server.js)
occurrences: 1
firstSeenAt: 1789250730123
lastSeenAt: 1790684787233
fingerprint: 6ae3e9a2d97d308051781e2c
payload:
  method: GET
  path: /health
  declared: true
  served: true
  description: Guardian health, job counts, provider status
  grammar:
    - health
    - health
  capability: guardian.health
