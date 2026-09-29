envelope: 1
uuid: nexus-export-command-cortex.memory.forget
type: command
id: cortex.memory.forget
context: cortex command — declared · served unknown (no dispatch extractor)
intent: null
summary: null
system: null
tags:
  - cortex
  - command
  - declared
exported_at: 1790684787090
source: cortex/registry-components.js
occurrences: 1
firstSeenAt: 1790684787090
lastSeenAt: 1790684787090
fingerprint: aa9a5e6215af4b4c424843ba
payload:
  method: POST
  path: /api/memory/forget
  declared: true
  served: null
  description: Archive memory row (never delete)
  grammar:
    - memory forget
  capability: cortex.memory.forget
