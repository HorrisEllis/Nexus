envelope: 1
uuid: nexus-export-command-get-api-tape
type: command
id: get-api-tape
context: >-
  ollama/commands — one real command, self-declared by its own route module (routes/tape.js's own
  `commands` export), aggregated live by ollama/lib/command-index.js. Regenerate this file by
  re-running this script if that route module's commands export changes.
intent: null
summary: null
system: ollama
tags:
  - ollama
  - command
  - tape
exported_at: 1791401155818
source: ollama/lib/command-index.js#buildCommandIndex() <- routes/tape.js
payload:
  method: GET
  path: /api/tape
  description: "every run on the Ollama tape"
