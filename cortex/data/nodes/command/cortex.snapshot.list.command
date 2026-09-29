envelope: 1
uuid: nexus-export-command-cortex.snapshot.list
type: command
id: cortex.snapshot.list
context: cortex command — declared · served unknown (no dispatch extractor)
intent: null
summary: null
system: null
tags:
  - cortex
  - command
  - declared
exported_at: 1790684787088
source: cortex/registry-components.js
occurrences: 1
firstSeenAt: 1790684787088
lastSeenAt: 1790684787088
fingerprint: c67b3491bd5d0a9388efb84b
payload:
  method: GET
  path: /api/snapshots
  declared: true
  served: null
  description: Snapshot list
  grammar:
    - snapshot list
  capability: cortex.snapshot.list
