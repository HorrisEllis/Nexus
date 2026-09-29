envelope: 1
uuid: nexus-export-command-copilot.opportunity.answers.approve
type: command
id: copilot.opportunity.answers.approve
context: copilot command — declared · served unknown (no dispatch extractor)
intent: null
summary: null
system: null
tags:
  - copilot
  - command
  - declared
exported_at: 1790684787060
source: copilot/registry-components.js
occurrences: 1
firstSeenAt: 1790684787060
lastSeenAt: 1790684787060
fingerprint: 2f7169550b5a7c63298ce93f
payload:
  method: POST
  path: /api/opportunity/answers/:id/approve
  declared: true
  served: null
  description: Approve a drafted answer for reuse
  grammar:
    - copilot opportunity answers approve
  capability: copilot.opportunity.answers.approve
