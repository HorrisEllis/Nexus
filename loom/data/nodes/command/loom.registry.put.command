envelope: 1
uuid: nexus-export-command-loom.registry.put
type: command
id: loom.registry.put
context: loom command — declared · served unknown (no dispatch extractor)
intent: null
summary: null
system: null
tags:
  - loom
  - command
  - declared
exported_at: 1790684787480
source: loom/registry-components.js
occurrences: 1
firstSeenAt: 1789250730148
lastSeenAt: 1790684787480
fingerprint: 4d586172855c5ae120e58789
payload:
  method: POST
  path: /api/registry/:kind
  declared: true
  served: null
  description: Write a registry entry
  grammar:
    - registry put
    - registry-put
  capability: loom.registry.put
