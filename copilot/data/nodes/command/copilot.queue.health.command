envelope: 1
uuid: nexus-export-command-copilot.queue.health
type: command
id: copilot.queue.health
context: copilot command — declared · served unknown (no dispatch extractor)
intent: null
summary: null
system: null
tags:
  - copilot
  - command
  - declared
exported_at: 1790684787040
source: copilot/registry-components.js
occurrences: 1
firstSeenAt: 1790684787040
lastSeenAt: 1790684787040
fingerprint: ad7eeb02fc4d0958f57c463a
payload:
  method: GET
  path: /api/queue/health
  declared: true
  served: null
  description: Every work queue's health
  grammar:
    - copilot queue health
  capability: copilot.queue.health
