envelope: 1
uuid: nexus-export-command-cg.events
type: command
id: cg.events
context: clear-glass command — declared · served unknown (no dispatch extractor)
intent: null
summary: null
system: null
tags:
  - clear-glass
  - command
  - declared
exported_at: 1790684786744
source: clear-glass/registry-components.js
occurrences: 1
firstSeenAt: 1789250730157
lastSeenAt: 1790684786744
fingerprint: 97a6d69e2e560cfd5402d148
payload:
  method: GET
  path: /events
  declared: true
  served: null
  description: SSE — all SISO bus events
  grammar:
    - events
  capability: cg.events
