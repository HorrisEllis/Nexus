envelope: 1
uuid: nexus-export-command-eravos.catalog.list
type: command
id: eravos.catalog.list
context: eravos command — declared · served unknown (no dispatch extractor)
intent: null
summary: null
system: null
tags:
  - eravos
  - command
  - declared
exported_at: 1790684787180
source: eravos/registry-components.js
occurrences: 1
firstSeenAt: 1789250730185
lastSeenAt: 1790684787180
fingerprint: d15db04ed93be9be7639b8ad
payload:
  method: GET
  path: /api/catalog
  declared: true
  served: null
  description: Available mods from registry
  grammar:
    - eravos catalog
  capability: eravos.catalog.list
