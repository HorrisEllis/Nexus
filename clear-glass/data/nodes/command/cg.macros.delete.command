envelope: 1
uuid: nexus-export-command-cg.macros.delete
type: command
id: cg.macros.delete
context: clear-glass command — declared · served unknown (no dispatch extractor)
intent: null
summary: null
system: null
tags:
  - clear-glass
  - command
  - declared
exported_at: 1790684786809
source: clear-glass/registry-components.js
occurrences: 1
firstSeenAt: 1790684786809
lastSeenAt: 1790684786809
fingerprint: bc07ea5dd004404f61721c5e
payload:
  method: IPC
  path: macros:delete
  declared: true
  served: null
  description: Delete a macro (soft-delete, audit trail kept)
  grammar:
    - macros delete
  capability: cg.macros.delete
