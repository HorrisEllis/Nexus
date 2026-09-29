envelope: 1
uuid: nexus-export-command-guardian.job.status
type: command
id: guardian.job.status
context: guardian command — declared · NOT served
intent: null
summary: null
system: null
tags:
  - guardian
  - command
  - declared
  - not-served
exported_at: 1790684787241
source: guardian/registry-components.js
occurrences: 1
firstSeenAt: 1789250730139
lastSeenAt: 1790684787241
fingerprint: 994ba4ea7184ab9a54b26823
payload:
  method: GET
  path: /status/:jobId
  declared: true
  served: false
  description: Single job status
  grammar:
    - job status
    - job-status
  capability: guardian.job.status
