envelope: 1
uuid: nexus-export-command-cortex.snapshot.rollback
type: command
id: cortex.snapshot.rollback
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
fingerprint: 63ae1acf111925be575c6cb2
payload:
  method: POST
  path: /api/snapshots/rollback
  declared: true
  served: null
  description: Rollback to snapshot
  grammar:
    - snapshot rollback
  capability: cortex.snapshot.rollback
