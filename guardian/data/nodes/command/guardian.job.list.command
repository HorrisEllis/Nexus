envelope: 1
uuid: nexus-export-command-guardian.job.list
type: command
id: guardian.job.list
context: guardian command — declared · served
intent: null
summary: null
system: null
tags:
  - guardian
  - command
  - declared
  - served
exported_at: 1790684787234
source: guardian/registry-components.js + guardian/lib/command-index-extract.js (guardian/server.js)
occurrences: 1
firstSeenAt: 1789250730135
lastSeenAt: 1790684787234
fingerprint: cfce6ef44ba3aa87cb03fc93
payload:
  method: GET
  path: /jobs
  declared: true
  served: true
  description: Active + recent jobs
  grammar:
    - job list
    - job-list
  capability: guardian.job.list
