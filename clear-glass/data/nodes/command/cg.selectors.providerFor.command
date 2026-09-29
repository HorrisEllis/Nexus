envelope: 1
uuid: nexus-export-command-cg.selectors.providerFor
type: command
id: cg.selectors.providerFor
context: clear-glass command — declared · served unknown (no dispatch extractor)
intent: null
summary: null
system: null
tags:
  - clear-glass
  - command
  - declared
exported_at: 1790684786829
source: clear-glass/registry-components.js
occurrences: 1
firstSeenAt: 1790684786829
lastSeenAt: 1790684786829
fingerprint: c4a25c0028e5612397bdd8b4
payload:
  method: IPC
  path: selectors:provider-for-url
  declared: true
  served: null
  description: >-
    Which NCP provider a page belongs to (src/providers/registry.js hosts) — decides whether a pick
    is offered as a provider selector
  grammar:
    - selectors providerFor
  capability: cg.selectors.providerFor
