envelope: 1
uuid: nexus-export-command-eravos.mod.list
type: command
id: eravos.mod.list
context: eravos command — declared · served unknown (no dispatch extractor)
intent: null
summary: null
system: null
tags:
  - eravos
  - command
  - declared
exported_at: 1790684787181
source: eravos/registry-components.js
occurrences: 1
firstSeenAt: 1789250730184
lastSeenAt: 1790684787181
fingerprint: 568af81d059a971df1ce967a
payload:
  method: GET
  path: /api/mods
  declared: true
  served: null
  description: List all mounted mods
  grammar:
    - eravos mods
  capability: eravos.mod.list
