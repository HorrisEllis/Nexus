envelope: 1
uuid: nexus-export-command-cortex.snapshot.create
type: command
id: cortex.snapshot.create
context: cortex command — declared · served unknown (no dispatch extractor)
intent: null
summary: null
system: null
tags:
  - cortex
  - command
  - declared
exported_at: 1790684787093
source: cortex/registry-components.js
occurrences: 1
firstSeenAt: 1790684787093
lastSeenAt: 1790684787093
fingerprint: b8a5fe1095ae7a10a0a2a10b
payload:
  method: POST
  path: /api/snapshots/create
  declared: true
  served: null
  description: Create snapshot
  grammar:
    - snapshot create
  capability: cortex.snapshot.create
