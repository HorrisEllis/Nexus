envelope: 1
uuid: nexus-export-command-eravos.mod.remove
type: command
id: eravos.mod.remove
context: eravos command — declared · served unknown (no dispatch extractor)
intent: null
summary: null
system: null
tags:
  - eravos
  - command
  - declared
exported_at: 1790684787178
source: eravos/registry-components.js
occurrences: 1
firstSeenAt: 1789250730184
lastSeenAt: 1790684787178
fingerprint: b53d891841d3544e9f214598
payload:
  method: DELETE
  path: /api/mods/:uuid
  declared: true
  served: null
  description: Remove an mod
  grammar:
    - eravos mod remove
  capability: eravos.mod.remove
