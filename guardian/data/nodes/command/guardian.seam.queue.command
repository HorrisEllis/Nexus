envelope: 1
uuid: nexus-export-command-guardian.seam.queue
type: command
id: guardian.seam.queue
context: guardian command — declared · NOT served
intent: null
summary: null
system: null
tags:
  - guardian
  - command
  - declared
  - not-served
exported_at: 1790684787237
source: guardian/registry-components.js
occurrences: 1
firstSeenAt: 1789250730140
lastSeenAt: 1790684787237
fingerprint: 1ec501143d02198467121aab
payload:
  method: GET
  path: /seam/queues/:id
  declared: true
  served: false
  description: Single SEAM queue detail
  grammar:
    - seam queue
    - seam-queue
  capability: guardian.seam.queue
