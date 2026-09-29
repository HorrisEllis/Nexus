envelope: 1
uuid: nexus-export-command-guardian.job.response
type: command
id: guardian.job.response
context: guardian command — declared · NOT served
intent: null
summary: null
system: null
tags:
  - guardian
  - command
  - declared
  - not-served
exported_at: 1790684787236
source: guardian/registry-components.js
occurrences: 1
firstSeenAt: 1789250730140
lastSeenAt: 1790684787236
fingerprint: 5c2e9c3debd87873227cc014
payload:
  method: GET
  path: /response/:jobId
  declared: true
  served: false
  description: Full response for a job
  grammar:
    - job response
    - job-response
  capability: guardian.job.response
