envelope: 1
uuid: nexus-export-command-copilot.opportunity.submit
type: command
id: copilot.opportunity.submit
context: copilot command — declared · served unknown (no dispatch extractor)
intent: null
summary: null
system: null
tags:
  - copilot
  - command
  - declared
exported_at: 1790684787059
source: copilot/registry-components.js
occurrences: 1
firstSeenAt: 1790684787059
lastSeenAt: 1790684787059
fingerprint: 30571196ad391d376dc566d7
payload:
  method: POST
  path: /api/opportunity/:id/submit
  declared: true
  served: null
  description: James submits a prepared application (presses the button, checks for confirmation)
  grammar:
    - copilot opportunity submit
  capability: copilot.opportunity.submit
