envelope: 1
uuid: nexus-export-command-loom.phasemap.system
type: command
id: loom.phasemap.system
context: loom command — declared · served unknown (no dispatch extractor)
intent: null
summary: null
system: null
tags:
  - loom
  - command
  - declared
exported_at: 1790684787473
source: loom/registry-components.js
occurrences: 1
firstSeenAt: 1789250730153
lastSeenAt: 1790684787473
fingerprint: 9ace2f98cbb6f9a8ab8db694
payload:
  method: GET
  path: /api/phasemap/:system
  declared: true
  served: null
  description: One system's roadmap — done/pending phase breakdown
  grammar:
    - phasemap system
    - phasemap-system
  capability: loom.phasemap.system
