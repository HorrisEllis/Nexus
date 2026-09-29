envelope: 1
uuid: nexus-export-command-cg.status
type: command
id: cg.status
context: clear-glass command — declared · served unknown (no dispatch extractor)
intent: null
summary: null
system: null
tags:
  - clear-glass
  - command
  - declared
exported_at: 1790684786749
source: clear-glass/registry-components.js
occurrences: 1
firstSeenAt: 1789250730157
lastSeenAt: 1790684786749
fingerprint: fc440fe895954daa09106bc6
payload:
  method: GET
  path: /status
  declared: true
  served: null
  description: Full system status — bus sample, agents, listeners, TLS
  grammar:
    - status
  capability: cg.status
