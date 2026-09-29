envelope: 1
uuid: nexus-export-command-copilot.opportunity.dismiss
type: command
id: copilot.opportunity.dismiss
context: copilot command — declared · served unknown (no dispatch extractor)
intent: null
summary: null
system: null
tags:
  - copilot
  - command
  - declared
exported_at: 1790684787057
source: copilot/registry-components.js
occurrences: 1
firstSeenAt: 1790684787057
lastSeenAt: 1790684787057
fingerprint: ff654ab58d3c551258ee7c24
payload:
  method: POST
  path: /api/opportunity/:id/dismiss
  declared: true
  served: null
  description: Dismiss an opportunity
  grammar:
    - copilot opportunity dismiss
  capability: copilot.opportunity.dismiss
