envelope: 1
uuid: nexus-export-command-guardian.sessions.list
type: command
id: guardian.sessions.list
context: guardian command — declared · served
intent: null
summary: null
system: null
tags:
  - guardian
  - command
  - declared
  - served
exported_at: 1790684787240
source: guardian/registry-components.js + guardian/lib/command-index-extract.js (guardian/server.js)
occurrences: 1
firstSeenAt: 1789250730143
lastSeenAt: 1790684787240
fingerprint: 79c55feebc0adc436c29a0b4
payload:
  method: GET
  path: /sessions
  declared: true
  served: true
  description: NCP session history
  grammar:
    - sessions list
    - sessions-list
  capability: guardian.sessions.list
