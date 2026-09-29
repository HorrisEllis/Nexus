envelope: 1
uuid: nexus-export-command-copilot.opportunity.templates.reset
type: command
id: copilot.opportunity.templates.reset
context: copilot command — declared · served unknown (no dispatch extractor)
intent: null
summary: null
system: null
tags:
  - copilot
  - command
  - declared
exported_at: 1790684787019
source: copilot/registry-components.js
occurrences: 1
firstSeenAt: 1790684787019
lastSeenAt: 1790684787019
fingerprint: 70ee6bb875017866daa13797
payload:
  method: DELETE
  path: /api/opportunity/templates/:id
  declared: true
  served: null
  description: Reset a drafting template to its default
  grammar:
    - copilot opportunity templates reset
  capability: copilot.opportunity.templates.reset
