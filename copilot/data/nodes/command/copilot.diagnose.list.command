envelope: 1
uuid: nexus-export-command-copilot.diagnose.list
type: command
id: copilot.diagnose.list
context: copilot command — declared · served unknown (no dispatch extractor)
intent: null
summary: null
system: null
tags:
  - copilot
  - command
  - declared
exported_at: 1790684787029
source: copilot/registry-components.js
occurrences: 1
firstSeenAt: 1789250730178
lastSeenAt: 1790684787029
fingerprint: 652a169e2d84ab1f811894c2
payload:
  method: GET
  path: /api/diagnose/list
  declared: true
  served: null
  description: List past diagnosis sessions
  grammar:
    - copilot diagnose list
  capability: copilot.diagnose.list
