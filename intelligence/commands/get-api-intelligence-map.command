envelope: 1
uuid: nexus-export-command-get-api-intelligence-map
type: command
id: get-api-intelligence-map
context: >-
  intelligence/commands — one real, self-declared route from capability "intelligence.map" (Real,
  live loom map). Regenerate by re-running this script if registry-components.js changes.
intent: null
summary: null
system: intelligence
tags:
  - intelligence
  - command
  - intelligence
exported_at: 1789239484020
source: intelligence/registry-components.js — the same list GET /api/commands already returns live
payload:
  method: GET
  path: /api/intelligence/map
