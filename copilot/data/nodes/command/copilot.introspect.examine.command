envelope: 1
uuid: nexus-export-command-copilot.introspect.examine
type: command
id: copilot.introspect.examine
context: copilot command — declared · served unknown (no dispatch extractor)
intent: null
summary: null
system: null
tags:
  - copilot
  - command
  - declared
exported_at: 1790684787054
source: copilot/registry-components.js
occurrences: 1
firstSeenAt: 1789250730181
lastSeenAt: 1790684787054
fingerprint: 3f0a332279395cdde2bdf932
payload:
  method: POST
  path: /api/introspect
  declared: true
  served: null
  description: >-
    Examine the last answer against REAL signals — reflection score, contract shape, gaps, ledger.
    Never the model’s own opinion
  grammar:
    - introspect
    - check your last answer
    - was that right
    - examine that response
  capability: copilot.introspect.examine
