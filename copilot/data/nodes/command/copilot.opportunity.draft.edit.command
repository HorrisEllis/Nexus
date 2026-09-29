envelope: 1
uuid: nexus-export-command-copilot.opportunity.draft.edit
type: command
id: copilot.opportunity.draft.edit
context: copilot command — declared · served unknown (no dispatch extractor)
intent: null
summary: null
system: null
tags:
  - copilot
  - command
  - declared
exported_at: 1790684787074
source: copilot/registry-components.js
occurrences: 1
firstSeenAt: 1790684787074
lastSeenAt: 1790684787074
fingerprint: a70bdf0925a918f451ce6745
payload:
  method: PUT
  path: /api/opportunity/:id/draft/:kind
  declared: true
  served: null
  description: James edits a draft; the edit is what gets used
  grammar:
    - copilot opportunity draft edit
  capability: copilot.opportunity.draft.edit
