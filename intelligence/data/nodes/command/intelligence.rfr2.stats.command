envelope: 1
uuid: nexus-export-command-intelligence.rfr2.stats
type: command
id: intelligence.rfr2.stats
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
fingerprint: b7a605f20cdcf24bb486f5c6
payload:
  method: GET
  path: /api/intelligence/rfr2/stats
  declared: true
  served: null
  description: RFR2 live kernel stats — event/edge counts since this process started listening
  grammar:
    - rfr2 stats
    - intelligence rfr2
  capability: intelligence.rfr2.stats
