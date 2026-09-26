envelope: 1
uuid: nexus-export-command-post-api-jobs
type: command
id: post-api-jobs
context: >-
  ollama/commands — one real command, self-declared by its own route module (routes/jobs.js's own
  `commands` export), aggregated live by ollama/lib/command-index.js. Regenerate this file by
  re-running this script if that route module's commands export changes.
intent: null
summary: null
system: ollama
tags:
  - ollama
  - command
  - jobs
exported_at: 1789239441223
source: ollama/lib/command-index.js#buildCommandIndex() <- routes/jobs.js
payload:
  method: POST
  path: /api/jobs
