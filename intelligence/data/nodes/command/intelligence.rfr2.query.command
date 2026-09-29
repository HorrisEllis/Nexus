envelope: 1
uuid: nexus-export-command-intelligence.rfr2.query
type: command
id: intelligence.rfr2.query
context: intelligence command — declared · served unknown (no dispatch extractor)
intent: null
summary: null
system: null
tags:
  - intelligence
  - command
  - declared
exported_at: 1790684787433
source: intelligence/registry-components.js
occurrences: 1
firstSeenAt: 1790684787433
lastSeenAt: 1790684787433
fingerprint: f4bfbba9bb240dcb4b420271
payload:
  method: GET
  path: /api/intelligence/rfr2/query
  declared: true
  served: null
  description: RFR2 Causal Query Language (CQL) — FIND events|edges|chains WHERE ...
  grammar:
    - rfr2 query
    - intelligence rfr2
  capability: intelligence.rfr2.query
