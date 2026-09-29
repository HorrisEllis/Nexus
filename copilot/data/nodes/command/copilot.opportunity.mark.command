envelope: 1
uuid: nexus-export-command-copilot.opportunity.mark
type: command
id: copilot.opportunity.mark
context: copilot command — declared · served unknown (no dispatch extractor)
intent: null
summary: null
system: null
tags:
  - copilot
  - command
  - declared
exported_at: 1790684787058
source: copilot/registry-components.js
occurrences: 1
firstSeenAt: 1790684787058
lastSeenAt: 1790684787058
fingerprint: fe42ec5e6131fd7d7d989b6a
payload:
  method: POST
  path: /api/opportunity/:id/mark
  declared: true
  served: null
  description: 'Record a response: RESPONDED / INTERVIEW / OFFER / REJECTED / ARCHIVED'
  grammar:
    - copilot opportunity mark
  capability: copilot.opportunity.mark
