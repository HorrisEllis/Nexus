envelope: 1
uuid: nexus-export-command-intelligence.alk.record
type: command
id: intelligence.alk.record
context: intelligence command — declared · served unknown (no dispatch extractor)
intent: null
summary: null
system: null
tags:
  - intelligence
  - command
  - declared
exported_at: 1790684787444
source: intelligence/registry-components.js
occurrences: 1
firstSeenAt: 1790684787444
lastSeenAt: 1790684787444
fingerprint: 6e1b852ad216f14282b1c2b4
payload:
  method: POST
  path: /api/intelligence/alk/record
  declared: true
  served: null
  description: ALK — record a decision node {actor,intent,payload,causedBy}
  grammar:
    - alk record
    - intelligence alk
  capability: intelligence.alk.record
