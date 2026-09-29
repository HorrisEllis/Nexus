envelope: 1
uuid: nexus-export-command-guardian.queue.compartment.create
type: command
id: guardian.queue.compartment.create
context: guardian command — declared · served
intent: null
summary: null
system: null
tags:
  - guardian
  - command
  - declared
  - served
exported_at: 1790684787254
source: guardian/registry-components.js + guardian/lib/command-index-extract.js (guardian/server.js)
occurrences: 1
firstSeenAt: 1789250730142
lastSeenAt: 1790684787254
fingerprint: 97d34d78ce44382daf7eda2b
payload:
  method: POST
  path: /queue/compartments
  declared: true
  served: true
  description: Create job compartment
  grammar:
    - queue compartment create
    - queue-compartment-create
  capability: guardian.queue.compartment.create
