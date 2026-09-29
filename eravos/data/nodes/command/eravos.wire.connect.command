envelope: 1
uuid: nexus-export-command-eravos.wire.connect
type: command
id: eravos.wire.connect
context: eravos command — declared · served unknown (no dispatch extractor)
intent: null
summary: null
system: null
tags:
  - eravos
  - command
  - declared
exported_at: 1790684787189
source: eravos/registry-components.js
occurrences: 1
firstSeenAt: 1789250730184
lastSeenAt: 1790684787189
fingerprint: be3a1f56bac8e1bd06dcd263
payload:
  method: POST
  path: /api/wires
  declared: true
  served: null
  description: Connect two mod hooks
  grammar:
    - eravos wire
  capability: eravos.wire.connect
