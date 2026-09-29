envelope: 1
uuid: nexus-export-command-cortex.events
type: command
id: cortex.events
context: cortex command — declared · served unknown (no dispatch extractor)
intent: null
summary: null
system: null
tags:
  - cortex
  - command
  - declared
exported_at: 1790684787089
source: cortex/registry-components.js
occurrences: 1
firstSeenAt: 1790684787089
lastSeenAt: 1790684787089
fingerprint: 9aa9617d8c52108e58b71350
payload:
  method: GET
  path: /events
  declared: true
  served: null
  description: SSE — all cortex events
  grammar:
    - events
  capability: cortex.events
