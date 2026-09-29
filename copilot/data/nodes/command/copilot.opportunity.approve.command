envelope: 1
uuid: nexus-export-command-copilot.opportunity.approve
type: command
id: copilot.opportunity.approve
context: copilot command — declared · served unknown (no dispatch extractor)
intent: null
summary: null
system: null
tags:
  - copilot
  - command
  - declared
exported_at: 1790684787056
source: copilot/registry-components.js
occurrences: 1
firstSeenAt: 1790684787056
lastSeenAt: 1790684787056
fingerprint: 75f2e28abeb648e8fb821888
payload:
  method: POST
  path: /api/opportunity/:id/approve
  declared: true
  served: null
  description: James approves an application (user-only; approves the answers it used)
  grammar:
    - copilot opportunity approve
  capability: copilot.opportunity.approve
