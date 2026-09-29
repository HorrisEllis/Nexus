envelope: 1
uuid: nexus-export-command-guardian.seam.retry
type: command
id: guardian.seam.retry
context: guardian command — declared · served
intent: null
summary: null
system: null
tags:
  - guardian
  - command
  - declared
  - served
exported_at: 1790684787256
source: guardian/registry-components.js + guardian/lib/command-index-extract.js (guardian/server.js)
occurrences: 1
firstSeenAt: 1789250730141
lastSeenAt: 1790684787256
fingerprint: 71b52f41c3b47380b2a76c52
payload:
  method: POST
  path: /seam/retry
  declared: true
  served: true
  description: Retry a failed SEAM chunk
  grammar:
    - seam retry
    - seam-retry
  capability: guardian.seam.retry
