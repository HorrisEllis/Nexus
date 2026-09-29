envelope: 1
uuid: nexus-export-command-copilot.context.get
type: command
id: copilot.context.get
context: copilot command — declared · served unknown (no dispatch extractor)
intent: null
summary: null
system: null
tags:
  - copilot
  - command
  - declared
exported_at: 1790684787027
source: copilot/registry-components.js
occurrences: 1
firstSeenAt: 1790684787027
lastSeenAt: 1790684787027
fingerprint: f47cd1743ad00633872e168c
payload:
  method: GET
  path: /api/context/:id
  declared: true
  served: null
  description: The context snapshot copilot would send for a session
  grammar:
    - copilot context get
  capability: copilot.context.get
