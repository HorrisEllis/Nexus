envelope: 1
uuid: nexus-export-command-copilot.tools.list
type: command
id: copilot.tools.list
context: copilot command — declared · served unknown (no dispatch extractor)
intent: null
summary: null
system: null
tags:
  - copilot
  - command
  - declared
exported_at: 1790684787042
source: copilot/registry-components.js
occurrences: 1
firstSeenAt: 1790684787042
lastSeenAt: 1790684787042
fingerprint: 7283379899b62a603f41b9a6
payload:
  method: GET
  path: /api/tools/list
  declared: true
  served: null
  description: Every registered tool, grouped, in plain language (?q= search, ?scope= marks a caller's scope)
  grammar:
    - tools
    - list tools
  capability: copilot.tools.list
