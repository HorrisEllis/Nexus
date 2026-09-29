envelope: 1
uuid: nexus-export-command-loom.tension
type: command
id: loom.tension
context: loom command — declared · served unknown (no dispatch extractor)
intent: null
summary: null
system: null
tags:
  - loom
  - command
  - declared
exported_at: 1790684787476
source: loom/registry-components.js
occurrences: 1
firstSeenAt: 1789250730154
lastSeenAt: 1790684787476
fingerprint: 3e9f5afd08256bf09c50e002
payload:
  method: GET
  path: /api/tension
  declared: true
  served: null
  description: Per-system tension (friction + gap accumulation), proxied live from the diagnostic kernel
  grammar:
    - tension
    - tension
  capability: loom.tension
