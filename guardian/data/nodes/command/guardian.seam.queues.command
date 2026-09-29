envelope: 1
uuid: nexus-export-command-guardian.seam.queues
type: command
id: guardian.seam.queues
context: guardian command — declared · served
intent: null
summary: null
system: null
tags:
  - guardian
  - command
  - declared
  - served
exported_at: 1790684787237
source: guardian/registry-components.js + guardian/lib/command-index-extract.js (guardian/server.js)
occurrences: 1
firstSeenAt: 1789250730140
lastSeenAt: 1790684787237
fingerprint: b4b02cb6ee3946fa9a7badb9
payload:
  method: GET
  path: /seam/queues
  declared: true
  served: true
  description: Active SEAM queues
  grammar:
    - seam queues
    - seam-queues
  capability: guardian.seam.queues
