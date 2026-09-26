envelope: 1
uuid: nexus-export-command-post-api-upload
type: command
id: post-api-upload
context: >-
  ollama/commands — one real command, self-declared by its own route module (routes/uploads.js's own
  `commands` export), aggregated live by ollama/lib/command-index.js. Regenerate this file by
  re-running this script if that route module's commands export changes.
intent: null
summary: null
system: ollama
tags:
  - ollama
  - command
  - uploads
exported_at: 1789239441229
source: ollama/lib/command-index.js#buildCommandIndex() <- routes/uploads.js
payload:
  method: POST
  path: /api/upload
