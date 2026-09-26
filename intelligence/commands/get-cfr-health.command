envelope: 1
uuid: nexus-export-command-get-cfr-health
type: command
id: get-cfr-health
context: >-
  intelligence/commands — one real, self-declared route from capability "intelligence.cfr.health"
  (CFR ledger health). Regenerate by re-running this script if registry-components.js changes.
intent: null
summary: null
system: intelligence
tags:
  - intelligence
  - command
  - intelligence
exported_at: 1789239484021
source: intelligence/registry-components.js — the same list GET /api/commands already returns live
payload:
  method: GET
  path: /cfr/health
