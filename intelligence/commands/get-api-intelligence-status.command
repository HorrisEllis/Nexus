envelope: 1
uuid: nexus-export-command-get-api-intelligence-status
type: command
id: get-api-intelligence-status
context: >-
  intelligence/commands — one real, self-declared route from capability "intelligence.status"
  (Intelligence subsystem health). Regenerate by re-running this script if registry-components.js
  changes.
intent: null
summary: null
system: intelligence
tags:
  - intelligence
  - command
  - intelligence
exported_at: 1789239484018
source: intelligence/registry-components.js — the same list GET /api/commands already returns live
payload:
  method: GET
  path: /api/intelligence/status
