envelope: 1
uuid: nexus-export-command-cg.accounts.setDefault
type: command
id: cg.accounts.setDefault
context: clear-glass command — declared · served unknown (no dispatch extractor)
intent: null
summary: null
system: null
tags:
  - clear-glass
  - command
  - declared
exported_at: 1790684786765
source: clear-glass/registry-components.js
occurrences: 1
firstSeenAt: 1790684786765
lastSeenAt: 1790684786765
fingerprint: 970d82c97ce223a47d210f6b
payload:
  method: IPC
  path: accounts:setDefault
  declared: true
  served: null
  description: >-
    Set/clear the per-provider default account (Clear Glass is the account authority guardian
    resolves against)
  grammar:
    - accounts setDefault
  capability: cg.accounts.setDefault
