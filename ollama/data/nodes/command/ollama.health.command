envelope: 1
uuid: nexus-export-command-ollama.health
type: command
id: ollama.health
context: ollama command — declared · served
intent: null
summary: null
system: null
tags:
  - ollama
  - command
  - declared
  - served
exported_at: 1790684787507
source: ollama/registry-components.js + ollama/lib/command-index.js (ollama/routes/*.js)
occurrences: 1
firstSeenAt: 1789250730191
lastSeenAt: 1790684787507
fingerprint: 17d79d685658fef3ceea76bd
payload:
  method: GET
  path: /health
  declared: true
  served: true
  description: Ollama bridge health
  grammar:
    - ollama health
  capability: ollama.health
