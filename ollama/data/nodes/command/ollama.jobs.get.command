envelope: 1
uuid: nexus-export-command-ollama.jobs.get
type: command
id: ollama.jobs.get
context: ollama command — declared · served
intent: null
summary: null
system: null
tags:
  - ollama
  - command
  - declared
  - served
exported_at: 1790684787502
source: ollama/registry-components.js + ollama/lib/command-index.js (ollama/routes/*.js)
occurrences: 1
firstSeenAt: 1789250730190
lastSeenAt: 1790684787502
fingerprint: a079672b9e168118c3760343
payload:
  method: GET
  path: /api/jobs/:id
  declared: true
  served: true
  description: Get single job by id
  grammar:
    - ollama jobs get
  capability: ollama.jobs.get
