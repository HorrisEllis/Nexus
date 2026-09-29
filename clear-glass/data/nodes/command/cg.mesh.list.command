envelope: 1
uuid: nexus-export-command-cg.mesh.list
type: command
id: cg.mesh.list
context: clear-glass command — declared · served unknown (no dispatch extractor)
intent: null
summary: null
system: null
tags:
  - clear-glass
  - command
  - declared
exported_at: 1790684786736
source: clear-glass/registry-components.js
occurrences: 1
firstSeenAt: 1789250730161
lastSeenAt: 1790684786736
fingerprint: 328a235ec19941c439dae1cc
payload:
  method: GET
  path: /agents
  declared: true
  served: null
  description: List mesh agents
  grammar:
    - mesh list
  capability: cg.mesh.list
