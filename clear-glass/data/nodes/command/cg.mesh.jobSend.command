envelope: 1
uuid: nexus-export-command-cg.mesh.jobSend
type: command
id: cg.mesh.jobSend
context: clear-glass command — declared · served unknown (no dispatch extractor)
intent: null
summary: null
system: null
tags:
  - clear-glass
  - command
  - declared
exported_at: 1790684786840
source: clear-glass/registry-components.js
occurrences: 1
firstSeenAt: 1790684786840
lastSeenAt: 1790684786840
fingerprint: b88adefdfe7c082548940dc0
payload:
  method: POST
  path: /agent-mesh/send
  declared: true
  served: null
  description: >-
    Guardian hands Clear Glass a job it CLAIMED on its .job; the intake verifies the claim via
    guardian /jobs?id= before queueing (idempotent by jobId)
  grammar:
    - mesh jobSend
  capability: cg.mesh.jobSend
