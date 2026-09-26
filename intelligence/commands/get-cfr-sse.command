envelope: 1
uuid: nexus-export-command-get-cfr-sse
type: command
id: get-cfr-sse
context: >-
  intelligence/commands — one real, self-declared route from capability "intelligence.cfr.sse"
  (Real-time CFR event stream). Regenerate by re-running this script if registry-components.js
  changes.
intent: null
summary: null
system: intelligence
tags:
  - intelligence
  - command
  - intelligence
  - sse
exported_at: 1789239484025
source: intelligence/registry-components.js — the same list GET /api/commands already returns live
payload:
  method: GET
  path: /cfr/sse
