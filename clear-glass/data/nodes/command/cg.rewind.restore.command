envelope: 1
uuid: nexus-export-command-cg.rewind.restore
type: command
id: cg.rewind.restore
context: clear-glass command — declared · served unknown (no dispatch extractor)
intent: null
summary: null
system: null
tags:
  - clear-glass
  - command
  - declared
exported_at: 1790684786826
source: clear-glass/registry-components.js
occurrences: 1
firstSeenAt: 1789250730172
lastSeenAt: 1790684786826
fingerprint: 42e287c2145772fd225a7926
payload:
  method: IPC
  path: rewind:restore
  declared: true
  served: null
  description: Restore a real rewind snapshot
  grammar:
    - rewind restore
  capability: cg.rewind.restore
