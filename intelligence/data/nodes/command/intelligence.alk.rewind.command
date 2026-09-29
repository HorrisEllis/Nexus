envelope: 1
uuid: nexus-export-command-intelligence.alk.rewind
type: command
id: intelligence.alk.rewind
context: intelligence command — declared · served unknown (no dispatch extractor)
intent: null
summary: null
system: null
tags:
  - intelligence
  - command
  - declared
exported_at: 1790684787445
source: intelligence/registry-components.js
occurrences: 1
firstSeenAt: 1790684787445
lastSeenAt: 1790684787445
fingerprint: 009ea711053f6be347434585
payload:
  method: POST
  path: /api/intelligence/alk/rewind
  declared: true
  served: null
  description: ALK — control-Z a decision (immutable original, reversedBy marker)
  grammar:
    - alk rewind
    - intelligence alk
  capability: intelligence.alk.rewind
