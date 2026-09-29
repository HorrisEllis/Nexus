envelope: 1
uuid: nexus-export-command-cg.accounts.resolve
type: command
id: cg.accounts.resolve
context: clear-glass command — declared · served unknown (no dispatch extractor)
intent: null
summary: null
system: null
tags:
  - clear-glass
  - command
  - declared
exported_at: 1790684786764
source: clear-glass/registry-components.js
occurrences: 1
firstSeenAt: 1790684786764
lastSeenAt: 1790684786764
fingerprint: 3d189ef6cf958bb4c11593ee
payload:
  method: IPC
  path: accounts:resolve
  declared: true
  served: null
  description: Resolve the account a dispatch to this provider would use (never auto-creates)
  grammar:
    - accounts resolve
  capability: cg.accounts.resolve
