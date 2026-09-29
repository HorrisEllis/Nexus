envelope: 1
uuid: nexus-export-command-cg.mesh.jobIntake
type: command
id: cg.mesh.jobIntake
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
fingerprint: 8d6613c85d022355c07abff1
payload:
  method: GET
  path: /agent-mesh/intake
  declared: true
  served: null
  description: >-
    Jobs Clear Glass has taken in from guardian (only jobs guardian claimed for it on their .job),
    with each <jobId>.intake record
  grammar:
    - mesh jobIntake
  capability: cg.mesh.jobIntake
