envelope: 1
uuid: nexus-export-command-cg.wire.hostile
type: command
id: cg.wire.hostile
context: clear-glass command — declared · served unknown (no dispatch extractor)
intent: null
summary: null
system: null
tags:
  - clear-glass
  - command
  - declared
exported_at: 1790684786845
source: clear-glass/registry-components.js
occurrences: 1
firstSeenAt: 1789250730165
lastSeenAt: 1790684786845
fingerprint: 3e55a9cdcb2b5fb16625c300
payload:
  method: POST
  path: /hook/hostile
  declared: true
  served: null
  description: Hostile detection → fp switch
  grammar:
    - wire hostile
  capability: cg.wire.hostile
