envelope: 1
uuid: nexus-export-command-cg.siteSettings.get
type: command
id: cg.siteSettings.get
context: clear-glass command — declared · served unknown (no dispatch extractor)
intent: null
summary: null
system: null
tags:
  - clear-glass
  - command
  - declared
exported_at: 1790684786832
source: clear-glass/registry-components.js
occurrences: 1
firstSeenAt: 1789250730167
lastSeenAt: 1790684786832
fingerprint: 8934d55c263507cad4cb33aa
payload:
  method: IPC
  path: site-settings:get
  declared: true
  served: null
  description: Get one real per-origin setting
  grammar:
    - siteSettings get
  capability: cg.siteSettings.get
