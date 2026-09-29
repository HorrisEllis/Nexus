envelope: 1
uuid: nexus-export-command-guardian.queue.compartments
type: command
id: guardian.queue.compartments
context: guardian command — declared · served
intent: null
summary: null
system: null
tags:
  - guardian
  - command
  - declared
  - served
exported_at: 1790684787236
source: guardian/registry-components.js + guardian/lib/command-index-extract.js (guardian/server.js)
occurrences: 1
firstSeenAt: 1789250730142
lastSeenAt: 1790684787236
fingerprint: 11cc280b392abdfa4950d4bb
payload:
  method: GET
  path: /queue/compartments
  declared: true
  served: true
  description: Job compartment list
  grammar:
    - queue compartments
    - queue-compartments
  capability: guardian.queue.compartments
