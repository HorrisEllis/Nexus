envelope: 1
uuid: nexus-export-command-ollama.models.list
type: command
id: ollama.models.list
context: ollama command — declared · served
intent: null
summary: null
system: null
tags:
  - ollama
  - command
  - declared
  - served
exported_at: 1790684787504
source: ollama/registry-components.js + ollama/lib/command-index.js (ollama/routes/*.js)
occurrences: 1
firstSeenAt: 1789250730190
lastSeenAt: 1790684787504
fingerprint: f3d466438120a497d843d818
payload:
  method: GET
  path: /api/models
  declared: true
  served: true
  description: Available local models
  grammar:
    - ollama models
    - om
  capability: ollama.models.list
