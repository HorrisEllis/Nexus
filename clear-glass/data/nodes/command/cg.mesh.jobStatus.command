envelope: 1
uuid: nexus-export-command-cg.mesh.jobStatus
type: command
id: cg.mesh.jobStatus
context: clear-glass command — declared · served unknown (no dispatch extractor)
intent: null
summary: null
system: null
tags:
  - clear-glass
  - command
  - declared
exported_at: 1790684786735
source: clear-glass/registry-components.js
occurrences: 1
firstSeenAt: 1790684786735
lastSeenAt: 1790684786735
fingerprint: 70b1eab2d20807fad64111eb
payload:
  method: GET
  path: /agent-mesh/job?jobId={jobId}
  declared: true
  served: null
  description: >-
    Status of a mesh job; survives a Clear Glass restart as clear_glass_restarted (sent:null, never
    resend)
  grammar:
    - mesh jobStatus
  capability: cg.mesh.jobStatus
