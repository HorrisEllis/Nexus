envelope: 1
uuid: nexus-export-command-copilot.introspect.health
type: command
id: copilot.introspect.health
context: copilot command — declared · served unknown (no dispatch extractor)
intent: null
summary: null
system: null
tags:
  - copilot
  - command
  - declared
exported_at: 1790684787030
source: copilot/registry-components.js
occurrences: 1
firstSeenAt: 1789250730182
lastSeenAt: 1790684787030
fingerprint: 4da3f89eee6beba0ff50a782
payload:
  method: GET
  path: /api/introspect/health
  declared: true
  served: null
  description: Which introspection signals are readable right now, and which are blind
  grammar:
    - introspect health
    - what can you check
  capability: copilot.introspect.health
