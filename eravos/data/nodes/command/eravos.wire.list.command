envelope: 1
uuid: nexus-export-command-eravos.wire.list
type: command
id: eravos.wire.list
context: eravos command — declared · served unknown (no dispatch extractor)
intent: null
summary: null
system: null
tags:
  - eravos
  - command
  - declared
exported_at: 1790684787182
source: eravos/registry-components.js
occurrences: 1
firstSeenAt: 1789250730184
lastSeenAt: 1790684787182
fingerprint: 8514b8da06956fe8b0eefdb2
payload:
  method: GET
  path: /api/wires
  declared: true
  served: null
  description: List all wires
  grammar:
    - eravos wire list
  capability: eravos.wire.list
