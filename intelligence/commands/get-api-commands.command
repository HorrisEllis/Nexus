envelope: 1
uuid: nexus-export-command-get-api-commands
type: command
id: get-api-commands
context: >-
  intelligence/commands — one real, self-declared route from capability "intelligence.commands"
  (Real, dynamic command list — this registry, live). Regenerate by re-running this script if
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
  path: /api/commands
