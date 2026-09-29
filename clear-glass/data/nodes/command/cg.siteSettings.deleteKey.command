envelope: 1
uuid: nexus-export-command-cg.siteSettings.deleteKey
type: command
id: cg.siteSettings.deleteKey
context: clear-glass command — declared · served unknown (no dispatch extractor)
intent: null
summary: null
system: null
tags:
  - clear-glass
  - command
  - declared
exported_at: 1790684786832
source: clear-glass/registry-components.js
occurrences: 1
firstSeenAt: 1789250730168
lastSeenAt: 1790684786832
fingerprint: d71ef3c2d9badc34efdb97bd
payload:
  method: IPC
  path: site-settings:deleteKey
  declared: true
  served: null
  description: Delete one real setting key
  grammar:
    - siteSettings deleteKey
  capability: cg.siteSettings.deleteKey
