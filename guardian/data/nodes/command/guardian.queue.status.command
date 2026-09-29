envelope: 1
uuid: nexus-export-command-guardian.queue.status
type: command
id: guardian.queue.status
context: guardian command — declared · served
intent: null
summary: null
system: null
tags:
  - guardian
  - command
  - declared
  - served
exported_at: 1790684787235
source: guardian/registry-components.js + guardian/lib/command-index-extract.js (guardian/server.js)
occurrences: 1
firstSeenAt: 1789250730141
lastSeenAt: 1790684787235
fingerprint: 3f1ad6517c52c274429091dc
payload:
  method: GET
  path: /queue
  declared: true
  served: true
  description: Physical queue status
  grammar:
    - queue status
    - queue-status
  capability: guardian.queue.status
