envelope: 1
uuid: nexus-export-command-copilot.sessions.get
type: command
id: copilot.sessions.get
context: copilot command — declared · served unknown (no dispatch extractor)
intent: null
summary: null
system: null
tags:
  - copilot
  - command
  - declared
exported_at: 1790684787041
source: copilot/registry-components.js
occurrences: 1
firstSeenAt: 1790684787041
lastSeenAt: 1790684787041
fingerprint: 294a86e224d0c5c720430620
payload:
  method: GET
  path: /api/sessions/:id
  declared: true
  served: null
  description: One session (404 when unknown)
  grammar:
    - copilot sessions get
  capability: copilot.sessions.get
