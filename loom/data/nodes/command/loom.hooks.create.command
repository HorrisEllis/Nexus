envelope: 1
uuid: nexus-export-command-loom.hooks.create
type: command
id: loom.hooks.create
context: loom command — declared · served unknown (no dispatch extractor)
intent: null
summary: null
system: null
tags:
  - loom
  - command
  - declared
exported_at: 1790684787478
source: loom/registry-components.js
occurrences: 1
firstSeenAt: 1789250730148
lastSeenAt: 1790684787478
fingerprint: 0b5ce382276a3883fba669ab
payload:
  method: POST
  path: /api/hooks
  declared: true
  served: null
  description: Create/update a hook (write authority)
  grammar:
    - hooks create
    - hooks-create
  capability: loom.hooks.create
