envelope: 1
uuid: nexus-export-command-copilot.opportunity.list
type: command
id: copilot.opportunity.list
context: copilot command — declared · served unknown (no dispatch extractor)
intent: null
summary: null
system: null
tags:
  - copilot
  - command
  - declared
exported_at: 1790684787032
source: copilot/registry-components.js
occurrences: 1
firstSeenAt: 1790684787032
lastSeenAt: 1790684787032
fingerprint: 3a98953a047a2cf6bdd59235
payload:
  method: GET
  path: /api/opportunity/list
  declared: true
  served: null
  description: List opportunities (?stage=&kind=&q=&limit=)
  grammar:
    - copilot opportunity list
  capability: copilot.opportunity.list
