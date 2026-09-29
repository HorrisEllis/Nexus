envelope: 1
uuid: nexus-export-command-cortex.health
type: command
id: cortex.health
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
fingerprint: 32b6d1827543bb86db0b28da
payload:
  method: GET
  path: /health
  declared: true
  served: null
  description: Cortex health + JAA stats
  grammar:
    - health
  capability: cortex.health
