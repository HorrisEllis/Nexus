envelope: 1
uuid: nexus-export-command-intelligence.gap.verify
type: command
id: intelligence.gap.verify
context: intelligence command — declared · served unknown (no dispatch extractor)
intent: null
summary: null
system: null
tags:
  - intelligence
  - command
  - declared
exported_at: 1790684787447
source: intelligence/registry-components.js
occurrences: 1
firstSeenAt: 1790684787447
lastSeenAt: 1790684787447
fingerprint: 081d8a8f69e9ee9d3128066e
payload:
  method: POST
  path: /api/intelligence/gap/verify
  declared: true
  served: null
  description: Verify closure of a gap (predicate + artifact, both required)
  grammar:
    - gap verify
    - intelligence gap
  capability: intelligence.gap.verify
