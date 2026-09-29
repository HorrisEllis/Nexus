envelope: 1
uuid: nexus-export-command-copilot.opportunity.rescore
type: command
id: copilot.opportunity.rescore
context: copilot command — declared · served unknown (no dispatch extractor)
intent: null
summary: null
system: null
tags:
  - copilot
  - command
  - declared
exported_at: 1790684787063
source: copilot/registry-components.js
occurrences: 1
firstSeenAt: 1790684787063
lastSeenAt: 1790684787063
fingerprint: 0acb45b71870e4f59f8d6767
payload:
  method: POST
  path: /api/opportunity/rescore
  declared: true
  served: null
  description: Re-rank everything not yet past SHORTLISTED after a profile change
  grammar:
    - copilot opportunity rescore
  capability: copilot.opportunity.rescore
