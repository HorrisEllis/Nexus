envelope: 1
uuid: nexus-export-command-cg.passwords.delete
type: command
id: cg.passwords.delete
context: clear-glass command — declared · served unknown (no dispatch extractor)
intent: null
summary: null
system: null
tags:
  - clear-glass
  - command
  - declared
exported_at: 1790684786816
source: clear-glass/registry-components.js
occurrences: 1
firstSeenAt: 1789250730173
lastSeenAt: 1790684786816
fingerprint: a5d768a7609971b3627c5ef8
payload:
  method: IPC
  path: passwords:delete
  declared: true
  served: null
  description: Delete a real saved password
  grammar:
    - passwords delete
  capability: cg.passwords.delete
