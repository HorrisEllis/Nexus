envelope: 1
uuid: nexus-export-command-copilot.opportunity.cycle
type: command
id: copilot.opportunity.cycle
context: copilot command — declared · served unknown (no dispatch extractor)
intent: null
summary: null
system: null
tags:
  - copilot
  - command
  - declared
exported_at: 1790684787061
source: copilot/registry-components.js
occurrences: 1
firstSeenAt: 1790684787061
lastSeenAt: 1790684787061
fingerprint: 3e44e9898a68d71513d6838b
payload:
  method: POST
  path: /api/opportunity/cycle
  declared: true
  served: null
  description: Fetch sources, score, shortlist, draft the top N, due follow-ups
  grammar:
    - find jobs
    - job cycle
    - run the job search
  capability: copilot.opportunity.cycle
