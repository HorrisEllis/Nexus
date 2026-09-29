envelope: 1
uuid: nexus-export-command-guardian.queue.enqueue
type: command
id: guardian.queue.enqueue
context: guardian command — declared · served
intent: null
summary: null
system: null
tags:
  - guardian
  - command
  - declared
  - served
exported_at: 1790684787255
source: guardian/registry-components.js + guardian/lib/command-index-extract.js (guardian/server.js)
occurrences: 1
firstSeenAt: 1789250730142
lastSeenAt: 1790684787255
fingerprint: 1c0eae5676e51133bf28c6ab
payload:
  method: POST
  path: /queue/enqueue
  declared: true
  served: true
  description: Enqueue item to physical queue
  grammar:
    - queue enqueue
    - queue-enqueue
  capability: guardian.queue.enqueue
