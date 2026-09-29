envelope: 1
uuid: nexus-export-command-copilot.opportunity.prepare_reply
type: command
id: copilot.opportunity.prepare_reply
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
fingerprint: dcef8ebdf1a7f25d102845da
payload:
  method: POST
  path: /api/opportunity/:id/prepare-reply
  declared: true
  served: null
  description: Type the approved reply into a Fiverr/Upwork thread; stops before send
  grammar:
    - copilot opportunity prepare_reply
  capability: copilot.opportunity.prepare_reply
