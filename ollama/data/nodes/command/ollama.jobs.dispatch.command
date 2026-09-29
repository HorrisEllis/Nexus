envelope: 1
uuid: nexus-export-command-ollama.jobs.dispatch
type: command
id: ollama.jobs.dispatch
context: ollama command — declared · served
intent: null
summary: null
system: null
tags:
  - ollama
  - command
  - declared
  - served
exported_at: 1790684787509
source: ollama/registry-components.js + ollama/lib/command-index.js (ollama/routes/*.js)
occurrences: 1
firstSeenAt: 1789250730189
lastSeenAt: 1790684787509
fingerprint: d8373f6e4019d41369e7e33a
payload:
  method: POST
  path: /api/jobs
  declared: true
  served: true
  description: Queue a job for local model execution
  grammar:
    - ollama dispatch
    - od
    - ollama run
  capability: ollama.jobs.dispatch
