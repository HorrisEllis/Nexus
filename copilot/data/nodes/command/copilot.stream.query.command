envelope: 1
uuid: nexus-export-command-copilot.stream.query
type: command
id: copilot.stream.query
context: copilot command — declared · served unknown (no dispatch extractor)
intent: null
summary: null
system: null
tags:
  - copilot
  - command
  - declared
exported_at: 1790684787042
source: copilot/registry-components.js
occurrences: 1
firstSeenAt: 1789250730176
lastSeenAt: 1790684787042
fingerprint: 355661ea6b4301ea7cb1b5fc
payload:
  method: GET
  path: /api/stream
  declared: true
  served: null
  description: Query the continuous event stream
  grammar:
    - stream
    - cs
  capability: copilot.stream.query
