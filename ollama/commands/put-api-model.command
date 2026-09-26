envelope: 1
uuid: nexus-export-command-put-api-model
type: command
id: put-api-model
context: >-
  ollama/commands — one real command, self-declared by its own route module (routes/models.js's own
  `commands` export), aggregated live by ollama/lib/command-index.js. Regenerate this file by
  re-running this script if that route module's commands export changes.
intent: null
summary: null
system: ollama
tags:
  - ollama
  - command
  - models
exported_at: 1789239441226
source: ollama/lib/command-index.js#buildCommandIndex() <- routes/models.js
payload:
  method: PUT
  path: /api/model
  description: validated against ollama's real /api/tags before accepting
