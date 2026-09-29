envelope: 1
uuid: nexus-export-command-copilot.opportunity.prepare
type: command
id: copilot.opportunity.prepare
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
fingerprint: 7fe8c4bab61cfea7912ccdaa
payload:
  method: POST
  path: /api/opportunity/:id/prepare
  declared: true
  served: null
  description: Open the application in Clear Glass and fill it; stops before submit
  grammar:
    - copilot opportunity prepare
  capability: copilot.opportunity.prepare
