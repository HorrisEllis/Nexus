envelope: 1
uuid: nexus-export-command-eravos.transport.stop
type: command
id: eravos.transport.stop
context: eravos command — declared · served unknown (no dispatch extractor)
intent: null
summary: null
system: null
tags:
  - eravos
  - command
  - declared
exported_at: 1790684787188
source: eravos/registry-components.js
occurrences: 1
firstSeenAt: 1789250730186
lastSeenAt: 1790684787188
fingerprint: b760d3db2f4411b8eb5aa1eb
payload:
  method: POST
  path: /api/transport/stop
  declared: true
  served: null
  description: Stop playback
  grammar:
    - eravos stop
  capability: eravos.transport.stop
