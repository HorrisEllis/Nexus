envelope: 1
uuid: nexus-export-command-cg.downloads.responseItem
type: command
id: cg.downloads.responseItem
context: clear-glass command — declared · served unknown (no dispatch extractor)
intent: null
summary: null
system: null
tags:
  - clear-glass
  - command
  - declared
exported_at: 1790684786737
source: clear-glass/registry-components.js
occurrences: 1
firstSeenAt: 1790684786737
lastSeenAt: 1790684786737
fingerprint: 692b0471bc51b4859fce0704
payload:
  method: GET
  path: /cli/downloads/responses/:id
  declared: true
  served: null
  description: >-
    One downloads-index item in full: a chat transcript version, the reply text and code blocks, or
    the downloaded file record
  grammar:
    - downloads responseItem
  capability: cg.downloads.responseItem
