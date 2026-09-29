envelope: 1
uuid: nexus-export-command-intelligence.gap.enrich
type: command
id: intelligence.gap.enrich
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
fingerprint: d359700ae074715c61e44034
payload:
  method: POST
  path: /api/intelligence/gap/enrich
  declared: true
  served: null
  description: Attach a checkable predicate + truth-floor to a raw gap
  grammar:
    - gap enrich
    - intelligence gap
  capability: intelligence.gap.enrich
