envelope: 1
uuid: nexus-export-command-get-events
type: command
id: get-events
context: >-
  ollama/commands — one real command, self-declared by its own route module (routes/system.js's own
  `commands` export), aggregated live by ollama/lib/command-index.js. Regenerate this file by
  re-running this script if that route module's commands export changes.
intent: null
summary: null
system: ollama
tags:
  - ollama
  - command
  - system
exported_at: 1789239441233
source: ollama/lib/command-index.js#buildCommandIndex() <- routes/system.js
payload:
  method: GET
  path: /events
  description: SSE stream, real ollama.connected event on open
