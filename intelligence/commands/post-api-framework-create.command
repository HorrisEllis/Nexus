envelope: 1
uuid: nexus-export-command-post-api-framework-create
type: command
id: post-api-framework-create
context: >-
  intelligence/commands — one real, self-declared route from capability
  "intelligence.framework.create" (Generate a real WARP-based framework skeleton). Regenerate by
  re-running this script if registry-components.js changes.
intent: null
summary: null
system: intelligence
tags:
  - intelligence
  - command
  - intelligence
  - build
exported_at: 1789239484025
source: intelligence/registry-components.js — the same list GET /api/commands already returns live
payload:
  method: POST
  path: /api/framework/create
