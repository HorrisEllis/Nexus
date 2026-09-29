envelope: 1
uuid: nexus-export-command-intelligence.gap.status
type: command
id: intelligence.gap.status
context: intelligence command — declared · served unknown (no dispatch extractor)
intent: null
summary: null
system: null
tags:
  - intelligence
  - command
  - declared
exported_at: 1790684787424
source: intelligence/registry-components.js
occurrences: 1
firstSeenAt: 1790684787424
lastSeenAt: 1790684787424
fingerprint: 5e494b3c744f5d62e30930c9
payload:
  method: GET
  path: /api/intelligence/gap/status
  declared: true
  served: null
  description: Gap-lifecycle ledger stats + registered predicate types
  grammar:
    - gap status
    - intelligence gap
  capability: intelligence.gap.status
