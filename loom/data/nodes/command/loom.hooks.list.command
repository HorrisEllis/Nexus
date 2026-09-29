envelope: 1
uuid: nexus-export-command-loom.hooks.list
type: command
id: loom.hooks.list
context: loom command — declared · served unknown (no dispatch extractor)
intent: null
summary: null
system: null
tags:
  - loom
  - command
  - declared
exported_at: 1790684787472
source: loom/registry-components.js
occurrences: 1
firstSeenAt: 1789250730147
lastSeenAt: 1790684787472
fingerprint: afd9b128a340021f249b9da9
payload:
  method: GET
  path: /api/hooks
  declared: true
  served: null
  description: List hooks — the registry loom is write authority for
  grammar:
    - hooks list
    - hooks-list
  capability: loom.hooks.list
