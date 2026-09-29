envelope: 1
uuid: nexus-export-command-architect.hook.update
type: command
id: architect.hook.update
context: architect command — declared · served unknown (no dispatch extractor)
intent: null
summary: null
system: null
tags:
  - architect
  - command
  - declared
exported_at: 1790684786604
source: architect/registry-components.js
occurrences: 1
firstSeenAt: 1789250730057
lastSeenAt: 1790684786604
fingerprint: bb499537efa610a69e842d47
payload:
  method: PATCH
  path: /api/hooks/:id
  declared: true
  served: null
  description: Update hook metadata
  grammar:
    - hook update
  capability: architect.hook.update
