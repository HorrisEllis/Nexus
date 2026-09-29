envelope: 1
uuid: nexus-export-command-loom.gaps.domain
type: command
id: loom.gaps.domain
context: loom command — declared · served unknown (no dispatch extractor)
intent: null
summary: null
system: null
tags:
  - loom
  - command
  - declared
exported_at: 1790684787469
source: loom/registry-components.js
occurrences: 1
firstSeenAt: 1789250730153
lastSeenAt: 1790684787469
fingerprint: 1c3e542553d9419ac3c85ce1
payload:
  method: GET
  path: /api/gaps/:domain
  declared: true
  served: null
  description: Open gaps for one domain (system | user-model)
  grammar:
    - gaps domain
    - gaps-domain
  capability: loom.gaps.domain
