envelope: 1
uuid: nexus-export-command-copilot.opportunity.show
type: command
id: copilot.opportunity.show
context: copilot command — declared · served unknown (no dispatch extractor)
intent: null
summary: null
system: null
tags:
  - copilot
  - command
  - declared
exported_at: 1790684787031
source: copilot/registry-components.js
occurrences: 1
firstSeenAt: 1790684787031
lastSeenAt: 1790684787031
fingerprint: b7bf2ac198cc7ab75fdb7919
payload:
  method: GET
  path: /api/opportunity/:id
  declared: true
  served: null
  description: One opportunity with its ledger and policy
  grammar:
    - copilot opportunity show
  capability: copilot.opportunity.show
