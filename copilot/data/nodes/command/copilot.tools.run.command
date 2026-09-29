envelope: 1
uuid: nexus-export-command-copilot.tools.run
type: command
id: copilot.tools.run
context: copilot command — declared · served unknown (no dispatch extractor)
intent: null
summary: null
system: null
tags:
  - copilot
  - command
  - declared
exported_at: 1790684787074
source: copilot/registry-components.js
occurrences: 1
firstSeenAt: 1790684787074
lastSeenAt: 1790684787074
fingerprint: 5844cadf569fc88127859680
payload:
  method: POST
  path: /api/tools/run
  declared: true
  served: null
  description: >-
    Run one tool through executeTool (config gate, fault history, event log); refused outside the
    caller's scope
  grammar:
    - run tool
  capability: copilot.tools.run
