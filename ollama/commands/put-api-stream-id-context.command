envelope: 1
uuid: nexus-export-command-put-api-stream-id-context
type: command
id: put-api-stream-id-context
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
exported_at: 1789239441228
source: ollama/lib/command-index.js#buildCommandIndex() <- routes/stream.js
payload:
  method: PUT
  path: /api/stream/:id/context
  description: checked before the generic /api/stream/:id prefix — see this file's own §ROUTE ORDER comment
