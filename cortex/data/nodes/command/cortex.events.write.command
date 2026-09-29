envelope: 1
uuid: nexus-export-command-cortex.events.write
type: command
id: cortex.events.write
context: cortex command — declared · served unknown (no dispatch extractor)
intent: null
summary: null
system: null
tags:
  - cortex
  - command
  - declared
exported_at: 1790684787089
source: cortex/registry-components.js
occurrences: 1
firstSeenAt: 1790684787089
lastSeenAt: 1790684787089
fingerprint: 68734483d6a23882a08d7d2f
payload:
  method: POST
  path: /api/event
  declared: true
  served: null
  description: Write event to JAA event_log
  grammar:
    - events write
  capability: cortex.events.write
