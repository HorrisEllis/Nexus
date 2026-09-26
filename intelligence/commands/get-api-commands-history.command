envelope: 1
uuid: nexus-export-command-get-api-commands-history
type: command
id: get-api-commands-history
context: >-
  intelligence/commands — one real, self-declared route from capability
  "intelligence.commands.history" (Real, persistent, queryable log of every command actually invoked
  — distinct from the static list above). Regenerate by re-running this script if
  registry-components.js changes.
intent: null
summary: null
system: intelligence
tags:
  - intelligence
  - command
  - intelligence
exported_at: 1789239484027
source: intelligence/registry-components.js — the same list GET /api/commands already returns live
payload:
  method: GET
  path: /api/commands/history
