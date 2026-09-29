envelope: 1
uuid: nexus-export-command-guardian.bus.emit
type: command
id: guardian.bus.emit
context: guardian command — declared · served
intent: null
summary: null
system: null
tags:
  - guardian
  - command
  - declared
  - served
exported_at: 1790684787250
source: guardian/registry-components.js + guardian/lib/command-index-extract.js (guardian/server.js)
occurrences: 1
firstSeenAt: 1789250730132
lastSeenAt: 1790684787250
fingerprint: b7daa498f2a5778f369cfecc
payload:
  method: POST
  path: /bus/emit
  declared: true
  served: true
  description: Emit event onto bus
  grammar:
    - bus emit
    - bus-emit
  capability: guardian.bus.emit
