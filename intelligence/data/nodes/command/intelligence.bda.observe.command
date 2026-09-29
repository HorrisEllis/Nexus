envelope: 1
uuid: nexus-export-command-intelligence.bda.observe
type: command
id: intelligence.bda.observe
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
fingerprint: 8cb1203e58e0135d318bdca1
payload:
  method: POST
  path: /api/intelligence/bda/observe
  declared: true
  served: null
  description: Feed one utterance to BDA — signals, regime, drift/gap events
  grammar:
    - bda observe
    - intelligence bda
  capability: intelligence.bda.observe
