envelope: 1
uuid: nexus-export-command-copilot.context.session
type: command
id: copilot.context.session
context: copilot command — declared · served unknown (no dispatch extractor)
intent: null
summary: null
system: null
tags:
  - copilot
  - command
  - declared
exported_at: 1790698456526
source: copilot/registry-components.js
occurrences: 1
firstSeenAt: 1790698456526
lastSeenAt: 1790698456526
fingerprint: ea561bb0ddddf855f9137b80
payload:
  method: GET
  path: /api/context/:id
  declared: true
  served: null
  description: The context snapshot copilot would send for a session
  grammar:
    - copilot context session
  capability: copilot.context.session
