envelope: 1
uuid: nexus-export-command-intelligence.status
type: command
id: intelligence.status
context: intelligence command — declared · served unknown (no dispatch extractor)
intent: null
summary: null
system: null
tags:
  - intelligence
  - command
  - declared
exported_at: 1790684787435
source: intelligence/registry-components.js
occurrences: 1
firstSeenAt: 1789250756065
lastSeenAt: 1790684787435
fingerprint: 690271c29c9f6cdb7c0b17bb
payload:
  method: GET
  path: /api/intelligence/status
  declared: true
  served: null
  description: Intelligence subsystem health
  grammar:
    - status
    - intelligence status
  capability: intelligence.status
