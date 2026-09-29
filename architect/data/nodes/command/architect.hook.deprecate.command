envelope: 1
uuid: nexus-export-command-architect.hook.deprecate
type: command
id: architect.hook.deprecate
context: architect command — declared · served unknown (no dispatch extractor)
intent: null
summary: null
system: null
tags:
  - architect
  - command
  - declared
exported_at: 1790684786594
source: architect/registry-components.js
occurrences: 1
firstSeenAt: 1789250730057
lastSeenAt: 1790684786594
fingerprint: 3f66587eee9eb9ff0bd9913d
payload:
  method: DELETE
  path: /api/hooks/:id
  declared: true
  served: null
  description: Deprecate or remove hook
  grammar:
    - hook deprecate
  capability: architect.hook.deprecate
