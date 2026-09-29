envelope: 1
uuid: nexus-export-command-loom.hooks.wire
type: command
id: loom.hooks.wire
context: loom command — declared · served unknown (no dispatch extractor)
intent: null
summary: null
system: null
tags:
  - loom
  - command
  - declared
exported_at: 1790684787479
source: loom/registry-components.js
occurrences: 1
firstSeenAt: 1789250730148
lastSeenAt: 1790684787479
fingerprint: b8d53dff25e34268f59d36d4
payload:
  method: POST
  path: /api/hooks/wire
  declared: true
  served: null
  description: Wire a hook→hook binding (fromId→toId) — the consumer-edge write path
  grammar:
    - hooks wire
    - hooks-wire
  capability: loom.hooks.wire
