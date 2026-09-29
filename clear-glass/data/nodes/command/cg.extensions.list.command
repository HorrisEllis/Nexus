envelope: 1
uuid: nexus-export-command-cg.extensions.list
type: command
id: cg.extensions.list
context: clear-glass command — declared · served unknown (no dispatch extractor)
intent: null
summary: null
system: null
tags:
  - clear-glass
  - command
  - declared
exported_at: 1790684786790
source: clear-glass/registry-components.js
occurrences: 1
firstSeenAt: 1789250730169
lastSeenAt: 1790684786790
fingerprint: aa2f80425820c7ffcaca8208
payload:
  method: IPC
  path: extensions:list
  declared: true
  served: null
  description: List real loaded Chrome extensions
  grammar:
    - extensions list
  capability: cg.extensions.list
