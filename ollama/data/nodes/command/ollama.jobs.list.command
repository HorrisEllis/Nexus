envelope: 1
uuid: nexus-export-command-ollama.jobs.list
type: command
id: ollama.jobs.list
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
fingerprint: 4e1cbd2798111511ce2fbccc
payload:
  method: GET
  path: /api/jobs
  declared: true
  served: true
  description: List recent jobs
  grammar:
    - ollama jobs
    - oj
  capability: ollama.jobs.list
