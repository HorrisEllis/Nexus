envelope: 1
uuid: nexus-export-command-cortex.raid.decide
type: command
id: cortex.raid.decide
context: cortex command — declared · served unknown (no dispatch extractor)
intent: null
summary: null
system: null
tags:
  - cortex
  - command
  - declared
exported_at: 1790684787092
source: cortex/registry-components.js
occurrences: 1
firstSeenAt: 1790684787092
lastSeenAt: 1790684787092
fingerprint: 719309ed5100547b2723d735
payload:
  method: POST
  path: /api/raid/decide
  declared: true
  served: null
  description: Route intent to best agent/component
  grammar:
    - raid decide
  capability: cortex.raid.decide
