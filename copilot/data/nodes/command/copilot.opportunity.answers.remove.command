envelope: 1
uuid: nexus-export-command-copilot.opportunity.answers.remove
type: command
id: copilot.opportunity.answers.remove
context: copilot command — declared · served unknown (no dispatch extractor)
intent: null
summary: null
system: null
tags:
  - copilot
  - command
  - declared
exported_at: 1790684787014
source: copilot/registry-components.js
occurrences: 1
firstSeenAt: 1790684787014
lastSeenAt: 1790684787014
fingerprint: f4c8ddf7ec8db8b745267e48
payload:
  method: DELETE
  path: /api/opportunity/answers/:id
  declared: true
  served: null
  description: Remove an answer
  grammar:
    - copilot opportunity answers remove
  capability: copilot.opportunity.answers.remove
