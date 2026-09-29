envelope: 1
uuid: nexus-export-command-loom.phasemap
type: command
id: loom.phasemap
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
fingerprint: 2d1b3b535405bd205dbb7112
payload:
  method: GET
  path: /api/phasemap
  declared: true
  served: null
  description: Every phase across every phasemap, tagged by system + status
  grammar:
    - phasemap
    - phasemap
  capability: loom.phasemap
