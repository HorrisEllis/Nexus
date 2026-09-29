envelope: 1
uuid: nexus-export-command-guardian.job.build
type: command
id: guardian.job.build
context: guardian command — declared · served
intent: null
summary: null
system: null
tags:
  - guardian
  - command
  - declared
  - served
exported_at: 1790684787249
source: guardian/registry-components.js + guardian/lib/command-index-extract.js (guardian/server.js)
occurrences: 1
firstSeenAt: 1789250730139
lastSeenAt: 1790684787249
fingerprint: 4b05615d024d727cec443dfe
payload:
  method: POST
  path: /build
  declared: true
  served: true
  description: Full T0→T1→T2 build pipeline from spec
  grammar:
    - job build
    - job-build
  capability: guardian.job.build
