envelope: 1
uuid: nexus-export-command-cortex.gaps.list
type: command
id: cortex.gaps.list
context: cortex command — declared · served unknown (no dispatch extractor)
intent: null
summary: null
system: null
tags:
  - cortex
  - command
  - declared
exported_at: 1790684787087
source: cortex/registry-components.js
occurrences: 1
firstSeenAt: 1790684787087
lastSeenAt: 1790684787087
fingerprint: 760b0d7e86c9ca7574913012
payload:
  method: GET
  path: /api/gaps
  declared: true
  served: null
  description: Open gaps by severity
  grammar:
    - gaps list
  capability: cortex.gaps.list
