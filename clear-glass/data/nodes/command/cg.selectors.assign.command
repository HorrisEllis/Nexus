envelope: 1
uuid: nexus-export-command-cg.selectors.assign
type: command
id: cg.selectors.assign
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
fingerprint: 67011ab7b45486ef366f8939
payload:
  method: IPC
  path: selectors:assign
  declared: true
  served: null
  description: >-
    Record a picked, live-checked input/send/reply selector in guardian's selector map (POST
    :7820/api/agents/:id/selectors, source picker); refused without evidence or with evidence from
    another provider's page
  grammar:
    - selectors assign
  capability: cg.selectors.assign
