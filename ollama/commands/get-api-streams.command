envelope: 1
uuid: nexus-export-command-get-api-streams
type: command
id: get-api-streams
context: >-
  ollama/commands — one real command, self-declared by its own route module (routes/stream.js's own
  `commands` export), aggregated live by ollama/lib/command-index.js. Regenerate this file by
  re-running this script if that route module's commands export changes.
intent: null
summary: null
system: ollama
tags:
  - ollama
  - command
  - stream
exported_at: 1789239441229
source: ollama/lib/command-index.js#buildCommandIndex() <- routes/stream.js
payload:
  method: GET
  path: /api/streams
