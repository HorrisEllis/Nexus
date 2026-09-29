envelope: 1
uuid: nexus-export-command-loom.registry.get
type: command
id: loom.registry.get
context: loom command — declared · served unknown (no dispatch extractor)
intent: null
summary: null
system: null
tags:
  - loom
  - command
  - declared
exported_at: 1790684787474
source: loom/registry-components.js
occurrences: 1
firstSeenAt: 1789250730148
lastSeenAt: 1790684787474
fingerprint: 25d58ee79d33feee64ab57cb
payload:
  method: GET
  path: /api/registry/:kind/:id
  declared: true
  served: null
  description: Read a registry entry (component/seam/wire)
  grammar:
    - registry get
    - registry-get
  capability: loom.registry.get
