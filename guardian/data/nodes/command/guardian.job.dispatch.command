envelope: 1
uuid: nexus-export-command-guardian.job.dispatch
type: command
id: guardian.job.dispatch
context: guardian command — declared · served
intent: null
summary: null
system: null
tags:
  - guardian
  - command
  - declared
  - served
exported_at: 1790684787253
source: guardian/registry-components.js + guardian/lib/command-index-extract.js (guardian/server.js)
occurrences: 1
firstSeenAt: 1789250730139
lastSeenAt: 1790684787253
fingerprint: c663b5d20a2509ce3563de9b
payload:
  method: POST
  path: /command
  declared: true
  served: true
  description: Dispatch job to provider (raw or SEAM)
  grammar:
    - job dispatch
    - job-dispatch
  capability: guardian.job.dispatch
