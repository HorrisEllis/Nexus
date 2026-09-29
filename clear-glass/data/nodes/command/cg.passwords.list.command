envelope: 1
uuid: nexus-export-command-cg.passwords.list
type: command
id: cg.passwords.list
context: clear-glass command — declared · served unknown (no dispatch extractor)
intent: null
summary: null
system: null
tags:
  - clear-glass
  - command
  - declared
exported_at: 1790684786817
source: clear-glass/registry-components.js
occurrences: 1
firstSeenAt: 1789250730173
lastSeenAt: 1790684786817
fingerprint: 0ce56c245a362e6f7aea9890
payload:
  method: IPC
  path: passwords:list
  declared: true
  served: null
  description: List real saved passwords (metadata only)
  grammar:
    - passwords list
  capability: cg.passwords.list
