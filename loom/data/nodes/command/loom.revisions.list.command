envelope: 1
uuid: nexus-export-command-loom.revisions.list
type: command
id: loom.revisions.list
context: loom command — declared · served unknown (no dispatch extractor)
intent: null
summary: null
system: null
tags:
  - loom
  - command
  - declared
exported_at: 1790684787474
source: loom/registry-components.js
occurrences: 1
firstSeenAt: 1789250730152
lastSeenAt: 1790684787474
fingerprint: 3f48f097d491928366565802
payload:
  method: GET
  path: /api/revisions
  declared: true
  served: null
  description: List registry revisions
  grammar:
    - revisions list
    - revisions-list
  capability: loom.revisions.list
