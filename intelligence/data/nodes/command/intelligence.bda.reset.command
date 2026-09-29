envelope: 1
uuid: nexus-export-command-intelligence.bda.reset
type: command
id: intelligence.bda.reset
context: intelligence command — declared · served unknown (no dispatch extractor)
intent: null
summary: null
system: null
tags:
  - intelligence
  - command
  - declared
exported_at: 1790684787446
source: intelligence/registry-components.js
occurrences: 1
firstSeenAt: 1790684787446
lastSeenAt: 1790684787446
fingerprint: 4415456dadb6f682d663dc1f
payload:
  method: POST
  path: /api/intelligence/bda/reset
  declared: true
  served: null
  description: Reset BDA session state
  grammar:
    - bda reset
    - intelligence bda
  capability: intelligence.bda.reset
