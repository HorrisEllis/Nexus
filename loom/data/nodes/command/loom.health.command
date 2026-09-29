envelope: 1
uuid: nexus-export-command-loom.health
type: command
id: loom.health
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
firstSeenAt: 1789250730147
lastSeenAt: 1790684787476
fingerprint: dd3d10e47b12cdf0f10c090a
payload:
  method: GET
  path: /health
  declared: true
  served: null
  description: Loom health — hooks.total + components.total it owns
  grammar:
    - health
    - health
  capability: loom.health
