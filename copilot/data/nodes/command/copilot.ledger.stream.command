envelope: 1
uuid: nexus-export-command-copilot.ledger.stream
type: command
id: copilot.ledger.stream
context: copilot command — declared · served unknown (no dispatch extractor)
intent: null
summary: null
system: null
tags:
  - copilot
  - command
  - declared
exported_at: 1790684787046
source: copilot/registry-components.js
occurrences: 1
firstSeenAt: 1789250730183
lastSeenAt: 1790684787046
fingerprint: 0bc838a09ac5836ce09dcd1c
payload:
  method: GET
  path: /ledger/stream
  declared: true
  served: null
  description: Canonical component-ledger rows as SSE — the cross-process wire autopilot consumes
  grammar:
    - copilot ledger stream
  capability: copilot.ledger.stream
