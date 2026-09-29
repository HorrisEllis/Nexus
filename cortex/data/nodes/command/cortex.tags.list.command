envelope: 1
uuid: nexus-export-command-cortex.tags.list
type: command
id: cortex.tags.list
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
fingerprint: a91df746befc0c9b3c192adc
payload:
  method: GET
  path: /api/tags
  declared: true
  served: null
  description: All tags in memory
  grammar:
    - tags list
  capability: cortex.tags.list
