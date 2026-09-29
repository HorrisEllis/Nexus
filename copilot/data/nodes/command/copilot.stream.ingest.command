envelope: 1
uuid: nexus-export-command-copilot.stream.ingest
type: command
id: copilot.stream.ingest
context: copilot command — declared · served unknown (no dispatch extractor)
intent: null
summary: null
system: null
tags:
  - copilot
  - command
  - declared
exported_at: 1790684787073
source: copilot/registry-components.js
occurrences: 1
firstSeenAt: 1789250730176
lastSeenAt: 1790684787073
fingerprint: caffaf94493d8dd159d94761
payload:
  method: POST
  path: /api/stream/ingest
  declared: true
  served: null
  description: Push events into co-pilot stream
  grammar:
    - copilot stream ingest
  capability: copilot.stream.ingest
