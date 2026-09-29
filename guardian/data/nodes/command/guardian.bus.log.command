envelope: 1
uuid: nexus-export-command-guardian.bus.log
type: command
id: guardian.bus.log
context: guardian command — declared · served
intent: null
summary: null
system: null
tags:
  - guardian
  - command
  - declared
  - served
exported_at: 1790684787229
source: guardian/registry-components.js + guardian/lib/command-index-extract.js (guardian/server.js)
occurrences: 1
firstSeenAt: 1789250730132
lastSeenAt: 1790684787229
fingerprint: d071de0ec2ac45574feb653c
payload:
  method: GET
  path: /bus
  declared: true
  served: true
  description: Recent SISO bus log
  grammar:
    - bus log
    - bus-log
  capability: guardian.bus.log
