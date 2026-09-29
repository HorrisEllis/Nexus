envelope: 1
uuid: nexus-export-command-cg.vault.status
type: command
id: cg.vault.status
context: clear-glass command — declared · served unknown (no dispatch extractor)
intent: null
summary: null
system: null
tags:
  - clear-glass
  - command
  - declared
exported_at: 1790684786837
source: clear-glass/registry-components.js
occurrences: 1
firstSeenAt: 1790684786837
lastSeenAt: 1790684786837
fingerprint: f79288bee7a0aa5e62fe1bf8
payload:
  method: IPC
  path: vault:status
  declared: true
  served: null
  description: Which key protects each vault — OS-sealed (safeStorage) or legacy
  grammar:
    - vault status
  capability: cg.vault.status
