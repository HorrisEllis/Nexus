envelope: 1
uuid: nexus-export-command-ollama.queue.status
type: command
id: ollama.queue.status
context: ollama command — declared · served
intent: null
summary: null
system: null
tags:
  - ollama
  - command
  - declared
  - served
exported_at: 1790684787505
source: ollama/registry-components.js + ollama/lib/command-index.js (ollama/routes/*.js)
occurrences: 1
firstSeenAt: 1789250730190
lastSeenAt: 1790684787505
fingerprint: ebc962153a1518e13f41f69c
payload:
  method: GET
  path: /api/queue
  declared: true
  served: true
  description: Queue depth and running count
  grammar:
    - ollama queue
    - oq
  capability: ollama.queue.status
