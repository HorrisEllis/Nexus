envelope: 1
uuid: nexus-export-command-intelligence.cfr.events
type: command
id: intelligence.cfr.events
context: intelligence command — declared · served unknown (no dispatch extractor)
intent: null
summary: null
system: null
tags:
  - intelligence
  - command
  - declared
exported_at: 1790684787438
source: intelligence/registry-components.js
occurrences: 1
firstSeenAt: 1789250756076
lastSeenAt: 1790684787438
fingerprint: 652161df5e9810a104ddfea7
payload:
  method: GET
  path: /cfr/events
  declared: true
  served: null
  description: CFR event ledger, tail
  grammar:
    - cfr events
    - intelligence cfr
  capability: intelligence.cfr.events
