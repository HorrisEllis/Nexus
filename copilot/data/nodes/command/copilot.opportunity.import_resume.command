envelope: 1
uuid: nexus-export-command-copilot.opportunity.import_resume
type: command
id: copilot.opportunity.import_resume
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
fingerprint: 333227bbdfd7367fc6c6154c
payload:
  method: POST
  path: /api/opportunity/import-resume
  declared: true
  served: null
  description: Read a resume (.pdf/.docx/.txt/.md) into the profile; suggests skills
  grammar:
    - copilot opportunity import_resume
  capability: copilot.opportunity.import_resume
