envelope: 1
uuid: nexus-export-command-copilot.opportunity.followups
type: command
id: copilot.opportunity.followups
context: copilot command — declared · served unknown (no dispatch extractor)
intent: null
summary: null
system: null
tags:
  - copilot
  - command
  - declared
exported_at: 1790684787062
source: copilot/registry-components.js
occurrences: 1
firstSeenAt: 1790684787062
lastSeenAt: 1790684787062
fingerprint: fd97ee92e0a0d02274360ea6
payload:
  method: POST
  path: /api/opportunity/followups
  declared: true
  served: null
  description: Mark submitted applications with no response past followUpDays and draft follow-ups
  grammar:
    - copilot opportunity followups
  capability: copilot.opportunity.followups
