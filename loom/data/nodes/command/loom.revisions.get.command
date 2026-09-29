envelope: 1
uuid: nexus-export-command-loom.revisions.get
type: command
id: loom.revisions.get
context: loom command — declared · served unknown (no dispatch extractor)
intent: null
summary: null
system: null
tags:
  - loom
  - command
  - declared
exported_at: 1790684787475
source: loom/registry-components.js
occurrences: 1
firstSeenAt: 1789250730152
lastSeenAt: 1790684787475
fingerprint: 0acd9e9e06ff036558c6d349
payload:
  method: GET
  path: /api/revisions/:id
  declared: true
  served: null
  description: Read one revision
  grammar:
    - revisions get
    - revisions-get
  capability: loom.revisions.get
