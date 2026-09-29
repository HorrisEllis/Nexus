envelope: 1
uuid: nexus-export-command-cg.health
type: command
id: cg.health
context: clear-glass command — declared · served unknown (no dispatch extractor)
intent: null
summary: null
system: null
tags:
  - clear-glass
  - command
  - declared
exported_at: 1790684786745
source: clear-glass/registry-components.js
occurrences: 1
firstSeenAt: 1789250730156
lastSeenAt: 1790684786745
fingerprint: c7e735dd08e8e1be0830a531
payload:
  method: GET
  path: /health
  declared: true
  served: null
  description: Clear Glass health, context count, bus stats
  grammar:
    - health
  capability: cg.health
