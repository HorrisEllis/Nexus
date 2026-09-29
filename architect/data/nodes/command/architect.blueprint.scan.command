envelope: 1
uuid: nexus-export-command-architect.blueprint.scan
type: command
id: architect.blueprint.scan
context: architect command — declared · served unknown (no dispatch extractor)
intent: null
summary: null
system: null
tags:
  - architect
  - command
  - declared
exported_at: 1790684786607
source: architect/registry-components.js
occurrences: 1
firstSeenAt: 1789250730063
lastSeenAt: 1790684786607
fingerprint: 3855785f1f90630f93a667c3
payload:
  method: POST
  path: /api/blueprint/scan
  declared: true
  served: null
  description: Scan path → generate blueprint
  grammar:
    - blueprint scan
  capability: architect.blueprint.scan
