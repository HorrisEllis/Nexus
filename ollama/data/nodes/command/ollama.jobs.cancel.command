envelope: 1
uuid: nexus-export-command-ollama.jobs.cancel
type: command
id: ollama.jobs.cancel
context: ollama command — declared · served
intent: null
summary: null
system: null
tags:
  - ollama
  - command
  - declared
  - served
exported_at: 1790684787501
source: ollama/registry-components.js + ollama/lib/command-index.js (ollama/routes/*.js)
occurrences: 1
firstSeenAt: 1789250730190
lastSeenAt: 1790684787501
fingerprint: 791ef535527528e6c6f48e32
payload:
  method: DELETE
  path: /api/jobs/:id
  declared: true
  served: true
  description: Cancel a queued job
  grammar:
    - ollama jobs cancel
  capability: ollama.jobs.cancel
